# Developer Helper Features Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement 7 features and bugfixes for Donation Helper including bulk actions for Admins, Members, and PICs, combined payments, amount copying, campaign ownership transfer, and authorization fixes.

**Architecture:** Use Apps Script backend functions in `Code.js` with batch transaction locks to prevent concurrency conflicts, and update `index.html` frontend components to provide checkbox-based lists, humanized Bahasa copy, m-banking copying, and automatic billing grouping by bank target.

**Tech Stack:** Google Apps Script (HTML/CSS/JS, LockService, SpreadsheetApp, DriveApp).

---

### Task 1: Fix Admin Archiving Campaign Bug

**Files:**
- Modify: `Code.js` (around `setCampaignStatusAdmin`)

**Step 1: Check existing authorization logic**
- Run `node -c Code.js` to ensure the starting file is syntactically correct.

**Step 2: Update authorization check**
Replace the authorization check in `setCampaignStatusAdmin` from `checkSuperAdmin_` to `checkAdmin_` to allow standard Admins to archive campaigns.

Modify `Code.js`:
```javascript
function setCampaignStatusAdmin(adminToken, campaignId, newStatus) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');

    const existing = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
    if (!existing) throw new Error('Campaign tidak ditemukan.');

    setCampaignField_(campaignId, 'Status', newStatus);
    return true;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS (no syntax errors)

**Step 4: Commit**
```bash
git add Code.js
git commit -m "fix: allow standard Admins to archive campaigns"
```

---

### Task 2: Admin Bulk Member Approval

**Files:**
- Modify: `Code.js`
- Modify: `index.html`

**Step 1: Create backend batch update function**
Create `adminBulkUpdateMemberStatus` in `Code.js` to handle batch member approvals.

Add to `Code.js`:
```javascript
function adminBulkUpdateMemberStatus(adminToken, updates) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
    if (!Array.isArray(updates)) throw new Error('Updates tidak valid.');
    
    const sh = sheet_(SHEETS.MEMBERS);
    const rows = getRows_(SHEETS.MEMBERS);
    const alias = getAdminAlias_(adminToken);
    const modifiedByCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedBy') + 1;
    const modifiedAtCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedAt') + 1;
    const statusCol = headerIndex_(SHEETS.MEMBERS, 'Status') + 1;

    updates.forEach(u => {
      const cleanWa = normalizePhone_(u.whatsapp);
      const existing = rows.find(m => normalizePhone_(m.WhatsApp) === cleanWa);
      if (existing) {
        const statusLower = String(u.status).toLowerCase();
        let finalStatus = 'active';
        if (statusLower === 'ex') finalStatus = 'ex';
        if (statusLower === 'pending') finalStatus = 'pending';
        if (statusLower === 'deleted' || statusLower === 'rejected') finalStatus = statusLower;

        sh.getRange(existing._row, statusCol).setValue(finalStatus);
        if (modifiedByCol > 0) sh.getRange(existing._row, modifiedByCol).setValue(alias);
        if (modifiedAtCol > 0) sh.getRange(existing._row, modifiedAtCol).setValue(new Date());
      }
    });
    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 2: Update pending members UI with checkboxes**
Modify `refreshPendingMembers` in `index.html` to add checkboxes and action buttons.

In `index.html`, render checkbox inputs and action buttons above the table:
```javascript
  function refreshPendingMembers(elId) {
    call('getPendingMembers', currentToken()).then(list => {
      const el = document.getElementById(elId);
      if (!el) return;
      const parentCard = elId === 'sa-pending-card' ? document.getElementById('sa-pending-card') : 
                         elId === 'admin-pending-card' ? document.getElementById('admin-pending-card') : null;
      if (!list.length) {
        el.innerHTML = '<p class="muted">Tidak ada pendaftaran baru.</p>';
        if (parentCard) parentCard.classList.add('hidden');
        return;
      }
      if (parentCard) parentCard.classList.remove('hidden');

      let html = '<div style="margin-bottom: 12px; display: flex; gap: 8px;">';
      html += '<button class="btn green btn-auto" style="margin:0; padding:6px 12px; font-size:12px;" onclick="bulkApprovePending(\'approve\', \'' + elId + '\')">Setujui Terpilih</button>';
      html += '<button class="btn danger btn-auto" style="margin:0; padding:6px 12px; font-size:12px;" onclick="bulkApprovePending(\'reject\', \'' + elId + '\')">Tolak Terpilih</button>';
      html += '</div>';

      html += '<div class="table-responsive"><table><tr>';
      html += '<th><input type="checkbox" id="select-all-pending-' + elId + '" onclick="toggleSelectAllPending(this, \'' + elId + '\')"></th>';
      html += '<th>Nama</th><th>WhatsApp</th><th>Status Awal</th><th>Aksi</th></tr>';
      
      list.forEach((m, idx) => {
        let defaultStatus = 'active';
        if (m.AddedBy && String(m.AddedBy).toLowerCase().includes('- ex')) defaultStatus = 'ex';
        html += '<tr>';
        html += '<td><input type="checkbox" class="pending-checkbox-' + elId + '" value="' + escapeHtml(m.WhatsApp) + '" data-status="' + defaultStatus + '"></td>';
        html += '<td>' + escapeHtml(m.Name) + '</td><td>' + escapeHtml(m.WhatsApp) + '</td>';
        html += '<td class="muted">' + (defaultStatus === 'active' ? 'Active (Karyawan)' : 'Ex (Alumni)') + '</td>';
        html += '<td><button class="btn green" style="margin-top:0; padding:6px 12px; font-size:12px; margin-right:4px;" onclick="approvePending(\'' + m.WhatsApp + '\', \'' + defaultStatus + '\', \'' + elId + '\')">Setujui</button>';
        html += '<button class="btn danger" style="margin-top:0; padding:6px 12px; font-size:12px;" onclick="approvePending(\'' + m.WhatsApp + '\', \'rejected\', \'' + elId + '\')">Tolak</button></td></tr>';
      });
      html += '</table></div>';
      el.innerHTML = html;
    });
  }
```

Add bulk helper functions in script section of `index.html`:
```javascript
  function toggleSelectAllPending(master, elId) {
    document.querySelectorAll('.pending-checkbox-' + elId).forEach(cb => cb.checked = master.checked);
  }

  function bulkApprovePending(action, elId) {
    const selected = [];
    document.querySelectorAll('.pending-checkbox-' + elId + ':checked').forEach(cb => {
      selected.push({ whatsapp: cb.value, defaultStatus: cb.getAttribute('data-status') });
    });
    if (!selected.length) {
      showInfoModal('Pilih minimal satu member terlebih dahulu.', 'Info');
      return;
    }

    const isRejection = action === 'reject';
    const updates = selected.map(s => ({
      whatsapp: s.whatsapp,
      status: isRejection ? 'rejected' : s.defaultStatus
    }));

    call('adminBulkUpdateMemberStatus', currentToken(), updates).then(() => {
      showToast('Status member terpilih berhasil diperbarui.');
      refreshPendingMembers(elId);
      refreshMembers();
      refreshSummary(elId === 'sa-pending-members' ? 'sa-summary' : 'admin-summary');
    }).catch(e => showInfoModal(e.message || String(e), 'Error'));
  }
```

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: add admin bulk member approval UI and backend batching"
```

---

### Task 3: Admin Transfer Ownership Campaign

**Files:**
- Modify: `Code.js`
- Modify: `index.html`

**Step 1: Create backend transfer function**
Implement `transferCampaignOwnershipAdmin` in `Code.js` to transfer campaign ownership to a member.

Add to `Code.js`:
```javascript
function transferCampaignOwnershipAdmin(adminToken, campaignId, targetWhatsapp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
    
    const cleanTarget = normalizePhone_(targetWhatsapp);
    const member = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === cleanTarget);
    if (!member || member.Status !== 'active') {
      throw new Error('Target PIC harus merupakan Member aktif.');
    }

    const campaign = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
    if (!campaign) throw new Error('Campaign tidak ditemukan.');

    const sh = sheet_(SHEETS.TOKENS);
    const tokens = getRows_(SHEETS.TOKENS);

    // Expire old PIC tokens linked to this campaign
    tokens.forEach(t => {
      if (t.LinkedCampaignID === campaignId && t.Role === 'PIC') {
        sh.getRange(t._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Expired');
      }
    });

    // Create new PIC token linked to this campaign
    const newTokenId = 'PIC-' + Utilities.getUuid().split('-')[0].toUpperCase();
    sh.appendRow([
      newTokenId,
      'PIC',
      'Active',
      campaignId,
      cleanTarget,
      new Date(),
      member.Name
    ]);

    SpreadsheetApp.flush();
    return newTokenId;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 2: Add transfer modal button in Admin view**
Add Transfer Ownership control in the Admin Campaign detail popup/modal in `index.html`.

In `index.html`, find the section where campaign details are shown to Admin (`viewCampaignAdmin` or similar). Let's render a Transfer section inside the admin modal:
```javascript
// We will insert this transfer ownership UI in index.html where campaign details are displayed in modal
```

Let's locate the exact modal renderer in `index.html`. Wait, we will do a search/grep to locate it. For now, the plan outlines adding the dropdown/selection interface:
1. An input/select containing the list of active members.
2. A button "Transfer Kepemilikan" invoking `transferOwnership(id)`.
3. In `transferOwnership`, calls backend `transferCampaignOwnershipAdmin`, closes modal, shows token in success modal, and refreshes the lists.

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: implement campaign transfer of ownership for admin"
```

---

### Task 4: PIC Auto Confirm All Bukti

**Files:**
- Modify: `Code.js`
- Modify: `index.html`

**Step 1: Create backend auto-confirm function**
Add `picVerifyAllPayments` to `Code.js`.

Add to `Code.js`:
```javascript
function picVerifyAllPayments(picToken, campaignId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const tok = findToken_(picToken, 'PIC');
    if (!tok || tok.Status === 'Expired') throw new Error('Token PIC tidak valid.');
    if (String(tok.LinkedCampaignID).trim() !== String(campaignId).trim()) throw new Error('Not authorized for this campaign');

    const picAlias = tok.Alias ? String(tok.Alias).trim() : 'PIC';
    const sh = sheet_(SHEETS.DONORS);
    const donors = getRows_(SHEETS.DONORS).filter(d =>
      d.CampaignID === campaignId &&
      d.DonorStatus === 'Pledged' &&
      d.Paid === true &&
      d.Verified !== true
    );

    const verifiedCol = headerIndex_(SHEETS.DONORS, 'Verified') + 1;
    const modByCol = headerIndex_(SHEETS.DONORS, 'ModifiedBy') + 1;
    const modAtCol = headerIndex_(SHEETS.DONORS, 'ModifiedAt') + 1;

    donors.forEach(d => {
      sh.getRange(d._row, verifiedCol).setValue('TRUE');
      if (modByCol > 0) sh.getRange(d._row, modByCol).setValue(picAlias);
      if (modAtCol > 0) sh.getRange(d._row, modAtCol).setValue(new Date());
    });

    SpreadsheetApp.flush();
    return donors.length;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 2: Add "Auto Confirm" button on PIC Dashboard**
In `index.html`, add a button *"Setujui Semua Bukti"* above the donor table in the PIC Dashboard:
`<button class="btn green btn-auto" onclick="picVerifyAll()">Setujui Semua Bukti</button>`

Implement the click action in `index.html`:
```javascript
  function picVerifyAll() {
    const campaignId = currentCampaignId; // current campaign being viewed
    call('picVerifyAllPayments', currentToken(), campaignId).then(count => {
      showToast('Berhasil menverifikasi ' + count + ' bukti transfer.');
      loadPicDashboard();
    }).catch(e => showInfoModal(e.message || String(e), 'Error'));
  }
```

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: add PIC bulk verification for uploaded payment proofs"
```

---

### Task 5: Member Copy Amount Donasi

**Files:**
- Modify: `index.html`

**Step 1: Add m-banking copy function**
Add the `copyAmount` function in the scripts block of `index.html` to copy the numeric-only amount to clipboard and show a Bahasa toast confirmation.

Add to `index.html`:
```javascript
  function copyAmount(amount, formattedText) {
    const raw = String(amount).replace(/[^0-9]/g, '');
    navigator.clipboard.writeText(raw).then(() => {
      showToast('Nominal Rp ' + formattedText + ' berhasil disalin untuk m-banking!');
    }).catch(() => showToast('Gagal menyalin nominal.'));
  }
```

**Step 2: Display copy icon in invoice cards**
Locate invoice nominal texts on the Member Dashboard and append a clickable copy button/badge:
`<span class="link-btn" onclick="copyAmount(' + amount + ', \'' + formatIDR(amount) + '\')" style="margin-left: 8px; cursor: pointer;">📋 Salin</span>`

**Step 3: Commit**
```bash
git add index.html
git commit -m "feat: add copy amount button with humanized toast for mobile banking"
```

---

### Task 6: Member Bulk Join Campaigns

**Files:**
- Modify: `Code.js`
- Modify: `index.html`

**Step 1: Implement bulk join in backend**
Create `joinCampaignsBulk` in `Code.js`.

Add to `Code.js`:
```javascript
function joinCampaignsBulk(campaignIds, name, whatsapp, customAmount, alias) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    whatsapp = normalizePhone_(whatsapp);
    const campaigns = getRows_(SHEETS.CAMPAIGNS);
    const donors = getRows_(SHEETS.DONORS);
    const dSheet = sheet_(SHEETS.DONORS);

    const statusCol = headerIndex_(SHEETS.DONORS, 'DonorStatus') + 1;
    const customCol = headerIndex_(SHEETS.DONORS, 'CustomAmount') + 1;
    const aliasCol = headerIndex_(SHEETS.DONORS, 'Alias') + 1;

    const finalCustomAmount = Number(customAmount) || 0;

    campaignIds.forEach(campaignId => {
      const campaign = campaigns.find(c => c.CampaignID === campaignId);
      if (!campaign || campaign.Status !== 'Open') return;

      const existing = donors.find(d => d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp);

      if (existing) {
        if (existing.DonorStatus !== 'Pledged') {
          dSheet.getRange(existing._row, statusCol).setValue('Pledged');
          if (customCol > 0) {
            dSheet.getRange(existing._row, customCol).setValue(finalCustomAmount > 0 ? finalCustomAmount : '');
          }
          if (aliasCol > 0) {
            dSheet.getRange(existing._row, aliasCol).setValue(alias || '');
          }
        }
      } else {
        const newRow = [campaignId, name, whatsapp, new Date(), 'Pledged', '', 'FALSE', '', '', finalCustomAmount > 0 ? finalCustomAmount : '', '', 'FALSE', 'FALSE', alias || ''];
        dSheet.appendRow(newRow);
      }
    });

    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 2: Add checkboxes to campaign lists and bulk join modal**
Modify campaign listings in `index.html` to include checkboxes.
Add a bulk action panel:
`<button id="bulk-join-btn" class="btn" style="display:none;" onclick="openBulkJoinModal()">Ikut Patungan Massal</button>`

Add script logic:
- Update checkboxes change listener to show/hide the bulk action panel.
- Implement `openBulkJoinModal()` which opens a custom modal showing a radio select for:
  - *"Patungan Rata (bagi rata tagihan nanti)"* (default)
  - *"Nominal Bebas (tulis nominal sendiri untuk semua campaign terpilih)"*
- Implement `submitBulkJoin()` which grabs checked campaign IDs and invokes `joinCampaignsBulk`.

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: add Member bulk campaign join backend and checkbox UI"
```

---

### Task 7: Member Combined Payment (Bayar Gabungan)

**Files:**
- Modify: `Code.js`
- Modify: `index.html`

**Step 1: Implement combined payment backend**
Create `submitCombinedPaymentProof` in `Code.js`.

Add to `Code.js`:
```javascript
function submitCombinedPaymentProof(campaignIds, whatsapp, fileData) {
  whatsapp = normalizePhone_(whatsapp);
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) throw new Error('Daftar Campaign tidak valid.');

  const folderId = getSetting('ProofsFolderId');
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64), fileData.mimeType, fileData.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = file.getUrl();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const donorsSheet = sheet_(SHEETS.DONORS);
    const donors = getRows_(SHEETS.DONORS);

    const paidCol = headerIndex_(SHEETS.DONORS, 'Paid') + 1;
    const proofLinkCol = headerIndex_(SHEETS.DONORS, 'ProofLink') + 1;
    const paidAtCol = headerIndex_(SHEETS.DONORS, 'PaidAt') + 1;
    const amountPaidCol = headerIndex_(SHEETS.DONORS, 'AmountPaid') + 1;

    campaignIds.forEach(campaignId => {
      const existing = donors.find(d =>
        d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged');
      if (existing) {
        donorsSheet.getRange(existing._row, paidCol).setValue('TRUE');
        donorsSheet.getRange(existing._row, proofLinkCol).setValue(fileUrl);
        donorsSheet.getRange(existing._row, paidAtCol).setValue(new Date());
        donorsSheet.getRange(existing._row, amountPaidCol).setValue(existing.AmountDue || 0);
      }
    });

    SpreadsheetApp.flush();
    return fileUrl;
  } finally {
    lock.releaseLock();
  }
}
```

**Step 2: Auto-group invoice list in frontend**
Modify invoice rendering logic on the Member Dashboard in `index.html`.
1. Scan the list of finalized campaigns where the member hasn't paid (`status === 'Pledged'` and `paid !== 'TRUE'`).
2. Group them by bank key: `BankName + '_' + BankAccount + '_' + AccountHolder`.
3. If a bank key has multiple invoices:
   - Render a combined payment card containing the sum of the amounts due.
   - Show a breakdown (e.g. *"Untuk patungan: [Target A], [Target B]"*).
   - Render a single "Konfirmasi Transfer" button that triggers a single file upload invoking `submitCombinedPaymentProof`.
4. If a bank key has only one invoice, render it as a single campaign card as usual.

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: implement combined payment grouping by bank details and backend submit"
```

---

### Task 8: Admin Dashboard and Email Notifications for signups

**Files:**
- Modify: `Code.js` (around `registerUser`)
- Modify: `index.html`

**Step 1: Implement email alerts on backend signup**
In `Code.js`, modify `registerUser` to send an email notification when a new member registers.

Modify `Code.js`:
Add email notification to the end of `registerUser` right after `sheet_(SHEETS.MEMBERS).appendRow(...)`:
```javascript
        // Send email alert to admin(s)
        try {
          const scriptOwnerEmail = Session.getEffectiveUser().getEmail();
          const recipientList = [scriptOwnerEmail];
          
          const adminEmailsSetting = getSetting('AdminNotificationEmails');
          if (adminEmailsSetting) {
            adminEmailsSetting.split(',').forEach(email => {
              const cleanEmail = email.trim();
              if (cleanEmail && recipientList.indexOf(cleanEmail) === -1) {
                recipientList.push(cleanEmail);
              }
            });
          }

          const webAppUrl = getWebAppUrl();
          const emailSubject = '[Donatur Helper] Pendaftaran Member Baru Menunggu Persetujuan: ' + name;
          const emailBody = 'Halo Admin,\n\n' +
            'Ada member baru yang mendaftar dan membutuhkan persetujuan Anda:\n' +
            'Nama: ' + name + '\n' +
            'WhatsApp: ' + whatsapp + '\n' +
            'Status Awal: ' + empStatus + '\n\n' +
            'Silakan buka Dashboard Admin untuk memproses:\n' +
            webAppUrl + '\n\n' +
            'Terima kasih,\nSystem Donatur Helper';

          MailApp.sendEmail(recipientList.join(','), emailSubject, emailBody);
        } catch (e) {
          Logger.log('Gagal mengirim email notifikasi pendaftaran: ' + e.message);
        }
```

**Step 2: Add client-side polling and visibility handling in frontend**
Modify `index.html` to implement client-side polling for pending members.
1. Implement browser tab title update helper:
```javascript
  let originalTitle = document.title || 'Donatur Helper';
  let activePendingCount = 0;

  function updateTabTitle(pendingCount) {
    activePendingCount = pendingCount;
    if (pendingCount > 0) {
      document.title = '(' + pendingCount + ') Pendaftaran Baru | ' + originalTitle;
    } else {
      document.title = originalTitle;
    }
  }
```

2. Play audio notification chime using Web Audio API:
```javascript
  let lastNotifiedCount = 0;

  function playAlertChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // Ding
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.4);

      // Dong
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(440, ctx.currentTime); // A4
        gain2.gain.setValueAtTime(0.3, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.6);
      }, 150);
    } catch(e) {
      console.log('Audio chime blocked or unsupported:', e);
    }
  }
```

3. Setup visibility-aware background polling:
```javascript
  let pollIntervalId = null;

  function startAdminPolling() {
    if (pollIntervalId) return;
    
    function runCheck() {
      const token = currentToken();
      if (!token || (currentRole !== 'Admin' && currentRole !== 'SuperAdmin')) return;

      call('getPendingMembers', token).then(list => {
        const currentCount = list.length;
        updateTabTitle(currentCount);

        if (currentCount > lastNotifiedCount) {
          playAlertChime();
          showToast('Ada ' + currentCount + ' pendaftaran member baru menunggu persetujuan!');
          
          // Trigger updates of target elements if visible
          const activePendingEl = document.getElementById('admin-pending-members') || document.getElementById('sa-pending-members');
          if (activePendingEl) {
            refreshPendingMembers(activePendingEl.id);
          }
        }
        lastNotifiedCount = currentCount;
      }).catch(e => console.log('Polling check failed:', e));
    }

    // Run immediately and setup 60s interval
    runCheck();
    pollIntervalId = setInterval(runCheck, 60000);

    // Watch tab visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      } else {
        startAdminPolling();
      }
    });
  }
```
Trigger `startAdminPolling()` upon successful Admin/SuperAdmin login.

**Step 3: Verify syntax**
Run: `node -c Code.js`
Expected: PASS

**Step 4: Commit**
```bash
git add Code.js index.html
git commit -m "feat: add admin dashboard polling notification chimes and backend email alerts"
```

