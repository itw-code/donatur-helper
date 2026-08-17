# Donatur Helper

A developer helper application to manage office/group campaign donations, coordinate splits, and track transfer verifications.

## Language

**Campaign**:
A donation event created by a PIC to collect funds for a specific target recipient (e.g. for resignations, weddings, or condolences).
_Avoid_: Event, fundraiser, activity

**Action-first dashboard**:
A role-specific dashboard that places the user's pending operational work before summaries, settings, and dense data.
_Avoid_: Summary-first dashboard, overview-only dashboard

**Contextual navigation**:
Navigation controls that reflect the current role and screen, such as a Donor menu/profile bar or a PIC campaign back/share bar.
_Avoid_: One-size-fits-all navigation, mandatory bottom navigation

**PIC (Person In Charge)**:
The owner and manager of a specific Campaign, responsible for closing registration, finalizing bill splits, and verifying payments.
_Avoid_: Coordinator, owner, manager

**Member**:
A registered user who is approved to access the application and participate in campaigns.
_Avoid_: User, developer, participant

**Donor**:
A Member who has joined a specific Campaign and pledged to contribute.
_Avoid_: Contributor, participant

**Bukti Transfer**:
An image or document uploaded by a Donor as proof of payment to the campaign's bank account.
_Avoid_: Receipt, transfer slip

**Bukti Transfer perlu ditinjau**:
A Bukti Transfer submitted by a paid Donor that the PIC has not yet accepted or rejected.
_Avoid_: Unpaid Donor, payment reminder

**Bukti Transfer perlu diperbaiki**:
A Bukti Transfer rejected by the PIC that requires the Donor to submit a replacement proof.
_Avoid_: Unpaid Donor, pending review

**Alasan penolakan Bukti Transfer**:
A short explanation supplied by the PIC and shown to the Donor when a Bukti Transfer needs to be replaced.
_Avoid_: Internal rejection note, silent rejection

**Pengingat pembayaran**:
A follow-up for a Donor who has not uploaded Bukti Transfer; it is separate from reviewing submitted proof.
_Avoid_: Proof review, verification

**Urgent payment action**:
An unpaid Donor obligation whose deadline is nearest or already past; deadline proximity takes priority over the amount owed.
_Avoid_: Highest-value-first, amount-first urgency

**Menunggu finalisasi**:
The state of a Donor who joined an Open Campaign before the PIC has finalized the exact bill; payment is not available until finalization.
_Avoid_: Payment pending, unpaid final bill

**Payment complete**:
A Donor state in which all of the Donor's Campaign payment obligations have been verified; the dashboard confirms completion compactly while keeping other Campaigns or history secondary.
_Avoid_: Empty dashboard, no-status completion

**Overdue campaign**:
An open Campaign whose deadline has passed; its unpaid actions remain visible and available until the PIC explicitly closes or finalizes the Campaign.
_Avoid_: Expired-and-hidden campaign, automatically closed campaign

**Closed Campaign**:
A Campaign explicitly closed by the PIC; it presents read-only history for Donor/PIC users and no new payment, proof-upload, reminder, or verification action, while an already-recorded overpayment may still be settled as refunded. Authorized Admin/SuperAdmin corrections remain possible through their administrative workflows.
_Avoid_: Archived-but-actionable campaign

**Missing deadline**:
A Campaign or payment obligation without a usable deadline; it is lower priority than dated obligations and must expose a data-quality warning.
_Avoid_: Never-ending deadline, silently undated

**Combined Payment**:
A single payment transaction covering multiple campaign donations that share the same destination bank account.
_Avoid_: Bulk payment, mass transfer

**Refund**:
An amount paid above a Donor's recorded Campaign obligation and owed back to that Donor. A Refund remains outstanding until the PIC records that it was returned; the PIC-facing state is **Refund perlu diselesaikan**.
_Avoid_: Discount, payment correction, duplicate payment
