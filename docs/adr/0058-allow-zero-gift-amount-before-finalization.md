# Allow zero gift amount before finalization

**Status:** accepted

A PIC can enter a gift amount at campaign creation, then cannot change it. The only PIC screen that writes the real total is finalize, which also locks the donor list and splits bills. Clearing a premature target is an admin correction, not a late-donor request and not an unfinalize.

## Decision

`admin_update_gift_amount` may set `gift_amount` to `0` only while the campaign is `OPEN` or `CLOSED`. `0` means the target is not determined yet. `FINALIZED` and `ARCHIVED` still require an amount greater than `0`, because those states already have, or must keep, a bill invariant.

## Implementation invariants

- **Write scope.** On `OPEN` or `CLOSED`, the RPC updates `campaigns.gift_amount` only. It does not update `donors.amount_due`, `amount_paid`, custom pledges, bank fields, or status.
- **Display.** PIC copy for `gift_amount <= 0` is **Belum ditentukan** (`js/views/pic.js`). Donor and invite copy is **Ditentukan nanti** (`js/views/donor.js`, `copyPicGroupReminder`). Admin detail formats `0` as `Rp0`. Already-sent WhatsApp messages do not update.
- **Finalize floor.** `finalize_campaign` still rejects `p_final_gift_amount <= 0`. It also rejects a final amount below `SUM(custom_amount)` of pledged donors. Clearing the target does not cancel custom pledges.
- **Not this path.** `request_late_donor` adds a named person after finalize and recalculates shares. It is not how a PIC corrects the target. `reopen_campaign_list` rejects `FINALIZED`. `admin_set_campaign_status` only flips the status column and is not an unfinalize.
- **Roles.** PIC tokens are rejected. Admin and SuperAdmin only. The live confirm on `don4tpro.pages.dev` still says to recalculate donor bills until the frontend in this change is deployed. That sentence is false for an open campaign. The RPC does not recalculate unless status is `FINALIZED` and the new amount is greater than `0`.
- **Production.** Applied to project `hhgtospruzcjwlafvkhf` on 2026-11-03 with `CREATE OR REPLACE`, not through `schema_migrations`. A later push of `supabase/migrations/20261103180000_allow_zero_gift_amount_before_finalize.sql` is idempotent. Live UI check: admin edit of an open campaign accepted `0`, PIC progress showed **Belum ditentukan**, donor rows stayed **Rata-rata** with empty transfer amounts. The checked campaign was restored to its previous positive amount after that check.
