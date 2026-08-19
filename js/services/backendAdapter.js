import { getClient, isConfigured } from './supabaseClient.js';
import { SCRIPT_URL } from '../config.js';

export const DEFAULT_TIMEOUT_MS = 15000;

const MIGRATED_ACTIONS = new Set([
  'loginWithToken', 'getDashboardSummary', 'getPendingMembers', 'getPendingLateRequests',
  'listAllCampaigns', 'fetchAllMembers', 'getCampaignForPic', 'getSettingsForSuperAdmin',
  'checkDonorWhatsApp', 'listActiveCampaigns', 'getUserPicCampaigns', 'getPublicSettings',
  'registerUser', 'updateMemberProfile', 'generateSeamlessPicToken', 'deleteDraftPicToken',
  'joinCampaign', 'joinCampaignsBulk', 'withdrawCampaign', 'submitPaymentProof',
  'submitCombinedPaymentProof', 'createCampaign', 'closeCampaignList', 'reopenCampaignList',
  'finalizeCampaign', 'updateGiftProof', 'picVerifyPayment', 'picVerifyAllPayments',
  'picMarkRefunded', 'markDonorRefunded', 'requestLateDonor', 'archiveCampaign',
  'deleteCampaign', 'adminUpdateMemberStatus', 'adminBulkUpdateMemberStatus', 'approveLateDonor',
  'generatePicToken', 'adminGeneratePicToken', 'transferCampaignOwnershipAdmin', 'adminTransferCampaignOwnership',
  'adminRecalculateCampaign', 'adminUpdateGiftAmount', 'adminDeleteDonor', 'adminTogglePaidStatus',
  'updateDonorPaidAmountAdmin', 'adminUpdateDonorPaidAmount', 'setCampaignStatusAdmin', 'adminSetCampaignStatus',
  'generateAdminToken', 'superadminGenerateAdminToken', 'revokeAdminToken', 'superadminRevokeAdminToken',
  'reactivateAdminToken', 'superadminReactivateAdminToken', 'deleteAdminToken', 'superadminDeleteAdminToken',
  'superAdminAssignMemberRole', 'superadminAssignMemberRole', 'addMember', 'superadminAddMember',
  'removeMember', 'superadminRemoveMember', 'deleteCampaignAdmin', 'superadminDeleteCampaign',
  'updateSettings', 'superadminUpdateSettings', 'sweepArchivedData'
]);

function _getEnv() {
  if (typeof window !== 'undefined' && window.__DH_ENV__) {
    return window.__DH_ENV__;
  }
  return {
    BACKEND_MODE: 'supabase',
    ALLOW_GAS_FALLBACK: true,
    DEBUG: false
  };
}

function _logDebug(action, backend, status) {
  const env = _getEnv();
  if (env && env.DEBUG) {
    console.log(`[DH-Backend] action="${action}" backend="${backend}" status="${status}"`);
  }
}

function _normalizeCampaignStatus(rawStatus) {
  if (!rawStatus) return 'Open';
  const upper = String(rawStatus).toUpperCase();
  if (upper === 'OPEN') return 'Open';
  if (upper === 'CLOSED') return 'Closed';
  if (upper === 'FINALIZED') return 'Finalized';
  if (upper === 'ARCHIVED') return 'Archived';
  if (upper === 'DRAFT') return 'Draft';
  return rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
}

/**
 * Executes a legacy HTTP request to Google Apps Script endpoint.
 */
export function fetchBackendGAS(name, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;

  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  const fetchOptions = {
    method: 'POST',
    body: JSON.stringify({ action: name, params: args }),
    mode: 'cors',
    credentials: 'omit',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    }
  };

  if (controller) fetchOptions.signal = controller.signal;

  return fetch(SCRIPT_URL, fetchOptions)
    .then(async response => {
      if (timer) clearTimeout(timer);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("Respons server bukan JSON (mungkin error atau diblokir). Detail: " + text.substring(0, 80));
      }
    })
    .then(res => {
      if (res.status === 'error') throw new Error(res.message);
      if (res.data && typeof res.data === 'object' && res.data.error) {
        throw new Error(res.data.error);
      }
      _logDebug(name, 'gas', 'success');
      return res.data;
    })
    .catch(err => {
      if (timer) clearTimeout(timer);
      _logDebug(name, 'gas', 'error');
      if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
        const timeoutErr = new Error('Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw err;
    });
}

/**
 * Dispatches an action to its corresponding Supabase RPC function.
 */
async function _dispatchSupabaseRpc(action, args = []) {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase client belum dikonfigurasi.');
  }

  switch (action) {
    case 'loginWithToken': {
      let token = '';
      if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('verify_auth_token', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal memverifikasi token.');
      if (!data || !data.length) {
        throw new Error('Token tidak valid atau tidak ditemukan.');
      }
      const row = data[0];
      if (row.status === 'EXPIRED') throw new Error('Token sudah kedaluwarsa.');
      if (row.status === 'REVOKED') throw new Error('Token telah dinonaktifkan.');

      let role = 'PIC';
      const roleUpper = String(row.role || '').toUpperCase();
      if (roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPERADMIN') role = 'SuperAdmin';
      else if (roleUpper === 'ADMIN') role = 'Admin';
      else if (roleUpper === 'PIC') role = 'PIC';

      return {
        success: true,
        role,
        alias: row.alias || '',
        status: row.status,
        linkedCampaignId: row.linked_campaign_id,
        tokenId: row.token_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        token
      };
    }

    case 'getDashboardSummary': {
      let token = '';
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_admin_dashboard_stage1', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal memuat ringkasan admin.');
      if (data && data.error) throw new Error(data.message || data.error);

      const s = data.summary || {};
      const pendingMembers = (data.pending_members_list || []).map(m => ({
        Name: m.name,
        name: m.name,
        WhatsApp: m.whatsapp,
        whatsapp: m.whatsapp,
        AddedBy: m.added_by || 'Self-Registered - active',
        addedBy: m.added_by || 'Self-Registered - active',
        AddedAt: m.added_at,
        addedAt: m.added_at,
        id: m.id,
        ...m
      }));
      const pendingLateRequests = (data.pending_late_requests || []).map(r => ({
        reqId: r.request_id,
        requestId: r.request_id,
        targetName: r.target_name || r.campaign_id,
        campaignId: r.campaign_id,
        pic: r.pic || '',
        donorName: r.donor_name,
        donorWhatsApp: r.donor_whatsapp,
        isCustom: Boolean(r.is_custom),
        customAmount: Number(r.custom_amount) || 0,
        reason: r.reason || '',
        createdAt: r.created_at,
        ...r
      }));

      return {
        summary: s,
        pending_members_list: data.pending_members_list || [],
        pending_late_requests: data.pending_late_requests || [],
        pendingMembers,
        pendingLateRequests,
        campaignsByStatus: {
          Open: s.open_campaigns || 0,
          Closed: s.closed_campaigns || 0,
          Finalized: s.finalized_campaigns || 0
        },
        totalDonors: s.total_donors || 0,
        totalPending: s.total_pending || 0,
        totalCollected: s.total_collected || 0,
        picTokens: s.pic_tokens || { unused: 0, active: 0, expired: 0 },
        totalMembers: s.total_members || 0,
        activeMembers: s.active_members || 0,
        ...s,
        ...data
      };
    }

    case 'getPendingMembers': {
      let token = '';
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_admin_dashboard_stage1', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal memuat daftar member pending.');
      if (data && data.error) throw new Error(data.message || data.error);

      return (data.pending_members_list || []).map(m => ({
        Name: m.name,
        name: m.name,
        WhatsApp: m.whatsapp,
        whatsapp: m.whatsapp,
        AddedBy: m.added_by || 'Self-Registered - active',
        addedBy: m.added_by || 'Self-Registered - active',
        AddedAt: m.added_at,
        addedAt: m.added_at,
        id: m.id,
        ...m
      }));
    }

    case 'getPendingLateRequests': {
      let token = '';
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_admin_dashboard_stage1', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal memuat pengajuan donatur susulan.');
      if (data && data.error) throw new Error(data.message || data.error);

      return (data.pending_late_requests || []).map(r => ({
        reqId: r.request_id,
        requestId: r.request_id,
        targetName: r.target_name || r.campaign_id,
        campaignId: r.campaign_id,
        pic: r.pic || '',
        donorName: r.donor_name,
        donorWhatsApp: r.donor_whatsapp,
        isCustom: Boolean(r.is_custom),
        customAmount: Number(r.custom_amount) || 0,
        reason: r.reason || '',
        createdAt: r.created_at,
        ...r
      }));
    }

    case 'listAllCampaigns': {
      let token = '';
      let page = 1;
      let pageSize = 50;
      let status = null;

      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
        page = Number(args.page || args.p_page) || 1;
        pageSize = Number(args.page_size || args.pageSize || args.p_page_size) || 50;
        status = args.status || args.p_status || null;
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
        page = Number(args[0].page || args[0].p_page) || 1;
        pageSize = Number(args[0].page_size || args[0].pageSize || args[0].p_page_size) || 50;
        status = args[0].status || args[0].p_status || null;
      } else {
        token = String(args[0] || '').trim();
        page = Number(args[1]) || 1;
        pageSize = Number(args[2]) || 50;
        status = args[3] || null;
      }

      if (status === 'all' || status === '') status = null;

      const { data, error } = await client.rpc('get_admin_campaigns', {
        p_token: token,
        p_page: page,
        p_page_size: pageSize,
        p_status: status
      });
      if (error) throw new Error(error.message || 'Gagal memuat daftar campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      const rawCampaigns = Array.isArray(data.campaigns) ? data.campaigns : (Array.isArray(data) ? data : []);
      const campaigns = rawCampaigns.map(c => {
        const normStatus = _normalizeCampaignStatus(c.status || c.Status);
        return {
          CampaignID: c.campaign_id || c.CampaignID || c.id,
          campaignId: c.campaign_id || c.CampaignID || c.id,
          TargetName: c.target_name || c.TargetName || '',
          targetName: c.target_name || c.TargetName || '',
          Reason: c.reason || c.Reason || '',
          reason: c.reason || c.Reason || '',
          GiftAmount: Number(c.gift_amount !== undefined ? c.gift_amount : c.GiftAmount) || 0,
          giftAmount: Number(c.gift_amount !== undefined ? c.gift_amount : c.GiftAmount) || 0,
          Status: normStatus,
          status: normStatus,
          StartDate: c.start_date ? String(c.start_date).split('T')[0] : (c.StartDate || ''),
          startDate: c.start_date ? String(c.start_date).split('T')[0] : (c.StartDate || ''),
          Deadline: c.deadline ? String(c.deadline).split('T')[0] : (c.Deadline || ''),
          deadline: c.deadline ? String(c.deadline).split('T')[0] : (c.Deadline || ''),
          CreatedAt: c.created_at ? (typeof c.created_at === 'number' ? c.created_at : new Date(c.created_at).getTime()) : (c.CreatedAt || 0),
          createdAt: c.created_at,
          FinalizedAt: c.finalized_at || c.FinalizedAt || null,
          finalizedAt: c.finalized_at || c.FinalizedAt || null,
          donorCount: Number(c.donor_count !== undefined ? c.donor_count : c.DonorCount) || 0,
          totalCollected: Number(c.total_collected !== undefined ? c.total_collected : c.TotalCollected) || 0,
          picAlias: c.pic_alias || c.PicAlias || c.picName || '',
          picName: c.pic_alias || c.PicAlias || c.picName || '',
          paidCount: Number(c.paid_count !== undefined ? c.paid_count : (c.paidCount || 0)),
          ModifiedBy: c.modified_by || c.ModifiedBy || '',
          ModifiedAt: c.modified_at || c.ModifiedAt || '',
          ...c
        };
      });

      return {
        campaigns,
        pagination: data.pagination || {
          page,
          page_size: pageSize,
          total_count: campaigns.length,
          total_pages: Math.ceil(campaigns.length / pageSize) || 1
        }
      };
    }

    case 'fetchAllMembers': {
      let token = '';
      let page = 1;
      let pageSize = 50;
      let search = null;
      let status = null;
      let role = null;

      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
        page = Number(args.page || args.p_page) || 1;
        pageSize = Number(args.page_size || args.pageSize || args.p_page_size) || 50;
        search = args.q || args.search || args.p_search || null;
        status = args.status || args.p_status || null;
        role = args.role || args.p_role || null;
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
        page = Number(args[0].page || args[0].p_page) || 1;
        pageSize = Number(args[0].page_size || args[0].pageSize || args[0].p_page_size) || 50;
        search = args[0].q || args[0].search || args[0].p_search || null;
        status = args[0].status || args[0].p_status || null;
        role = args[0].role || args[0].p_role || null;
      } else {
        token = String(args[0] || '').trim();
        page = Number(args[1]) || 1;
        pageSize = Number(args[2]) || 50;
        search = args[3] || null;
        status = args[4] || null;
        role = args[5] || null;
      }

      if (status === 'all' || status === '') status = null;
      if (role === 'all' || role === '') role = null;
      if (search === '') search = null;

      const { data, error } = await client.rpc('get_admin_members', {
        p_token: token,
        p_page: page,
        p_page_size: pageSize,
        p_search: search,
        p_status: status,
        p_role: role
      });
      if (error) throw new Error(error.message || 'Gagal memuat daftar member.');
      if (data && data.error) throw new Error(data.message || data.error);

      const rawMembers = Array.isArray(data.members) ? data.members : (Array.isArray(data) ? data : []);
      const members = rawMembers.map(m => {
        let normStatus = m.status || m.Status || 'Active';
        normStatus = normStatus.charAt(0).toUpperCase() + normStatus.slice(1).toLowerCase();
        let normRole = m.role || m.Role || 'Member';
        normRole = normRole.charAt(0).toUpperCase() + normRole.slice(1).toLowerCase();
        return {
          id: m.id,
          Name: m.name || m.Name || '',
          name: m.name || m.Name || '',
          WhatsApp: m.whatsapp || m.WhatsApp || '',
          whatsapp: m.whatsapp || m.WhatsApp || '',
          Email: m.email || m.Email || '',
          email: m.email || m.Email || '',
          Role: normRole,
          role: normRole,
          Status: normStatus,
          status: normStatus,
          AddedBy: m.added_by || m.AddedBy || '',
          addedBy: m.added_by || m.AddedBy || '',
          AddedAt: m.added_at || m.AddedAt || m.created_at || '',
          addedAt: m.added_at || m.AddedAt || m.created_at || '',
          ModifiedBy: m.modified_by || m.ModifiedBy || '',
          ModifiedAt: m.modified_at || m.ModifiedAt || '',
          ...m
        };
      });

      return {
        members,
        pagination: data.pagination || {
          page,
          page_size: pageSize,
          total_count: members.length,
          total_pages: Math.ceil(members.length / pageSize) || 1
        }
      };
    }

    case 'getCampaignForPic': {
      let token = '';
      let page = 1;
      let pageSize = 100;

      if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
        page = Number(args[0].page || args[0].p_page) || 1;
        pageSize = Number(args[0].pageSize || args[0].p_page_size) || 100;
      } else {
        token = String(args[0] || '').trim();
        page = Number(args[1]) || 1;
        pageSize = Number(args[2]) || 100;
      }

      const { data, error } = await client.rpc('get_pic_dashboard', {
        p_token: token,
        p_page: page,
        p_page_size: pageSize
      });
      if (error) throw new Error(error.message || 'Gagal memuat dashboard PIC.');
      if (data && data.error) throw new Error(data.message || data.error);

      if (!data || !data.campaign) {
        return { campaign: null, donors: [], summary: null };
      }

      const c = data.campaign;
      const normalizedStatus = _normalizeCampaignStatus(c.status || c.Status);
      const normalizedCampaign = {
        CampaignID: c.campaign_id || c.CampaignID || '',
        TargetName: c.target_name || c.TargetName || '',
        Reason: c.reason || c.Reason || '',
        GiftAmount: Number(c.gift_amount !== undefined ? c.gift_amount : c.GiftAmount) || 0,
        Status: normalizedStatus,
        Deadline: c.deadline ? String(c.deadline).split('T')[0] : (c.Deadline || ''),
        StartDate: c.start_date ? String(c.start_date).split('T')[0] : (c.StartDate || ''),
        BankName: c.bank_name || c.BankName || '',
        BankAccount: c.bank_account || c.BankAccount || '',
        AccountHolder: c.account_holder || c.AccountHolder || '',
        GiftLink: c.gift_link || c.GiftLink || '',
        GiftImage: c.gift_image || c.GiftImage || '',
        PicWhatsApp: c.pic_whatsapp || c.PicWhatsApp || '',
        CreatedAt: c.created_at || c.CreatedAt || '',
        ...c,
        status: normalizedStatus
      };

      const normalizedDonors = (data.donors || []).map(d => {
        const isPaid = String(d.paid !== undefined ? d.paid : (d.Paid || 'FALSE')).toUpperCase() === 'TRUE';
        const isVer = String(d.verified !== undefined ? d.verified : (d.Verified || 'FALSE')).toUpperCase() === 'TRUE';
        const isRef = String(d.refunded !== undefined ? d.refunded : (d.Refunded || 'FALSE')).toUpperCase() === 'TRUE';
        const isCus = String(d.is_custom !== undefined ? d.is_custom : (d.IsCustom || 'FALSE')).toUpperCase() === 'TRUE';
        const proofPath = d.proof_storage_path || d.ProofStoragePath || '';
        const proofLink = proofPath && proofPath.startsWith('http') ? proofPath : (d.proof_link || d.ProofLink || '');
        const amtDue = Number(d.amount_due !== undefined ? d.amount_due : d.AmountDue) || 0;
        const amtPaid = Number(d.amount_paid !== undefined ? d.amount_paid : d.AmountPaid) || 0;
        const name = d.name || d.Name || '';
        const wa = d.whatsapp || d.WhatsApp || '';
        const alias = d.alias || d.Alias || '';
        const cusAmt = d.custom_amount !== undefined ? d.custom_amount : d.CustomAmount;
        const status = d.donor_status || d.DonorStatus || 'joined';
        const actGrp = d.action_group || d.ActionGroup || '';
        const jAt = d.joined_at || d.JoinedAt || '';
        const pAt = d.paid_at || d.PaidAt || '';
        const mAt = d.modified_at || d.ModifiedAt || '';
        const mBy = d.modified_by || d.ModifiedBy || '';

        return {
          id: d.id, name, whatsapp: wa, alias, donor_status: status, is_custom: isCus,
          custom_amount: Number(cusAmt) || null, amount_due: amtDue, amount_paid: amtPaid,
          paid: isPaid, verified: isVer, refunded: isRef, proof_storage_path: proofPath,
          proof_link: proofLink, action_group: actGrp, joined_at: jAt, paid_at: pAt,
          modified_at: mAt, modified_by: mBy,
          Name: name, WhatsApp: wa, Alias: alias, DonorStatus: status,
          IsCustom: isCus ? 'TRUE' : 'FALSE', CustomAmount: cusAmt, AmountDue: amtDue,
          AmountPaid: amtPaid, Paid: isPaid ? 'TRUE' : 'FALSE', Verified: isVer ? 'TRUE' : 'FALSE',
          Refunded: isRef ? 'TRUE' : 'FALSE', ProofStoragePath: proofPath, ProofLink: proofLink,
          ActionGroup: actGrp, JoinedAt: jAt, PaidAt: pAt, ModifiedAt: mAt, ModifiedBy: mBy,
          ...d
        };
      });

      return {
        campaign: normalizedCampaign,
        donors: normalizedDonors,
        summary: data.summary || {
          total_donors: normalizedDonors.length,
          total_paid: normalizedDonors.filter(d => d.paid).length
        }
      };
    }

    case 'getSettingsForSuperAdmin': {
      let token = '';
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = String(args.token || args.p_token || '').trim();
      } else if (args[0] && typeof args[0] === 'object') {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_superadmin_dashboard_stage1', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal memuat dashboard super admin.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'checkDonorWhatsApp': {
      let wa = '';
      if (args[0] && typeof args[0] === 'object') {
        wa = String(args[0].whatsapp || args[0].p_whatsapp || '').trim();
      } else {
        wa = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_donor_dashboard', { p_whatsapp: wa });
      if (error) throw new Error(error.message || 'Gagal memeriksa nomor WhatsApp.');
      if (data && data.error) {
        if (data.error === 'not_found' || data.error === 'not_found_in_campaign') {
          return { exists: false, status: 'unregistered', verified: false, pending: false };
        }
        throw new Error(data.message || data.error);
      }

      const id = (data && data.identity) || {};
      const status = String(id.member_status || (data && data.status) || '').toLowerCase();
      return {
        exists: Boolean(id.is_registered_member || id.name || data.exists),
        name: id.name || data.name || '',
        alias: id.alias || data.alias || '',
        status: status || 'unregistered',
        verified: status === 'active',
        pending: status === 'pending',
        ...data
      };
    }

    case 'listActiveCampaigns': {
      let wa = '';
      if (args[0] && typeof args[0] === 'object') {
        wa = String(args[0].whatsapp || args[0].p_whatsapp || '').trim();
      } else {
        wa = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_donor_dashboard', { p_whatsapp: wa });
      if (error) throw new Error(error.message || 'Gagal memuat dashboard donatur.');
      if (data && data.error) throw new Error(data.message || data.error);

      const joinedCampaigns = (data.joined_campaigns || []).map(c => {
        const camp = c.campaign || {};
        const cId = camp.campaign_id || c.campaign_id;
        const tName = camp.target_name || c.target_name;
        const reas = camp.reason || c.reason || '';
        const gAmt = Number(camp.gift_amount !== undefined ? camp.gift_amount : c.gift_amount) || 0;
        const stat = _normalizeCampaignStatus(camp.status || c.status);
        const sDate = camp.start_date ? String(camp.start_date).split('T')[0] : (c.start_date ? String(c.start_date).split('T')[0] : '');
        const dLine = camp.deadline ? String(camp.deadline).split('T')[0] : (c.deadline ? String(c.deadline).split('T')[0] : '');
        const bName = camp.bank_name || c.bank_name || '';
        const bAcc = camp.bank_account || c.bank_account || '';
        const aHolder = camp.account_holder || c.account_holder || '';
        const gLink = camp.gift_link || c.gift_link || '';
        const gImg = camp.gift_image || c.gift_image || '';

        return {
          ...camp,
          ...c,
          campaignId: cId,
          targetName: tName,
          reason: reas,
          giftAmount: gAmt,
          status: stat,
          startDate: sDate,
          deadline: dLine,
          donorStatus: c.donor_status || 'joined',
          isCustom: Boolean(c.is_custom),
          customAmount: Number(c.custom_amount) || null,
          amountDue: Number(c.amount_due) || 0,
          amountPaid: Number(c.amount_paid) || 0,
          paid: Boolean(c.paid),
          verified: Boolean(c.verified),
          refunded: Boolean(c.refunded),
          proofLink: c.proof_link || '',
          proofStoragePath: c.proof_storage_path || '',
          joinedAt: c.joined_at || '',
          paidAt: c.paid_at || '',
          bankName: bName,
          bankAccount: bAcc,
          accountHolder: aHolder,
          giftLink: gLink,
          giftImage: gImg,
          joined: true,
          action_group: c.action_group || (stat === 'Finalized' && !c.paid ? 'NEED_PAYMENT' : '')
        };
      });

      const openCampaigns = (data.open_campaigns || []).map(c => ({
        ...c,
        campaignId: c.campaign_id,
        targetName: c.target_name,
        reason: c.reason || '',
        giftAmount: Number(c.gift_amount) || 0,
        status: _normalizeCampaignStatus(c.status),
        startDate: c.start_date ? String(c.start_date).split('T')[0] : '',
        deadline: c.deadline ? String(c.deadline).split('T')[0] : '',
        donorCount: c.donor_count || 0,
        totalCollected: Number(c.total_collected) || 0,
        joined: false
      }));

      const allList = [...joinedCampaigns, ...openCampaigns];
      allList.joined = joinedCampaigns;
      allList.open = openCampaigns;
      allList.member = data.member || data.identity || null;
      return allList;
    }

    case 'getUserPicCampaigns': {
      let wa = '';
      if (args[0] && typeof args[0] === 'object') {
        wa = String(args[0].whatsapp || args[0].p_whatsapp || '').trim();
      } else {
        wa = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('get_user_pic_campaigns', { p_whatsapp: wa });
      if (error) throw new Error(error.message || 'Gagal memuat campaign PIC pengguna.');
      if (data && data.error) throw new Error(data.message || data.error);

      return (data || []).map(c => ({
        campaignId: c.campaign_id,
        targetName: c.target_name,
        reason: c.reason || '',
        giftAmount: Number(c.gift_amount) || 0,
        status: _normalizeCampaignStatus(c.status),
        deadline: c.deadline ? String(c.deadline).split('T')[0] : '',
        token: c.token,
        donorCount: c.donor_count || 0,
        totalCollected: Number(c.total_collected) || 0,
        ...c
      }));
    }

    case 'getPublicSettings': {
      const { data, error } = await client.rpc('get_public_settings');
      if (error) throw new Error(error.message || 'Gagal memuat pengaturan publik.');
      return data || { enableRounding: true, roundTo: 500, maxActiveCampaigns: 5 };
    }

    // --- MUTATIONS ---
    case 'registerUser': {
      let name, wa, empStatus, email, alias;
      if (args[0] && typeof args[0] === 'object') {
        name = args[0].name || args[0].p_name;
        wa = args[0].whatsapp || args[0].p_whatsapp;
        empStatus = args[0].empStatus || args[0].status;
        email = args[0].email || args[0].p_email;
        alias = args[0].alias || args[0].p_alias;
      } else {
        [name, wa, empStatus, alias] = args;
      }
      const { data, error } = await client.rpc('register_donor_member', {
        p_name: name,
        p_whatsapp: wa,
        p_email: email || null,
        p_alias: alias || null
      });
      if (error) throw new Error(error.message || 'Gagal mendaftar.');
      if (data && data.error) throw new Error(data.message || data.error);

      const member = (data && data.member) || {};
      const rawStatus = String(member.status || data.status || '').toUpperCase();
      const resolvedStatus = empStatus || (member.status ? String(member.status).toLowerCase() : (data.status || 'active'));
      return {
        exists: rawStatus === 'PENDING' || rawStatus === 'EXISTING' || rawStatus === 'EXISTS' || rawStatus === 'ACTIVE' || Boolean(data.exists),
        pending: rawStatus === 'PENDING' || Boolean(data.pending) || true,
        active: rawStatus === 'ACTIVE' || Boolean(data.active),
        status: resolvedStatus,
        name: member.name || data.name || name,
        maskedWhatsapp: member.whatsapp_masked || member.maskedWhatsapp || '',
        token: data.token || member.token,
        member,
        ...data
      };
    }

    case 'generateSeamlessPicToken': {
      let wa, targetName, reason, giftAmount, deadline, startDate;
      if (args[0] && typeof args[0] === 'object') {
        wa = args[0].whatsapp || args[0].p_whatsapp;
        targetName = args[0].targetName || args[0].p_target_name;
        reason = args[0].reason || args[0].p_reason;
        giftAmount = args[0].giftAmount || args[0].p_gift_amount;
        deadline = args[0].deadline || args[0].p_deadline;
        startDate = args[0].startDate || args[0].p_start_date;
      } else {
        [wa, targetName, reason, giftAmount, deadline, startDate] = args;
      }
      const { data, error } = await client.rpc('generate_seamless_pic_token', {
        p_whatsapp: wa,
        p_target_name: targetName || null,
        p_reason: reason || null,
        p_gift_amount: giftAmount ? Number(giftAmount) : null,
        p_deadline: deadline || null,
        p_start_date: startDate || null
      });
      if (error) throw new Error(error.message || 'Gagal membuat campaign PIC.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data.token || data;
    }

    case 'joinCampaign': {
      let campaignId, name, wa, isCustom, customAmount, alias;
      if (args[0] && typeof args[0] === 'object') {
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        name = args[0].name || args[0].p_name;
        wa = args[0].whatsapp || args[0].p_whatsapp;
        isCustom = args[0].isCustom !== undefined ? args[0].isCustom : args[0].p_is_custom;
        customAmount = args[0].customAmount !== undefined ? args[0].customAmount : args[0].p_custom_amount;
        alias = args[0].alias || args[0].p_alias;
      } else if (args.length === 5) {
        [campaignId, name, wa, customAmount, alias] = args;
        isCustom = Boolean(customAmount);
      } else {
        [campaignId, name, wa, isCustom, customAmount, alias] = args;
      }
      let parsedCustomAmt = null;
      if (customAmount !== undefined && customAmount !== null && String(customAmount).trim() !== '') {
        parsedCustomAmt = typeof customAmount === 'number' ? customAmount : Number(String(customAmount).replace(/\D/g, ''));
      }
      const { data, error } = await client.rpc('join_campaign', {
        p_campaign_id: campaignId,
        p_name: name,
        p_whatsapp: wa,
        p_is_custom: isCustom !== undefined ? Boolean(isCustom) : Boolean(parsedCustomAmt),
        p_custom_amount: parsedCustomAmt,
        p_alias: alias || null
      });
      if (error) throw new Error(error.message || 'Gagal bergabung dengan campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'joinCampaignsBulk': {
      let campaignIds, name, wa, customAmount, alias;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        campaignIds = args[0].campaignIds || args[0].campaign_ids || args[0].p_campaign_ids;
        name = args[0].name || args[0].donorName || args[0].p_name;
        wa = args[0].whatsapp || args[0].donorWhatsApp || args[0].p_whatsapp;
        customAmount = args[0].customAmount || args[0].custom_amount || args[0].p_custom_amount;
        alias = args[0].alias || args[0].donorAlias || args[0].p_alias;
      } else {
        [campaignIds, name, wa, customAmount, alias] = args;
      }
      const ids = Array.isArray(campaignIds) ? campaignIds : String(campaignIds || '').split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await client.rpc('join_campaigns_bulk', {
        p_campaign_ids: ids,
        p_name: name,
        p_whatsapp: wa,
        p_custom_amount: customAmount ? Number(customAmount) : null,
        p_alias: alias || null
      });
      if (error) throw new Error(error.message || 'Gagal bergabung secara massal.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'withdrawCampaign': {
      let campaignId, wa;
      if (args[0] && typeof args[0] === 'object') {
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        wa = args[0].whatsapp || args[0].p_whatsapp;
      } else {
        [campaignId, wa] = args;
      }
      const { data, error } = await client.rpc('withdraw_campaign', {
        p_campaign_id: campaignId,
        p_whatsapp: wa
      });
      if (error) throw new Error(error.message || 'Gagal membatalkan partisipasi.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'submitPaymentProof': {
      let campaignId, wa, storagePath, publicUrl;
      if (args[0] && typeof args[0] === 'object') {
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        wa = args[0].whatsapp || args[0].p_whatsapp;
        storagePath = args[0].storagePath || args[0].p_storage_path;
        publicUrl = args[0].publicUrl || args[0].p_public_url;
      } else {
        [campaignId, wa, storagePath, publicUrl] = args;
      }
      const { data, error } = await client.rpc('submit_payment_proof', {
        p_campaign_id: campaignId,
        p_whatsapp: wa,
        p_storage_path: storagePath || null,
        p_public_url: publicUrl || null
      });
      if (error) throw new Error(error.message || 'Gagal mengunggah bukti transfer.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'submitCombinedPaymentProof': {
      let campaignIds, wa, storagePath, publicUrl;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        campaignIds = args[0].campaignIds || args[0].p_campaign_ids;
        wa = args[0].whatsapp || args[0].p_whatsapp;
        storagePath = args[0].storagePath || args[0].p_storage_path;
        publicUrl = args[0].publicUrl || args[0].p_public_url;
      } else {
        [campaignIds, wa, storagePath, publicUrl] = args;
      }
      const ids = Array.isArray(campaignIds) ? campaignIds : String(campaignIds || '').split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await client.rpc('submit_combined_payment_proof', {
        p_campaign_ids: ids,
        p_whatsapp: wa,
        p_storage_path: storagePath || null,
        p_public_url: publicUrl || null
      });
      if (error) throw new Error(error.message || 'Gagal mengirim bukti transfer gabungan.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'createCampaign': {
      let token, dataPayload;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        dataPayload = args[0];
      } else {
        [token, dataPayload] = args;
      }
      const { data, error } = await client.rpc('create_campaign_for_pic', {
        p_token: token,
        p_target_name: dataPayload.targetName || dataPayload.target_name,
        p_reason: dataPayload.reason || '',
        p_gift_amount: dataPayload.giftAmount ? Number(dataPayload.giftAmount) : 0,
        p_start_date: dataPayload.startDate || null,
        p_deadline: dataPayload.deadline || null
      });
      if (error) throw new Error(error.message || 'Gagal membuat campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'closeCampaignList': {
      let token = '';
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('close_campaign_list', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal menutup pendaftaran.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'reopenCampaignList': {
      let token = '';
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('reopen_campaign_list', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal membuka pendaftaran.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'finalizeCampaign': {
      let token, bankInfo, rawFinalAmount, giftImagePath;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        bankInfo = args[0].bankInfo || args[0];
        rawFinalAmount = args[0].rawFinalAmount || args[0].finalAmount || args[0].gift_amount || args[0].p_gift_amount;
        giftImagePath = args[0].giftImagePath || args[0].p_gift_image;
      } else {
        [token, bankInfo, rawFinalAmount, giftImagePath] = args;
      }
      const b = bankInfo || {};
      const { data, error } = await client.rpc('finalize_campaign', {
        p_token: token,
        p_bank_name: b.bankName || b.bank_name || '',
        p_bank_account: b.bankAccount || b.bank_account || '',
        p_account_holder: b.accountHolder || b.account_holder || '',
        p_gift_link: b.giftLink || b.gift_link || null,
        p_gift_image: giftImagePath || b.giftImage || b.gift_image || null,
        p_gift_amount: Number(rawFinalAmount) || 0
      });
      if (error) throw new Error(error.message || 'Gagal memfinalisasi campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'updateGiftProof': {
      let token, link, fileData;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        link = args[0].link || args[0].p_link;
        fileData = args[0].imageStoragePath || args[0].image || args[0].p_image_path || args[0].fileData;
      } else {
        [token, link, fileData] = args;
      }
      const { data, error } = await client.rpc('update_campaign_gift_proof', {
        p_token: token,
        p_link: link || null,
        p_image_path: typeof fileData === 'string' ? fileData : null
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui bukti hadiah.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'picVerifyPayment': {
      let token, campaignId, whatsapp, isValid;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        whatsapp = args[0].whatsapp || args[0].p_whatsapp;
        isValid = args[0].isValid !== undefined ? args[0].isValid : args[0].p_is_valid;
      } else {
        [token, campaignId, whatsapp, isValid] = args;
      }
      const { data, error } = await client.rpc('verify_donor_payment', {
        p_token: token,
        p_campaign_id: campaignId,
        p_whatsapp: whatsapp,
        p_is_valid: Boolean(isValid)
      });
      if (error) throw new Error(error.message || 'Gagal memverifikasi pembayaran.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'picVerifyAllPayments': {
      let token, campaignId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
      } else {
        [token, campaignId] = args;
      }
      const { data, error } = await client.rpc('verify_all_donor_payments', {
        p_token: token,
        p_campaign_id: campaignId
      });
      if (error) throw new Error(error.message || 'Gagal memverifikasi semua pembayaran.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data.verified_count !== undefined ? data.verified_count : data;
    }

    case 'requestLateDonor': {
      let token, name, wa, isCustom, amount, reason, realToken, alias;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].p_token;
        name = args[0].donorName || args[0].name || args[0].p_donor_name;
        wa = args[0].donorWhatsApp || args[0].whatsapp || args[0].wa || args[0].p_donor_whatsapp;
        isCustom = args[0].isCustom !== undefined ? args[0].isCustom : args[0].p_is_custom;
        amount = args[0].customAmount !== undefined ? args[0].customAmount : (args[0].amount || args[0].p_custom_amount);
        reason = args[0].reason || args[0].p_reason;
        alias = args[0].donorAlias || args[0].alias || args[0].p_donor_alias;
      } else {
        [token, name, wa, isCustom, amount, reason, realToken, alias] = args;
      }
      const { data, error } = await client.rpc('request_late_donor', {
        p_token: token,
        p_donor_name: name,
        p_donor_whatsapp: wa,
        p_reason: reason,
        p_is_custom: Boolean(isCustom),
        p_custom_amount: amount ? Number(amount) : null,
        p_donor_alias: alias || null
      });
      if (error) throw new Error(error.message || 'Gagal mengajukan donatur susulan.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'archiveCampaign': {
      let token = '';
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('archive_campaign_pic', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal mengarsipkan campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'deleteCampaign': {
      let token = '';
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = String(args[0].token || args[0].p_token || '').trim();
      } else {
        token = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('delete_campaign_pic', { p_token: token });
      if (error) throw new Error(error.message || 'Gagal menghapus campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminUpdateMemberStatus': {
      let token, wa, newStatus;
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = args.token || args.p_token;
        wa = args.whatsapp || args.wa || args.p_whatsapp;
        newStatus = args.newStatus || args.status || args.p_new_status;
      } else if (args[0] && typeof args[0] === 'object') {
        token = args[0].token || args[0].p_token;
        wa = args[0].whatsapp || args[0].wa || args[0].p_whatsapp;
        newStatus = args[0].newStatus || args[0].status || args[0].p_new_status;
      } else {
        [token, wa, newStatus] = args;
      }
      const { data, error } = await client.rpc('admin_update_member_status', {
        p_token: token,
        p_whatsapp: wa,
        p_new_status: newStatus
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui status member.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'approveLateDonor': {
      let token, reqId, isApprove;
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        token = args.token || args.p_token;
        reqId = args.reqId || args.requestId || args.p_req_id;
        isApprove = args.isApproved !== undefined ? args.isApproved : (args.isApprove !== undefined ? args.isApprove : args.p_is_approved);
      } else if (args[0] && typeof args[0] === 'object') {
        token = args[0].token || args[0].p_token;
        reqId = args[0].reqId || args[0].requestId || args[0].p_req_id;
        isApprove = args[0].isApproved !== undefined ? args[0].isApproved : (args[0].isApprove !== undefined ? args[0].isApprove : args[0].p_is_approved);
      } else {
        [token, reqId, isApprove] = args;
      }
      const { data, error } = await client.rpc('admin_approve_late_donor', {
        p_token: token,
        p_req_id: reqId,
        p_is_approved: Boolean(isApprove)
      });
      if (error) throw new Error(error.message || 'Gagal memproses pengajuan donatur susulan.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'updateMemberProfile': {
      let wa, name, email;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        wa = args[0].whatsapp || args[0].wa || args[0].p_whatsapp;
        name = args[0].name || args[0].p_name;
        email = args[0].email || args[0].p_email;
      } else {
        [wa, name, email] = args;
      }
      const { data, error } = await client.rpc('update_member_profile', {
        p_whatsapp: wa,
        p_name: name,
        p_email: email || null
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui profil member.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'deleteDraftPicToken': {
      let picToken = '';
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        picToken = args[0].picToken || args[0].token || args[0].p_pic_token || '';
      } else {
        picToken = String(args[0] || '').trim();
      }
      const { data, error } = await client.rpc('delete_draft_pic_token', {
        p_pic_token: picToken
      });
      if (error) throw new Error(error.message || 'Gagal menghapus token draft PIC.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'picMarkRefunded':
    case 'markDonorRefunded': {
      let token, campaignId, wa;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].picToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        wa = args[0].whatsapp || args[0].donorWhatsApp || args[0].p_whatsapp;
      } else {
        [token, campaignId, wa] = args;
      }
      const { data, error } = await client.rpc('mark_donor_refunded', {
        p_token: token,
        p_campaign_id: campaignId,
        p_whatsapp: wa
      });
      if (error) throw new Error(error.message || 'Gagal menandai pengembalian dana donatur.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminBulkUpdateMemberStatus': {
      let token, updates;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0].updates) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        updates = args[0].updates || args[0].p_updates;
      } else {
        [token, updates] = args;
      }
      const { data, error } = await client.rpc('admin_bulk_update_member_status', {
        p_token: token,
        p_updates: Array.isArray(updates) ? updates : []
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui status member massal.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'generatePicToken':
    case 'adminGeneratePicToken': {
      let token, alias;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        alias = args[0].alias || args[0].p_alias;
      } else {
        [token, alias] = args;
      }
      const { data, error } = await client.rpc('admin_generate_pic_token', {
        p_token: token,
        p_alias: alias || null
      });
      if (error) throw new Error(error.message || 'Gagal membuat token PIC baru.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'transferCampaignOwnershipAdmin':
    case 'adminTransferCampaignOwnership': {
      let token, campaignId, targetWhatsapp;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        targetWhatsapp = args[0].targetWhatsapp || args[0].target_whatsapp || args[0].p_target_whatsapp;
      } else {
        [token, campaignId, targetWhatsapp] = args;
      }
      const { data, error } = await client.rpc('admin_transfer_campaign_ownership', {
        p_token: token,
        p_campaign_id: campaignId,
        p_target_whatsapp: targetWhatsapp
      });
      if (error) throw new Error(error.message || 'Gagal mentransfer kepemilikan campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminRecalculateCampaign': {
      let token, campaignId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
      } else {
        [token, campaignId] = args;
      }
      const { data, error } = await client.rpc('admin_recalculate_campaign', {
        p_token: token,
        p_campaign_id: campaignId
      });
      if (error) throw new Error(error.message || 'Gagal menghitung ulang tagihan campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminUpdateGiftAmount': {
      let token, campaignId, newAmount;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        newAmount = args[0].newAmount !== undefined ? args[0].newAmount : (args[0].amount || args[0].p_new_amount);
      } else {
        [token, campaignId, newAmount] = args;
      }
      const { data, error } = await client.rpc('admin_update_gift_amount', {
        p_token: token,
        p_campaign_id: campaignId,
        p_new_amount: Number(newAmount) || 0
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui nominal hadiah campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminDeleteDonor': {
      let token, campaignId, donorWhatsApp;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        donorWhatsApp = args[0].donorWhatsApp || args[0].whatsapp || args[0].p_donor_whatsapp;
      } else {
        [token, campaignId, donorWhatsApp] = args;
      }
      const { data, error } = await client.rpc('admin_delete_donor', {
        p_token: token,
        p_campaign_id: campaignId,
        p_donor_whatsapp: donorWhatsApp
      });
      if (error) throw new Error(error.message || 'Gagal menghapus donatur dari campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'adminTogglePaidStatus': {
      let token, campaignId, donorWhatsApp, isPaid;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        donorWhatsApp = args[0].donorWhatsApp || args[0].whatsapp || args[0].p_donor_whatsapp;
        isPaid = args[0].isPaid !== undefined ? args[0].isPaid : args[0].p_is_paid;
      } else {
        [token, campaignId, donorWhatsApp, isPaid] = args;
      }
      const { data, error } = await client.rpc('admin_toggle_paid_status', {
        p_token: token,
        p_campaign_id: campaignId,
        p_donor_whatsapp: donorWhatsApp,
        p_is_paid: Boolean(isPaid)
      });
      if (error) throw new Error(error.message || 'Gagal mengubah status pembayaran donatur.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'updateDonorPaidAmountAdmin':
    case 'adminUpdateDonorPaidAmount': {
      let token, campaignId, wa, amount;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        wa = args[0].whatsapp || args[0].donorWhatsApp || args[0].p_whatsapp;
        amount = args[0].amount !== undefined ? args[0].amount : (args[0].paidAmount || args[0].p_amount);
      } else {
        [token, campaignId, wa, amount] = args;
      }
      const { data, error } = await client.rpc('admin_update_donor_paid_amount', {
        p_token: token,
        p_campaign_id: campaignId,
        p_whatsapp: wa,
        p_amount: Number(amount) || 0
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui nominal bayar donatur.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'setCampaignStatusAdmin':
    case 'adminSetCampaignStatus': {
      let token, campaignId, newStatus;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].adminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
        newStatus = args[0].newStatus || args[0].status || args[0].p_new_status;
      } else {
        [token, campaignId, newStatus] = args;
      }
      const { data, error } = await client.rpc('admin_set_campaign_status', {
        p_token: token,
        p_campaign_id: campaignId,
        p_new_status: newStatus
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui status campaign.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'generateAdminToken':
    case 'superadminGenerateAdminToken': {
      let token, alias;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        alias = args[0].alias || args[0].p_alias;
      } else {
        [token, alias] = args;
      }
      const { data, error } = await client.rpc('superadmin_generate_admin_token', {
        p_token: token,
        p_alias: alias
      });
      if (error) throw new Error(error.message || 'Gagal membuat token Admin baru.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'revokeAdminToken':
    case 'superadminRevokeAdminToken': {
      let token, tokenId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        tokenId = args[0].tokenId || args[0].token_id || args[0].p_token_id;
      } else {
        [token, tokenId] = args;
      }
      const { data, error } = await client.rpc('superadmin_revoke_admin_token', {
        p_token: token,
        p_token_id: tokenId
      });
      if (error) throw new Error(error.message || 'Gagal menonaktifkan token.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'reactivateAdminToken':
    case 'superadminReactivateAdminToken': {
      let token, tokenId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        tokenId = args[0].tokenId || args[0].token_id || args[0].p_token_id;
      } else {
        [token, tokenId] = args;
      }
      const { data, error } = await client.rpc('superadmin_reactivate_admin_token', {
        p_token: token,
        p_token_id: tokenId
      });
      if (error) throw new Error(error.message || 'Gagal mengaktifkan kembali token.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'deleteAdminToken':
    case 'superadminDeleteAdminToken': {
      let token, tokenId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        tokenId = args[0].tokenId || args[0].token_id || args[0].p_token_id;
      } else {
        [token, tokenId] = args;
      }
      const { data, error } = await client.rpc('superadmin_delete_admin_token', {
        p_token: token,
        p_token_id: tokenId
      });
      if (error) throw new Error(error.message || 'Gagal menghapus token permanen.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'superAdminAssignMemberRole':
    case 'superadminAssignMemberRole': {
      let token, wa, newRole;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        wa = args[0].whatsapp || args[0].wa || args[0].p_whatsapp;
        newRole = args[0].newRole || args[0].role || args[0].p_new_role;
      } else {
        [token, wa, newRole] = args;
      }
      const { data, error } = await client.rpc('superadmin_assign_member_role', {
        p_token: token,
        p_whatsapp: wa,
        p_new_role: newRole
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui role member.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'addMember':
    case 'superadminAddMember': {
      let token, name, wa, status, email;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        name = args[0].name || args[0].p_name;
        wa = args[0].whatsapp || args[0].wa || args[0].p_whatsapp;
        status = args[0].status || args[0].p_status;
        email = args[0].email || args[0].p_email;
      } else {
        [token, name, wa, status, email] = args;
      }
      const { data, error } = await client.rpc('superadmin_add_member', {
        p_token: token,
        p_name: name,
        p_whatsapp: wa,
        p_status: status || 'ACTIVE',
        p_email: email || null
      });
      if (error) throw new Error(error.message || 'Gagal menambahkan member.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'removeMember':
    case 'superadminRemoveMember': {
      let token, wa;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        wa = args[0].whatsapp || args[0].wa || args[0].p_whatsapp;
      } else {
        [token, wa] = args;
      }
      const { data, error } = await client.rpc('superadmin_remove_member', {
        p_token: token,
        p_whatsapp: wa
      });
      if (error) throw new Error(error.message || 'Gagal menghapus member.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'deleteCampaignAdmin':
    case 'superadminDeleteCampaign': {
      let token, campaignId;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        campaignId = args[0].campaignId || args[0].p_campaign_id;
      } else {
        [token, campaignId] = args;
      }
      const { data, error } = await client.rpc('superadmin_delete_campaign', {
        p_token: token,
        p_campaign_id: campaignId
      });
      if (error) throw new Error(error.message || 'Gagal menghapus campaign secara permanen.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'updateSettings':
    case 'superadminUpdateSettings': {
      let token, settings;
      if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0].settings) {
        token = args[0].token || args[0].superAdminToken || args[0].p_token;
        settings = args[0].settings || args[0].p_settings;
      } else {
        [token, settings] = args;
      }
      const { data, error } = await client.rpc('superadmin_update_settings', {
        p_token: token,
        p_settings: typeof settings === 'object' && settings !== null ? settings : {}
      });
      if (error) throw new Error(error.message || 'Gagal memperbarui pengaturan sistem.');
      if (data && data.error) throw new Error(data.message || data.error);

      return data;
    }

    case 'sweepArchivedData': {
      return {
        success: false,
        error: 'migration_deferred',
        message: 'Fitur pembersihan arsip data ditangguhkan dalam migrasi ini.'
      };
    }

    default:
      throw new Error(`Aksi "${action}" belum dimigrasikan ke Supabase.`);
  }
}

/**
 * Unified Backend Entrypoint compatible with legacy frontend call patterns.
 */
export function adapterFetchBackend(name, args = [], options = {}) {
  const env = _getEnv();
  const mode = String(env.BACKEND_MODE || 'supabase').toLowerCase();
  const allowGasFallback = env.ALLOW_GAS_FALLBACK !== false;

  if (mode === 'gas') {
    return fetchBackendGAS(name, args, options);
  }

  const isMigrated = MIGRATED_ACTIONS.has(name);
  const clientConfigured = isConfigured();

  if (isMigrated && clientConfigured) {
    return _dispatchSupabaseRpc(name, args)
      .then(res => {
        _logDebug(name, 'supabase', 'success');
        return res;
      })
      .catch(err => {
        _logDebug(name, 'supabase', 'error');
        if (mode === 'auto' && allowGasFallback) {
          return fetchBackendGAS(name, args, options);
        }
        throw err;
      });
  }

  if (allowGasFallback) {
    return fetchBackendGAS(name, args, options);
  }

  _logDebug(name, 'blocked', 'unmigrated_no_fallback');
  const migrationError = new Error('Fitur ini sedang dalam proses migrasi ke Supabase.');
  migrationError.error = 'migration_in_progress';
  return Promise.reject(migrationError);
}

export const fetchBackend = adapterFetchBackend;

if (typeof window !== 'undefined') {
  window.__dhBackendAdapter = {
    fetchBackend: adapterFetchBackend,
    fetchBackendGAS
  };

  const env = _getEnv();
  if (env && env.DEBUG) {
    window.__dhHealthCheck = function () {
      const currentEnv = _getEnv();
      return {
        supabaseConfigured: isConfigured(),
        backendMode: currentEnv.BACKEND_MODE || 'supabase',
        allowGasFallback: currentEnv.ALLOW_GAS_FALLBACK !== false,
        status: 'healthy'
      };
    };
  }
}
