# Authenticated Mobile UX Phase 2 Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 2 authenticated mobile UX improvements for Donatur Helper across Admin, PIC, and Donor surfaces to reduce scanning cost, clarify final/settled states, improve donor dashboard empty states, optimize PIC donor queue usability, streamline Admin campaign card density, demote secondary token provisioning CTAs, and resolve language/icon inconsistencies.

**Architecture:** Continue updating `index.html` (styles, HTML structure, and JS logic) using standard lightweight DOM manipulation, semantic CSS tokens, vanilla JavaScript (ES6+), and the Node.js built-in test runner (`node --test`). Preserve Phase 1 improvements (sticky Admin navigation, Admin member pagination, PIC action priority, Admin summary scope labels, and overdue campaign callouts).

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+), Node.js built-in test runner.

---

### Task 1: PIC Final-State Clarity
**Files:**
- Modify: `index.html:160-350` (CSS tokens & classes for settled/final cards)
- Modify: `index.html:3600-3620` (`getPicDonorQueueState`, `getPicDonorQueueLabel`)
- Modify: `index.html:3723-3760` (`renderPicActionQueue`, `renderPicNextAction`)
- Modify: `index.html:3935-4115` (`renderDonorTable`)
- Test: `tests/pic-final-state.test.js`

**Step 1:** Create `tests/pic-final-state.test.js` testing:
  - Final/settled donor cards render with neutral/success styling (`.donor-card-settled`) instead of warning/pending cues.
  - Verified donors display explicit Indonesian text: "Terverifikasi" badge and "Selesai · Tidak ada tindakan lanjutan untuk donatur ini."
  - Reminder and review actions are hidden for final donors.
  - When all donors are finalized, render a reassuring settled state ("Semua pembayaran telah terverifikasi dan final. Tidak ada tagihan tertunda.").
  - When campaign is final but queue contains pending items, explain the remaining count clearly.

**Step 2:** Update CSS in `index.html` to add `.donor-card-settled` and `.donor-card-settled-text` styles (soft neutral/green tint, subtle border, no alerting colors).

**Step 3:** Update `getPicDonorQueueState`, `renderPicActionQueue`, and `renderDonorTable`:
  - Ensure verified donors without pending refunds receive `.donor-card-settled`.
  - For final donors, replace warning/empty verification actions with calm text: `<span class="muted verification-complete">Selesai · Tidak ada tindakan lanjutan untuk donatur ini.</span>`.
  - In `renderPicActionQueue` and `renderDonorTable`, render reassuring banner when all donors are complete.

**Step 4:** Run `rtk node --test tests/pic-final-state.test.js` to verify.

---

### Task 2: PIC Donor Queue Usability & Grouping
**Files:**
- Modify: `index.html:3935-4115` (`renderDonorTable`, queue grouping, timeline formatting)
- Modify: `index.html:3696-3746` (`renderPicActionItem`, `renderPicActionQueue`)
- Test: `tests/pic-queue-usability.test.js`

**Step 1:** Create `tests/pic-queue-usability.test.js` asserting:
  - Donors are separated into distinct action groups: "Perlu Pengingat", "Perlu Review Bukti", "Perlu Refund / Tindakan Lain", and "Sudah Final".
  - Next action per donor is visually prominent (e.g. highlighted WA reminder button, proof review action).
  - Repetitive multi-line timeline stacks are replaced with a compact horizontal summary line on mobile.
  - A bulk "Salin Rekap Pengingat Belum Bayar" button is available in the reminder section header for eligible un-paid donors.

**Step 2:** Refactor `renderDonorTable` in `index.html`:
  - Structure queue sections with clear visual dividers and counts.
  - Format timestamps compactly (`Daftar: 01 Agu · Bayar: 02 Agu`).
  - Add `copyUnpaidReminderRecap(detail)` helper allowing PIC to copy a formatted WhatsApp reminder list of all pending donors in one click.

**Step 3:** Run `rtk node --test tests/pic-queue-usability.test.js` to verify.

---

### Task 3: Donor Dashboard Empty State & Next-Step CTA
**Files:**
- Modify: `index.html:2810-2880` (`refreshCampaignList`)
- Test: `tests/donor-empty-state.test.js`

**Step 1:** Create `tests/donor-empty-state.test.js` asserting:
  - When a donor has no pending bills, render a calm, encouraging empty state with reassuring copy and a next-step CTA ("Lihat campaign yang masih terbuka").
  - When a donor has not joined any campaigns, provide an inviting onboarding message encouraging them to participate.
  - Empty states include semantic status icons and centered, non-alarming layout.

**Step 2:** Update `refreshCampaignList` in `index.html`:
  - Replace `<div class="card muted">Tidak ada tagihan tertunda.</div>` with a structured empty state container (`.donor-empty-state`) featuring an icon, reassurance text ("Tidak ada tagihan tertunda. Semua partisipasi Anda sudah beres."), and an anchor CTA button pointing to Open campaigns.
  - Handle the case where user has 0 joined campaigns with welcoming guidance.

**Step 3:** Run `rtk node --test tests/donor-empty-state.test.js` to verify.

---

### Task 4: Donor Campaign List Grouping & Hierarchy
**Files:**
- Modify: `index.html:2810-2885` (`refreshCampaignList`)
- Modify: `index.html:3165-3255` (`renderCampaignCard`)
- Test: `tests/donor-campaign-grouping.test.js`

**Step 1:** Create `tests/donor-campaign-grouping.test.js` asserting:
  - Campaign list separates items into three distinct sections: "Bisa Diikuti", "Sudah Diikuti", and "Selesai / Riwayat".
  - Completed / Archived campaigns are placed behind a collapsible disclosure (`<details>`) to prevent excessive vertical height.
  - Each campaign card presents exactly one primary action per state.

**Step 2:** Refactor `refreshCampaignList` and `renderCampaignCard`:
  - Filter `others` into `canJoin` (Status Open + !joined), `alreadyJoined` (joined + paid/waiting finalization), and `history` (Archived or completed).
  - Render each group under its own semantic heading with appropriate empty state fallbacks.
  - Wrap `history` campaigns in `<details class="donor-history-disclosure">` with a clear toggle label ("Lihat riwayat campaign yang sudah selesai").

**Step 3:** Run `rtk node --test tests/donor-campaign-grouping.test.js` to verify.

---

### Task 5: Admin Campaign Card Density
**Files:**
- Modify: `index.html:160-350` (CSS for Admin campaign cards and disclosure)
- Modify: `index.html:4961-5018` (`renderAdminCampaignViews`, `renderAdminCampaignActions`)
- Test: `tests/admin-campaign-density.test.js`

**Step 1:** Create `tests/admin-campaign-density.test.js` asserting:
  - Mobile campaign cards display essential data first: Campaign Name, Status Badge, Target/Collected count, Sisa Waktu / Overdue callout, and one primary action ("Lihat detail").
  - Secondary metadata (PIC name, Terakhir diupdate timestamp & author) is demoted into a compact secondary disclosure or row.
  - Card padding and internal gap adhere to `--card-pad: 16px` and `--space-2: 8px`.

**Step 2:** Refactor `renderAdminCampaignViews` in `index.html` to streamline mobile card layout and tuck audit metadata into `<details class="admin-card-more">` or compact secondary meta container.

**Step 3:** Run `rtk node --test tests/admin-campaign-density.test.js` to verify.

---

### Task 4 & 5 Verification Check:
Run `rtk node --test tests/admin-mobile-ux.test.js tests/admin-campaign-density.test.js` to ensure zero regressions in Admin tables or pagination.

---

### Task 6: Admin Token CTA Placement & Styling
**Files:**
- Modify: `index.html:2065-2070` (`#admin-section-tools` in `#view-admin-dashboard`)
- Modify: `index.html:2150-2165` (`#sa-gen-admin-form` in `#view-superadmin-dashboard`)
- Test: `tests/admin-tools-cta.test.js`

**Step 1:** Create `tests/admin-tools-cta.test.js` asserting:
  - "Generate token PIC baru" is positioned cleanly within the Tools section after Members with secondary styling (`btn secondary btn-auto`) and helper description.
  - Token generator does not compete visually with pending approvals or main campaign actions.
  - Token creation and copy functionality remains 100% operational.

**Step 2:** Update HTML structure in `#view-admin-dashboard` and `#view-superadmin-dashboard`:
  - Relocate `#admin-section-tools` after Members or style with subtle secondary card design (`background: #f8fafc`, compact button).
  - Add explanatory caption ("Gunakan untuk membuat akses PIC baru secara manual.").

**Step 3:** Run `rtk node --test tests/admin-tools-cta.test.js` to verify.

---

### Task 7: Language and Icon Consistency
**Files:**
- Modify: `index.html:1848-1850` (Header / Brand consistency)
- Modify: `index.html:2436-2446` (`paymentStatusIcon` and new SVG helpers)
- Modify: `index.html:2715-2725` ("Verified Member" / "Alumni Member" labels)
- Modify: `index.html:3145-3155`, `3228-3235`, `3825-3845` ("Copy" -> "Salin" & SVG icons)
- Modify: `index.html:3790-3805` ("Danger Zone" -> "Zona Berbahaya")
- Test: `tests/language-icon-consistency.test.js`

**Step 1:** Create `tests/language-icon-consistency.test.js` asserting:
  - Visible Indonesian replacements: "Member terverifikasi", "Member alumni", "Salin", "Zona Berbahaya", "Pembayaran Gabungan".
  - All decorative status and action SVGs include `aria-hidden="true"`.
  - Emoji system icons are replaced with lightweight, crisp SVGs.
  - No broken data models or backend role identifiers.

**Step 2:** Implement icon helpers (`uiIcon(name)`) and replace raw emojis and English labels across authenticated views in `index.html`.

**Step 3:** Run `rtk node --test` across all test suites to confirm full verification.

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Validate responsiveness on 360px and 390px mobile viewports.
3. Update `docs/plans/task.md` with task-by-task execution records.
4. Report before/after evidence and claim completion.
