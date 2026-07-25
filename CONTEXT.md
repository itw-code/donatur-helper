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

**Combined Payment**:
A single payment transaction covering multiple campaign donations that share the same destination bank account.
_Avoid_: Bulk payment, mass transfer

## Responsive Design Decisions (2026-07-25)

**Priority order**: Donor views → PIC views → Admin/SuperAdmin (last)

**Breakpoints**:
- ≤480px: phones — full-width cards, 16px padding, single-column, card reflow for tables
- 481–767px: large phones / small tablets — `.wrap` centered at max-width 480px
- 768–1023px: tablets — `.wrap` at 720px, split-layout active, tables remain tables, forms 2-column
- ≥1024px: desktop — `.wrap` at 1200px, full multi-column layout

**Component decisions**:
- PIC donor table: card reflow on mobile (≤10 donors per campaign)
- Forms: 2-column at 768px+ (date pairs, name+amount side by side)
- Modals: bottom sheets on mobile (full-width, slide up, rounded top), centered dialogs at 768px+
- Toast: full-width banner on mobile, centered pill on desktop
- Touch targets: 44px minimum height for all interactive elements on mobile
- Font scaling: uniform (layout adapts, type does not)
- Split layout: stacks below 768px, two-column at 768px+

**Out of scope**: Admin/SuperAdmin table reflow, navigation restructuring, typography scaling
