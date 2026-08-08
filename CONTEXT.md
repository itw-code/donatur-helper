# Donatur Helper

A developer helper application to manage office/group campaign donations, coordinate splits, and track transfer verifications.

## Language

**Campaign**:
A donation event created by a PIC to collect funds for a specific target recipient (e.g. for resignations, weddings, or condolences).
_Avoid_: Event, fundraiser, activity

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

**Pengingat pembayaran**:
A follow-up for a Donor who has not uploaded Bukti Transfer; it is separate from reviewing submitted proof.
_Avoid_: Proof review, verification

**Combined Payment**:
A single payment transaction covering multiple campaign donations that share the same destination bank account.
_Avoid_: Bulk payment, mass transfer
