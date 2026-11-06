import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './harness.js';
import {
  renderCampaignCard,
  renderCampaignGiftActions,
  renderCampaignJoinOptions,
  renderCampaignPaymentSection,
  renderCombinedCampaignCard,
  renderDonorEmptyState,
  renderMyPicCampaigns
} from '../../js/views/donor.js';

const finalizedCampaign = {
  campaignId: 'cmp-42',
  targetName: '<Nadia & Co>',
  reason: 'Hadiah perpisahan',
  status: 'Finalized',
  joined: true,
  paid: false,
  giftAmount: 1250000,
  donorCount: '3',
  amountDue: 250000,
  bankName: 'BCA',
  bankAccount: '1234567890',
  accountHolder: 'Nadia'
};

test('renderCampaignCard emits testable finalized payment markup', () => {
  const { document } = render(campaign => renderCampaignCard(campaign, {}, true), finalizedCampaign);
  const card = document.querySelector('[data-testid="campaign-card"]');
  assert.ok(card, 'campaign card renders');
  assert.equal(card.getAttribute('data-id'), 'cmp-42', 'campaign id is exposed separately');
  assert.match(card.textContent, /<Nadia & Co>/, 'user target is escaped into text, not markup');
  assert.match(card.textContent, /3 donatur/, 'donor count renders');
  assert.equal(document.querySelector('[data-testid="payment-form"]').getAttribute('class').includes('theme-blue-total'), true, 'unpaid campaign renders payment form');
  assert.equal(document.querySelector('[data-testid="donor-total"]').textContent, 'Rp250.000', 'payment total uses IDR formatting');
  assert.equal(document.querySelector('[data-testid="proof-upload"]').getAttribute('type'), 'file', 'proof uploader renders');
  assert.equal(document.querySelector('[data-testid="btn-pay"]').textContent, 'Sudah Transfer, Kirim Bukti', 'payment action renders');
  assert.ok(document.querySelector('[data-testid="proof-error"]'), 'payment error state renders');
});

test('extracted donor render functions preserve states and actions', () => {
  const openCampaign = { campaignId: 'cmp-open', targetName: 'Alya', status: 'Open', joined: false, giftAmount: 0, donorCount: 0 };
  const join = render(renderCampaignJoinOptions, openCampaign).document;
  assert.ok(join.querySelector('[data-testid="donation-options"]'), 'open campaign renders donation options');
  assert.ok(join.querySelector('[data-testid="input-custom-amount"]'), 'custom amount field renders');
  assert.equal(join.querySelector('[data-testid="btn-donasi"]').textContent, 'Gabung Donasi untuk Alya', 'join action names target');

  const gift = render(renderCampaignGiftActions, { ...finalizedCampaign, GiftImage: 'proofs/gift.png' }).document;
  assert.equal(gift.querySelector('[data-testid="btn-gift-image"]').textContent, '📷 Lihat Screenshot Harga', 'stored gift image action renders');

  const payment = render(renderCampaignPaymentSection, { ...finalizedCampaign, paid: true, verified: true, amountPaid: 275000, proofLink: 'https://example.test/proof.png' }).document;
  assert.match(payment.querySelector('[data-testid="payment-status"]').textContent, /Pembayaran Terverifikasi PIC/, 'verified payment state renders');
  assert.equal(payment.querySelector('[data-testid="donor-total"]').textContent, 'Rp275.000', 'paid total uses IDR formatting');
  assert.ok(payment.querySelector('[data-testid="link-proof"]'), 'proof link renders');
});

test('combined, empty, and PIC renderers expose rendered state', () => {
  const combined = render(group => renderCombinedCampaignCard(group, 'bca_123', {}), [finalizedCampaign, { ...finalizedCampaign, campaignId: 'cmp-43', targetName: 'Budi', amountDue: 50000 }]).document;
  assert.equal(combined.querySelectorAll('[data-testid="campaign-card"]').length, 1, 'combined payment has one state card');
  assert.equal(combined.querySelector('[data-testid="donor-total"]').textContent.replace(/\s+/g, ' ').trim(), 'Total nominal gabungan yang harus ditransfer:Rp300.000 Salin', 'combined total uses IDR formatting');
  assert.ok(combined.querySelector('[data-testid="btn-verify"]'), 'combined verification action renders');

  const empty = render(renderDonorEmptyState, { title: 'Belum ada campaign aktif', note: 'Campaign akan muncul di sini.' }).document;
  assert.match(empty.querySelector('[data-testid="campaign-card-emptystate"]').textContent, /Belum ada campaign aktif/, 'empty campaign state renders');
  assert.equal(renderMyPicCampaigns([], '0812'), '', 'empty PIC campaign list renders no card');

  const pic = render(list => renderMyPicCampaigns(list, '0812'), [{ campaignId: 'cmp-pic', targetName: 'Citra', status: 'Open', donorCount: 2, totalCollected: 150000 }]).document;
  assert.equal(pic.querySelector('[data-testid="pic-campaign-row"]').getAttribute('data-id'), 'cmp-pic', 'PIC row exposes raw campaign id');
  assert.match(pic.querySelector('[data-testid="my-pic-campaigns"]').textContent, /Rp150.000/, 'PIC total uses IDR formatting');
});

test('gift links are sanitised — a hostile GiftLink cannot become an href', () => {
  // [B7a-review] These assertions exist because mutation testing showed the suite passed while
  // `sanitizeUrl(giftLink)` was removed. The button/media branches were covered; the plain
  // <a href> branch was not. A DOM test that cannot fail on an XSS regression is decoration.
  const ok = render(renderCampaignGiftActions, {
    ...finalizedCampaign, GiftLink: 'https://example.test/gift'
  }).document;
  const okLink = ok.querySelector('[data-testid="link-gift"]');
  assert.ok(okLink, 'a valid GiftLink renders an anchor');
  assert.equal(okLink.getAttribute('href'), 'https://example.test/gift', 'https URL passes through');

  const bad = render(renderCampaignGiftActions, {
    ...finalizedCampaign, GiftLink: 'javascript:alert(document.domain)'
  }).document;
  const badLink = bad.querySelector('[data-testid="link-gift"]');
  assert.ok(badLink, 'the anchor still renders');
  assert.ok(!/^javascript:/i.test(badLink.getAttribute('href') || ''),
    'javascript: scheme must not survive into href, got: ' + badLink.getAttribute('href'));

  const img = render(renderCampaignGiftActions, {
    ...finalizedCampaign, GiftImage: 'javascript:alert(1)'
  }).document;
  assert.equal(img.querySelector('[data-testid="link-gift-image"]'), null,
    'a javascript: GiftImage is not rendered as a link');
});

test('campaign target names cannot break out of attributes', () => {
  // The target name reaches both text and attribute contexts on this card; the escaped form
  // must survive in both, which is what makes extraction safe.
  const { document } = render(c => renderCampaignCard(c, {}, true), {
    ...finalizedCampaign, targetName: '"><img src=x onerror=alert(1)>'
  });
  assert.equal(document.querySelectorAll('img[onerror]').length, 0,
    'injected handler must not become a real element');
  assert.equal(document.querySelectorAll('img').length, 0,
    'no img element should be produced from a hostile target name');
});

test('a quote inside an otherwise-valid URL cannot break out of the href attribute', () => {
  // [B7a-review] sanitizeUrl() returns https URLs VERBATIM — it validates the protocol, it does
  // not neutralise quotes. So escapeHtml() around it is load-bearing, not belt-and-braces.
  // Mutation testing proved this: removing escapeHtml left every other test green.
  const hostile = 'https://example.test/a"onmouseover="alert(1)';
  const { document } = render(renderCampaignGiftActions, { ...finalizedCampaign, GiftLink: hostile });
  const link = document.querySelector('[data-testid="link-gift"]');
  assert.ok(link, 'link renders');
  assert.ok(!/\sonmouseover\s*=/i.test(link.outerHTML || ''),
    'quotes must be escaped so no attribute can be injected, got: ' + link.getAttribute('href'));
  // NOTE: getAttribute() returns the DECODED value, so a literal quote here is expected and
  // correct. The real guarantee is that the RAW emitted markup has no unescaped quote that could
  // terminate the attribute. That is asserted on the source, below.
  const raw = renderCampaignGiftActions({ ...finalizedCampaign, GiftLink: hostile });
  assert.ok(raw.includes('&quot;'), 'emitted HTML must entity-escape the quote in href');
  assert.ok(!/href="[^"]*"[^\s>]*onmouseover/i.test(raw), 'no attribute can be injected after href');
});
