# Authenticated Mobile UX Phase 3 Implementation Plan: Copy, Trust & Language Quality

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 3 copy, trust, and communication quality improvements for Donatur Helper across Donor, PIC, Admin, and SuperAdmin surfaces to eliminate internal-tool jargon, eliminate mixed-language inconsistencies, standardize status semantics, humanize trust-sensitive microcopy, and establish lightweight regression tests for language quality.

**Architecture:** Continue updating `index.html` (styles, HTML structure, and JS logic) using standard lightweight DOM manipulation, semantic CSS tokens, and vanilla JavaScript (ES6+). Maintain `nlp_auditor.py` as an auxiliary copy-quality auditor and `docs/copy/ui-copy-inventory.md` as the single-source copy inventory. Preserve Phase 1 and Phase 2 improvements while introducing consistent Indonesian status terminology and user-friendly error formatting. Verify with the Node.js built-in test runner (`node --test`).

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+), Node.js built-in test runner, Python `nlp_auditor.py` for optional/adhoc copy auditing.

---

### Task 1: UI Copy Inventory Audit & Enrichment
**Files:**
- Modify: `docs/copy/ui-copy-inventory.md`

**Step 1: Audit and expand UI Copy Inventory**
- Review `docs/copy/ui-copy-inventory.md` to ensure all user-visible copy is cataloged across all 15 required states:
  1. Landing & Authentication (`#view-landing`, `#view-user-login`, `#view-token-login`)
  2. Donor Dashboard (`#view-user-dashboard`, `#profile-modal`, mass join modal)
  3. PIC Dashboard (`#view-pic-dashboard`, `#view-pic-create`, `#finalize-form`, `#late-donor-form`, `#gift-proof-form`)
  4. Admin Dashboard (`#view-admin-dashboard`, `#admin-pending-card`, `#admin-late-card`, `#admin-summary`, campaigns, members, tools)
  5. SuperAdmin Dashboard (`#view-superadmin-dashboard`, admin management, system settings, database maintenance)
  6. Empty states (donor bills empty, PIC queue empty, Admin approvals empty, search/filter no results)
  7. Loading states (checking phone, logging in, loading campaigns/members, saving proof, recalculating)
  8. Error states (network failure, invalid phone/name, invalid amount, file size error, unapproved member)
  9. Success states (profile saved, proof uploaded, member approved, token generated, campaign archived)
  10. Confirmation dialogs (delete draft, close campaign, archive, sweep data, recalculate split, toggle paid)
  11. Buttons & CTAs (primary, secondary, link buttons, icon buttons)
  12. Badges (member status, urgency deadline, queue tags, refund badges)
  13. Status labels (Open, Closed, Finalized, Archived)
  14. Overdue messages (Admin callout, PIC progress callout, deadline badges)
  15. Final/settled messages (all donors complete, campaign complete, gratitude templates)
  16. Reminder messages (WhatsApp personal reminder, group billing reminder, unpaid recap)

**Step 2: Clean up NLP violations in inventory**
- Fix non-standard spellings (e.g. `di-copy` -> `disalin`).
- Replace any unescaped em-dashes/en-dashes with commas, hyphens, colons, or parentheses in accordance with Indonesian typography standards.

**Step 3: Commit**
```bash
git add docs/copy/ui-copy-inventory.md
git commit -m "docs(copy): enrich and standardize ui copy inventory across all roles and states"
```

---

### Task 2: Run and Summarize NLP Auditor
**Files:**
- Create: `docs/reports/nlp-copy-audit.json`
- Create: `docs/reports/nlp-copy-audit.md`
- Tool: `nlp_auditor.py`

**Step 1: Execute NLP auditor against UI copy inventory**
- Run the auditor via CLI:
  `rtk python nlp_auditor.py docs/copy/ui-copy-inventory.md --json -o docs/reports/nlp-copy-audit.json`

**Step 2: Generate NLP audit summary report**
- Create `docs/reports/nlp-copy-audit.md` summarizing:
  - Reading ease score and grade level.
  - Total word count and sentence statistics.
  - Severity breakdown: High, Medium, Low findings.
  - Prioritized list of High & Medium findings to fix in `index.html`:
    1. Mixed-language phrases (`di-copy`, `Recalculate Donor Split`, `Amount Due`, `Deep Dive`, `Sweep Data`, `Generate token`).
    2. Brand consistency (`Donation Helper` vs `Donatur Helper`).
    3. Low-trust/technical error messages (`e.message`, raw JSON or system errors).
    4. Status label inconsistencies (`Active`/`Ex` vs `Karyawan Aktif`/`Alumni`).

**Step 3: Commit**
```bash
git add docs/reports/nlp-copy-audit.json docs/reports/nlp-copy-audit.md
git commit -m "docs(audit): add nlp copy audit baseline and prioritized findings report"
```

---

### Task 3: Fix High-Priority Copy & Brand Consistency Issues
**Files:**
- Modify: `index.html:1840-2200` (Header, modals, toasts)
- Modify: `index.html:3700-4500` (PIC toasts, clipboard actions, share messages)
- Modify: `index.html:4800-5400` (Admin tools, recalculate split, sweep data)
- Test: `tests/language-icon-consistency.test.js`

**Step 1: Update failing tests for new copy expectations**
- Update `tests/language-icon-consistency.test.js` to assert:
  - Header brand name is `Donatur Helper`.
  - All toast clipboard messages use `disalin` instead of `di-copy` or `meng-copy` (e.g. `Pesan undangan berhasil disalin! Tempel ke grup WhatsApp.`, `Nomor rekening disalin!`, `Laporan selesai berhasil disalin!`, `Teks berhasil disalin!`).
  - Action labels use clear Indonesian verbs:
    * `+ Generate token PIC baru` -> `+ Buat token PIC baru`
    * `Generate token Admin baru` -> `Buat token Admin baru`
    * `Recalculate Donor Split` -> `Hitung Ulang Tagihan Donatur`
    * `Lihat sebagai PIC (Deep Dive)` -> `Tinjau sebagai PIC`
    * `Jalankan Sweep Data` -> `Bersihkan Arsip Data`
    * `Sweeping database...` -> `Membersihkan data arsip...`

**Step 2: Run test to verify it fails**
- Run: `rtk node --test tests/language-icon-consistency.test.js`
- Expected: FAIL on newly asserted Indonesian terms.

**Step 3: Implement minimal code changes in `index.html`**
- Replace `Donation Helper` with `Donatur Helper` in main app header.
- Replace all instances of `di-copy`, `meng-copy`, `copy` in toasts and modals with `disalin`, `menyalin`, `salin`.
- Replace `Recalculate Donor Split` with `Hitung Ulang Tagihan Donatur` in Admin UI and confirm modal text.
- Replace `Lihat sebagai PIC (Deep Dive)` with `Tinjau sebagai PIC`.
- Replace `Generate token` buttons with `Buat token`.
- Replace `Jalankan Sweep Data` with `Bersihkan Arsip Data` and update helper description: "Pindahkan data campaign yang sudah diarsipkan ke penyimpanan dingin untuk menjaga kecepatan sistem."

**Step 4: Run test to verify it passes**
- Run: `rtk node --test tests/language-icon-consistency.test.js`
- Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/language-icon-consistency.test.js
git commit -m "fix(copy): resolve high-priority copy issues, brand header, and clipboard toasts"
```

---

### Task 4: Standardize Status Semantics & Urgency Wording
**Files:**
- Modify: `index.html:2400-2460` (Status badges & icon helpers)
- Modify: `index.html:2700-2750` (Member status labels)
- Modify: `index.html:3600-3660` (`getPicDonorQueueState`, `getPicDonorQueueLabel`)
- Modify: `index.html:4900-5020` (`renderAdminCampaignViews`, `renderAdminCampaignDeadline`)
- Test: `tests/status-semantics.test.js`

**Step 1: Write failing test for status semantics**
- Create `tests/status-semantics.test.js` testing:
  - Campaign Status labels: `Terbuka`, `Menunggu finalisasi`, `Final`, `Selesai`.
  - Member Status labels: `Karyawan Aktif` (or `Aktif`), `Alumni`, `Menunggu Persetujuan`.
  - Donor Status labels: `Terverifikasi`, `Perlu Ditinjau`, `Bukti Belum Diunggah`, `Belum Bayar`, `Perlu Refund`, `Refund Selesai`.
  - Urgency Deadline format: Always includes absolute date in Indonesian (`DD MMM YYYY`, e.g. `25 Agu 2026`) and explicit next-step instruction.

**Step 2: Run test to verify it fails**
- Run: `rtk node --test tests/status-semantics.test.js`
- Expected: FAIL with missing test file or assertion failures.

**Step 3: Implement standardized status vocabulary in `index.html`**
- Harmonize status helper functions:
  * `getPicDonorQueueLabel`: `Perlu Ditinjau` (was `Perlu Cek`), `Bukti Belum Diunggah` (was `Bukti Belum Ada`), `Terverifikasi`, `Belum Bayar`.
  * `renderAdminCampaignDeadline`: `Terlewat {days} hari ({absDate}) · Hubungi PIC untuk menutup pendaftaran atau perbarui deadline.`
  * Filter options in Admin & SuperAdmin: `Semua status`, `Terbuka`, `Ditutup`, `Final`, `Selesai`.
  * Member status dropdowns & badges: `Active (Karyawan)`, `Ex (Alumni)`, `Pending (Menunggu Persetujuan)`.

**Step 4: Run test to verify it passes**
- Run: `rtk node --test tests/status-semantics.test.js`
- Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/status-semantics.test.js
git commit -m "feat(semantics): standardize status labels, member roles, and deadline urgency copy"
```

---

### Task 5: Improve Trust-Sensitive Microcopy & Friendly Error Handling
**Files:**
- Modify: `index.html:2150-2220` (`formatUserErrorMessage`, `showInfoModal`, `showToast`)
- Modify: `index.html:2450-2520` (Auth error handling & privacy notice)
- Modify: `index.html:2800-3350` (Donor bills, proof upload, and confirmation)
- Modify: `index.html:3600-4100` (PIC finalization, refund callouts, and settled banners)
- Test: `tests/trust-microcopy.test.js`

**Step 1: Write failing test for trust-sensitive microcopy**
- Create `tests/trust-microcopy.test.js` testing:
  - `formatUserErrorMessage`: Maps network errors (e.g. `Failed to fetch`, `NetworkError`) to calm Indonesian message ("Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.").
  - `formatUserErrorMessage`: Sanitizes technical stack traces or raw script error strings into safe user-facing copy.
  - Payment proof helper: Clear instruction that files are kept private and only visible to the campaign PIC.
  - Finalization warning: Clear, reassuring confirmation explaining that bills will be calculated and distributed to all participants.
  - WhatsApp privacy callout: "Nomor WhatsApp hanya digunakan untuk verifikasi login dan pengingat patungan donasi."

**Step 2: Run test to verify it fails**
- Run: `rtk node --test tests/trust-microcopy.test.js`
- Expected: FAIL with missing functions or unhandled error cases.

**Step 3: Implement trust-sensitive microcopy and error normalizer in `index.html`**
- Add `formatUserErrorMessage(err)` function:
  ```javascript
  function formatUserErrorMessage(err) {
    if (!err) return 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.';
    const msg = typeof err === 'string' ? err : (err.message || String(err));
    if (/network|fetch|failed to fetch/i.test(msg)) {
      return 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.';
    }
    if (/timeout|abort/i.test(msg)) {
      return 'Waktu permintaan habis. Silakan coba beberapa saat lagi.';
    }
    if (/unauthorized|token/i.test(msg)) {
      return 'Sesi akses Anda telah berakhir. Silakan masuk kembali.';
    }
    return escapeHtml(msg);
  }
  ```
- Wrap all catch blocks calling `showInfoModal` and inline error renderers with `formatUserErrorMessage(e)`.
- Enhance payment proof microcopy: "Unggah bukti transfer (format JPG, PNG, atau PDF maks 2MB). Bukti hanya digunakan oleh PIC untuk verifikasi."
- Reassure donors in empty states: "Tidak ada tagihan tertunda. Semua partisipasi donasi Anda sudah beres."

**Step 4: Run test to verify it passes**
- Run: `rtk node --test tests/trust-microcopy.test.js`
- Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/trust-microcopy.test.js
git commit -m "feat(microcopy): add friendly error normalizer and enhance trust-sensitive microcopy"
```

---

### Task 6: Add Lightweight Node Copy & Trust Regression Test Suite
**Files:**
- Create: `tests/copy-trust-quality.test.js`
- Modify: `package.json` (Ensure test script runs all test suites cleanly)

**Step 1: Write comprehensive copy & trust regression tests**
- Create `tests/copy-trust-quality.test.js` testing:
  1. Donor empty-state CTA exists with link to open campaigns.
  2. Settled/final donor card includes reassuring completion copy without action buttons.
  3. Overdue campaign cards display absolute date and actionable recommendation.
  4. Error messages do not expose raw technical stack traces.
  5. Primary CTA labels are consistent across Donor, PIC, Admin, SuperAdmin.
  6. Important badges use standardized Indonesian labels (`Terverifikasi`, `Karyawan Aktif`, `Alumni`, `Perlu Ditinjau`).
  7. No unescaped user-input interpolation in error handlers.

**Step 2: Run all tests to verify coverage and passing status**
- Run: `rtk node --test`
- Expected: All 20+ tests pass with 0 failures.

**Step 3: Commit**
```bash
git add tests/copy-trust-quality.test.js
git commit -m "test(copy): add comprehensive regression test suite for copy and trust behaviors"
```

---

### Task 7: Manual Verification Checklist
**Files:**
- Update: `docs/plans/2026-08-17-mobile-ux-phase3-copy-trust.md`

**Step 1: Execute manual checks across viewports and edge cases**
- [ ] **360px viewport (Small Android)**:
  - Check text wrapping on donor cards, PIC progress card, and Admin summary.
  - Verify buttons do not truncate or cause horizontal scrolling.
- [ ] **390px viewport (Standard iOS/Android)**:
  - Verify spacing hierarchy, sticky navigation bar, and readability.
- [ ] **Keyboard-open state**:
  - Test login form, late donor form, and finalization form on mobile with virtual keyboard active.
- [ ] **Long text & edge-case strings**:
  - Test target names with 40+ characters (e.g. `Dr. Muhammad Farhan Al-Habsyi S.Kom`).
  - Test large amounts (e.g. `Rp15.750.000`).
- [ ] **Empty states**:
  - Donor with 0 bills -> Reassuring message + CTA to explore campaigns.
  - PIC with 0 donors -> Calm guidance.
  - Admin with 0 pending items -> Reassuring queue state.
- [ ] **Error states & offline/slow network**:
  - Simulate network disconnection -> Friendly Indonesian error modal.
- [ ] **Final / settled donor states**:
  - Verify verified donor card is soft green/neutral with no reminder buttons.
- [ ] **Overdue campaigns**:
  - Verify overdue callout with absolute date and action recommendation.

**Step 2: Run auxiliary NLP audit tool**
- Run: `rtk python nlp_auditor.py docs/copy/ui-copy-inventory.md --json`
- Verify score is >= 95 with 0 High/Medium slop or grammar violations.

**Step 3: Commit**
```bash
git add docs/plans/2026-08-17-mobile-ux-phase3-copy-trust.md
git commit -m "docs(plan): update manual verification checklist and completion evidence"
```

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Run NLP auditor verification:
   `rtk python nlp_auditor.py docs/copy/ui-copy-inventory.md`
3. Validate responsiveness on 360px and 390px mobile viewports.
4. Update `docs/plans/task.md` with task-by-task execution records.
5. Report before/after evidence and claim completion.
