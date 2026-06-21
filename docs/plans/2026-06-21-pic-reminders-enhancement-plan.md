# Enhanced PIC Reminders and Gratitude Messages Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal**: Implement and verify enhanced group reminder, invitation, and gratitude templates for the PIC, handling standard and custom pledge breakdowns dynamically on the backend.

**Architecture**: Add string-builder helper functions in `Code.js` that format messages based on campaign status, donor lists, and rounding rules. Update `getReminderInfo` to serve as the unified API router. Add new action triggers and clipboard buttons to the PIC Dashboard in `Index.html`.

**Tech Stack**: Google Apps Script (JavaScript), HTML, Tailwind-free CSS.

---

### Task 1: Backend Helpers and Unit Tests

**Files**:
* Modify: `Code.js`
* Test: `Code.js` (using inline `runReminderTests()` helper)

**Step 1: Write failing test functions**
Write `runReminderTests()` at the bottom of `Code.js` asserting that the reminder templates contain the correct formatting details for all states.
```javascript
function runReminderTests() {
  const mockCampaign = {
    CampaignID: "C-TEST1",
    TargetName: "Test Target",
    Reason: "Resign",
    GiftAmount: 1000000,
    Deadline: "2026-07-01",
    Status: "Open",
    BankName: "BCA",
    BankAccount: "123456",
    AccountHolder: "Test Holder"
  };
  const mockDonors = [
    { Name: "Donor A", WhatsApp: "6281", DonorStatus: "Pledged" },
    { Name: "Donor B", WhatsApp: "6282", DonorStatus: "Pledged", CustomAmount: 200000 }
  ];
  
  // Assertions for pre-registration
  const invite = generatePreRegistrationMessage_(mockCampaign, mockDonors, "http://mock");
  if (!invite.includes("Test Target") || !invite.includes("Donor A")) throw new Error("Invite test failed");
  
  // Assertions for billing reminder
  mockCampaign.Status = "Finalized";
  const bill = generateGroupBillingReminder_(mockCampaign, mockDonors, "http://mock");
  if (!bill.includes("Nominal Bebas: Rp200.000") || !bill.includes("Tagihan per orang standard")) throw new Error("Billing test failed");
  
  // Assertions for gratitude
  const thanks = generateGratitudeMessage_(mockCampaign, mockDonors);
  if (!thanks.includes("Rp200.000") || !thanks.includes("Donor A")) throw new Error("Gratitude test failed");
  
  Logger.log("ALL TEST CASES PASSED!");
}
```

**Step 2: Run test to verify it fails**
We cannot run it yet since the generator helpers are not defined. We expect a ReferenceError.
Verification: Execute `runReminderTests()` in the Apps Script environment (or mock check).

**Step 3: Write minimal implementation**
Implement helper functions:
* `generatePreRegistrationMessage_(campaign, donors, webUrl)`
* `generateGroupBillingReminder_(campaign, donors, webUrl)`
* `generateGratitudeMessage_(campaign, donors)`
Update `getReminderInfo(picToken)` to load the dynamic webUrl using `ScriptApp.getService().getUrl()` and delegate based on campaign status and unpaid donor checks.

**Step 4: Run test to verify it passes**
Expected: Tests print `"ALL TEST CASES PASSED!"` in the logger output.

**Step 5: Commit**
```bash
git add Code.js
git commit -m "feat(backend): add enhanced reminder helper generators and routing logic"
```

---

### Task 2: Frontend Dashboard UI and Handler Integration

**Files**:
* Modify: `Index.html`

**Step 1: Write a mock verification for UI copy actions**
Simulate/write the handler code in `Index.html` to ensure `copyPicGroupReminder()` resolves successfully.

**Step 2: Run verification**
Verify existing buttons load without console errors.

**Step 3: Modify UI logic**
* Replace the Share box in `renderPicActions(detail)` to dynamically display `📋 Copy Undangan Patungan` (when Open/Closed), `📋 Copy Tagihan Patungan (Grup)` (when Finalized and unpaid donors remain), and `📋 Copy Laporan Selesai (Gratitude)` (when Finalized and all are verified paid).
* Add the JS function `copyPicGroupReminder()` to call the backend `getReminderInfo` and copy the result to clipboard with a toast feedback message.

**Step 4: Run manual verification**
Load page, check button displays for each campaign state.

**Step 5: Commit**
```bash
git add Index.html
git commit -m "feat(frontend): integrate dynamic group reminder buttons on PIC dashboard"
```
