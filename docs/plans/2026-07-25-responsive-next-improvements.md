# Responsive & UX Improvement Plan (Post-Launch)

> **For Antigravity:** REQUIRED WORKFLOW: Use `/grill-with-docs` to refine each task before `/implement`.

**Goal**: Address remaining responsive gaps, improve mobile UX for Admin/SuperAdmin data tables, and enhance overall app usability identified during the 2026-07-25 responsive overhaul.

**Architecture**: All changes target `index.html` (single-file SPA). No backend (`Code.js`) changes required unless noted.

**Tech Stack**: Vanilla CSS media queries, inline HTML/CSS/JS in `index.html`.

---

## Completed (2026-07-25)

- [x] Viewport meta + charset UTF-8 added
- [x] 4-tier breakpoint system (≤480 / 481–767 / 768–1023 / ≥1024)
- [x] PIC donor table → card reflow on mobile
- [x] Pending members → card reflow on mobile (Admin + SuperAdmin)
- [x] Forms 2-column at 768px+ (PIC create, donor registration)
- [x] All modals → bottom sheets on mobile
- [x] Toast → full-width banner on mobile
- [x] 44px touch targets (excluding checkboxes/radios)
- [x] Admin campaign table wrapped in .table-responsive
- [x] Admin modal (View) → bottom sheet + inner table scroll
- [x] Confirm/Edit modal buttons → stack vertically on mobile
- [x] Checkbox alignment fix (donor campaign cards)
- [x] File input width fix
- [x] SuperAdmin settings min-width override

---

## Phase 1: High Priority (Next Sprint)

### Task 1: Admin/SuperAdmin Table Card Reflow

**Problem**: Admin campaign table (7 cols), member list (5-6 cols), late donor table (5 cols), and admin list (5 cols) still rely on horizontal scroll on mobile. Horizontal scroll is functional but not a great experience.

**Approach**: Apply the same dual-render pattern used for PIC donor table and pending members:
- Render a card layout (`.admin-cards`) alongside the table
- CSS toggles visibility at 768px breakpoint
- Each card shows: key info (name, status badge, key metric) + action buttons

**Files**: `index.html` (JS render functions + CSS)

**Functions to modify**:
- `renderAdminCampaignTable()` → campaign cards (target name, status, PIC, donor count, actions)
- `refreshMembers()` → member cards (name, WA, role badge, status select, actions)
- `refreshLateRequests()` → late donor cards (campaign, name, amount, approve/reject)
- Admin list render → admin cards (alias, token preview, actions)

**Acceptance criteria**:
- [ ] No horizontal scroll needed on any Admin/SA view at ≤767px
- [ ] All action buttons meet 44px touch target
- [ ] Desktop (≥768px) retains full table layout unchanged

---

### Task 2: Member Status Dropdown UX

**Problem**: The member list Status column uses a `<select>` inside a table cell. On mobile (even with horizontal scroll), it's hard to read and interact with while scrolling.

**Approach**:
- In the mobile card layout (Task 1), render the status as a segmented button group (Active / Ex / Pending) instead of a dropdown
- Tap to change, with immediate visual feedback
- Keep the `<select>` for desktop table view

**Files**: `index.html` (JS render + CSS)

**Acceptance criteria**:
- [ ] Status change works via tap on mobile cards
- [ ] Visual feedback on selection (highlighted state)
- [ ] Desktop retains dropdown behavior

---

### Task 3: PIC Dashboard Mobile Card Actions Font Size

**Problem**: Action buttons in `.donor-card-actions` render at 11px font inside 44px-tall buttons. Functional but visually awkward.

**Approach**: Bump font-size to 13px for buttons inside `.donor-card-actions` and `.pending-card-actions` on mobile.

**Files**: `index.html` (CSS only)

**Acceptance criteria**:
- [ ] Buttons in mobile cards are 13px font minimum
- [ ] No layout breakage from larger text

---

## Phase 2: Medium Priority

### Task 4: Swipe-to-Dismiss Bottom Sheets

**Problem**: Bottom sheets have no drag-to-dismiss gesture. Users must find and tap the × button or "Batal".

**Approach**:
- Add a drag handle bar (40px × 4px rounded pill) at the top of each bottom sheet
- Implement touch event listeners for swipe-down-to-close (>80px threshold)
- Add subtle transition animation on dismiss

**Files**: `index.html` (JS + CSS)

**Acceptance criteria**:
- [ ] Drag handle visible on all bottom sheets at ≤767px
- [ ] Swipe down >80px closes the modal
- [ ] Smooth slide-down animation on dismiss
- [ ] No interference with inner scroll (only dismiss when scrolled to top)

---

### Task 5: Pull-to-Refresh on Dashboards

**Problem**: No way to refresh data on mobile without a full page reload.

**Approach**:
- Add a pull-to-refresh gesture on the donor dashboard and PIC dashboard
- Show a spinner indicator during refresh
- Call the existing `refreshCampaignList()` / `renderPicDashboard()` functions

**Files**: `index.html` (JS + CSS)

**Acceptance criteria**:
- [ ] Pull down >60px triggers refresh
- [ ] Spinner shows during API call
- [ ] Works on donor dashboard and PIC dashboard
- [ ] Does not conflict with inner scroll containers

---

### Task 6: Landscape Phone Support (481–767px)

**Problem**: The 481–767px tier constrains `.wrap` to 480px, wasting horizontal space on landscape phones (~667px wide).

**Approach**:
- At 481–767px, allow `.wrap` to use `max-width: 100%` with `padding: 24px`
- Enable 2-column grid for campaign cards in the donor dashboard
- Keep forms single-column (readability)

**Files**: `index.html` (CSS only)

**Acceptance criteria**:
- [ ] Landscape phone uses full width
- [ ] Campaign cards display in 2-column grid
- [ ] No overflow or cramped layouts

---

## Phase 3: Low Priority / Polish

### Task 7: Dark Mode Support

**Approach**: Add `prefers-color-scheme: dark` media query with inverted CSS variables. All colors are already in `:root` variables, making this straightforward.

### Task 8: Reduce innerHTML Re-renders

**Problem**: All dynamic content is rebuilt via `innerHTML` on every state change. This causes flicker and loses scroll position.

**Approach**: Introduce targeted DOM updates (update specific cells/cards) instead of full re-renders for high-frequency operations (payment verification, status changes).

### Task 9: Accessibility Audit

- Add `aria-label` to icon-only buttons (×, 🔄, 🗑️)
- Add `role="dialog"` and `aria-modal` to modals
- Ensure focus trapping in bottom sheets
- Add `aria-live="polite"` to toast

### Task 10: PWA / Install Prompt

- Add `manifest.json` with app icons
- Add service worker for offline shell caching
- Enable "Add to Home Screen" for frequent donors/PICs

---

## Suggested Flow (per ask-matt)

```
/grill-with-docs  →  refine each task's scope
/to-spec          →  if multi-session (Tasks 1-2 likely are)
/to-tickets       →  split into tracer-bullet tickets
/implement        →  one ticket per session, /tdd internally
/code-review      →  two-axis review before commit
```

Tasks 3 and 6 are single-session `/implement` candidates (CSS-only, no spec needed).
Tasks 4-5 are prototype-first (`/prototype` to validate gesture feel, then `/implement`).
