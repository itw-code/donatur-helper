# 02 — Immediate Email on Campaign Finalization

**What to build:** 
The moment a PIC finalizes a campaign, an initial billing email is instantly sent to all donors in that campaign who have an email on file. The system records exactly when this email was sent so it doesn't double-send later.

**Blocked by:** 
01 — User Profile & Email Capture

**Status:** completed

- [x] A new `LastReminderSentAt` column is added to the `Donors` sheet schema and handled in Apps Script.
- [x] The existing `finalizeCampaign` backend function is updated to fetch all pledged donors for the campaign.
- [x] For each donor, the system looks up their email from the `Members` sheet.
- [x] The system formats an email (containing Target Name, Amount Due, Bank Name, Bank Account, and Deadline) and sends it via `GmailApp.sendEmail()` to donors with an email address.
- [x] The system records the current timestamp in the `LastReminderSentAt` column for every donor that received the email.