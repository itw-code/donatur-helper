# Use the migrated shell for PIC Campaign creation

**Status:** accepted

When a PIC has no Campaign, Phase 1 will show a migrated PIC empty/create state with a clear primary Buat Campaign action while preserving the existing creation fields and behavior. The no-Campaign path must not fall back to the legacy visual shell inside the migrated PIC experience.

## Implementation Invariants (2026-11-02)

- **Token State Partitioning**: A newly generated PIC token starts in `S[0] = (role='PIC', status='UNUSED', linked_campaign_id=NULL)`. Calling `loadPicDashboard()` (`js/views/pic.js`) dispatches `getCampaignForPic` (`js/services/backendAdapter.js`) $\rightarrow$ `get_pic_dashboard(p_token)`.
- **Unlinked Draft Response**: For `status = 'UNUSED'` and `linked_campaign_id IS NULL`, `get_pic_dashboard` (`supabase/migrations/20261102120000_fix_pic_draft_token_dashboard_and_persistence.sql`) and `backendAdapter.js` (via `verify_auth_token` fallback when remote SQL is older) MUST return `{ campaign: null, donors: [], summary: null }` and MUST NOT mutate `status` to `'ACTIVE'`. Only `create_campaign_for_pic` promotes the token to `status = 'ACTIVE'` when linking `campaign_id`.
- **Orphaned Active Guard**: If `status = 'ACTIVE'` while `linked_campaign_id IS NULL`, the token is rejected as an orphaned token (`error: 'orphaned_token'`), matching legacy `Code.js:488-490`.
- **Stale Session Recovery**: If `loadPicDashboard()` fails due to an expired or revoked token in `localStorage`, `js/views/pic.js` clears `auth_token` and `auth_role` and returns the user to `loadUserDashboard()` (when `donor_user` is present) or `#view-landing`.
