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

// 1.6 Check backendAdapter.js checkDonorWhatsApp return shape includes email
assert(
  adapterCode.includes("case 'checkDonorWhatsApp':") &&
  adapterCode.includes("email: resolvedEmail"),
  'backendAdapter.js checkDonorWhatsApp must explicitly return `email`'
);

// 1.7 Check auth.js stores email in session on login
assert(
  authCode.includes("const resolvedEmail = res.email || (res.identity && res.identity.email) || '';") &&
  authCode.includes("email: resolvedEmail"),
  'auth.js must include `email` in userSession upon login'
);

// 1.8 Check auth.js stores email in session on register
assert(
  authCode.includes("const resolvedEmail = user.email || (user.member && user.member.email) || '';") &&
  authCode.includes("email: resolvedEmail"),
  'auth.js must include `email` in userSession upon registration'
);

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

// 3.5 admin_get_campaign_detail RPC signature & parity
assert(
  adapterCode.includes("'getCampaignDetail'") &&
  adapterCode.includes("'getCampaignDetailAdmin'") &&
  adapterCode.includes("'adminGetCampaignDetail'"),
  'backendAdapter.js MIGRATED_ACTIONS must include campaign detail action variants'
);
const adminDetailRpcCall = adapterCode.match(/client\.rpc\('admin_get_campaign_detail',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(adminDetailRpcCall), 'backendAdapter.js has admin_get_campaign_detail RPC dispatch');
if (adminDetailRpcCall) {
  const detailParams = adminDetailRpcCall[1];
  assert(detailParams.includes('p_token'), 'admin_get_campaign_detail RPC passes `p_token`');
  assert(detailParams.includes('p_campaign_id'), 'admin_get_campaign_detail RPC passes `p_campaign_id`');
}
assert(
  adapterCode.includes("picToken: data.pic_token || (data.campaign && data.campaign.pic_token) || data.picToken || null"),
  'backendAdapter.js getCampaignDetail must normalize picToken fallback chain'
);
assert(
  adminCode.includes("👁️ Lihat Sebagai PIC") &&
  adminCode.includes("deepDive(\\'' + detail.picToken + '\\')"),
  'admin.js adminView must render `👁️ Lihat Sebagai PIC` button when picToken is present'
);

// 3.6 admin_generate_pic_token response normalization
assert(
  adapterCode.includes("case 'adminGeneratePicToken':") &&
  adapterCode.includes("token: plaintextToken") &&
  adapterCode.includes("plaintextToken: plaintextToken"),
  'backendAdapter.js adminGeneratePicToken must normalize response to include plaintext token properties'
);
assert(
  adminCode.includes("res.token || res.plaintextToken || ''") &&
  adminCode.includes("genPicToken"),
  'admin.js genPicToken must read string token from response'
);

// 3.7 superadmin_list_admin_tokens RPC dispatch & mapping
assert(
  adapterCode.includes("'listAdminTokens'") &&
  adapterCode.includes("'listAdmins'") &&
  adapterCode.includes("'superadminListAdminTokens'"),
  'backendAdapter.js MIGRATED_ACTIONS must include superadmin token list action variants'
);
const saTokenRpcCall = adapterCode.match(/client\.rpc\('superadmin_list_admin_tokens',\s*\{([\s\S]*?)\}\);/);
assert(Boolean(saTokenRpcCall), 'backendAdapter.js has superadmin_list_admin_tokens RPC dispatch');
if (saTokenRpcCall) {
  const saParams = saTokenRpcCall[1];
  assert(saParams.includes('p_token'), 'superadmin_list_admin_tokens RPC passes `p_token`');
  assert(
    (adapterCode.includes("TokenID: realToken") || adapterCode.includes("TokenID: t.token || t.TokenID || t.id")) &&
    adapterCode.includes("token: realToken"),
    'superadmin_list_admin_tokens maps real TokenID and token'
  );
}
assert(
  adminCode.includes("escapeHtml(a.token || a.TokenID)"),
  'admin.js renderAdminAccounts renders real token in .token-box and table column'
);

// 3.8 Admin token mutation RPC signatures (revoke, reactivate, delete)
assert(
  adapterCode.includes("client.rpc('superadmin_revoke_admin_token', {") &&
  adapterCode.includes("p_token_id: String(tokenId).trim()"),
  'backendAdapter.js revokeAdminToken must pass `p_token_id: String(tokenId).trim()`'
);
assert(
  adapterCode.includes("client.rpc('superadmin_reactivate_admin_token', {") &&
  adapterCode.includes("p_token_id: String(tokenId).trim()"),
  'backendAdapter.js reactivateAdminToken must pass `p_token_id: String(tokenId).trim()`'
);
assert(
  adapterCode.includes("client.rpc('superadmin_delete_admin_token', {") &&
  adapterCode.includes("p_token_id: String(tokenId).trim()"),
  'backendAdapter.js deleteAdminToken must pass `p_token_id: String(tokenId).trim()`'
);

// 3.9 Primary SuperAdmin and Current Session protection in renderAdminAccounts
assert(
  adminCode.includes("const isPrimary = a.Alias === 'primary-superadmin' || a.alias === 'primary-superadmin' || a.token === 'SA-6FC5F961' || a.TokenID === 'SA-6FC5F961';"),
  'admin.js renderAdminAccounts must identify Primary SuperAdmin'
);
assert(
  adminCode.includes("const isCurrentSession = (a.token && a.token === currentToken()) || (a.TokenID && a.TokenID === currentToken()) || (a.id && a.id === currentToken());"),
  'admin.js renderAdminAccounts must identify Current Session token'
);
assert(
  adminCode.includes('<span class="badge blue">Primary</span>') &&
  adminCode.includes('<span class="muted" style="font-size:12px;">Akun Utama (Terkunci)</span>'),
  'admin.js renderAdminAccounts must protect Primary SuperAdmin with badge and locked text'
);
assert(
  adminCode.includes('<span class="muted" style="font-size:12px;">Akun Anda (Aktif)</span>'),
  'admin.js renderAdminAccounts must protect Current Session against self-deactivation/deletion'
);

// 3.10 SuperAdmin Assign Member Role & Generated Admin Token Modal Contract
assert(
  adminCode.includes("res.generated_admin_token") &&
  adminCode.includes("Token Login Admin: ' + res.generated_admin_token") &&
  adminCode.includes("showInfoModal('Member ' + escapeHtml(wa) + ' berhasil diubah menjadi Admin!"),
  'admin.js assignMemberRoleUI must display informative modal containing generated admin token when promoted to Admin'
);


// -----------------------------------------------------------------------------
// 4. ADMIN MEMBER PAGINATION CONTRACT (admin.js)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Admin Member Pagination Contract ---');
assert(
  adapterCode.includes("pageSize = 1000") &&
  adminCode.includes("export function refreshMembers(page = 1, pageSize = 1000"),
  'backendAdapter.js and admin.js refreshMembers must default to pageSize = 1000 for full member roster'
);
assert(
  adminCode.includes("export function changeMemberPage(") &&
  adminCode.includes("window.changeMemberPage = changeMemberPage"),
  'admin.js must export changeMemberPage and attach to window.changeMemberPage'
);
assert(
  adminCode.includes("onclick=\"changeMemberPage(") &&
  adminCode.includes("&laquo; Sebelumnya") &&
  adminCode.includes("Berikutnya &raquo;"),
  'admin.js must render Prev/Next buttons with changeMemberPage handlers'
);
assert(
  adminCode.includes("Menampilkan ' + fromNum + '-' + toNum + ' dari ' + total + ' member"),
  'admin.js must format page range as `Menampilkan X-Y dari Z member`'
);

// -----------------------------------------------------------------------------
// 5. CAMPAIGN OWNERSHIP TRANSFER & SEARCHABLE PIC PICKER CONTRACT (admin.js)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Campaign Ownership Transfer Contract ---');
assert(
  adapterCode.includes("case 'transferCampaignOwnershipAdmin':") &&
  adapterCode.includes("client.rpc('admin_transfer_campaign_ownership'"),
  'backendAdapter.js must handle transferCampaignOwnershipAdmin via admin_transfer_campaign_ownership RPC'
);
assert(
  adapterCode.includes("new_pic_token: newToken") &&
  adapterCode.includes("token: newToken"),
  'backendAdapter.js must normalize transfer campaign response object with plaintext token properties'
);
assert(
  adminCode.includes("id=\"transfer-pic-search\"") &&
  adminCode.includes("oninput=\"filterTransferPicOptions(this.value)\""),
  'admin.js must provide searchable input `#transfer-pic-search` for transferring campaign ownership'
);
assert(
  adminCode.includes("export function filterTransferPicOptions(") &&
  adminCode.includes("window.filterTransferPicOptions = filterTransferPicOptions"),
  'admin.js must export filterTransferPicOptions and attach to window'
);
assert(
  adminCode.includes("res.new_pic_token || res.token || res.newToken") &&
  !adminCode.includes("'Token PIC Baru: ' + newToken + '\\n\\n'"),
  'admin.js adminTransferOwnershipUI must defensively extract token and message without [object Object] coercion'
);


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
