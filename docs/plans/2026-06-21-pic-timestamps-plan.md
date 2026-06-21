# PIC Donor Timestamps and Audit Trail Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Enhance the donor list on the PIC Dashboard to display a dynamic, stacked milestone timeline showing registration, transfer proof upload, and verification/refund timestamps, backed by server-side modification audit logs.

**Architecture:** Update backend functions `picVerifyPayment` and `picMarkRefunded` in `Code.js` to write the performing PIC's alias to `ModifiedBy` and `new Date()` to `ModifiedAt` in the spreadsheet. In the frontend (`Index.html`), add styling for a clean stacked milestone list, and update `renderDonorTable` to parse and render `JoinedAt`, `PaidAt`, `ModifiedAt`, and `ModifiedBy` as visual timeline checkpoints.

**Tech Stack:** Google Apps Script (JavaScript), HTML, Vanilla CSS.

---

### Task 1: Backend Audit Logging and Local Tests

**Files:**
- Modify: `Code.js`
- Test: `C:/Users/oneda/.gemini/antigravity-ide/brain/53a525a2-13d6-42ab-9297-847d6b927457/scratch/run_backend_tests.js`

**Step 1: Write the failing test**
We will add assertions to the local test runner to verify audit logging columns are written correctly when verifying payment and marking a refund.
Open and update `C:/Users/oneda/.gemini/antigravity-ide/brain/53a525a2-13d6-42ab-9297-847d6b927457/scratch/run_backend_tests.js` to:
1. Mock `SpreadsheetApp` and sheet modification actions.
2. Call `picVerifyPayment` and check that it sets `ModifiedBy` and `ModifiedAt`.
3. Call `picMarkRefunded` and check that it sets `ModifiedBy` and `ModifiedAt`.

```javascript
// Test implementation in run_backend_tests.js:
// We will verify that backend functions correctly modify row coordinates for ModifiedBy and ModifiedAt columns.
```

**Step 2: Run test to verify it fails**
Run command: `node "C:\Users\oneda\.gemini\antigravity-ide\brain\53a525a2-13d6-42ab-9297-847d6b927457\scratch\run_backend_tests.js"`
Expected: Fail because `picVerifyPayment` and `picMarkRefunded` do not yet set these columns.

**Step 3: Write minimal implementation**
Modify `picVerifyPayment` and `picMarkRefunded` in `Code.js` to resolve `tok.Alias || 'PIC'`, fetch indices for `ModifiedBy` and `ModifiedAt`, and call `setValue` with them.

**Step 4: Run test to verify it passes**
Run command: `node "C:\Users\oneda\.gemini\antigravity-ide\brain\53a525a2-13d6-42ab-9297-847d6b927457\scratch\run_backend_tests.js"`
Expected: All assertions pass.

**Step 5: Commit**
```bash
git add Code.js
git commit -m "feat(backend): add PIC alias and timestamp audit logging during verification and refund"
```

---

### Task 2: Frontend Dashboard Milestone Timeline

**Files:**
- Modify: `Index.html`

**Step 1: Write a mock verification for timeline rendering**
We will inspect `Index.html` code to verify we render the timestamps in `renderDonorTable`.

**Step 2: Run verification**
Load/preview the dashboard (or inspect code) to verify the current single registration timestamp is displayed.

**Step 3: Modify UI logic**
1. Add CSS rules in the `<style>` block in `Index.html` for `.milestone-stack`, `.milestone-item`, `.milestone-dot`, `.milestone-dot.daftar`, `.milestone-dot.bayar`, `.milestone-dot.verif`, `.milestone-dot.refund`, `.milestone-label`, and `.milestone-time`.
2. Update `renderDonorTable` in `Index.html` to render the dynamic stacked milestones under the "Waktu" column. It should display:
   - **Daftar**: `JoinedAt` timestamp (always shown).
   - **Bayar**: `PaidAt` timestamp (shown if `Paid` is true/TRUE).
   - **Verif**: `ModifiedAt` timestamp and `ModifiedBy` alias (shown if `Verified` is true/TRUE and `ModifiedAt` is present).
   - **Refund**: `ModifiedAt` timestamp and `ModifiedBy` alias (shown if `Refunded` is true/TRUE and `ModifiedAt` is present).

**Step 4: Run manual verification**
Verify the table rendering code runs without errors.

**Step 5: Commit**
```bash
git add Index.html
git commit -m "feat(frontend): render dynamic stacked milestone timelines on PIC donor dashboard"
```
