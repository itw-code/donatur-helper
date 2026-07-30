# 03 — Scheduled Automated Reminders (Cron)

**What to build:** 
The system automatically wakes up every morning to nag unpaid donors based on how close they are to the deadline. It respects a cooling-off period (every 2 days) when the deadline is far away, gets aggressive (daily) when the deadline is near, and gives up after 14 days overdue.

**Blocked by:** 
02 — Immediate Email on Campaign Finalization

**Status:** ready-for-agent

- [ ] A new `processEmailReminders()` backend function exists to loop over all Finalized campaigns and their unpaid, Pledged donors.
- [ ] The function correctly skips donors who have no email on file.
- [ ] Logic: If > 3 days before deadline, send only if `LastReminderSentAt` is > 48 hours ago.
- [ ] Logic: If <= 3 days before deadline OR Overdue, send daily (if `LastReminderSentAt` > 24 hours ago).
- [ ] Logic: If > 14 days past deadline, skip entirely (give up).
- [ ] When an email is sent, the `LastReminderSentAt` column is updated.
- [ ] A time-driven trigger is configured in Apps Script to run this function every morning.