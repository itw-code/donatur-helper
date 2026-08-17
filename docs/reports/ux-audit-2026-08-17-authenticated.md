# Donatur Helper UX audit — authenticated mobile pass

Date: 2026-08-17  
Surface tested: https://don4tpro.pages.dev/  
Viewports: 390 × 844 mobile and 1440 × 1000 desktop  
Audience: donor, PIC, Admin, SuperAdmin

## Scope and privacy

This report extends the public landing/login audit. The authenticated Admin surface was opened with the user-provided credential, then a campaign owner was used internally to inspect the corresponding donor and PIC surfaces. Credentials and phone numbers were not written to this report or to screenshots. Captures under docs/reports/assets/ux-audit-2026-08-17/ contain [REDACTED] placeholders where sensitive identifiers appeared.

Counts and deadlines below are a UX snapshot from this session, not a data-quality verdict.

## Executive summary

The authenticated experience is functionally rich but operationally too long for a mobile-first donation product.

- Admin is calm and understandable, but the mobile page reached approximately 29,100px with 9 campaign cards and 92 member cards. Logout and later management sections are effectively buried.
- PIC has the strongest information architecture: campaign context, progress, queue counts, and a next-action CTA are visible. However, sharing, closing, and finalization are still presented as equally prominent full-width buttons.
- Donor is the clearest surface, but Perlu tindakan can show no outstanding bill while presenting a long Campaign Lainnya list without a strong next step.
- The product still feels like an internal tool because Donation Helper, Verified Member, Final, Copy, and other English labels sit beside Indonesian copy.

### Updated top five risks

1. Mobile scroll debt: 92 member records render as a long card sequence; filters are not sticky.
2. Action priority is diluted: PIC actions use equal visual weight; Admin token generation receives a full-width card despite being secondary.
3. Status can be ambiguous: open campaigns show Terlewat 48 hari while remaining actionable; PIC shows Rp0 terkumpul and Belum ditentukan without a prominent finalization explanation.
4. Summary scope is unclear: Admin showed 94 members in summary while the visible list showed 92; token status categories had no stated total.
5. Repetition is expensive: repeated labels, timestamps, and controls create tall lists before users reach an action.

## Runtime evidence

### Admin

- Mobile body height: approximately 29,100px.
- 9 campaign cards and 92 member cards rendered.
- First screen contains role heading, action queue, and a six-metric summary.
- Empty queue state is reassuring: 0 item perlu tindakan and Tidak ada item yang perlu ditinjau.
- Member search/filter is at the top of the long list and does not remain visible.
- Desktop uses nested table scroll containers capped at 400px.

### Donor

- Role heading and Perlu tindakan are clear.
- Empty payment state says Tidak ada tagihan tertunda, but offers no next action.
- Campaign Lainnya includes informational/non-joined campaigns with little reason to act.
- Greeting uses an emoji and the status badge reads Verified Member.

### PIC

- Progress card exposes campaign context and queue metrics.
- Tested campaign showed 15 payment reminders, 0 proof reviews, and 0 verified donors.
- Progress showed Rp0 terkumpul and Belum ditentukan, which needs a clearer explanation.
- Tindakan berikutnya presents Copy Undangan Patungan, Tutup pendaftaran, and Selesaikan & input rekening as equal full-width actions.
- Donor queue repeats orange Belum upload Bukti Transfer cards and is expensive to scan.

## Screen-by-screen findings

| Screen / area | Issue | User impact | Severity | Evidence / likely cause | Recommended fix | Suggested CSS/token change |
|---|---|---|---|---|---|---|
| Admin mobile shell | No persistent section navigation, account control, or jump-to-top affordance. | Users must traverse thousands of pixels to reach members, tools, or logout. | Critical | 29,100px body height; logout is at document end. | Add sticky role bar with anchors for summary, campaigns, members, tools, and logout. | role-bar position: sticky; add scroll-margin-top: 64px. |
| Admin action queue | Role eyebrow and Perlu ditinjau repeat in the page heading and card. | Redundant content increases vertical cost. | Medium | Authenticated capture and admin-action-queue. | Keep the role eyebrow once; use the card for count/state. | Reduce queue padding from 20px to 16px. |
| Admin summary | Six metrics stack into a long mobile card; supporting counts have unclear scope. | Users cannot distinguish totals, active records, and filtered records. | High | Summary showed 94 total members while list showed 92. | Group metrics into campaign, donor, and system clusters; label scopes. | Two-column metric grid below 560px; gap 8px. |
| Admin campaign cards | Every record repeats metadata and one or two full-width buttons. | Nine cards create a repetitive scan; action intent is not obvious. | High | Mobile campaign capture and admin-campaign-card styles. | Show target, status, urgency, and one primary action first. Disclose PIC/update metadata. | Card padding 16px; internal gap 8px. |
| Admin overdue campaigns | Open campaigns show red Terlewat 48 hari while remaining actionable. | Admin may not know whether to contact PIC, close, or extend. | High | Campaign card capture and SISA WAKTU label. | Add explicit next step and absolute deadline date. | Add an overdue callout with amber background and border. |
| Admin tables | Desktop tables are inside 400px nested scroll areas. | Users lose page context and may miss rows/actions. | Medium | Desktop capture and table-responsive max-height. | Use pagination or Lihat semua; keep one scroll context per screen. | Remove max-height for primary tables; paginate large lists. |
| Admin token CTA | Generate token PIC baru is isolated in a full-width card. | Secondary provisioning looks more important than approvals. | Medium | Desktop and mobile captures. | Move into a Tools section or compact secondary action. | Use transparent tool surface and btn-auto. |
| Member management | 92 member cards render on mobile with repeated status controls. | High scroll cost and difficult bulk management. | Critical | 92 admin-member-card elements; 29,100px body height. | Paginate to 20 items, keep filters sticky, and add bulk status actions. | Paginate before rendering; sticky toolbar under role bar. |
| Donor empty state | Tidak ada tagihan tertunda does not explain what to do next. | Donors may interpret a quiet dashboard as broken. | Medium | Authenticated donor capture. | Add reassurance and one CTA: Lihat campaign yang masih terbuka or Perbarui profil. | Empty state padding 24px 16px; centered text. |
| Donor campaign list | Informational/non-joined campaigns remain visible with small link actions. | Donor sees information without a clear decision. | Medium | Authenticated donor capture and renderCampaignCard. | Separate Can join, Already joined, and Completed; move history behind disclosure. | Use 24px group spacing and 44px link buttons. |
| PIC progress card | Rp0 terkumpul and Belum ditentukan are ambiguous without state explanation. | PIC may not know whether to finalize, set target, or troubleshoot. | High | Authenticated PIC deep-dive capture. | Add: Tentukan total hadiah dan rekening sebelum menagih donatur. | Add 12px amber state callout below metrics. |
| PIC action panel | Share, close, and finalize are all full-width and prominent. | Competing CTAs increase error risk. | High | Authenticated PIC action capture; renderPicActions at index.html line 3630. | Select one primary action by campaign state; demote sharing and separate destructive actions. | Primary action uses semantic primary color; secondary actions outlined. |
| PIC donor queue | 15 reminder cards repeat the same status and timeline; per-donor action is not immediately visible in the capture. | PIC scans a long queue without an obvious next contact action. | High | Authenticated donor queue capture and renderDonorTable. | Add visible Kirim pengingat WA per card or one bulk reminder action. | Donor card actions display grid with 8px gap and 12px top padding. |
| Shared language/icons | English labels and emoji icons remain in authenticated views. | Inconsistent language and platform-dependent glyphs reduce polish. | Medium | Donation Helper, Verified Member, Copy, clipboard/hand emojis. | Adopt Indonesian labels and SVG icons; hide decorative icons from assistive tech. | Define semantic copy tokens and one icon size token. |

## Spacing and density audit

The authenticated capture confirms that base spacing is not inherently cramped; repeated structures and record volume are the main problem.

Current values:

- Base card padding: 20px.
- Admin/mobile data card padding: 14px.
- Toolbar padding: 12px.
- PIC donor card padding: 14px 16px.
- Primary controls: generally 44px minimum height.
- Admin mobile card gap: 10px.
- Table cells: 10px 8px.
- Table scroll region: 400px maximum height.

Recommended scale:

~~~css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --control-h: 48px;
  --card-pad: 16px;
  --section-gap: 24px;
}
~~~

Use 16px for cards/forms, 24px between workflow sections, and 32px only between major role areas. Keep 44px for compact secondary controls, but use 48px for primary Android actions.

## Mobile usability and feel

Good:

- Full-width primary buttons are easy to reach.
- Form controls use 16px text on phones.
- Responsive card fallbacks prevent main-page horizontal overflow.
- PIC progress exposes queue counts before the donor list.
- Empty Admin queue communicates a reassuring nothing-to-do state.

Needs improvement:

- No sticky Admin section navigation or filter toolbar.
- Long member lists require excessive thumb travel.
- Nested table scroll areas are hard to discover.
- PIC action buttons are equally prominent.
- Donor/PIC cards repeat low-value timestamps before the next action.
- Profile/dialog keyboard behavior and safe-area handling still need device testing.

## Trust and clarity

Status communication is strongest where text and icons are combined. The empty Admin queue is a good trust pattern because it explicitly says there is nothing to review.

Trust is weakened by mixed language, relative overdue labels without an operational recommendation, unclear summary scopes, passive donor empty states, technical loading/error language, emoji system icons, and dashboards that are much longer than the task itself.

## Prioritized action plan

### Quick wins

1. Add a sticky mobile role bar with anchors for Ringkasan, Campaign, Members, Tools, and Logout.
2. Make one action primary per PIC campaign state; demote share and destructive actions.
3. Add explicit scope labels to Admin metrics and reconcile displayed totals with filtered list counts.

### Medium fixes

1. Paginate or virtualize member and campaign records; render no more than 20 cards initially.
2. Add explicit overdue copy and absolute dates to Admin and PIC campaign states.
3. Redesign donor/PIC empty states with one reassuring explanation and one next-step CTA.

### Deeper improvements

1. Establish a role-based dashboard shell with shared tokens, language, status semantics, and navigation.
2. Test 360×800 and 390×844 Android devices with 100-member datasets, slow network, keyboard-open forms, overdue campaigns, rejected proofs, and empty queues.

## Redacted before-state captures

- [Admin mobile — queue and summary](assets/ux-audit-2026-08-17/donatur-admin-mobile-top-loaded.png)
- [Admin mobile — campaign cards](assets/ux-audit-2026-08-17/donatur-admin-mobile-campaigns-loaded.png)
- [Admin desktop — tables and summary](assets/ux-audit-2026-08-17/donatur-admin-desktop-loaded.png)
- [Donor mobile — authenticated dashboard](assets/ux-audit-2026-08-17/donatur-member-mobile-auth.png)
- [PIC mobile — campaign creation](assets/ux-audit-2026-08-17/donatur-pic-mobile-auth.png)
- [PIC mobile — progress and next action](assets/ux-audit-2026-08-17/donatur-pic-deepdive-mobile-top-correct.png)
- [PIC mobile — action panel](assets/ux-audit-2026-08-17/donatur-pic-deepdive-mobile-actions-loaded.png)
- [PIC mobile — donor queue](assets/ux-audit-2026-08-17/donatur-pic-deepdive-mobile-donors-loaded.png)

## Additional evidence still needed

- A real donor/PIC/Admin recording with Android keyboard open.
- Confirmation whether Admin summary totals intentionally include deleted/rejected records.
- Expected behavior for overdue Open campaigns: close, extend, or keep actionable.
- A production comparison after the first three quick wins to verify reduced scroll depth and clearer action priority.
