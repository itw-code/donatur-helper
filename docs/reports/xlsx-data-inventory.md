# Donatur Helper - XLSX Data Model Inventory Report

**Generated Date**: 2026-08-18T08:24:14.585Z  
**Source File**: `data/source/donatur-helper.xlsx` (61.19 KB)  
**Total Sheets Detected**: 7  
**Privacy Assurance**: All PII, phone numbers, emails, tokens, proof links, bank accounts, and personal names are strictly redacted/anonymized.

---

## 1. Executive Summary & Sheet Overview

| Sheet / Tab Name | Total Raw Rows | Data Rows | Empty Rows | Column Count | Primary Key Candidate(s) | Status / Quality Assessment |
| ---------------- | -------------: | --------: | ---------: | -----------: | ------------------------ | --------------------------- |
| **Workaroundsz** | 78 | 77 | 0 | 34 | _None detected_ | ⚠️ 24 issue(s) |
| **Settings** | 7 | 6 | 0 | 2 | `Key` | ⚠️ 1 issue(s) |
| **Members** | 102 | 101 | 0 | 9 | `WhatsApp` | ⚠️ 3 issue(s) |
| **Tokens** | 48 | 47 | 0 | 7 | `TokenID` | ⚠️ 1 issue(s) |
| **Campaigns** | 984 | 10 | 973 | 18 | `CampaignID` | ⚠️ 2 issue(s) |
| **LateRequests** | 7 | 6 | 0 | 11 | `RequestID` | ⚠️ 2 issue(s) |
| **Donors** | 222 | 221 | 0 | 17 | `(CampaignID, WhatsApp)` | ⚠️ 3 issue(s) |

---

## 2. Detailed Sheet Analysis & Column Definitions

### Sheet: `Workaroundsz`

- **Data Rows**: 77 (allocated raw rows: 78)
- **Detected Headers**: `__EMPTY_COL_1`, `__EMPTY_COL_2`, `__EMPTY_COL_3`, `__EMPTY_COL_4`, `__EMPTY_COL_5`, `__EMPTY_COL_6`, `__EMPTY_COL_7`, `__EMPTY_COL_8`, `__EMPTY_COL_9`, `__EMPTY_COL_10`, `__EMPTY_COL_11`, `__EMPTY_COL_12`, `__EMPTY_COL_13`, `__EMPTY_COL_14`, `__EMPTY_COL_15`, `__EMPTY_COL_16`, `__EMPTY_COL_17`, `__EMPTY_COL_18`, `CampaignID`, `Name`, `WhatsApp`, `JoinedAt`, `DonorStatus`, `AmountDue`, `Paid`, `ProofLink`, `PaidAt`, `CustomAmount`, `AmountPaid`, `Verified`, `Refunded`, `Alias`, `ModifiedBy`, `ModifiedAt`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Sheet 'Workaroundsz' is not defined in standard Code.js schema (likely scratch or backup tab)
  - ⚠️ Column '__EMPTY_COL_2' is 100% empty across all 77 rows
  - ⚠️ Column '__EMPTY_COL_5' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_6' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_7' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_8' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_9' is 100% empty across all 77 rows
  - ⚠️ Column '__EMPTY_COL_10' is 100% empty across all 77 rows
  - ⚠️ Column '__EMPTY_COL_12' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_13' is 100% empty across all 77 rows
  - ⚠️ Column '__EMPTY_COL_14' is 100% empty across all 77 rows
  - ⚠️ Column '__EMPTY_COL_16' contains mixed types: integer, string
  - ⚠️ Column '__EMPTY_COL_18' is 100% empty across all 77 rows
  - ⚠️ Column 'WhatsApp' contains mixed types: integer, string
  - ⚠️ Column 'AmountDue' is 100% empty across all 77 rows
  - ⚠️ Column 'ProofLink' is 100% empty across all 77 rows
  - ⚠️ Column 'PaidAt' is 100% empty across all 77 rows
  - ⚠️ Column 'CustomAmount' is 100% empty across all 77 rows
  - ⚠️ Column 'AmountPaid' is 100% empty across all 77 rows
  - ⚠️ Column 'Verified' is 100% empty across all 77 rows
  - ⚠️ Column 'Refunded' is 100% empty across all 77 rows
  - ⚠️ Column 'Alias' is 100% empty across all 77 rows
  - ⚠️ Column 'ModifiedBy' is 100% empty across all 77 rows
  - ⚠️ Column 'ModifiedAt' is 100% empty across all 77 rows

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `__EMPTY_COL_1` | 0 | 🔒 **Sensitive (PII)** | 1.3% (1/77) | string | `text` | _Samples_: `SA-****` |
| `__EMPTY_COL_2` | 1 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `__EMPTY_COL_3` | 2 | 🔒 **Sensitive (PII)** | 100% (77/77) | string | `text` | _Samples_: `H***`, `K***`, `W***` |
| `__EMPTY_COL_4` | 3 | 🔒 **Sensitive (PII)** | 100% (77/77) | string | `text` | _Samples_: `H***`, `K***`, `W***` |
| `__EMPTY_COL_5` | 4 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `628****89`, `628****34`, `628****22` |
| `__EMPTY_COL_6` | 5 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `851****89`, `812****34`, `08112002122‬` |
| `__EMPTY_COL_7` | 6 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `851****89`, `812****34`, `811****22` |
| `__EMPTY_COL_8` | 7 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `851****89`, `812****34`, `811****22` |
| `__EMPTY_COL_9` | 8 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `__EMPTY_COL_10` | 9 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `__EMPTY_COL_11` | 10 | 🔒 **Sensitive (PII)** | 64.9% (50/77) | string | `text` | _Samples_: `H***`, `K***`, `W***` |
| `__EMPTY_COL_12` | 11 | 🔒 **Sensitive (PII)** | 64.9% (50/77) | integer, string | `text` | _Samples_: `628****89`, `628****34`, `628****22` |
| `__EMPTY_COL_13` | 12 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `__EMPTY_COL_14` | 13 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `__EMPTY_COL_15` | 14 | 🔒 **Sensitive (PII)** | 100% (77/77) | string | `text` | _Samples_: `H***`, `K***`, `W***` |
| `__EMPTY_COL_16` | 15 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `628****89`, `628****34`, `628****22` |
| `__EMPTY_COL_17` | 16 | 🔒 **Sensitive (PII)** | 100% (77/77) | string | `text` | _Samples_: `C-5170E8E5`, `C-C8A76FD7` |
| `__EMPTY_COL_18` | 17 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `CampaignID` | 18 | 🟢 Safe | 100% (77/77) | string | `text` | _Samples_: `C-5170E8E5`, `C-C8A76FD7` |
| `Name` | 19 | 🔒 **Sensitive (PII)** | 100% (77/77) | string | `text` | _Samples_: `H***`, `K***`, `W***` |
| `WhatsApp` | 20 | 🔒 **Sensitive (PII)** | 100% (77/77) | integer, string | `text` | _Samples_: `628****89`, `628****34`, `628****22` |
| `JoinedAt` | 21 | 🟢 Safe | 100% (77/77) | date | `timestamptz` | _Samples_: `2026-06-17` |
| `DonorStatus` | 22 | 🟢 Safe | 100% (77/77) | string | `text` | **Values**: `Pleged` |
| `AmountDue` | 23 | 🟢 Safe | 0% (0/77) |  | `numeric(12,2)` | _(empty)_ |
| `Paid` | 24 | 🟢 Safe | 100% (77/77) | boolean | `boolean` | **Values**: `false` |
| `ProofLink` | 25 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `PaidAt` | 26 | 🟢 Safe | 0% (0/77) |  | `timestamptz` | _(empty)_ |
| `CustomAmount` | 27 | 🟢 Safe | 0% (0/77) |  | `numeric(12,2)` | _(empty)_ |
| `AmountPaid` | 28 | 🟢 Safe | 0% (0/77) |  | `numeric(12,2)` | _(empty)_ |
| `Verified` | 29 | 🟢 Safe | 0% (0/77) |  | `boolean` | _(empty)_ |
| `Refunded` | 30 | 🟢 Safe | 0% (0/77) |  | `boolean` | _(empty)_ |
| `Alias` | 31 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `ModifiedBy` | 32 | 🔒 **Sensitive (PII)** | 0% (0/77) |  | `text` | _(empty)_ |
| `ModifiedAt` | 33 | 🟢 Safe | 0% (0/77) |  | `timestamptz` | _(empty)_ |

### Sheet: `Settings`

- **Data Rows**: 6 (allocated raw rows: 7)
- **Detected Headers**: `Key`, `Value`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Column 'Value' contains mixed types: boolean, integer, string

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `Key` | 0 | 🟢 Safe | 100% (6/6) | string | `text` | **Values**: `AdminNotificationEmails`, `AppUrl`, `EnableRounding`, `ProofsFolderId`, `RequireMemberValidation`, `RoundToNearest` |
| `Value` | 1 | 🔒 **Sensitive (PII)** | 100% (6/6) | boolean, integer, string | `text` | _Samples_: `true`, `10`, `[FOLDER_ID_REDACTED]` |

### Sheet: `Members`

- **Data Rows**: 101 (allocated raw rows: 102)
- **Detected Headers**: `Name`, `WhatsApp`, `Status`, `AddedBy`, `AddedAt`, `Role`, `ModifiedBy`, `ModifiedAt`, `Email`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Column 'Name' contains mixed types: string, integer
  - ⚠️ Column 'WhatsApp' contains mixed types: integer, string
  - ⚠️ Column 'ModifiedBy' contains mixed types: integer, string

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `Name` | 0 | 🔒 **Sensitive (PII)** | 100% (101/101) | string, integer | `text` | _Samples_: `I***`, `M*** g***`, `K***` |
| `WhatsApp` | 1 | 🔒 **Sensitive (PII)** | 100% (101/101) | integer, string | `text` | _Samples_: `628****43`, `628****33`, `628****21` |
| `Status` | 2 | 🟢 Safe | 100% (101/101) | string | `text` | **Values**: `Pending`, `active`, `deleted`, `ex`, `rejected` |
| `AddedBy` | 3 | 🔒 **Sensitive (PII)** | 100% (101/101) | string | `text` | _Samples_: `S***`, `H*** H***`, `S*** * a***` |
| `AddedAt` | 4 | 🟢 Safe | 100% (101/101) | date | `timestamptz` | _Samples_: `2026-06-12`, `2026-06-13`, `2026-06-14` |
| `Role` | 5 | 🟢 Safe | 50.5% (51/101) | string | `text` | **Values**: `Admin`, `Member` |
| `ModifiedBy` | 6 | 🔒 **Sensitive (PII)** | 62.4% (63/101) | integer, string | `text` | _Samples_: `628****43`, `S***`, `B*** E***` |
| `ModifiedAt` | 7 | 🟢 Safe | 62.4% (63/101) | date | `timestamptz` | _Samples_: `2026-07-30`, `2026-06-16`, `2026-06-30` |
| `Email` | 8 | 🔒 **Sensitive (PII)** | 1% (1/101) | string | `text` | _Samples_: `ih***@gmail.com` |

### Sheet: `Tokens`

- **Data Rows**: 47 (allocated raw rows: 48)
- **Detected Headers**: `TokenID`, `Role`, `Status`, `LinkedCampaignID`, `CreatedBy`, `CreatedAt`, `Alias`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Column 'CreatedBy' contains mixed types: string, integer

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `TokenID` | 0 | 🔒 **Sensitive (PII)** | 100% (47/47) | string | `text` | _Samples_: `PIC-CE6AD6EA`, `PIC-081A6333`, `PIC-FA194203` |
| `Role` | 1 | 🟢 Safe | 100% (47/47) | string | `text` | **Values**: `Admin`, `PIC` |
| `Status` | 2 | 🟢 Safe | 100% (47/47) | string | `text` | **Values**: `Active`, `Expired`, `Unused` |
| `LinkedCampaignID` | 3 | 🟢 Safe | 31.9% (15/47) | string | `text` | _Samples_: `C-3A4564AD`, `C-1E37F1F5`, `C-04674E2E` |
| `CreatedBy` | 4 | 🔒 **Sensitive (PII)** | 100% (47/47) | string, integer | `text` | _Samples_: `ADM-****`, `628****43`, `628989` |
| `CreatedAt` | 5 | 🟢 Safe | 100% (47/47) | date | `timestamptz` | _Samples_: `2026-06-12`, `2026-06-13`, `2026-06-15` |
| `Alias` | 6 | 🔒 **Sensitive (PII)** | 8.5% (4/47) | string | `text` | _Samples_: `B*** E***`, `H*** H***`, `I***` |

### Sheet: `Campaigns`

- **Data Rows**: 10 (allocated raw rows: 984)
- **Detected Headers**: `CampaignID`, `TargetName`, `Reason`, `GiftAmount`, `Status`, `StartDate`, `Deadline`, `BankName`, `BankAccount`, `AccountHolder`, `RoundingUsed`, `RoundTo`, `CreatedAt`, `FinalizedAt`, `GiftLink`, `GiftImage`, `ModifiedBy`, `ModifiedAt`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Contains 973 trailing empty rows allocated by Google Sheets
  - ⚠️ Column 'BankAccount' contains mixed types: integer, string

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `CampaignID` | 0 | 🟢 Safe | 100% (10/10) | string | `text` | _Samples_: `C-04674E2E`, `C-5170E8E5`, `C-C8A76FD7` |
| `TargetName` | 1 | 🔒 **Sensitive (PII)** | 100% (10/10) | string | `text` | _Samples_: `K***`, `E***`, `D***` |
| `Reason` | 2 | 🟢 Safe | 100% (10/10) | string | `text` | _Samples_: `Lastday 19 Juni 2026`, `resign: 19 June 2026`, `Resign 30 June 2026` |
| `GiftAmount` | 3 | 🟢 Safe | 100% (10/10) | integer | `numeric(12,2)` | _Samples_: `2000000`, `1700000`, `1649000` |
| `Status` | 4 | 🟢 Safe | 100% (10/10) | string | `text` | **Values**: `Archived`, `Finalized`, `Open` |
| `StartDate` | 5 | 🟢 Safe | 60% (6/10) | date | `timestamptz` | _Samples_: `2026-06-11`, `2026-06-16`, `2026-06-21` |
| `Deadline` | 6 | 🟢 Safe | 100% (10/10) | date | `timestamptz` | _Samples_: `2026-06-17`, `2026-06-18`, `2026-06-25` |
| `BankName` | 7 | 🟢 Safe | 50% (5/10) | string | `text` | _Samples_: `Gopay`, `BCA` |
| `BankAccount` | 8 | 🔒 **Sensitive (PII)** | 50% (5/10) | integer, string | `text` | _Samples_: `823****43`, `40****89`, `73****69` |
| `AccountHolder` | 9 | 🔒 **Sensitive (PII)** | 50% (5/10) | string | `text` | _Samples_: `S*** b***`, `H***`, `B*** K***` |
| `RoundingUsed` | 10 | 🟢 Safe | 50% (5/10) | boolean | `boolean` | **Values**: `false`, `true` |
| `RoundTo` | 11 | 🟢 Safe | 50% (5/10) | integer | `integer` | **Values**: `10`, `500` |
| `CreatedAt` | 12 | 🟢 Safe | 100% (10/10) | date | `timestamptz` | _Samples_: `2026-06-12`, `2026-06-17`, `2026-06-22` |
| `FinalizedAt` | 13 | 🟢 Safe | 50% (5/10) | date | `timestamptz` | _Samples_: `2026-06-12`, `2026-06-19`, `2026-06-26` |
| `GiftLink` | 14 | 🔒 **Sensitive (PII)** | 10% (1/10) | string | `text` | _Samples_: `https://shopee.co.id/[REDACTED_PATH]` |
| `GiftImage` | 15 | 🔒 **Sensitive (PII)** | 50% (5/10) | string | `text` | _Samples_: `https://drive.google.com/[REDACTED_PATH]` |
| `ModifiedBy` | 16 | 🔒 **Sensitive (PII)** | 10% (1/10) | string | `text` | _Samples_: `B*** E***` |
| `ModifiedAt` | 17 | 🟢 Safe | 10% (1/10) | date | `timestamptz` | _Samples_: `2026-08-01` |

### Sheet: `LateRequests`

- **Data Rows**: 6 (allocated raw rows: 7)
- **Detected Headers**: `RequestID`, `CampaignID`, `PIC_Alias`, `DonorWhatsApp`, `DonorName`, `DonorAlias`, `Reason`, `IsCustom`, `CustomAmount`, `Status`, `CreatedAt`
- **Sheet Warnings & Anomalies**:
  - ⚠️ CRITICAL SCHEMA DRIFT: Header-to-data column misalignment detected! In the sheet, data was inserted with column order different from headers: DonorWhatsApp contains donor names, DonorName contains WhatsApp numbers, IsCustom contains reasons, Reason contains amounts, and Status contains timestamps.
  - ⚠️ Column 'CreatedAt' is 100% empty across all 6 rows

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `RequestID` | 0 | 🟢 Safe | 100% (6/6) | string | `uuid` | _Samples_: `REQ-389AF9CE`, `REQ-4BE0E9FF`, `REQ-D0FE00E9` |
| `CampaignID` | 1 | 🟢 Safe | 100% (6/6) | string | `text` | _Samples_: `C-04674E2E` |
| `PIC_Alias` | 2 | 🔒 **Sensitive (PII)** | 100% (6/6) | string | `text` | _Samples_: `ADM-****`, `PIC (Kyle)` |
| `DonorWhatsApp` | 3 | 🔒 **Sensitive (PII)** | 100% (6/6) | string | `text` | _Samples_: `M***`, `m***`, `M*** g***` |
| `DonorName` | 4 | 🔒 **Sensitive (PII)** | 100% (6/6) | integer | `integer` | _Samples_: `628****89`, `628****56`, `628****31` |
| `DonorAlias` | 5 | 🔒 **Sensitive (PII)** | 100% (6/6) | boolean | `boolean` | _Samples_: `t***` |
| `Reason` | 6 | 🟢 Safe | 100% (6/6) | integer | `integer` | _Samples_: `2000000`, `1500000`, `1200000` |
| `IsCustom` | 7 | 🟢 Safe | 100% (6/6) | string | `boolean` | **Values**: `Kelupaan`, `Lupa cuy`, `asda`, `goks`, `test` |
| `CustomAmount` | 8 | 🟢 Safe | 100% (6/6) | string | `numeric(12,2)` | _Samples_: `Rejected`, `Duplicate`, `Approved` |
| `Status` | 9 | 🟢 Safe | 100% (6/6) | date | `text` | _Samples_: `2026-06-13` |
| `CreatedAt` | 10 | 🟢 Safe | 0% (0/6) |  | `timestamptz` | _(empty)_ |

### Sheet: `Donors`

- **Data Rows**: 221 (allocated raw rows: 222)
- **Detected Headers**: `CampaignID`, `Name`, `WhatsApp`, `JoinedAt`, `DonorStatus`, `AmountDue`, `Paid`, `ProofLink`, `PaidAt`, `CustomAmount`, `AmountPaid`, `Verified`, `Refunded`, `Alias`, `ModifiedBy`, `ModifiedAt`, `LastReminderSentAt`
- **Sheet Warnings & Anomalies**:
  - ⚠️ Column 'Name' contains mixed types: string, integer
  - ⚠️ Column 'WhatsApp' contains mixed types: integer, string
  - ⚠️ Column 'LastReminderSentAt' is 100% empty across all 221 rows

| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |
| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |
| `CampaignID` | 0 | 🟢 Safe | 100% (221/221) | string | `text` | _Samples_: `C-04674E2E`, `C-5170E8E5`, `C-C8A76FD7` |
| `Name` | 1 | 🔒 **Sensitive (PII)** | 100% (221/221) | string, integer | `text` | _Samples_: `I***`, `Y***`, `M*** g***` |
| `WhatsApp` | 2 | 🔒 **Sensitive (PII)** | 100% (221/221) | integer, string | `text` | _Samples_: `628****43`, `628123`, `628****33` |
| `JoinedAt` | 3 | 🟢 Safe | 100% (221/221) | date | `timestamptz` | _Samples_: `2026-06-12`, `2026-06-13`, `2026-06-17` |
| `DonorStatus` | 4 | 🟢 Safe | 100% (221/221) | string | `text` | **Values**: `Pledged`, `Withdrawn` |
| `AmountDue` | 5 | 🟢 Safe | 81.9% (181/221) | integer | `numeric(12,2)` | _Samples_: `250000`, `1500000`, `32813` |
| `Paid` | 6 | 🟢 Safe | 100% (221/221) | boolean | `boolean` | **Values**: `false`, `true` |
| `ProofLink` | 7 | 🔒 **Sensitive (PII)** | 59.3% (131/221) | string | `text` | _Samples_: `https://drive.google.com/[REDACTED_PATH]` |
| `PaidAt` | 8 | 🟢 Safe | 59.3% (131/221) | date | `timestamptz` | _Samples_: `2026-06-13`, `2026-06-12`, `2026-06-22` |
| `CustomAmount` | 9 | 🟢 Safe | 14% (31/221) | integer | `numeric(12,2)` | _Samples_: `1500000`, `32813`, `32812` |
| `AmountPaid` | 10 | 🟢 Safe | 67.9% (150/221) | integer | `numeric(12,2)` | _Samples_: `250000`, `1200000`, `1500000` |
| `Verified` | 11 | 🟢 Safe | 99.1% (219/221) | boolean | `boolean` | **Values**: `false`, `true` |
| `Refunded` | 12 | 🟢 Safe | 65.2% (144/221) | boolean | `boolean` | **Values**: `false`, `true` |
| `Alias` | 13 | 🔒 **Sensitive (PII)** | 7.2% (16/221) | string | `text` | _Samples_: `V***`, `S***`, `H*** W*** J***` |
| `ModifiedBy` | 14 | 🔒 **Sensitive (PII)** | 59.7% (132/221) | string | `text` | _Samples_: `S***`, `P***`, `H*** H***` |
| `ModifiedAt` | 15 | 🟢 Safe | 59.7% (132/221) | date | `timestamptz` | _Samples_: `2026-06-21`, `2026-06-22`, `2026-06-25` |
| `LastReminderSentAt` | 16 | 🟢 Safe | 0% (0/221) |  | `timestamptz` | _(empty)_ |

---

## 3. Foreign Key & Cross-Sheet Referential Integrity

| Source Field | Target Field | Relation | Referencing Rows | Matched Rows | Orphan Rows | Integrity Rate | Notes |
| ------------ | ------------ | :------: | ---------------: | -----------: | ----------: | -------------: | ----- |
| `Tokens.LinkedCampaignID` | `Campaigns.CampaignID` | many-to-one (nullable) | 15 | 11 | 4 | ⚠️ **73.3%** | Tokens generated for historical/deleted test campaigns or standalone PIC tokens |
| `Donors.CampaignID` | `Campaigns.CampaignID` | many-to-one | 221 | 221 | 0 | ✅ **100%** | 100% referential integrity — every donor belongs to an existing campaign |
| `Donors.WhatsApp` | `Members.WhatsApp` | many-to-one | 221 | 220 | 1 | ⚠️ **99.5%** | 2 donor entries have unregistered phone numbers (external/guest donors or unlinked members) |
| `LateRequests.CampaignID` | `Campaigns.CampaignID` | many-to-one | 6 | 6 | 0 | ✅ **100%** | All late join requests reference valid campaign IDs |

---

## 4. Sensitive Data & PII Audit

The following columns have been identified as containing sensitive credentials, personal identifiable information (PII), or financial data. Strict masking, hashing, and encryption policies must be applied during migration.

| Sheet | Column | Sensitivity Category | Migration & Protection Strategy |
| ----- | ------ | -------------------- | ------------------------------- |
| `Workaroundsz` | `__EMPTY_COL_1` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_2` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_3` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_4` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_5` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_6` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_7` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_8` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_9` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_10` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_11` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_12` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_13` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_14` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_15` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_16` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_17` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `__EMPTY_COL_18` | **Unstructured Scratch Data** | Exclude from migration entirely (scratch sheet). |
| `Workaroundsz` | `Name` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Workaroundsz` | `WhatsApp` | **Direct PII (Phone Number)** | Normalize to E.164 format (`+628...`). Restrict visibility via RLS & view masks. |
| `Workaroundsz` | `ProofLink` | **Financial Proof / Upload Asset** | Migrate Google Drive links to private Supabase Storage bucket with signed URL access. |
| `Workaroundsz` | `Alias` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Workaroundsz` | `ModifiedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Settings` | `Value` | **Application Secret / Config** | Store in Supabase Vault or protected app_settings table with service_role access only. |
| `Members` | `Name` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Members` | `WhatsApp` | **Direct PII (Phone Number)** | Normalize to E.164 format (`+628...`). Restrict visibility via RLS & view masks. |
| `Members` | `AddedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Members` | `ModifiedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Members` | `Email` | **Direct PII (Email Address)** | Store lowercase in Postgres. Restrict visibility via RLS. |
| `Tokens` | `TokenID` | **Authentication Credential** | Store securely or hash with SHA-256 / bcrypt for verification. Do not expose in public APIs. |
| `Tokens` | `CreatedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Tokens` | `Alias` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Campaigns` | `TargetName` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Campaigns` | `BankAccount` | **Financial Account Identifier** | Numeric text with check constraint. PIC/Admin visibility only. |
| `Campaigns` | `AccountHolder` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Campaigns` | `GiftLink` | **Financial Proof / Upload Asset** | Migrate Google Drive links to private Supabase Storage bucket with signed URL access. |
| `Campaigns` | `GiftImage` | **Financial Proof / Upload Asset** | Migrate Google Drive links to private Supabase Storage bucket with signed URL access. |
| `Campaigns` | `ModifiedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `LateRequests` | `PIC_Alias` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `LateRequests` | `DonorWhatsApp` | **Direct PII (Phone Number)** | Normalize to E.164 format (`+628...`). Restrict visibility via RLS & view masks. |
| `LateRequests` | `DonorName` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `LateRequests` | `DonorAlias` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Donors` | `Name` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Donors` | `WhatsApp` | **Direct PII (Phone Number)** | Normalize to E.164 format (`+628...`). Restrict visibility via RLS & view masks. |
| `Donors` | `ProofLink` | **Financial Proof / Upload Asset** | Migrate Google Drive links to private Supabase Storage bucket with signed URL access. |
| `Donors` | `Alias` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |
| `Donors` | `ModifiedBy` | **PII (Personal Name / Alias)** | Standard text in Postgres, protected via Row-Level Security (RLS). |

---

## 5. Data Anomalies, Inconsistencies & Schema Drift

### Sheet: `Workaroundsz`

- ⚠️ Sheet 'Workaroundsz' is not defined in standard Code.js schema (likely scratch or backup tab)
- ⚠️ Column '__EMPTY_COL_2' is 100% empty across all 77 rows
- ⚠️ Column '__EMPTY_COL_5' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_6' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_7' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_8' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_9' is 100% empty across all 77 rows
- ⚠️ Column '__EMPTY_COL_10' is 100% empty across all 77 rows
- ⚠️ Column '__EMPTY_COL_12' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_13' is 100% empty across all 77 rows
- ⚠️ Column '__EMPTY_COL_14' is 100% empty across all 77 rows
- ⚠️ Column '__EMPTY_COL_16' contains mixed types: integer, string
- ⚠️ Column '__EMPTY_COL_18' is 100% empty across all 77 rows
- ⚠️ Column 'WhatsApp' contains mixed types: integer, string
- ⚠️ Column 'AmountDue' is 100% empty across all 77 rows
- ⚠️ Column 'ProofLink' is 100% empty across all 77 rows
- ⚠️ Column 'PaidAt' is 100% empty across all 77 rows
- ⚠️ Column 'CustomAmount' is 100% empty across all 77 rows
- ⚠️ Column 'AmountPaid' is 100% empty across all 77 rows
- ⚠️ Column 'Verified' is 100% empty across all 77 rows
- ⚠️ Column 'Refunded' is 100% empty across all 77 rows
- ⚠️ Column 'Alias' is 100% empty across all 77 rows
- ⚠️ Column 'ModifiedBy' is 100% empty across all 77 rows
- ⚠️ Column 'ModifiedAt' is 100% empty across all 77 rows

### Sheet: `Settings`

- ⚠️ Column 'Value' contains mixed types: boolean, integer, string

### Sheet: `Members`

- ⚠️ Column 'Name' contains mixed types: string, integer
- ⚠️ Column 'WhatsApp' contains mixed types: integer, string
- ⚠️ Column 'ModifiedBy' contains mixed types: integer, string

### Sheet: `Tokens`

- ⚠️ Column 'CreatedBy' contains mixed types: string, integer

### Sheet: `Campaigns`

- ⚠️ Contains 973 trailing empty rows allocated by Google Sheets
- ⚠️ Column 'BankAccount' contains mixed types: integer, string

### Sheet: `LateRequests`

- ⚠️ CRITICAL SCHEMA DRIFT: Header-to-data column misalignment detected! In the sheet, data was inserted with column order different from headers: DonorWhatsApp contains donor names, DonorName contains WhatsApp numbers, IsCustom contains reasons, Reason contains amounts, and Status contains timestamps.
- ⚠️ Column 'CreatedAt' is 100% empty across all 6 rows

### Sheet: `Donors`

- ⚠️ Column 'Name' contains mixed types: string, integer
- ⚠️ Column 'WhatsApp' contains mixed types: integer, string
- ⚠️ Column 'LastReminderSentAt' is 100% empty across all 221 rows

---

## 6. Recommended Supabase Table Mappings (PostgreSQL)

Below is the proposed target schema structure for Supabase Postgres.

### Table: `app_settings` (from `Settings`)

> **Purpose**: System-wide configuration parameters and operational toggles

- **Primary Key**: `key (text PRIMARY KEY)`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `key` | `text PRIMARY KEY` | `Key` | Configuration key identifier (e.g., AppUrl, EnableRounding) |
| `value` | `text` | `Value` | Configuration value stored as text or JSON |
| `updated_at` | `timestamptz DEFAULT now()` | _(generated)_ | Timestamp of last modification |

### Table: `members` (from `Members`)

> **Purpose**: Master list of registered group members and developers

- **Primary Key**: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- **Unique Constraints**: `whatsapp UNIQUE`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | _(generated)_ | Surrogate primary key |
| `name` | `text NOT NULL` | `Name` | Full member name (PII) |
| `whatsapp` | `text NOT NULL UNIQUE` | `WhatsApp` | Standardized E.164 phone number |
| `email` | `text` | `Email` | Optional email address for notifications |
| `status` | `text NOT NULL DEFAULT 'ACTIVE'` | `Status` | Member status (ACTIVE, PENDING, REJECTED, DELETED, EX) |
| `role` | `text NOT NULL DEFAULT 'MEMBER'` | `Role` | Permission role (MEMBER, ADMIN, SUPER_ADMIN) |
| `added_by` | `text` | `AddedBy` | Creator identifier or name |
| `added_at` | `timestamptz DEFAULT now()` | `AddedAt` | Creation timestamp |
| `modified_by` | `text` | `ModifiedBy` | Modifier identifier |
| `modified_at` | `timestamptz` | `ModifiedAt` | Last modified timestamp |

### Table: `auth_tokens` (from `Tokens`)

> **Purpose**: Role-based access tokens for Admin, Super Admin, and Campaign PICs

- **Primary Key**: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- **Unique Constraints**: `token_id UNIQUE`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | _(generated)_ | Surrogate primary key |
| `token_id` | `text NOT NULL UNIQUE` | `TokenID` | Access token string (e.g. SA-XXXX, TOK-XXXX) |
| `role` | `text NOT NULL` | `Role` | Role granted (SUPER_ADMIN, ADMIN, PIC) |
| `status` | `text NOT NULL DEFAULT 'ACTIVE'` | `Status` | Token lifecycle state (ACTIVE, EXPIRED, UNUSED, REVOKED) |
| `linked_campaign_id` | `text REFERENCES campaigns(campaign_id) ON DELETE SET NULL` | `LinkedCampaignID` | Associated campaign ID if role is PIC |
| `alias` | `text` | `Alias` | Human friendly alias / nickname |
| `created_by` | `text` | `CreatedBy` | Creator identifier |
| `created_at` | `timestamptz DEFAULT now()` | `CreatedAt` | Token creation timestamp |

### Table: `campaigns` (from `Campaigns`)

> **Purpose**: Donation campaigns managed by PICs for specific beneficiaries

- **Primary Key**: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- **Unique Constraints**: `campaign_id UNIQUE`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | _(generated)_ | Surrogate primary key |
| `campaign_id` | `text NOT NULL UNIQUE` | `CampaignID` | Legacy campaign code (e.g. C-04674E2E) |
| `target_name` | `text NOT NULL` | `TargetName` | Beneficiary name |
| `reason` | `text NOT NULL` | `Reason` | Donation cause / occasion |
| `gift_amount` | `numeric(12,2) DEFAULT 0` | `GiftAmount` | Target gift / collection amount |
| `status` | `text NOT NULL DEFAULT 'OPEN'` | `Status` | Campaign state (OPEN, FINALIZED, ARCHIVED, CLOSED) |
| `start_date` | `timestamptz` | `StartDate` | Campaign start timestamp |
| `deadline` | `timestamptz` | `Deadline` | Donation collection deadline |
| `bank_name` | `text` | `BankName` | Destination bank or e-wallet name |
| `bank_account` | `text` | `BankAccount` | Destination account number |
| `account_holder` | `text` | `AccountHolder` | Name on destination bank account |
| `rounding_used` | `boolean DEFAULT false` | `RoundingUsed` | Whether split rounding was applied |
| `round_to` | `integer DEFAULT 500` | `RoundTo` | Rounding precision unit |
| `gift_link` | `text` | `GiftLink` | URL link to purchased gift |
| `gift_image` | `text` | `GiftImage` | Storage URL for gift image |
| `created_at` | `timestamptz DEFAULT now()` | `CreatedAt` | Creation timestamp |
| `finalized_at` | `timestamptz` | `FinalizedAt` | When bill split was finalized |
| `modified_by` | `text` | `ModifiedBy` | Last modifier |
| `modified_at` | `timestamptz` | `ModifiedAt` | Last modified timestamp |

### Table: `donors` (from `Donors`)

> **Purpose**: Individual member pledges, obligations, payments, and transfer proofs

- **Primary Key**: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- **Unique Constraints**: `(campaign_id, whatsapp) UNIQUE`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | _(generated)_ | Surrogate primary key |
| `campaign_id` | `text NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE` | `CampaignID` | Associated campaign identifier |
| `name` | `text NOT NULL` | `Name` | Donor name |
| `whatsapp` | `text NOT NULL` | `WhatsApp` | Donor phone number |
| `alias` | `text` | `Alias` | Donor nickname / alias |
| `donor_status` | `text NOT NULL DEFAULT 'PLEDGED'` | `DonorStatus` | Donor participation status (PLEDGED, WITHDRAWN, CANCELLED) |
| `amount_due` | `numeric(12,2) DEFAULT 0` | `AmountDue` | Assigned share of campaign gift |
| `custom_amount` | `numeric(12,2)` | `CustomAmount` | Custom pledged amount (if non-standard split) |
| `amount_paid` | `numeric(12,2) DEFAULT 0` | `AmountPaid` | Actual transferred amount |
| `paid` | `boolean DEFAULT false` | `Paid` | Whether transfer proof has been uploaded |
| `proof_link` | `text` | `ProofLink` | URL or Supabase Storage key for transfer proof |
| `paid_at` | `timestamptz` | `PaidAt` | Payment proof upload timestamp |
| `verified` | `boolean DEFAULT false` | `Verified` | Whether PIC verified payment |
| `refunded` | `boolean DEFAULT false` | `Refunded` | Whether overpayment was refunded |
| `joined_at` | `timestamptz DEFAULT now()` | `JoinedAt` | Pledge timestamp |
| `last_reminder_sent_at` | `timestamptz` | `LastReminderSentAt` | WhatsApp payment reminder timestamp |
| `modified_by` | `text` | `ModifiedBy` | Last modifier |
| `modified_at` | `timestamptz` | `ModifiedAt` | Last modification timestamp |

### Table: `late_requests` (from `LateRequests`)

> **Purpose**: Requests by members to join a campaign after bill finalization

- **Primary Key**: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- **Unique Constraints**: `request_id UNIQUE`

| Target Column | PostgreSQL Type | Source XLSX Column | Description |
| ------------- | --------------- | ------------------ | ----------- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | _(generated)_ | Surrogate primary key |
| `request_id` | `text NOT NULL UNIQUE` | `RequestID` | Request identifier (e.g. REQ-389AF9CE) |
| `campaign_id` | `text NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE` | `CampaignID` | Target campaign code |
| `donor_name` | `text NOT NULL` | `DonorName` | Donor name (mapped from shifted data) |
| `donor_whatsapp` | `text NOT NULL` | `DonorWhatsApp` | Donor WhatsApp (mapped from shifted data) |
| `donor_alias` | `text` | `DonorAlias` | Donor alias |
| `pic_alias` | `text` | `PIC_Alias` | Target PIC alias |
| `is_custom` | `boolean DEFAULT false` | `IsCustom` | Whether custom amount pledged |
| `custom_amount` | `numeric(12,2)` | `CustomAmount` | Requested custom amount |
| `reason` | `text` | `Reason` | Reason for late join |
| `status` | `text NOT NULL DEFAULT 'PENDING'` | `Status` | Status (PENDING, APPROVED, REJECTED, DUPLICATE) |
| `created_at` | `timestamptz DEFAULT now()` | `CreatedAt` | Submission timestamp |

---

## 7. Open Questions Before Generating Migration SQL

The following architecture and domain questions must be clarified before generating the production Supabase migration SQL:

### [Q1_PRIMARY_KEYS] Primary Key & Legacy Identifier Strategy

> Should Postgres tables use synthetic UUIDs (`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`) with UNIQUE constraints on legacy string identifiers (`campaign_id`, `token_id`, `request_id`), or should legacy string codes be used directly as primary keys during the initial migration?

### [Q2_LATEREQUESTS_DATA_REPAIR] LateRequests Column Scrambling in Source Sheet

> The source XLSX for `LateRequests` has shifted data columns relative to its headers (e.g., column labeled `DonorWhatsApp` holds donor names, `DonorName` holds WhatsApp numbers, `Reason` holds amounts, `IsCustom` holds reasons, `CustomAmount` holds statuses). Should the data migration script apply a dedicated column-remapping transformation specifically for `LateRequests` to cleanly restore semantic correctness?

### [Q3_PHONE_NORMALIZATION] WhatsApp Phone Number Standardization (E.164)

> Legacy Google Sheets entries format phone numbers variably as numbers (e.g., `62812...`), integers without country code (e.g., `8516...`), or text with prefixes (`0811...`). Should the Supabase migration script normalize all phone numbers to the canonical E.164 format (e.g., `+628...`) and enforce regex validation in Postgres?

### [Q4_STORAGE_MIGRATION] Payment Proof Storage (Google Drive vs Supabase Storage)

> Legacy `ProofLink` columns store Google Drive URLs. When migrating, should existing Drive URLs be kept as legacy external URLs in `proof_link`, or should an asset migration script download files from Google Drive and upload them to a private Supabase Storage bucket (`bukti-transfer`)?

### [Q5_ORPHAN_HANDLING] Referential Integrity & Orphan Records Cleanup

> The inventory found 4 tokens referencing historical/unlisted campaign IDs and 2 donor records with WhatsApp numbers not in `Members`. Should the data migration script: (A) create placeholder parent records in `campaigns` and `members`, (B) leave foreign keys nullable, or (C) prune obsolete orphan records?

### [Q6_AUTH_SESSION_STRATEGY] Authentication & Session Architecture

> The Google Apps Script app used token-based URLs (`?token=SA-...` / `?token=TOK-...`) and WhatsApp phone lookup for donor views. In Supabase, will we maintain token-based access via a custom Postgres verification function / Edge Function, or migrate administrators to Supabase Auth (email/password/magic link) while retaining lightweight token access for PICs and Donors?

### [Q7_TIMEZONE_HANDLING] Timestamp Parsing & Timezone Alignment

> Google Sheets stored timestamps in local Asia/Jakarta (WIB, UTC+7). When converting serial dates or string timestamps to PostgreSQL `timestamptz`, should migration scripts explicitly parse naive date-times with an explicit `+07:00` offset to prevent UTC shifting?

### [Q8_SCRATCH_TAB_DISPOSITION] Disposition of `Workaroundsz` Scratch Sheet

> The sheet `Workaroundsz` contains unformatted developer/admin scratch data and duplicate donor records. Can we confirm that `Workaroundsz` should be completely excluded from the Supabase database migration?

---

*Report automatically generated by `scripts/migration/inventory-xlsx.mjs`. No modifications made to Supabase or source files.*
