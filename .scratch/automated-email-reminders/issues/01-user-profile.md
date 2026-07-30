# 01 — User Profile & Email Capture

**What to build:** 
Members can save their email addresses in the system. When logged in, they have a "Profile" section where they can view their WhatsApp number (read-only) and edit their Name and Email. The system saves this to the database, and politely nudges them if their email is missing.

**Blocked by:** 
None — can start immediately.

**Status:** ready-for-agent

- [ ] A new `Email` column is added to the `Members` sheet schema and handled in Apps Script.
- [ ] A backend endpoint (`updateMemberProfile`) exists to update the current user's Name and Email based on their session token.
- [ ] A Profile UI exists on the frontend allowing the user to view their read-only WhatsApp and update their Name and Email.
- [ ] The dashboard shows a polite, dismissible nudge/toast if the user's email is empty, asking them to fill it out for billing reminders.