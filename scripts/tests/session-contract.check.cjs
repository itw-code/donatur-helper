/**
 * scripts/tests/session-contract.check.cjs
 *
 * Permanent Static Contract Regression Check for Donatur Helper.
 * Validates session write-vs-read consistency and adapter RPC parameter signatures
 * across frontend views and services.
 *
 * Exit code 0: All session contracts & RPC mappings valid.
 * Exit code 1: Any contract breach or signature mismatch detected.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function loadFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Required file not found: ${relPath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    failureCount++;
  } else {
    console.log(`✅ [PASS] ${message}`);
  }
}

console.log('================================================================');
console.log(' DONATUR HELPER — SESSION & BACKEND ADAPTER CONTRACT CHECK');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. DONOR SESSION CONTRACT: auth.js write vs donor.js reads
// -----------------------------------------------------------------------------
console.log('--- 1. Donor Session Contract (auth.js vs donor.js) ---');

const authCode = loadFile('js/views/auth.js');
const donorCode = loadFile('js/views/donor.js');
const adapterCode = loadFile('js/services/backendAdapter.js');

// 1.1 Check auth.js writes complete user session on login
assert(
  authCode.includes("safeSet('donor_user', JSON.stringify(userSession))") ||
  (authCode.includes("safeSet('donor_user', JSON.stringify(") && authCode.includes("whatsapp:")),
  'auth.js must serialize a session object containing explicit `whatsapp` property on login'
);

// 1.2 Check auth.js writes complete user session on register
const registerSessionMatch = authCode.match(/callQueued\('registerUser'[\s\S]*?safeSet\('donor_user',\s*JSON\.stringify\((\w+)\)/);
assert(
  Boolean(registerSessionMatch),
  'auth.js must store session object upon user registration'
);

// 1.3 Check backendAdapter.js checkDonorWhatsApp return shape includes whatsapp & whatsapp_masked
assert(
  adapterCode.includes("case 'checkDonorWhatsApp':") &&
  adapterCode.includes("whatsapp: wa") &&
  adapterCode.includes("whatsapp_masked:"),
  'backendAdapter.js checkDonorWhatsApp must return both `whatsapp` and `whatsapp_masked`'
);

// 1.4 Check backendAdapter.js registerUser return shape includes whatsapp & whatsapp_masked
assert(
  adapterCode.includes("case 'registerUser':") &&
  adapterCode.includes("whatsapp: wa") &&
  adapterCode.includes("whatsapp_masked:"),
  'backendAdapter.js registerUser must return both `whatsapp` and `whatsapp_masked`'
);

// 1.5 Check donor.js reads matching user session properties
const donorSessionReads = [
  { name: 'user.whatsapp in seamlessBecomePic', pattern: /export\s+(async\s+)?function\s+seamlessBecomePic[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in submitBulkJoin', pattern: /export\s+(async\s+)?function\s+submitBulkJoin[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in joinCampaign', pattern: /export\s+(async\s+)?function\s+joinCampaign[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in withdraw', pattern: /export\s+(async\s+)?function\s+withdraw[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in submitProof', pattern: /export\s+(async\s+)?function\s+submitProof[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in submitCombinedProof', pattern: /export\s+(async\s+)?function\s+submitCombinedProof[\s\S]*?if\s*\(!user\s*\|\|\s*!user\.whatsapp\)/ },
  { name: 'user.whatsapp in saveProfile', pattern: /export\s+(async\s+)?function\s+saveProfile[\s\S]*?const\s+wa\s*=\s*user\.whatsapp/ }
];

for (const item of donorSessionReads) {
  assert(item.pattern.test(donorCode), `donor.js must correctly guard/read ${item.name}`);
}

// -----------------------------------------------------------------------------
// 2. TOKEN SESSION CONTRACT (Role Views: PIC, Admin, SuperAdmin)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Role Token Session Contract (auth.js vs role views) ---');

const stateCode = loadFile('js/state.js');
const picCode = loadFile('js/views/pic.js');
const adminCode = loadFile('js/views/admin.js');
const superadminCode = loadFile('js/views/superadmin.js');

// 2.1 Token write checks in auth.js
assert(authCode.includes("safeSet('auth_token', token)"), 'auth.js writes auth_token on login');
assert(authCode.includes("safeSet('auth_role', res.role)"), 'auth.js writes auth_role on login');
assert(authCode.includes("safeSet('deep_dive_return_token', safeGet('auth_token'))"), 'auth.js stores return token on deep dive');
assert(authCode.includes("safeSet('auth_token', rToken)"), 'auth.js restores auth_token on returnFromDeepDive');

// 2.2 state.js token bridge checks
assert(stateCode.includes("safeGet('auth_token')"), 'state.js currentToken() reads safeGet("auth_token")');
assert(stateCode.includes("safeGet('auth_role')"), 'state.js currentRole() reads safeGet("auth_role")');

// 2.3 Role views token usage checks (via currentToken from state.js)
assert(picCode.includes("currentToken()"), 'pic.js accesses auth token via currentToken()');
assert(adminCode.includes("currentToken()"), 'admin.js accesses auth token via currentToken()');
assert(superadminCode.includes("currentToken()"), 'superadmin.js accesses auth token via currentToken()');

// -----------------------------------------------------------------------------
// 3. BACKEND ADAPTER RPC SIGNATURE & PARAMETER MAPPING CHECK
// -----------------------------------------------------------------------------
console.log('\n--- 3. Backend Adapter RPC Signature Parity Check ---');

// 3.1 joinCampaign RPC signature parity (must NOT pass p_is_custom)
const joinRpcCall = adapterCode.match(/case 'joinCampaign':[\s\S]*?client\.rpc\('join_campaign',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(joinRpcCall), 'backendAdapter.js has join_campaign RPC dispatch');
if (joinRpcCall) {
  const joinParams = joinRpcCall[1];
  assert(!joinParams.includes('p_is_custom'), 'join_campaign RPC must NOT pass undeclared `p_is_custom`');
  assert(joinParams.includes('p_campaign_id'), 'join_campaign RPC passes `p_campaign_id`');
  assert(joinParams.includes('p_name'), 'join_campaign RPC passes `p_name`');
  assert(joinParams.includes('p_whatsapp'), 'join_campaign RPC passes `p_whatsapp`');
  assert(joinParams.includes('p_custom_amount'), 'join_campaign RPC passes `p_custom_amount`');
  assert(joinParams.includes('p_alias'), 'join_campaign RPC passes `p_alias`');
}

// 3.2 submitPaymentProof RPC signature parity (p_proof_url, not p_public_url)
const proofRpcCall = adapterCode.match(/case 'submitPaymentProof':[\s\S]*?client\.rpc\('submit_payment_proof',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(proofRpcCall), 'backendAdapter.js has submit_payment_proof RPC dispatch');
if (proofRpcCall) {
  const proofParams = proofRpcCall[1];
  assert(proofParams.includes('p_proof_url'), 'submit_payment_proof RPC passes `p_proof_url`');
  assert(!proofParams.includes('p_public_url:'), 'submit_payment_proof RPC must NOT pass invalid `p_public_url` key');
}

// 3.3 submitCombinedPaymentProof RPC signature parity (p_proof_storage_path, p_proof_url)
const combProofRpcCall = adapterCode.match(/case 'submitCombinedPaymentProof':[\s\S]*?client\.rpc\('submit_combined_payment_proof',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(combProofRpcCall), 'backendAdapter.js has submit_combined_payment_proof RPC dispatch');
if (combProofRpcCall) {
  const combParams = combProofRpcCall[1];
  assert(combParams.includes('p_proof_storage_path'), 'submit_combined_payment_proof RPC passes `p_proof_storage_path`');
  assert(combParams.includes('p_proof_url'), 'submit_combined_payment_proof RPC passes `p_proof_url`');
  assert(!combParams.includes('p_storage_path:'), 'submit_combined_payment_proof RPC must NOT pass invalid `p_storage_path` key');
}

// 3.4 generateSeamlessPicToken RPC signature parity (only p_whatsapp)
const seamlessRpcCall = adapterCode.match(/case 'generateSeamlessPicToken':[\s\S]*?client\.rpc\('generate_seamless_pic_token',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(seamlessRpcCall), 'backendAdapter.js has generate_seamless_pic_token RPC dispatch');
if (seamlessRpcCall) {
  const seamlessParams = seamlessRpcCall[1];
  assert(seamlessParams.includes('p_whatsapp'), 'generate_seamless_pic_token RPC passes `p_whatsapp`');
  assert(!seamlessParams.includes('p_target_name'), 'generate_seamless_pic_token RPC must NOT pass undeclared `p_target_name`');
}

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
if (failureCount === 0) {
  console.log('✅ ALL SESSION CONTRACTS & RPC SIGNATURES ARE VALID (0 ERRORS)');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`❌ FOUND ${failureCount} CONTRACT VIOLATION(S)!`);
  console.log('================================================================\n');
  process.exit(1);
}
