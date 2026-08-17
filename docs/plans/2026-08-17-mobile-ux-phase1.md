# Authenticated Mobile UX Phase 1 Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 1 mobile UX improvements for Donatur Helper across Admin, PIC, and Donor surfaces to eliminate mobile scroll debt, establish sticky section navigation, prioritize PIC actions, clarify summary scopes, and improve overdue campaign communication.

**Architecture:** Update `index.html` (styles, HTML structure, and JS logic) using standard lightweight DOM manipulation, semantic CSS tokens, in-memory client-side pagination for long lists, and clear action priority hierarchy. Ensure all existing tests pass and add new unit tests for Admin pagination and PIC action priority.

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+), Node.js built-in test runner.

---

### Task 1: Spacing Tokens and Navigation Styles
**Files:**
- Modify: `index.html:16-160`

**Step 1:** Add minimal CSS variables (`--space-1` through `--space-6`, `--card-pad`, `--section-gap`, `--control-h`) to `:root`.
**Step 2:** Add styles for `.admin-nav-bar`, `.admin-nav-link`, `.admin-nav-logout`, `.admin-section`, `.admin-sticky-toolbar`, `.pic-share-box`, `.pic-state-callout`, `.admin-campaign-overdue-callout`, and pagination button `.admin-load-more`.
**Step 3:** Verify styles with reduced motion and mobile viewport breakpoints (360px and 390px).

---

### Task 2: Admin Sticky Role Navigation Bar and Section Anchors
**Files:**
- Modify: `index.html:1827-2095`

**Step 1:** Add `<nav class="admin-nav-bar">` inside `#view-admin-dashboard` and `#view-superadmin-dashboard` with anchors for Ringkasan (`#admin-section-summary`), Campaign (`#admin-section-campaigns`), Members (`#admin-section-members`), Tools (`#admin-section-tools`), and Logout (`logoutToken()`).
**Step 2:** Wrap sections with matching IDs and `class="admin-section"` with `scroll-margin-top: 72px`.
**Step 3:** Ensure logout action is easily reachable from the top sticky bar as well as the bottom of the page.

---

### Task 3: Admin Member List Pagination & Sticky Toolbar
**Files:**
- Modify: `index.html:5393-5480` and `index.html:4784-4835`
- Test: `tests/admin-mobile-ux.test.js`

**Step 1:** Create `tests/admin-mobile-ux.test.js` testing that member list renders <= 20 records initially and provides a "Muat lebih banyak" mechanism that expands the list.
**Step 2:** Implement pagination state (`_adminMembersPagination`, `_saMembersPagination`) with default page size of 20.
**Step 3:** Update `refreshMembers`, `filterMembers`, and `renderMembersView` to render only the visible chunk, update the counter summary ("Menampilkan X dari Y member"), and render the "Muat lebih banyak" button when Y > X.
**Step 4:** Run tests and verify member list debt is solved without breaking filtering or inline status updates.

---

### Task 4: PIC Action Priority & State Clarification
**Files:**
- Modify: `index.html:3581-3730`
- Test: `tests/pic-action-priority.test.js`

**Step 1:** Create `tests/pic-action-priority.test.js` asserting action hierarchy per state (Open: 1 primary CTA, demoted secondary share box, separate closing action; Closed: 1 primary CTA; Finalized: primary queue action).
**Step 2:** Update `renderPicActions` and `renderPicDashboard`:
  - Convert loud green share box into an elegant secondary outlined card with copy button.
  - Set `Selesaikan & input rekening` as the primary CTA (`btn blue`).
  - Make `Tutup pendaftaran` a secondary action with distinct spacing.
  - In `pic-campaign-info`, add a clear state explanation callout when target amount is Rp0 / Belum ditentukan: "Tentukan total hadiah dan rekening sebelum menagih donatur."
**Step 3:** Run `rtk node --test tests/pic-action-priority.test.js tests/pic-action-queue.test.js` to verify.

---

### Task 5: Admin Summary Scope Clarification & Overdue Campaign Clarity
**Files:**
- Modify: `index.html:2273-2303`, `index.html:4927-5013`, `index.html:2884-2916`
- Test: `tests/admin-summary-overdue.test.js`

**Step 1:** Create `tests/admin-summary-overdue.test.js` verifying summary labels (distinguishing active vs total vs pending) and overdue date display (showing absolute date and next recommended step).
**Step 2:** Refactor `renderSummaryCard` to display structured groups:
  - Campaign metrics (Open, Closed/Menunggu finalisasi, Final).
  - Financial & Donor metrics (Total donatur, Terkumpul, Belum dibayar).
  - Access & Member metrics with explicit labels: "X tampil di daftar (Y aktif) · Z total database" and token breakdown.
**Step 3:** Refactor `renderAdminCampaignDeadline` and `renderAdminCampaignViews` to show absolute date (`DD MMM YYYY`), days overdue, and an overdue callout with amber/red styling and actionable recommendation for Open campaigns.
**Step 4:** Run all tests and verify.
