/**
 * Donatur Helper — Supabase Free-plan keep-alive Worker.
 *
 * Supabase pauses Free-plan projects that record too few user database queries
 * over a 7-day window. This Worker calls the `get_public_settings()` RPC twice a
 * day. That RPC is read-only, takes no arguments, is SECURITY DEFINER, and is
 * already granted to the `anon` role — so the publishable/anon key is sufficient
 * and nothing privileged is exposed.
 *
 * Heartbeat paths:
 *   - Cron Trigger (`0 9,21 * * *`, see wrangler.toml) — primary, 3 retries.
 *   - `GET|POST /ping` — one-shot heartbeat for manual runs and for an external
 *     free scheduler used as redundancy if the Cron Trigger stops firing.
 *
 * The dead-man's switch is pinged by *cron heartbeats only*. That is deliberate:
 * if the Cron Trigger dies while external `/ping` calls keep the database alive,
 * the switch still reports the cron path as dead.
 *
 * Required Worker secrets (never hardcode, never the service_role key):
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY
 * Optional Worker secret:
 *   HEARTBEAT_URL — dead-man's-switch endpoint, e.g. https://hc-ping.com/<uuid>.
 *                   When unset, no alerting is configured and a warning is
 *                   logged on every run.
 */

const PING_INTERVAL_MS = 1500;
const PING_TIMEOUT_MS = 10_000;
const SWITCH_TIMEOUT_MS = 5_000;

/** Retries only make sense for a timed run; `/ping` is already a human/external retry. */
const CRON_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Env} env
 * @returns {{ baseUrl: string, publishableKey: string, heartbeatUrl: string }}
 */
function readConfig(env) {
  return {
    baseUrl: (env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    publishableKey: (env.SUPABASE_PUBLISHABLE_KEY || '').trim(),
    heartbeatUrl: (env.HEARTBEAT_URL || '').trim().replace(/\/+$/, ''),
  };
}

/**
 * Pings the Supabase RPC endpoint once.
 * @param {string} baseUrl
 * @param {string} publishableKey
 * @returns {Promise<{ ok: boolean, status: number, body: string }>}
 */
async function pingOnce(baseUrl, publishableKey) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/get_public_settings`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });

  // Read the body unconditionally so a non-2xx response still reports the
  // Postgres/PostgREST error message instead of a bare status code.
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase responded ${res.status}: ${body.slice(0, 300)}`);
  }
  return { ok: true, status: res.status, body };
}

/**
 * Dead-man's-switch notification. Never throws: a monitor that is unreachable
 * must not turn a successful heartbeat into a failed cron run.
 * @param {string} heartbeatUrl
 * @param {boolean} ok
 * @param {string} detail
 */
async function reportToSwitch(heartbeatUrl, ok, detail) {
  if (!heartbeatUrl) {
    console.warn(
      '[keepalive] HEARTBEAT_URL is not set — no failure alerting. ' +
        'Set it with: npx wrangler secret put HEARTBEAT_URL'
    );
    return;
  }

  try {
    await fetch(ok ? heartbeatUrl : `${heartbeatUrl}/fail`, {
      method: 'POST',
      body: detail.slice(0, 200),
      signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn(`[keepalive] dead-man's-switch notification failed: ${error.message}`);
  }
}

/**
 * Runs the heartbeat, retrying transient failures.
 * @param {Env} env
 * @param {number} attempts
 * @returns {Promise<{ ok: boolean, status: number, body: string }>}
 */
async function runHeartbeat(env, attempts) {
  const { baseUrl, publishableKey } = readConfig(env);

  if (!baseUrl || !publishableKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY Worker secret. ' +
        'Set them with: npx wrangler secret put <NAME>'
    );
  }

  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await pingOnce(baseUrl, publishableKey);
      console.log(
        `[keepalive] heartbeat OK (attempt ${attempt}/${attempts}, status ${result.status}): ${result.body.slice(0, 200)}`
      );
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[keepalive] attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) {
        await sleep(PING_INTERVAL_MS);
      }
    }
  }

  throw new Error(`[keepalive] all ${attempts} heartbeat attempt(s) failed: ${lastError?.message}`);
}

/**
 * Cron handler. Retries because a single transient 5xx must not silently
 * forfeit a heartbeat — losing every run in a week would let the project pause.
 * @param {ScheduledController} controller
 * @param {Env} env
 * @param {ExecutionContext} ctx
 */
async function scheduled(controller, env, ctx) {
  const { heartbeatUrl } = readConfig(env);
  const attempts = (controller.cron || '').length > 0 ? CRON_ATTEMPTS : 1;

  try {
    const result = await runHeartbeat(env, attempts);
    ctx.waitUntil(reportToSwitch(heartbeatUrl, true, `status ${result.status}`));
  } catch (error) {
    ctx.waitUntil(reportToSwitch(heartbeatUrl, false, error.message));
    // Throwing fails the Cron Trigger run, which surfaces in Workers Logs and
    // metrics instead of being swallowed as a clean execution.
    throw error;
  }
}

/**
 * HTTP handler.
 *
 * `/ping` runs the heartbeat on demand. It is intentionally unauthenticated:
 * the same RPC is already callable by anyone holding the publishable key, which
 * ships in the public frontend bundle, so this exposes no new capability.
 *
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function fetchHandler(request, env) {
  const { pathname } = new URL(request.url);

  if (pathname.replace(/\/+$/, '') === '/ping') {
    try {
      const result = await runHeartbeat(env, 1);
      return Response.json(
        { ok: true, status: result.status, body: result.body.slice(0, 500) },
        { status: 200 }
      );
    } catch (error) {
      return Response.json({ ok: false, error: error.message }, { status: 502 });
    }
  }

  return new Response(
    'Supabase keep-alive Worker. Cron heartbeats run twice daily at 09:00 and 21:00 UTC; ' +
      'GET|POST /ping runs one heartbeat on demand.',
    { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

export default {
  scheduled,
  fetch: fetchHandler,
};