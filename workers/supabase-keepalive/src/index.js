/**
 * Donatur Helper — Supabase Free-plan keep-alive Worker.
 *
 * Supabase pauses Free-plan projects that record too few user database queries
 * over a 7-day window. This Worker calls the `get_public_settings()` RPC on a
 * Cron Trigger (Mon/Wed/Fri 09:00 UTC, see wrangler.toml). That RPC is
 * read-only, takes no arguments, is SECURITY DEFINER, and is already granted to
 * the `anon` role — so the publishable/anon key is sufficient and nothing
 * privileged is exposed.
 *
 * Required Worker secrets (never hardcode, never the service_role key):
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY
 */

const PING_INTERVAL_MS = 1500;
const PING_TIMEOUT_MS = 10_000;

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
 * Cron handler. Retries because a single transient 5xx must not silently
 * forfeit a heartbeat — losing all three weekly runs would let the project pause.
 * @param {ScheduledController} controller
 * @param {Env} env
 * @param {ExecutionContext} ctx
 */
async function scheduled(controller, env, ctx) {
  const baseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!baseUrl || !publishableKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY Worker secret. ' +
        'Set them with: npx wrangler secret put <NAME>'
    );
  }

  const attempts = (controller.cron || '').length > 0 ? 3 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await pingOnce(baseUrl, publishableKey);
      console.log(
        `[keepalive] heartbeat OK (attempt ${attempt}/${attempts}, status ${result.status}): ${result.body.slice(0, 200)}`
      );
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[keepalive] attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, PING_INTERVAL_MS));
      }
    }
  }

  // Throwing fails the Cron Trigger run, which surfaces in Cloudflare's Workers
  // metrics/logs instead of being swallowed as a clean execution.
  throw new Error(`[keepalive] all ${attempts} heartbeat attempt(s) failed: ${lastError?.message}`);
}

/**
 * Manual trigger only — the Worker has no route and is not fetchable at the
 * Pages origin. `wrangler dev` or the workers.dev URL can exercise it by hand.
 */
async function fetchHandler() {
  return new Response(
    'Supabase keep-alive Worker. Heartbeats run on a Cron Trigger (Mon/Wed/Fri 09:00 UTC).',
    { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

export default {
  scheduled,
  fetch: fetchHandler,
};
