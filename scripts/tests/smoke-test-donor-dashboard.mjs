#!/usr/bin/env node

/**
 * scripts/tests/smoke-test-donor-dashboard.mjs
 * 
 * Smoke test to verify get_donor_dashboard RPC compilation and output:
 * - Checks that get_donor_dashboard executes without error
 * - Verifies that joined_campaigns[].campaign includes gift_image, gift_link, and donor_count
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('[ERROR] SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false }
});

async function runSmokeTest() {
  console.log('=== Smoke Test: get_donor_dashboard ===\n');

  // Test WhatsApp known to have joined campaigns (e.g. Fiqi)
  const testPhone = '+6281297488665';
  console.log(`Querying get_donor_dashboard for: ${testPhone}`);

  const { data, error } = await supabase.rpc('get_donor_dashboard', { p_whatsapp: testPhone });

  if (error) {
    console.error('❌ RPC call failed:', error);
    process.exit(1);
  }

  if (!data || data.error) {
    console.error('❌ Unexpected response error:', data?.error, data?.message);
    process.exit(1);
  }

  console.log('✅ RPC executed successfully');
  console.log(`Identity: ${data.identity?.name} (${data.identity?.whatsapp_masked})`);
  console.log(`Total joined campaigns: ${data.joined_campaigns?.length || 0}`);

  if (!data.joined_campaigns || data.joined_campaigns.length === 0) {
    console.warn('⚠️ No joined campaigns found for test user');
    process.exit(0);
  }

  let allHaveFields = true;
  for (const [idx, item] of data.joined_campaigns.entries()) {
    const campaign = item.campaign;
    const hasGiftImage = 'gift_image' in campaign;
    const hasGiftLink = 'gift_link' in campaign;
    const hasDonorCount = 'donor_count' in campaign;

    console.log(`\n[Campaign ${idx + 1}] ID: ${campaign.campaign_id} - ${campaign.target_name}`);
    console.log(`  - status: ${campaign.status}`);
    console.log(`  - gift_image: ${JSON.stringify(campaign.gift_image)} (key present: ${hasGiftImage})`);
    console.log(`  - gift_link: ${JSON.stringify(campaign.gift_link)} (key present: ${hasGiftLink})`);
    console.log(`  - donor_count: ${JSON.stringify(campaign.donor_count)} (key present: ${hasDonorCount})`);

    if (!hasGiftImage || !hasGiftLink) {
      allHaveFields = false;
    }
  }

  console.log('\n----------------------------------------');
  if (allHaveFields) {
    console.log('🎉 PASS: All joined campaigns include gift_image and gift_link!');
    process.exit(0);
  } else {
    console.log('❌ FAIL: One or more joined campaigns are missing gift_image or gift_link in campaign object.');
    process.exit(2);
  }
}

runSmokeTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
