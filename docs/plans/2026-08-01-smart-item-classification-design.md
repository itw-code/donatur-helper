# Smart Item Classification — Design Document
**Date:** 2026-08-01  
**Status:** Approved  
**Author:** Ihsan Wanda / Antigravity  
**Spreadsheet:** [Donatur Helper Datasource](https://docs.google.com/spreadsheets/d/1i_an1TvFU1YpI3MD1goh4qMveX4M7_4cZgR8XfrezP8/edit)  
**Apps Script (Target):** [walawenews script](https://script.google.com/home/projects/1Ngo3fU-6eOJj9rwhljEcFZQ8gKJclyCQ9Cut3s2Nu2JuA1gVm6PNUadU/edit)  
**Apps Script (Vertex AI Reference):** [GeoCodeWithAI script](https://script.google.com/home/projects/1AY0cLpbzXHFDtZcOgwNscY1qrjd3W63yIDq6mRvMtVePsoT0t4oGb_V6/edit)

---

## 1. Problem Statement

When new product items appear in the **Datasource** sheet (Column D = invoice), the formula in **Column AA** (`sync_status_display`) performs a VLOOKUP against the **Item Class** sheet to categorize them. If the item does not exist in the `Item Class` master list, the formula returns `"Not Found"`.

Currently, the existing `checkNotFoundValues()` function (in `walawenews.js`) only **detects** this problem and emails the team. It does **not resolve it**, meaning items remain uncategorized until a human manually adds them to the `Item Class` sheet — a slow and error-prone process.

---

## 2. Goals

- Automatically detect items where Column AA = `"Not Found"`.
- Use **Vertex AI (Gemini Flash)** to predict the correct Item Class based on the existing categorization patterns in the `Item Class` sheet.
- Stage the AI predictions in a new **`Pending Items Inbox`** sheet for human review.
- Allow the team to approve, edit, or reject predictions before they are written into the master `Item Class` sheet.
- Notify the team by email when new items are staged.
- Support both **manual (menu)** and **automated (time-driven trigger)** execution.

---

## 3. Architecture Overview

```
┌─────────────────────┐
│  Datasource Sheet   │
│  Col F: Item ID     │
│  Col AA: "Not Found"│
└────────┬────────────┘
         │ 1. Scan & Extract unique "Not Found" items
         ▼
┌─────────────────────┐
│  Item Class Sheet   │
│  (master list)      │◄─── 2. Cross-check: skip already existing
└────────┬────────────┘
         │ 3. Send unrecognized items to Vertex AI
         ▼
┌─────────────────────────────────────────┐
│  Vertex AI  (Gemini 2.5 Flash)          │
│  Prompt: predict category based on      │
│  existing Item Class patterns           │
└────────┬────────────────────────────────┘
         │ 4. Write AI predictions into staging sheet
         ▼
┌─────────────────────────────────────────────────────────┐
│  Pending Items Inbox Sheet (NEW)                        │
│  Columns: Item ID | AI Suggested Class | Status | Notes │
│  Status: "Pending Review"                               │
└────────┬────────────────────────────────────────────────┘
         │ 5. Email team → they review & correct AI guesses
         │
         │ 6. Team clicks "Approve Pending Items" (menu)
         ▼
┌─────────────────────┐
│  Item Class Sheet   │
│  (master list)      │ ◄─── Approved rows merged here
└─────────────────────┘
         │
         │ 7. Column AA auto-updates via VLOOKUP formula
         ▼
┌─────────────────────┐
│  Datasource Sheet   │
│  Col AA: "Synced"   │ ← "Not Found" resolved automatically
└─────────────────────┘
```

---

## 4. New Sheet: `Pending Items Inbox`

This sheet acts as a **human-in-the-loop review buffer**. It is created automatically on first run if it does not exist.

| Column | Header | Description |
|--------|--------|-------------|
| A | `item_id` | The raw Item ID string from Column F of Datasource |
| B | `ai_suggested_class` | The category predicted by Vertex AI |
| C | `confidence` | AI confidence level: `High`, `Medium`, `Low` |
| D | `status` | `Pending Review` / `Approved` / `Rejected` |
| E | `reviewer_notes` | Free-text field for the human reviewer |
| F | `staged_at` | Timestamp when the row was staged |
| G | `approved_at` | Timestamp when the row was approved/rejected |

---

## 5. Vertex AI Integration

### Authentication
We reuse the **exact same Service Account JWT authentication pattern** from the `GeoCodeWithAI` script (the Vertex AI reference project). This is a battle-tested approach already deployed in production at SawitPRO.

Credentials are stored securely in **Apps Script → Project Settings → Script Properties**:

| Property Key | Example Value | Description |
|---|---|---|
| `VERTEX_PROJECT_ID` | `my-gcp-project-123` | GCP Project ID |
| `VERTEX_REGION` | `asia-southeast1` | Primary Vertex AI region |
| `VERTEX_CLIENT_EMAIL` | `sa@project.iam.gserviceaccount.com` | Service Account email |
| `VERTEX_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | Full PEM private key (literal `\n` OK) |

The token is generated via a JWT signed with `Utilities.computeRsaSha256Signature()` and cached for 50 minutes using `CacheService` to avoid redundant token exchanges.

### Model
- **Model:** `gemini-2.5-flash` (same as GeoCodeWithAI, low cost, fast)
- **Region Fallback Chain:** Primary region → `asia-southeast1` → `us-central1`
- **Temperature:** `0` (deterministic, no creativity)
- **Max Output Tokens:** `64` (category name only, no explanation)

### Prompt Design
The prompt will be dynamically constructed to include the **full existing category list** from the `Item Class` sheet so the model has grounding context:

```
You are a product classification assistant for a palm oil agricultural company in Indonesia.

Below is the list of existing valid Item Classes:
- Pupuk
- Pupuk Grosir
- Benih
- Racun
- Khusus Petani
- Toling
- ...

Classify the following new item into ONE of the above categories.
If you are not confident, respond with: "Low confidence"

Rules:
- Respond with ONLY the category name. No explanation, no markdown.
- If the item clearly belongs to a category, respond with just the category name.
- Include a confidence prefix: "High: Pupuk" / "Medium: Racun" / "Low confidence"

Item to classify: {ITEM_ID}
```

---

## 6. Functions to Build

### In a new file `autoSolve.js` added to the Apps Script project:

| Function | Trigger | Description |
|---|---|---|
| `autoSolveMissingItems()` | Menu + Time-trigger | Main orchestrator: scans, deduplicates, calls Vertex, stages results, emails team |
| `approvePendingItems()` | Menu button | Merges `Pending Review` rows from Inbox into `Item Class` master list |
| `rejectPendingItems()` | Menu button | Marks selected rows as `Rejected` and skips them |
| `getItemClassAccessToken_()` | Internal | JWT auth helper (ported from GeoCodeWithAI) |
| `normalizeItemClassPrivateKey_()` | Internal | Key sanitizer (ported from GeoCodeWithAI) |
| `ensurePendingInboxSheet_()` | Internal | Creates the staging sheet if missing |
| `classifyItemViaVertex_(itemId, categories)` | Internal | Calls Vertex AI and returns `{ suggestedClass, confidence }` |
| `installAutoSolveTrigger()` | Menu button | Installs a time-driven trigger (every 6 hours) |
| `removeAutoSolveTrigger()` | Menu button | Removes the time-driven trigger |

### Updated in `Code.js`:

The `onOpen()` menu will be extended with a new submenu section:

```javascript
.addSeparator()
.addItem('Auto-Solve Missing Items', 'autoSolveMissingItems')
.addItem('Approve Pending Items',    'approvePendingItems')
.addItem('Reject Pending Items',     'rejectPendingItems')
.addSeparator()
.addItem('Install Auto-Solve Trigger', 'installAutoSolveTrigger')
.addItem('Remove Auto-Solve Trigger',  'removeAutoSolveTrigger')
```

---

## 7. Email Notification

When new items are staged into the `Pending Items Inbox`, the script sends a single summary email to the team:

- **To:** `ida.brahmavidya@sawitpro.com`
- **CC:** `edo.syahputra@sawitpro.com`, `ihsan.wanda@sawitpro.com`
- **Subject:** `[Action Required] X new items staged for classification review`
- **Body:** Bulleted list of Item IDs with AI's suggested class and confidence level, plus a direct link to the `Pending Items Inbox` sheet.

---

## 8. Error Handling

| Scenario | Handling |
|---|---|
| No "Not Found" items in Datasource | Early exit with `Logger.log`, no email sent |
| Item already exists in `Item Class` | Skipped (deduplication cross-check) |
| Item already in `Pending Items Inbox` with status not Approved/Rejected | Skipped to avoid duplicate staging |
| Vertex AI credentials missing from Script Properties | Log error, stage item with `confidence = "Unclassified"` so team fills manually |
| Vertex AI returns low confidence | Stage with `confidence = "Low"` — reviewer must classify manually |
| Vertex AI quota exceeded | Abort batch, log warning, items stay as "Not Found" for next run |
| `Item Class` sheet not found | Show alert to user, abort function |
| `Datasource` sheet not found | Show alert to user, abort function |

---

## 9. Trigger Setup

A Time-Driven Trigger installed via a menu item `"Install Auto-Solve Trigger"`:

```javascript
ScriptApp.newTrigger('autoSolveMissingItems')
  .timeBased()
  .everyHours(6)   // runs 4x per day
  .create();
```

---

## 10. Script Properties Required

Before running, these properties must be set in Apps Script Project Settings:

```
VERTEX_PROJECT_ID    → your GCP project ID
VERTEX_REGION        → asia-southeast1 (or your preferred region)
VERTEX_CLIENT_EMAIL  → service-account@project.iam.gserviceaccount.com
VERTEX_PRIVATE_KEY   → -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

> **Note:** These are the same property keys used in the GeoCodeWithAI script.
> If the same Service Account is reused, values can be copied directly from that project's settings.

---

## 11. Out of Scope

- Automatically approving items without human review (by design — data integrity must be maintained).
- Modifying the VLOOKUP formula logic in Column AA.
- Integrating with Shopify API to fetch product metadata (future iteration).
- Deleting or modifying existing rows in `Item Class`.
- Classifying items that are already in `Item Class` with a valid category.
