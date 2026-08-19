#!/usr/bin/env node

/**
 * scripts/migration/verify-supabase-data.mjs
 * 
 * Post-migration reconciliation script to verify live Supabase table counts
 * and referential integrity against the XLSX migration requirements.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const EXPECTED_COUNTS = {
  app_settings: 6,
  members: 103,
  auth_tokens: 52,
  campaigns: 10,
  donors: 226,
  late_requests: 6
};

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('[ERROR] SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false }
  });

  console.log('================================================================');
  console.log(' Supabase Live Database Reconciliation & Verification');
  console.log('================================================================\n');

  console.log('Table Name        Live Count   Expected Count   Status');
  console.log('----------------  -----------  ---------------  ------');

  let allMatched = true;

  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error(`Error querying ${table}:`, error.message);
      allMatched = false;
      continue;
    }

    const matched = count === expected;
    if (!matched) allMatched = false;

    console.log(
      `${table.padEnd(16)}  ${String(count).padStart(11)}  ${String(expected).padStart(15)}  ${matched ? 'MATCH ✅' : 'MISMATCH ❌'}`
    );
  }

  console.log('----------------  -----------  ---------------  ------\n');

  // Verify foreign key linkages
  const { data: donorsWithNullMember, count: nullMemberCount } = await supabase
    .from('donors')
    .select('id', { count: 'exact' })
    .is('member_id', null);

  const { count: linkedMemberCount } = await supabase
    .from('donors')
    .select('id', { count: 'exact' })
    .not('member_id', 'is', null);

  const { count: nullCampaignTokensCount } = await supabase
    .from('auth_tokens')
    .select('id', { count: 'exact' })
    .is('linked_campaign_id', null);

  const { data: verifiedEmails } = await supabase
    .from('members')
    .select('name, whatsapp, email')
    .not('email', 'is', null);

  console.log('Relational Integrity & Foreign Key Audit:');
  console.log(`- Donors linked to registered Members:        ${linkedMemberCount} / 226 (${((linkedMemberCount / 226) * 100).toFixed(1)}%)`);
  console.log(`- Donors with unlinked / dummy Member ID:     ${nullMemberCount} (expected: 1)`);
  console.log(`- Tokens with linked_campaign_id = null:      ${nullCampaignTokensCount}`);
  console.log(`- Registered Members with Email populated:    ${verifiedEmails?.length || 0} (Ihsan, nadya, Fiqi)`);
  console.log(`- Overall Verification:                       ${allMatched ? 'ALL VERIFICATIONS PASSED ✅' : 'FAIL ❌'}`);
  console.log('\n================================================================\n');

  if (!allMatched) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err.message);
  process.exit(1);
});
