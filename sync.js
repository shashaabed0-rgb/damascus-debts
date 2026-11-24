// ==================== إعدادات Supabase والحالة المشتركة ====================
const SUPABASE_URL = 'https://oeojvcikwiyiwmenozew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qescc0we7OizukGkCGc29w_kIiBhUHU';

let sb = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

function ensureSupabaseClient() {
  if (!sb && window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return sb;
}

function createIsolatedAuthClient() {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('مكتبة الاتصال غير جاهزة، يرجى تحديث الصفحة مع توفر الإنترنت.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-isolated-' + Date.now()
    }
  });
}

// ==================== بيانات التطبيق والمطور (تظهر في نافذة «حول التطبيق») ====================
const APP_META = {
  appName: 'دفتر الديون السحابي',
  version: 'v1.0',
  developerOrg: 'مركز الدمشقي للصيانة',
  developerName: 'أبو العز',
  developerPhone: '0994373742'
};

const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'دولار', short: 'دولار' },
  SYP: { code: 'SYP', symbol: 'ل.س', name: 'ليرة سوري', short: 'ليرة سوري' }
};

const DEVICE_SETTINGS_KEY = 'debt_device_settings_sb_v1';
const LAST_SESSION_KEY = 'debt_last_session_sb_v1';
const DEVICE_UID_KEY = 'debt_device_uid_v1';
const DEVICE_LOGOUT_VER_PREFIX = 'debt_logout_ver_v1_';
const FREE_OFFLINE_MAX_CUSTOMERS = 25;
const FREE_OFFLINE_WORKSHOP_ID = 'free_offline_local';
const FREE_OFFLINE_MODE_KEY = 'debt_free_offline_mode_v1';
const FREE_OFFLINE_WS_SETTINGS_KEY = 'debt_free_offline_ws_settings_v1';
const LOCAL_LOGO_KEY_PREFIX = 'debt_local_logo_v1_';
const AUDIT_RETENTION_DAYS = 14;
const INACTIVE_ACCOUNT_DAYS = 90;
let pendingConfirmEmail = '';
let cachedSystemStats = null;
let lastActivityTouchMs = 0;

function getLocalLogoKey(wid = null) {
  const id = wid || (currentProfile ? currentProfile.workshop_id : '') || (currentWorkshop ? currentWorkshop.id : '') || 'default';
  return LOCAL_LOGO_KEY_PREFIX + id;
}

function loadLocalShopLogo(wid = null) {
  try {
    return localStorage.getItem(getLocalLogoKey(wid)) || '';
  } catch (e) {
    return '';
  }
}

function saveLocalShopLogo(dataUrl, wid = null) {
  try {
    const k = getLocalLogoKey(wid);
    if (dataUrl) localStorage.setItem(k, dataUrl);
    else localStorage.removeItem(k);
  } catch (e) {}
}

function isAuditEntryWithinRetention(entry) {
  if (!entry || !entry.created_at) return true;
  const ts = Date.parse(entry.created_at);
  if (isNaN(ts)) return true;
  const cutoff = Date.now() - (AUDIT_RETENTION_DAYS * 86400000);
  return ts >= cutoff;
}

function pruneOldLocalAuditLogs() {
  if (Array.isArray(auditLogs)) {
    auditLogs = auditLogs.filter(isAuditEntryWithinRetention);
  }
  if (Array.isArray(pendingAuditQueue)) {
    pendingAuditQueue = pendingAuditQueue.filter(isAuditEntryWithinRetention);
  }
}
const CUSTOMER_STUB_TYPE = 'ملف_عميل';

function isCustomerStubRecord(rec) {
  if (!rec) return false;
  const t = String(typeof rec === 'string' ? rec : (rec.type || '')).trim();
  return t === CUSTOMER_STUB_TYPE;
}
let lastSyncMeta = { syncedAt: '', localUpdatedAt: '', lastAction: '' };
const memberCredsMap = new Map();
const workshopCredsMap = new Map();
let memberStatusChannel = null;
let lastNotifiedSecondAttemptIso = '';

const DEFAULT_WA_CONFIG = {
  showShopName: true,
  showGreeting: true,
  greetingText: 'السلام عليكم',
  showLatestTx: true,
  debtIntroText: 'تم تسجيل دين جديد على حسابك:',
  payIntroText: 'تم تسجيل دفعة جديدة في حسابك:',
  showTxNote: true,
  showTxDate: true,
  showSummary: true,
  summaryTitleText: 'ملخص حسابك حتى تاريخ',
  showTotalDebt: true,
  showTotalPay: true,
  showBalance: true,
  showShamCash: true,
  shamCashLabel: 'شام كاش:',
  showGeneralNote: true,
  showContactInfo: true,
  showCustomNote: false,
  customNoteText: ''
};

let settings = {
  shopName: 'مركز الدمشقي للصيانة',
  shopAddress: '',
  shopPhone: '',
  shopPhones: [],
  shopLogo: '',
  generalNote: '',
  shamCashEnabled: false,
  shamCashCode: '',
  waConfig: { ...DEFAULT_WA_CONFIG },
  currency: 'BOTH',
  overdueDays: 30,
  customerDueDates: {},
  whatsappApp: 'normal',
  themeMode: 'auto',
  showMainFilters: false,
  customerSortMode: 'latest',
  customerSortDateDir: 'asc',
  lockEnabled: false,
  pin: '',
  bioEnabled: false,
  bioCredId: ''
};

let currentUser = null;
let currentProfile = null;
let currentWorkshop = null;
let realtimeChannel = null;
let presenceChannel = null;
let workshopStatusChannel = null;
let onlineUsersMap = new Map();
let onlineWorkshopsMap = new Map();
let cachedMembersList = [];
let cachedWorkshopsList = [];
let cachedAllMembersByWs = new Map();
let editingWorkshopId = null;
let editingWorkshopAdminId = null;
let editingWorkshopOldEmail = '';
let sessionTempLoginPass = '';
let tempCredsOnceData = null;

let allRecords = [];
let pendingQueue = [];
let auditLogs = [];
let pendingAuditQueue = [];
let pendingDueDateQueue = {};
let auditTableMissingOnServer = false;
let pendingAutoFreeMigrateCheck = false;
let groupedCustomers = [];
let visibleCustomers = [];
let currentFilter = 'all';
let currentCustomerName = null;
let editingTxId = null;
let confirmAction = null;
let txKind = 'debt';
let txCurrency = 'USD';
let lastUsedTxCurrency = 'USD';
let isUnlocked = false;
let isSyncing = false;
let allowAppExit = false;
let rootGuardArmed = false;
let tempSettingsCurrency = 'BOTH';
let tempSettingsWa = 'normal';
let tempLogoData = '';

// ==================== الصلاحيات ====================
function isFreeOfflineMode() {
  return !!(currentProfile && currentProfile.is_free_offline === true);
}
function isAdmin() {
  return !!(currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'super_admin' || currentProfile.is_free_offline === true));
}
function canManageAccounts() {
  return !isFreeOfflineMode() && !!(currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'super_admin'));
}
function isSuperAdmin() {
  return !isFreeOfflineMode() && !!(currentProfile && currentProfile.role === 'super_admin');
}
function canDeleteRecords() {
  return isAdmin() || !!(currentProfile && currentProfile.can_delete);
}
function getRoleLabel(role) {
  if (role === 'super_admin') return 'مدير عام';
  if (role === 'admin') return 'مدير';
  if (role === 'free_offline') return 'حساب مجاني (أوفلاين)';
  return 'موظف / جهاز';
}

// ==================== مفاتيح التخزين المحلي المعزولة لكل ورشة ====================
function wsKey(suffix) {
  const wid = currentProfile ? currentProfile.workshop_id : 'none';
  return `debt_sb_${suffix}_${wid}`;
}

function loadDeviceSettings() {
  try {
    const dev = JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) || '{}');
    settings.whatsappApp = dev.whatsappApp || 'normal';
    settings.themeMode = (dev.themeMode === 'light' || dev.themeMode === 'dark' || dev.themeMode === 'auto') ? dev.themeMode : 'auto';
    settings.showMainFilters = !!dev.showMainFilters;
    settings.customerSortMode = (dev.customerSortMode === 'latest' || dev.customerSortMode === 'alpha' || dev.customerSortMode === 'date')
      ? dev.customerSortMode
      : 'latest';
    settings.customerSortDateDir = dev.customerSortDateDir === 'desc' ? 'desc' : 'asc';
    settings.lockEnabled = !!dev.lockEnabled;
    settings.pin = dev.pin || '';
    settings.bioEnabled = !!dev.bioEnabled;
    settings.bioCredId = dev.bioCredId || '';
  } catch (e) {}
  if (typeof applyThemeMode === 'function') applyThemeMode(settings.themeMode);
}

function persistDeviceSettings() {
  localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({
    whatsappApp: settings.whatsappApp,
    themeMode: settings.themeMode || 'auto',
    showMainFilters: !!settings.showMainFilters,
    customerSortMode: settings.customerSortMode || 'latest',
    customerSortDateDir: settings.customerSortDateDir || 'asc',
    lockEnabled: settings.lockEnabled,
    pin: settings.pin,
    bioEnabled: settings.bioEnabled,
    bioCredId: settings.bioCredId
  }));
}

function getShopPhonesList() {
  if (Array.isArray(settings.shopPhones) && settings.shopPhones.length > 0) {
    return settings.shopPhones.map(p => String(p || '').trim()).filter(Boolean);
  }
  const single = String(settings.shopPhone || '').trim();
  if (!single) return [];
  return single.split(/[،,|/\n]+/).map(p => p.trim()).filter(Boolean);
}

function applyWorkshopSettingsToState(ws) {
  const s = (ws && ws.settings && typeof ws.settings === 'object') ? ws.settings : {};
  settings.shopName = (ws && ws.name) || s.shopName || 'مركز الدمشقي للصيانة';
  settings.shopAddress = s.shopAddress || '';
  if (Array.isArray(s.shopPhones) && s.shopPhones.length > 0) {
    settings.shopPhones = s.shopPhones.map(p => String(p || '').trim()).filter(Boolean);
  } else if (s.shopPhone && String(s.shopPhone).trim()) {
    settings.shopPhones = String(s.shopPhone).split(/[،,|/\n]+/).map(p => p.trim()).filter(Boolean);
  } else {
    settings.shopPhones = [];
  }
  settings.shopPhone = settings.shopPhones.join(' - ');
  const wsIdForLogo = (ws && ws.id) || (currentProfile && currentProfile.workshop_id) || '';
  let localLogo = loadLocalShopLogo(wsIdForLogo);
  // ترحيل لمرة واحدة فقط إن كان هناك شعار قديم محفوظ بالسحابة ليبقى على جهاز المستخدم محلياً
  if (!localLogo && s.shopLogo) {
    saveLocalShopLogo(s.shopLogo, wsIdForLogo);
    localLogo = s.shopLogo;
  }
  settings.shopLogo = localLogo;
  settings.generalNote = s.generalNote || '';
  settings.shamCashEnabled = !!s.shamCashEnabled;
  settings.shamCashCode = s.shamCashCode || '';
  settings.waConfig = { ...DEFAULT_WA_CONFIG, ...(s.waConfig && typeof s.waConfig === 'object' ? s.waConfig : {}) };
  settings.currency = (s.currency === 'USD' || s.currency === 'SYP' || s.currency === 'BOTH') ? s.currency : 'BOTH';
  const parsedOverdue = Number(s.overdueDays);
  settings.overdueDays = (Number.isFinite(parsedOverdue) && parsedOverdue >= 0) ? Math.floor(parsedOverdue) : 30;
  settings.customerDueDates = (s.customerDueDates && typeof s.customerDueDates === 'object' && !Array.isArray(s.customerDueDates))
    ? { ...s.customerDueDates }
    : {};
}

function formatDateTimeDisplay(d = new Date()) {
  const datePart = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const timePart = d.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} - ${timePart}`;
}

function getLastUpdateDisplayText() {
  const bestTime = lastSyncMeta.localUpdatedAt || lastSyncMeta.syncedAt || '';
  if (!bestTime) return '';
  if (lastSyncMeta.syncedAt && lastSyncMeta.localUpdatedAt && lastSyncMeta.localUpdatedAt !== lastSyncMeta.syncedAt && pendingQueue.length > 0) {
    return `آخر تعديل محلي: ${lastSyncMeta.localUpdatedAt}`;
  }
  return `آخر تحديث: ${lastSyncMeta.syncedAt || lastSyncMeta.localUpdatedAt}`;
}

function saveLastSyncMeta(patch = {}) {
  if (!currentProfile) return;
  lastSyncMeta = { ...lastSyncMeta, ...patch };
  try {
    localStorage.setItem(wsKey('last_sync_meta'), JSON.stringify(lastSyncMeta));
  } catch (e) {}
}

function loadWorkshopLocalData() {
  try {
    allRecords = JSON.parse(localStorage.getItem(wsKey('records')) || '[]');
    pendingQueue = JSON.parse(localStorage.getItem(wsKey('queue')) || '[]');
    auditLogs = JSON.parse(localStorage.getItem(wsKey('audit_logs')) || '[]');
    pendingAuditQueue = JSON.parse(localStorage.getItem(wsKey('audit_queue')) || '[]');
    pendingDueDateQueue = JSON.parse(localStorage.getItem(wsKey('due_queue')) || '{}');
    if (pendingDueDateQueue && typeof pendingDueDateQueue === 'object') {
      Object.entries(pendingDueDateQueue).forEach(([k, v]) => {
        if (v && v.date) settings.customerDueDates[k] = { date: v.date, note: v.note || '' };
        else delete settings.customerDueDates[k];
      });
    }
    pruneOldLocalAuditLogs();
    lastSyncMeta = JSON.parse(localStorage.getItem(wsKey('last_sync_meta')) || '{"syncedAt":"","localUpdatedAt":"","lastAction":""}');
  } catch (e) {
    allRecords = [];
    pendingQueue = [];
    auditLogs = [];
    pendingAuditQueue = [];
    pendingDueDateQueue = {};
    lastSyncMeta = { syncedAt: '', localUpdatedAt: '', lastAction: '' };
  }
}

function persistAuditData() {
  if (!currentProfile) return;
  try {
    localStorage.setItem(wsKey('audit_logs'), JSON.stringify((auditLogs || []).slice(0, 500)));
    localStorage.setItem(wsKey('audit_queue'), JSON.stringify((pendingAuditQueue || []).slice(0, 300)));
    localStorage.setItem(wsKey('due_queue'), JSON.stringify(pendingDueDateQueue || {}));
  } catch (e) {}
}

function persistData() {
  if (!currentProfile) return;
  localStorage.setItem(wsKey('records'), JSON.stringify(allRecords));
  localStorage.setItem(wsKey('queue'), JSON.stringify(pendingQueue));
  persistAuditData();
}

const TRACKED_AUDIT_ACTIONS = new Set(['edit_tx', 'delete_tx', 'edit_customer', 'delete_customer', 'set_due_date']);

function recordAuditEvent({ action_type, customer_name, summary, before_data = null, after_data = null }) {
  if (!currentProfile || isFreeOfflineMode()) return null;
  if (!TRACKED_AUDIT_ACTIONS.has(String(action_type || ''))) return null;
  const entry = {
    id: 'aud_' + genId(),
    workshop_id: currentProfile.workshop_id,
    actor_user_id: currentUser && currentUser.id && !isFreeOfflineMode() ? currentUser.id : null,
    actor_name: String(currentProfile.display_name || currentProfile.email || 'المستخدم'),
    action_type: String(action_type || 'edit_tx'),
    customer_name: cleanDisplayCustomerName(customer_name || ''),
    summary: String(summary || ''),
    before_data: before_data || null,
    after_data: after_data || null,
    created_at: new Date().toISOString()
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 500) auditLogs = auditLogs.slice(0, 500);
  if (!isFreeOfflineMode()) {
    pendingAuditQueue.push(entry);
  }
  persistAuditData();
  return entry;
}

function isDualCurrencyMode() {
  return settings.currency === 'BOTH';
}

function getCurr(code = null) {
  const c = code || (settings.currency === 'SYP' ? 'SYP' : 'USD');
  return CURRENCIES[c] || CURRENCIES.USD;
}

function getRecordCurrency(rec) {
  const t = String((rec && rec.type) || rec || '');
  if (t.includes('ل.س') || t.toUpperCase().includes('SYP') || t.includes('سوري')) return 'SYP';
  if (t.includes('$') || t.toUpperCase().includes('USD') || t.includes('دولار')) return 'USD';
  return settings.currency === 'SYP' ? 'SYP' : 'USD';
}

function getEnabledCurrencyCodes() {
  if (settings.currency === 'USD') return ['USD'];
  if (settings.currency === 'SYP') return ['SYP'];
  return ['USD', 'SYP'];
}
function normalizeDigits(str) {
  return String(str == null ? '' : str)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

function normalizeLocalPhoneInput(rawPhone) {
  let s = normalizeDigits(rawPhone).trim().replace(/^'/, '');
  if (!s) return '';
  // إزالة الفراغات والرموز الزائدة مع الإبقاء على الصيغة المحلية السورية بدون رمز دولي
  const digits = s.replace(/[^\d]/g, '');
  if (digits.startsWith('00963') && digits.length >= 13) {
    const rest = digits.slice(5);
    return rest.startsWith('0') ? rest : ('0' + rest);
  }
  if (digits.startsWith('963') && digits.length >= 11) {
    const rest = digits.slice(3);
    return rest.startsWith('0') ? rest : ('0' + rest);
  }
  if (digits.startsWith('9') && digits.length === 9) {
    return '0' + digits;
  }
  return digits || s;
}

function genId(salt = 0) { return String(Date.now()) + '_' + salt + '_' + Math.floor(Math.random() * 10000); }

function toDbRecord(rec) {
  return {
    id: String(rec.id),
    workshop_id: currentProfile.workshop_id,
    date: String(rec.date || todayString()),
    name: String(rec.name || '').trim(),
    phone: normalizeLocalPhoneInput(rec.phone || ''),
    type: String(rec.type || 'دين ($)'),
    amount: Number(rec.amount) || 0,
    note: String(rec.note || '').trim(),
    created_by: String(rec.created_by || currentProfile.display_name || currentProfile.email || '')
  };
}

// ==================== معرف الجهاز الفريد وحماية الجهاز الواحد ====================
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_UID_KEY);
    if (!id) {
      if (window.crypto && typeof crypto.randomUUID === 'function') {
        id = 'dev_' + crypto.randomUUID();
      } else {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      }
      localStorage.setItem(DEVICE_UID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'dev_fallback';
  }
}

let resolvedDeviceModelName = '';

function initHighEntropyDeviceModel() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      navigator.userAgentData.getHighEntropyValues(['model']).then((vals) => {
        const mdl = vals && vals.model ? String(vals.model).trim() : '';
        if (mdl && mdl.length >= 2 && mdl.length <= 28 && !/^(K|Mobile|Android|Linux)$/i.test(mdl)) {
          const changed = resolvedDeviceModelName !== mdl;
          resolvedDeviceModelName = mdl;
          if (changed && presenceChannel && currentUser && currentProfile && !isFreeOfflineMode()) {
            presenceChannel.track(buildPresenceTrackPayload()).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  } catch (e) {}
}

function getFriendlyDeviceLabel() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    if (resolvedDeviceModelName) {
      return `أندرويد (${resolvedDeviceModelName})`;
    }
    const m = ua.match(/Android[^;]*;\s*([^;)]+)/i);
    const rawModel = m && m[1] ? m[1].replace(/Build\/.*/i, '').trim() : '';
    const isGeneric = !rawModel || rawModel.length < 2 || /^(K|Mobile|wv|Linux|Android|U)$/i.test(rawModel);
    return (!isGeneric && rawModel.length <= 24) ? `أندرويد (${rawModel})` : 'هاتف أندرويد';
  }
  if (/iPhone/i.test(ua)) return 'هاتف آيفون';
  if (/iPad/i.test(ua)) return 'جهاز آيباد';
  if (/Windows/i.test(ua)) return 'كمبيوتر Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'كمبيوتر Mac';
  if (/Linux/i.test(ua)) return 'كمبيوتر Linux';
  return 'جهاز آخر';
}

function formatArabicDeviceCount(n) {
  const num = Number(n) || 0;
  if (num <= 0) return '0 أجهزة';
  if (num === 1) return 'جهاز واحد';
  if (num === 2) return 'جهازين';
  if (num >= 3 && num <= 10) return `${num} أجهزة`;
  return `${num} جهازاً`;
}

function getDeviceIconEmoji(label) {
  const s = String(label || '');
  if (s.includes('كمبيوتر') || /Windows|Mac|Linux/i.test(s)) return '💻';
  return '📱';
}

function getLiveDevicesForUser(userId, fallbackProfile = null) {
  const myDevId = getOrCreateDeviceId();
  const rawList = onlineUsersMap.get(userId) || [];
  const list = rawList.map(d => ({
    ...d,
    isCurrentDevice: Boolean(currentUser && userId === currentUser.id && d.device_id === myDevId)
  }));

  if (currentUser && userId === currentUser.id && navigator.onLine && !isFreeOfflineMode()) {
    if (!list.some(d => d.device_id === myDevId)) {
      list.unshift({
        user_id: currentUser.id,
        workshop_id: currentProfile ? currentProfile.workshop_id : '',
        display_name: (currentProfile && currentProfile.display_name) || '',
        email: (currentProfile && currentProfile.email) || '',
        role: (currentProfile && currentProfile.role) || '',
        device_id: myDevId,
        device_label: getFriendlyDeviceLabel(),
        online_at: new Date().toISOString(),
        isCurrentDevice: true
      });
    }
  }

  list.sort((a, b) => (b.isCurrentDevice ? 1 : 0) - (a.isCurrentDevice ? 1 : 0));
  return list;
}

function buildLiveDevicesChipsHtml(devices) {
  if (!devices || devices.length === 0) return '';
  const labelTotals = {};
  devices.forEach(d => {
    const lbl = d.device_label || 'جهاز متصل';
    labelTotals[lbl] = (labelTotals[lbl] || 0) + 1;
  });
  const labelSeen = {};
  const chips = devices.map(d => {
    const baseLbl = d.device_label || 'جهاز متصل';
    labelSeen[baseLbl] = (labelSeen[baseLbl] || 0) + 1;
    const numberedLbl = labelTotals[baseLbl] > 1 ? `${baseLbl} #${labelSeen[baseLbl]}` : baseLbl;
    const icon = getDeviceIconEmoji(baseLbl);
    const selfTag = d.isCurrentDevice ? ' <span class="live-dev-self">(هذا الجهاز)</span>' : '';
    return `<span class="live-dev-chip${d.isCurrentDevice ? ' is-self' : ''}">${icon} ${escapeHtml(numberedLbl)}${selfTag}</span>`;
  }).join('');

  return `
    <div class="live-devices-box">
      <div class="live-devices-head">
        <span class="presence-dot online"></span>
        <span>الأجهزة المتصلة الآن (${formatArabicDeviceCount(devices.length)}):</span>
      </div>
      <div class="live-devices-list">${chips}</div>
    </div>
  `;
}

function updateSettingsLiveDevicesSummary() {
  const el = document.getElementById('setAccountLiveDevices');
  if (!el || !currentUser || isFreeOfflineMode()) return;
  if (!navigator.onLine) {
    el.textContent = 'غير متصل (أوفلاين)';
    return;
  }
  const devs = getLiveDevicesForUser(currentUser.id);
  const labelTotals = {};
  devs.forEach(d => {
    const lbl = d.device_label || 'جهاز متصل';
    labelTotals[lbl] = (labelTotals[lbl] || 0) + 1;
  });
  const labelSeen = {};
  const names = devs.map(d => {
    const base = d.device_label || 'جهاز متصل';
    labelSeen[base] = (labelSeen[base] || 0) + 1;
    const numLbl = labelTotals[base] > 1 ? `${base} #${labelSeen[base]}` : base;
    return d.isCurrentDevice ? `${numLbl} (هذا الجهاز)` : numLbl;
  });
  el.textContent = `${formatArabicDeviceCount(devs.length)}${names.length ? ' — ' + names.join('، ') : ''}`;
}

initHighEntropyDeviceModel();

function getSavedForceLogoutVersion(uid) {
  if (!uid) return null;
  try {
    const v = localStorage.getItem(DEVICE_LOGOUT_VER_PREFIX + uid);
    return v !== null ? Number(v) : null;
  } catch (e) {
    return null;
  }
}

function saveForceLogoutVersion(uid, ver) {
  if (!uid) return;
  try {
    localStorage.setItem(DEVICE_LOGOUT_VER_PREFIX + uid, String(Number(ver || 0)));
  } catch (e) {}
}

function clearSavedForceLogoutVersion(uid) {
  if (!uid) return;
  try { localStorage.removeItem(DEVICE_LOGOUT_VER_PREFIX + uid); } catch (e) {}
}

function formatIsoDateTimeShort(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return formatDateTimeDisplay(d);
}

function stripZeroWidthChars(str) {
  return String(str == null ? '' : str).replace(/[\u200B\uFEFF]/g, '');
}

function stripDuplicateConflictTag(name) {
  return stripZeroWidthChars(name)
    .trim()
    .replace(/\s*\(مكرر(?:\s*[-–]\s*[^)]*|\s*\d+)?\)\s*$/, '')
    .trim();
}

function cleanDisplayCustomerName(name) {
  return stripDuplicateConflictTag(name);
}

function cleanCustomerNameInput(name) {
  return stripZeroWidthChars(name).trim();
}

function getConflictBaseKey(name) {
  const base = stripDuplicateConflictTag(name);
  return normalizeDigits(base)
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function wipeLocalWorkshopDataForSecurity(uid, wid) {
  try {
    if (uid) {
      localStorage.removeItem('debt_ctx_sb_' + uid);
      clearSavedForceLogoutVersion(uid);
    }
    if (wid) {
      localStorage.removeItem(`debt_sb_records_${wid}`);
      localStorage.removeItem(`debt_sb_queue_${wid}`);
      localStorage.removeItem(`debt_sb_last_sync_meta_${wid}`);
      localStorage.removeItem(`debt_sb_daily_snaps_v1_${wid}`);
      localStorage.removeItem(`debt_sb_audit_logs_${wid}`);
      localStorage.removeItem(`debt_sb_audit_queue_${wid}`);
    }
  } catch (e) {}
}

async function handleForcedRemoteLogout(reasonMsg) {
  const uid = currentUser ? currentUser.id : null;
  const wid = currentProfile ? currentProfile.workshop_id : null;

  try {
    const client = ensureSupabaseClient();
    if (realtimeChannel && client) { client.removeChannel(realtimeChannel); realtimeChannel = null; }
    if (presenceChannel && client) { client.removeChannel(presenceChannel); presenceChannel = null; }
    if (workshopStatusChannel && client) { client.removeChannel(workshopStatusChannel); workshopStatusChannel = null; }
    if (memberStatusChannel && client) { client.removeChannel(memberStatusChannel); memberStatusChannel = null; }
  } catch (e) {}

  onlineUsersMap.clear();
  onlineWorkshopsMap.clear();
  clearSavedLastUser();
  wipeLocalWorkshopDataForSecurity(uid, wid);

  try {
    const client = ensureSupabaseClient();
    if (client) await client.auth.signOut({ scope: 'local' });
  } catch (e) {}

  sessionStorage.removeItem('debt_unlocked_v3');
  currentUser = null;
  currentProfile = null;
  currentWorkshop = null;
  allRecords = [];
  pendingQueue = [];
  isSyncing = false;
  resetAllOpenLayersForLogout();
  showLoginScreen(reasonMsg || 'تم إخراج الحساب من هذا الجهاز من قبل المدير.');
}

async function claimDeviceLockOnServer(client, userId) {
  try {
    const { data, error } = await client.rpc('claim_member_device', {
      p_device_id: getOrCreateDeviceId(),
      p_device_label: getFriendlyDeviceLabel()
    });
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('claim_member_device') || msg.includes('does not exist')) {
        return { allowed: true, skipped: true };
      }
      return { allowed: true, skipped: true };
    }
    if (data && data.allowed === false) {
      return data;
    }
    if (data && typeof data.force_logout_version !== 'undefined') {
      saveForceLogoutVersion(userId, data.force_logout_version);
    }
    return data || { allowed: true };
  } catch (e) {
    return { allowed: true, skipped: true };
  }
}

async function verifyMemberDeviceBinding(memCheck, client) {
  if (!memCheck || !currentUser) return true;
  if (memCheck.role === 'super_admin' || memCheck.single_device_only === false) {
    return true;
  }

  const myDevId = getOrCreateDeviceId();
  const savedVer = getSavedForceLogoutVersion(currentUser.id);
  const serverVer = Number(memCheck.force_logout_version || 0);

  // 1. إذا قام المدير بالضغط على "إخراج من الجهاز" بعد تسجيل دخولنا
  if (savedVer !== null && serverVer > savedVer) {
    await handleForcedRemoteLogout('تم إخراج هذا الحساب من هذا الجهاز من قبل المدير.');
    return false;
  }

  // 2. إذا كان الحساب مرتبطاً بجهاز آخر مختلف عن جهازنا
  if (memCheck.active_device_id && memCheck.active_device_id !== myDevId) {
    const otherLbl = memCheck.active_device_label ? ` (${memCheck.active_device_label})` : '';
    await handleForcedRemoteLogout(`هذا الحساب مفتوح على جهاز آخر${otherLbl} — تم تسجيل الخروج من هذا الجهاز.`);
    return false;
  }

  // 3. إذا لم يكن هناك جهاز مرتبط حالياً
  if (!memCheck.active_device_id) {
    // ترقية سلسة من الإصدار السابق فقط إذا لم يصدر أي أمر إخراج من المدير
    if (savedVer === null && serverVer === 0) {
      const claimRes = await claimDeviceLockOnServer(client, currentUser.id);
      if (claimRes && claimRes.allowed === false) {
        const otherLbl = claimRes.bound_device ? ` (${claimRes.bound_device})` : '';
        await handleForcedRemoteLogout(`هذا الحساب مفتوح حالياً على جهاز آخر${otherLbl}.`);
        return false;
      }
      saveForceLogoutVersion(currentUser.id, serverVer);
      return true;
    }
    await handleForcedRemoteLogout('تم إخراج هذا الحساب من هذا الجهاز من قبل المدير.');
    return false;
  }

  // 4. الجهاز مطابق لجهازنا الحالي — نحفظ رقم الإصدار الحالي ونتحقق من أي محاولة دخول ثانية
  if (savedVer === null) {
    saveForceLogoutVersion(currentUser.id, serverVer);
  }
  if (memCheck.second_device_attempt_at && memCheck.second_device_attempt_at !== lastNotifiedSecondAttemptIso) {
    lastNotifiedSecondAttemptIso = memCheck.second_device_attempt_at;
    showToast('⚠️ تنبيه: تمت محاولة فتح حسابك من جهاز ثاني وتم منعها');
  }
  return true;
}

// ==================== المصادقة وتسجيل الدخول (أوفلاين أولاً) ====================
function getSavedLastUser() {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    return (u && u.id) ? u : null;
  } catch (e) {
    return null;
  }
}

function saveLastUser(user) {
  if (!user || !user.id) return;
  try {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ id: user.id, email: user.email || '' }));
  } catch (e) {}
}

function clearSavedLastUser() {
  try { localStorage.removeItem(LAST_SESSION_KEY); } catch (e) {}
}

function isSupabaseNotFoundError(err) {
  if (!err) return false;
  return err.code === 'PGRST116' || err.status === 406;
}

function loadFreeOfflineWorkshopSettings() {
  try {
    const raw = localStorage.getItem(FREE_OFFLINE_WS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {
    shopName: 'دفتر الديون (مجاني)',
    shopAddress: '',
    shopPhone: '',
    shopPhones: [],
    shopLogo: '',
    generalNote: '',
    shamCashEnabled: false,
    shamCashCode: '',
    waConfig: { ...DEFAULT_WA_CONFIG },
    currency: 'BOTH'
  };
}

function saveFreeOfflineWorkshopSettings(wsSettingsObj) {
  try {
    localStorage.setItem(FREE_OFFLINE_WS_SETTINGS_KEY, JSON.stringify(wsSettingsObj || {}));
  } catch (e) {}
}

function updateFreeOfflineStatusBar() {
  if (!isFreeOfflineMode()) return;
  const used = groupedCustomers.length;
  const max = FREE_OFFLINE_MAX_CUSTOMERS;
  const state = used >= max ? 'err' : 'ok';
  updateSyncStatusUI(`حساب مجاني أوفلاين • ${used} / ${max} زبون`, state);

  const txtEl = document.getElementById('freeSettingsUsageText');
  const barEl = document.getElementById('freeSettingsUsageBar');
  if (txtEl) txtEl.textContent = `${used} / ${max} زبون`;
  if (barEl) {
    const pct = Math.min(100, Math.round((used / max) * 100));
    barEl.style.width = `${pct}%`;
    barEl.className = 'free-meter-fill' + (used >= max ? ' full' : (used >= max - 5 ? ' warn' : ''));
  }
}

function enterFreeOfflineMode(isAutoResume = false) {
  try { localStorage.setItem(FREE_OFFLINE_MODE_KEY, '1'); } catch (e) {}
  const wsSettings = loadFreeOfflineWorkshopSettings();

  currentUser = { id: 'free_offline_user', email: '' };
  currentProfile = {
    user_id: 'free_offline_user',
    workshop_id: FREE_OFFLINE_WORKSHOP_ID,
    role: 'free_offline',
    display_name: 'حساب مجاني',
    email: '',
    can_delete: true,
    active: true,
    is_free_offline: true
  };
  currentWorkshop = {
    id: FREE_OFFLINE_WORKSHOP_ID,
    name: wsSettings.shopName || 'دفتر الديون (مجاني)',
    settings: wsSettings
  };

  applyWorkshopSettingsToState(currentWorkshop);
  loadWorkshopLocalData();
  pendingQueue = [];
  persistData();
  applyBrandingUI();
  applyPermissionsUI();
  updateHeaderLockButton();

  document.getElementById('loginScreen').classList.add('hidden');
  if (settings.lockEnabled && settings.pin && sessionStorage.getItem('debt_unlocked_v3') !== '1') {
    showLockScreen();
  } else {
    showMainView();
  }
  if (!isAutoResume) {
    showToast(`مرحباً بك في الحساب المجاني الأوفلاين (حتى ${FREE_OFFLINE_MAX_CUSTOMERS} زبون)`);
  }
}

async function initApp() {
  const params = new URLSearchParams(window.location.search);
  const copyParam = params.get('copy');
  if (copyParam) {
    showQuickCopyScreen(copyParam, params.get('shop') || '');
    return;
  }
  loadDeviceSettings();
  if (typeof syncLoginDevCardUI === 'function') syncLoginDevCardUI();

  // فحص عودة المستخدم من رابط تأكيد الإيميل أو استعادة كلمة المرور
  const rawHash = String(window.location.hash || '');
  const hashParams = new URLSearchParams(rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);
  const authErrCode = params.get('error_code') || hashParams.get('error_code') || '';
  const authErrDesc = params.get('error_description') || hashParams.get('error_description') || '';
  const hasAuthCallback = Boolean(
    params.get('code') ||
    hashParams.get('access_token') ||
    hashParams.get('type') ||
    params.get('type')
  );
  const authCallbackType = hashParams.get('type') || params.get('type') || '';

  if (authErrCode || authErrDesc) {
    try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
    const friendlyErr = (authErrCode === 'otp_expired' || /expired/i.test(authErrDesc))
      ? 'انتهت صلاحية رابط التأكيد — يمكنك إدخال بريدك وطلب إعادة الإرسال أو التسجيل مجدداً.'
      : 'تعذّر إتمام التحقق من الرابط، حاول تسجيل الدخول مجدداً.';
    showLoginScreen(friendlyErr);
    return;
  }

  if (!hasAuthCallback && localStorage.getItem(FREE_OFFLINE_MODE_KEY) === '1') {
    enterFreeOfflineMode(true);
    return;
  }

  let activeUser = null;
  let isRecoveryFlow = (authCallbackType === 'recovery');
  const client = ensureSupabaseClient();
  if (client) {
    if (hasAuthCallback) {
      // انتظار بسيط لمعالجة Supabase لرمز التأكيد من الرابط (PKCE أو Hash)
      const codeParam = params.get('code');
      if (codeParam && typeof client.auth.exchangeCodeForSession === 'function') {
        try {
          await client.auth.exchangeCodeForSession(codeParam);
        } catch (e) {}
      }
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
    }

    try {
      const sessionRes = await Promise.race([
        client.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, timedOut: true }), 3500))
      ]);
      if (sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.user) {
        activeUser = sessionRes.data.session.user;
        saveLastUser(activeUser);
        if (hasAuthCallback) {
          try { localStorage.removeItem(FREE_OFFLINE_MODE_KEY); } catch (e) {}
          if (authCallbackType === 'signup') {
            showToast('تم تأكيد بريدك الإلكتروني بنجاح ✓ جاري تجهيز حسابك...');
          }
        }
      }
    } catch (e) {
      console.warn('Offline getSession fallback:', e);
    }
  }

  // عند فتح التطبيق بدون شبكة أو انتهاء صلاحية الجلسة مؤقتاً، نستعيد آخر مستخدم محفوظ محلياً
  if (!activeUser) {
    const saved = getSavedLastUser();
    if (saved && localStorage.getItem('debt_ctx_sb_' + saved.id)) {
      activeUser = saved;
    }
  }

  if (!activeUser) {
    showLoginScreen();
    return;
  }
  await loadUserWorkspace(activeUser, hasAuthCallback, isRecoveryFlow);
}

function switchAuthMode(mode = 'login') {
  const isReg = mode === 'register';
  const isConfirm = mode === 'confirm';
  document.getElementById('authTabLoginBtn')?.classList.toggle('active', !isReg);
  document.getElementById('authTabRegBtn')?.classList.toggle('active', isReg);
  document.getElementById('loginForm')?.classList.toggle('hidden', isReg || isConfirm);
  document.getElementById('registerForm')?.classList.toggle('hidden', !isReg);
  document.getElementById('emailConfirmBox')?.classList.toggle('hidden', !isConfirm);
  const errEl = document.getElementById('loginErr');
  if (errEl && mode !== 'login') errEl.textContent = '';
}

function showEmailConfirmationBox(email, customMsg = '') {
  pendingConfirmEmail = String(email || '').trim().toLowerCase();
  const txtEl = document.getElementById('emailConfirmText');
  if (txtEl) {
    txtEl.innerHTML = customMsg ||
      `تم إرسال رسالة تأكيد إلى البريد <strong dir="ltr" style="display:inline;">${escapeHtml(pendingConfirmEmail)}</strong>.<br>افتح بريدك (وتفقد مجلد الرسائل غير المرغوب فيها Spam) واضغط رابط التفعيل، ثم سجّل الدخول.`;
  }
  switchAuthMode('confirm');
}

function showLoginScreen(errMsg = '') {
  isUnlocked = false;
  sessionTempLoginPass = '';
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('forceChangePassScreen')?.classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  switchAuthMode('login');
  document.getElementById('loginErr').textContent = errMsg;
}

async function handleSelfRegister(ev) {
  ev.preventDefault();
  const shopName = (document.getElementById('regShopName')?.value || '').trim();
  const displayName = (document.getElementById('regDisplayName')?.value || '').trim();
  const email = (document.getElementById('regEmail')?.value || '').trim().toLowerCase();
  const pass1 = document.getElementById('regPassword')?.value || '';
  const pass2 = document.getElementById('regPassword2')?.value || '';
  const agreed = Boolean(document.getElementById('regPolicyAgree')?.checked);
  const errEl = document.getElementById('loginErr');
  const btn = document.getElementById('registerBtn');
  if (errEl) errEl.textContent = '';

  if (!shopName) { if (errEl) errEl.textContent = 'يرجى كتابة اسم المحل أو الحساب.'; return; }
  if (!displayName) { if (errEl) errEl.textContent = 'يرجى كتابة اسمك.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (errEl) errEl.textContent = 'يرجى إدخال بريد إلكتروني صحيح.'; return; }
  if (pass1.length < 6) { if (errEl) errEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.'; return; }
  if (pass1 !== pass2) { if (errEl) errEl.textContent = 'كلمتا المرور غير متطابقتين.'; return; }
  if (!agreed) { if (errEl) errEl.textContent = 'يرجى الموافقة على تنبيه حذف الحسابات الخاملة (90 يوماً).'; return; }

  const client = ensureSupabaseClient();
  if (!client || !navigator.onLine) {
    if (errEl) errEl.textContent = 'يلزم الاتصال بالإنترنت لإنشاء حساب جديد.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري إنشاء الحساب وإرسال الرسالة...';
  try {
    const redirectUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? `${window.location.origin}${window.location.pathname}`
      : undefined;

    const { data, error } = await client.auth.signUp({
      email,
      password: pass1,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          self_signup: true,
          shop_name: shopName,
          display_name: displayName
        }
      }
    });
    if (error) throw error;

    // إذا كان الإيميل مسجّلاً مسبقاً في Supabase مع Confirm Email مفعّل يرجع identities فارغة
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      if (errEl) errEl.textContent = 'هذا البريد الإلكتروني مسجّل مسبقاً — جرّب تسجيل الدخول أو استعادة كلمة المرور.';
      return;
    }

    document.getElementById('registerForm')?.reset();

    // في حال تفعيل تأكيد الإيميل في Supabase لا تُمنح جلسة حتى يضغط المستخدم الرابط
    if (data && data.session && data.user) {
      // في حال كان التأكيد غير مفعّل بعد على السيرفر، نُنشئ مساحته وندخله مباشرة
      try { localStorage.removeItem(FREE_OFFLINE_MODE_KEY); } catch (e) {}
      pendingAutoFreeMigrateCheck = true;
      saveLastUser(data.user);
      await loadUserWorkspace(data.user, true);
    } else {
      const loginEmailInp = document.getElementById('loginEmail');
      if (loginEmailInp) loginEmailInp.value = email;
      showEmailConfirmationBox(email);
    }
  } catch (err) {
    const msg = String(err && err.message || '');
    if (/already registered/i.test(msg)) {
      if (errEl) errEl.textContent = 'هذا البريد الإلكتروني مسجّل مسبقاً، يمكنك تسجيل الدخول مباشرةً.';
    } else if (/rate limit|too many/i.test(msg)) {
      if (errEl) errEl.textContent = 'تم إرسال عدة رسائل مؤخراً، يرجى الانتظار بضع دقائق والمحاولة مجدداً.';
    } else {
      if (errEl) errEl.textContent = msg || 'تعذّر إنشاء الحساب، حاول مجدداً.';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء الحساب وإرسال رسالة التأكيد';
  }
}

async function resendConfirmationEmail() {
  const email = pendingConfirmEmail || (document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
  if (!email) return showToast('يرجى كتابة بريدك الإلكتروني أولاً');
  const client = ensureSupabaseClient();
  if (!client || !navigator.onLine) return showToast('يلزم الاتصال بالإنترنت لإعادة الإرسال');

  const btn = document.getElementById('resendConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الإرسال...'; }
  try {
    const redirectUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? `${window.location.origin}${window.location.pathname}`
      : undefined;
    const { error } = await client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl }
    });
    if (error) throw error;
    showToast('تمت إعادة إرسال رسالة التأكيد إلى بريدك ✓');
  } catch (err) {
    showToast('تعذّر إعادة الإرسال حالياً: ' + (err.message || 'حاول بعد دقيقة'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'إعادة إرسال الرسالة'; }
  }
}

async function handleForgotPassword() {
  const prefill = (document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
  const email = prompt('أدخل بريدك الإلكتروني المسجّل لإرسال رابط إعادة تعيين كلمة المرور:', prefill);
  if (email === null) return;
  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return showToast('يرجى إدخال بريد إلكتروني صحيح');
  }
  const client = ensureSupabaseClient();
  if (!client || !navigator.onLine) return showToast('يلزم الاتصال بالإنترنت');
  try {
    const redirectUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? `${window.location.origin}${window.location.pathname}`
      : undefined;
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, { redirectTo: redirectUrl });
    if (error) throw error;
    showToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك ✓');
  } catch (err) {
    showToast('تعذّر الإرسال: ' + (err.message || 'حاول بعد قليل'));
  }
}

function needsForcedPasswordChange(profile, workshop) {
  if (!profile || profile.is_free_offline === true) return false;
  if (profile.role === 'super_admin') return false;
  if (profile.must_change_password === true) return true;
  if (profile.role === 'admin' && workshop && workshop.settings && workshop.settings.adminMustChangePassword === true) {
    return true;
  }
  return false;
}

function showForceChangePassScreen() {
  isUnlocked = false;
  resetAllOpenLayersForLogout();
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.add('hidden');

  const shopEl = document.getElementById('forcePassShopName');
  if (shopEl) shopEl.textContent = settings.shopName || (currentWorkshop && currentWorkshop.name) || '';

  const isReset = Boolean(
    (currentProfile && currentProfile.password_reset_at) ||
    (currentWorkshop && currentWorkshop.settings && currentWorkshop.settings.adminPasswordResetAt)
  );
  const subEl = document.getElementById('forcePassSubtitle');
  if (subEl) {
    subEl.textContent = isReset
      ? 'تم تعيين كلمة مرور مؤقتة لحسابك من قِبل الدعم الفني. لحماية خصوصية بيانات ورشتك، يرجى وضع كلمة مرور جديدة خاصة بك الآن — لن تُحفظ كنص صريح ولن يتمكن أحد من رؤيتها.'
      : 'مرحباً بك! لحماية خصوصية بيانات ورشتك، يرجى تغيير كلمة المرور المؤقتة وتعيين كلمة مرور خاصة بك للمتابعة — لن يتمكن المدير العام أو أي شخص آخر من رؤيتها.';
  }

  const p1 = document.getElementById('forceNewPass1');
  const p2 = document.getElementById('forceNewPass2');
  const chk = document.getElementById('forceShowPassChk');
  const errEl = document.getElementById('forcePassErr');
  if (p1) { p1.value = ''; p1.type = 'password'; }
  if (p2) { p2.value = ''; p2.type = 'password'; }
  if (chk) chk.checked = false;
  if (errEl) errEl.textContent = '';

  document.getElementById('forceChangePassScreen')?.classList.remove('hidden');
}

function toggleForcePassVisibility(show) {
  const t = show ? 'text' : 'password';
  const p1 = document.getElementById('forceNewPass1');
  const p2 = document.getElementById('forceNewPass2');
  if (p1) p1.type = t;
  if (p2) p2.type = t;
}

async function handleForcedPasswordChangeSubmit(ev) {
  ev.preventDefault();
  const p1 = (document.getElementById('forceNewPass1')?.value || '').trim();
  const p2 = (document.getElementById('forceNewPass2')?.value || '').trim();
  const errEl = document.getElementById('forcePassErr');
  const btn = document.getElementById('forcePassSubmitBtn');
  if (errEl) errEl.textContent = '';

  if (p1.length < 6) {
    if (errEl) errEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.';
    return;
  }
  if (p1 !== p2) {
    if (errEl) errEl.textContent = 'كلمتا المرور غير متطابقتين، يرجى التأكد.';
    return;
  }
  if (sessionTempLoginPass && p1 === sessionTempLoginPass) {
    if (errEl) errEl.textContent = 'يرجى اختيار كلمة مرور جديدة مختلفة عن كلمة المرور المؤقتة.';
    return;
  }
  if (!navigator.onLine || !ensureSupabaseClient()) {
    if (errEl) errEl.textContent = 'يلزم الاتصال بالإنترنت لحفظ كلمة المرور الجديدة.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري حفظ كلمة مرورك الخاصة...';
  try {
    const { error: authErr } = await sb.auth.updateUser({ password: p1 });
    if (authErr) throw authErr;

    try {
      await sb.rpc('sync_my_saved_password', { new_password: p1 });
    } catch (e) {}

    if (currentProfile) {
      currentProfile.must_change_password = false;
      currentProfile.password_reset_at = null;
      if (currentProfile.role === 'admin') currentProfile.login_password = null;
    }

    const changedIso = new Date().toISOString();
    if (currentUser && currentUser.id) {
      try { localStorage.setItem('debt_pass_updated_at_' + currentUser.id, changedIso); } catch (e) {}
    }

    if (isAdmin() && !isSuperAdmin() && currentWorkshop) {
      const nextWsSettings = { ...(currentWorkshop.settings || {}) };
      delete nextWsSettings.managerPassword;
      delete nextWsSettings.shopLogo;
      nextWsSettings.adminMustChangePassword = false;
      nextWsSettings.adminPasswordResetAt = null;
      nextWsSettings.adminPasswordUpdatedAt = changedIso;
      try {
        await sb.from('workshops').update({ settings: nextWsSettings }).eq('id', currentProfile.workshop_id);
      } catch (e) {}
      currentWorkshop.settings = nextWsSettings;
    }

    if (currentUser && currentProfile && currentWorkshop) {
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
    }

    sessionTempLoginPass = '';
    document.getElementById('forceChangePassScreen')?.classList.add('hidden');
    showToast('تم حفظ كلمة مرورك الخاصة بنجاح ✓ — حسابك محمي الآن');

    if (settings.lockEnabled && settings.pin && sessionStorage.getItem('debt_unlocked_v3') !== '1') {
      showLockScreen();
    } else {
      showMainView();
    }
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'تعذّر تحديث كلمة المرور، حاول مجدداً.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ كلمة المرور والدخول للتطبيق';
  }
}

async function handleLogin(ev) {
  ev.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  document.getElementById('loginErr').textContent = '';

  const client = ensureSupabaseClient();
  if (!client || !navigator.onLine) {
    document.getElementById('loginErr').textContent = 'يلزم الاتصال بالإنترنت لتسجيل الدخول لأول مرة.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري التحقق...';
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // فحص وقفل الحساب على جهاز واحد فقط (للموظفين والأجهزة الجديدة)
    const claimRes = await claimDeviceLockOnServer(client, data.user.id);
    if (claimRes && claimRes.allowed === false) {
      clearSavedLastUser();
      await client.auth.signOut({ scope: 'local' });
      const devLbl = claimRes.bound_device ? ` (${claimRes.bound_device})` : '';
      document.getElementById('loginErr').textContent =
        `⚠️ هذا الحساب مفتوح حالياً على جهاز آخر${devLbl}. يعمل الحساب على جوال واحد فقط — اطلب من المدير إخراج الجهاز السابق.`;
      return;
    }

    try { localStorage.removeItem(FREE_OFFLINE_MODE_KEY); } catch (e) {}
    sessionTempLoginPass = password;
    pendingAutoFreeMigrateCheck = true;
    saveLastUser(data.user);
    await loadUserWorkspace(data.user, true);
  } catch (err) {
    const msg = String(err && err.message || '');
    if (/email not confirmed/i.test(msg)) {
      showEmailConfirmationBox(email, `حسابك <strong dir="ltr" style="display:inline;">${escapeHtml(email)}</strong> بانتظار تأكيد البريد الإلكتروني.<br>افتح الرسالة التي وصلتك واضغط رابط التفعيل، أو اضغط «إعادة إرسال الرسالة».`);
    } else {
      document.getElementById('loginErr').textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول (النسخة السحابية)';
  }
}

async function loadUserWorkspace(user, forceNetworkCheck = false, isRecoveryFlow = false) {
  currentUser = user;
  saveLastUser(user);
  const ctxCacheKey = 'debt_ctx_sb_' + user.id;
  let profile = null;
  let workshop = null;

  // 1. تحميل فوري من الكاش المحلي أولاً لفتح البيانات مباشرة حتى بدون شبكة أو مع شبكة ضعيفة
  let hasCachedCtx = false;
  try {
    const cachedRaw = localStorage.getItem(ctxCacheKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.profile && parsed.workshop) {
        profile = parsed.profile;
        workshop = parsed.workshop;
        hasCachedCtx = true;
      }
    }
  } catch (e) {}

  // 2. إذا كان تسجيل دخول جديد (أو لا يوجد كاش)، نتحقق من السيرفر أولاً
  const client = ensureSupabaseClient();
  if ((!hasCachedCtx || forceNetworkCheck) && navigator.onLine && client) {
    try {
      let { data: mem, error: memErr } = await client
        .from('workshop_members')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // إذا كان مستخدماً جديداً سجّل بالإيميل وأكّد بريده للتو، ننشئ مساحته المعزولة تلقائياً عبر دالة السيرفر الآمنة
      if (isSupabaseNotFoundError(memErr)) {
        const meta = (user && user.user_metadata) || {};
        const { data: provData, error: provErr } = await client.rpc('provision_self_registered_account', {
          p_shop_name: meta.shop_name || null,
          p_display_name: meta.display_name || null
        });
        if (!provErr && provData && provData.workshop_id) {
          const retry = await client
            .from('workshop_members')
            .select('*')
            .eq('user_id', user.id)
            .single();
          mem = retry.data;
          memErr = retry.error;
        }
      }

      if (isSupabaseNotFoundError(memErr)) {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('هذا الحساب غير مرتبط بمساحة مفعّلة أو تمت إزالته.');
        return;
      }
      if (memErr) throw memErr;
      if (!mem) throw new Error('تعذّر قراءة بيانات الحساب');
      if (!mem.active) {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('تم إيقاف هذا الحساب من قبل المدير.');
        return;
      }

      const { data: ws, error: wsErr } = await client
        .from('workshops')
        .select('*')
        .eq('id', mem.workshop_id)
        .single();

      if (wsErr || !ws) throw wsErr || new Error('تعذّر قراءة بيانات الحساب');
      if (ws.settings && ws.settings.frozen === true && mem.role !== 'super_admin') {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('تم تجميد هذا الحساب من قبل الإدارة.');
        return;
      }

      profile = mem;
      workshop = ws;
      hasCachedCtx = true;
      localStorage.setItem(ctxCacheKey, JSON.stringify({ profile, workshop }));
    } catch (err) {
      if (!hasCachedCtx) {
        showLoginScreen('تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً.');
        return;
      }
    }
  }

  if (!hasCachedCtx) {
    showLoginScreen('يلزم الاتصال بالإنترنت لتسجيل الدخول لأول مرة على هذا الجهاز.');
    return;
  }

  currentProfile = profile;
  currentWorkshop = workshop;
  applyWorkshopSettingsToState(workshop);
  loadWorkshopLocalData();
  applyBrandingUI();
  applyPermissionsUI();
  updateHeaderLockButton();

  document.getElementById('loginScreen').classList.add('hidden');
  if (isRecoveryFlow || needsForcedPasswordChange(currentProfile, currentWorkshop)) {
    showForceChangePassScreen();
    return;
  }
  if (settings.lockEnabled && settings.pin && sessionStorage.getItem('debt_unlocked_v3') !== '1') {
    showLockScreen();
  } else {
    showMainView();
  }
}

function applyPermissionsUI() {
  const freeMode = isFreeOfflineMode();
  document.getElementById('drawerAccountsBtn').classList.toggle('hidden', !canManageAccounts());
  document.getElementById('drawerAuditBtn')?.classList.toggle('hidden', freeMode || !isAdmin());
  document.getElementById('settingsAccountsShortcut').classList.toggle('hidden', !canManageAccounts());
  document.getElementById('settingsChangePassField')?.classList.toggle('hidden', canManageAccounts());
  document.getElementById('detailDeleteCustomerBtn').classList.toggle('hidden', !canDeleteRecords());
  document.getElementById('workshopAdminSettingsWrap').classList.toggle('hidden', !isAdmin());
  document.getElementById('currencySettingField').classList.toggle('hidden', !isAdmin());
  document.getElementById('restoreBackupWrap')?.classList.toggle('hidden', !isAdmin());
  document.getElementById('syncBtn')?.classList.toggle('hidden', freeMode);
  document.getElementById('cloudAccountCard')?.classList.toggle('hidden', freeMode);
  document.getElementById('freeAccountCard')?.classList.toggle('hidden', !freeMode);
  const titleEl = document.getElementById('shopSettingsCardTitle');
  if (titleEl) {
    titleEl.textContent = freeMode
      ? 'بيانات المحل واللوغو (تُحفظ على هذا الجهاز)'
      : 'بيانات المحل واللوغو (تتزامن مع جميع الأجهزة)';
  }
}

function clearSupabaseLocalAuthTokens() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token/i.test(k)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

async function handleLogout() {
  if (isFreeOfflineMode()) {
    if (!confirm('هل تريد الخروج إلى شاشة تسجيل الدخول؟ (ستبقى بياناتك المحلية محفوظة على الجهاز عند العودة للحساب المجاني)')) return;
    try { localStorage.removeItem(FREE_OFFLINE_MODE_KEY); } catch (e) {}
    sessionStorage.removeItem('debt_unlocked_v3');
    currentUser = null;
    currentProfile = null;
    currentWorkshop = null;
    allRecords = [];
    pendingQueue = [];
    auditLogs = [];
    pendingAuditQueue = [];
    pendingDueDateQueue = {};
    groupedCustomers = [];
    visibleCustomers = [];
    resetAllOpenLayersForLogout();
    showLoginScreen();
    showToast('تم الخروج من الحساب المجاني');
    return;
  }
  if (pendingQueue.length > 0) {
    if (!confirm(`يوجد ${pendingQueue.length} عملية لم تُرفع بعد للسحابة. هل تريد تسجيل الخروج رغم ذلك؟`)) return;
  }
  const logoutUid = currentUser ? currentUser.id : null;
  try {
    const client = ensureSupabaseClient();
    if (client && navigator.onLine) {
      try {
        await Promise.race([
          client.rpc('release_my_device', { p_device_id: getOrCreateDeviceId() }),
          new Promise(res => setTimeout(res, 1800))
        ]);
      } catch (e) {}
    }
    if (realtimeChannel && client) { client.removeChannel(realtimeChannel); realtimeChannel = null; }
    if (presenceChannel && client) { client.removeChannel(presenceChannel); presenceChannel = null; }
    if (workshopStatusChannel && client) { client.removeChannel(workshopStatusChannel); workshopStatusChannel = null; }
    if (memberStatusChannel && client) { client.removeChannel(memberStatusChannel); memberStatusChannel = null; }
  } catch (e) {}
  onlineUsersMap.clear();
  onlineWorkshopsMap.clear();
  clearSavedLastUser();
  clearSavedForceLogoutVersion(logoutUid);
  try {
    const client = ensureSupabaseClient();
    if (client) {
      await Promise.race([
        client.auth.signOut({ scope: 'local' }),
        new Promise(res => setTimeout(res, 1500))
      ]);
    }
  } catch (e) {
    console.warn('SignOut warning:', e);
  }
  clearSupabaseLocalAuthTokens();
  sessionStorage.removeItem('debt_unlocked_v3');
  currentUser = null;
  currentProfile = null;
  currentWorkshop = null;
  allRecords = [];
  pendingQueue = [];
  auditLogs = [];
  pendingAuditQueue = [];
  pendingDueDateQueue = {};
  resetAllOpenLayersForLogout();
  showLoginScreen();
  showToast('تم تسجيل الخروج');
}

function getSavedPassUpdatedAt(uid, isSelfCard = false) {
  let iso = '';
  if (isSelfCard && currentWorkshop && currentWorkshop.settings && currentWorkshop.settings.adminPasswordUpdatedAt) {
    iso = String(currentWorkshop.settings.adminPasswordUpdatedAt);
  }
  if (uid) {
    try {
      const localIso = localStorage.getItem('debt_pass_updated_at_' + uid) || '';
      if (localIso && (!iso || localIso > iso)) iso = localIso;
    } catch (e) {}
  }
  return iso;
}

function toggleSelfPassBox(uid) {
  const box = document.getElementById('selfPassBox_' + uid);
  const btn = document.getElementById('selfPassToggleBtn_' + uid);
  if (!box) return;
  const willOpen = box.classList.contains('hidden');
  box.classList.toggle('hidden', !willOpen);
  if (btn) btn.textContent = willOpen ? 'إلغاء' : 'تغيير كلمة السر';
  if (willOpen) {
    const inp = document.getElementById('selfNewPassInput_' + uid);
    if (inp) {
      inp.value = '';
      setTimeout(() => inp.focus(), 60);
    }
  }
}

async function changeMyPassword(inputId = 'setNewPassInput', eyeBtnId = 'toggleMyPassVisBtn', submitBtnId = '') {
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  const newPass = (inputEl.value || '').trim();
  if (newPass.length < 6) return showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  if (!navigator.onLine) return showToast('يلزم الاتصال بالإنترنت لتغيير كلمة المرور');

  const submitBtn = submitBtnId ? document.getElementById(submitBtnId) : null;
  const oldBtnTxt = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التحديث...';
  }

  try {
    const { error } = await sb.auth.updateUser({ password: newPass });
    if (error) return showToast(error.message);

    // مزامنة الحالة على السيرفر (للموظف تُحفظ لمدير ورشته؛ أما مدير الورشة فتُمسح أي نسخة نصية وتبقى مشفّرة فقط)
    try {
      await sb.rpc('sync_my_saved_password', { new_password: newPass });
    } catch (e) {}

    const changedIso = new Date().toISOString();
    if (currentUser && currentUser.id) {
      try { localStorage.setItem('debt_pass_updated_at_' + currentUser.id, changedIso); } catch (e) {}
    }

    if (isAdmin() && currentWorkshop) {
      try {
        const nextWsSettings = {
          ...(currentWorkshop.settings || {}),
          managerEmail: currentProfile?.email || currentUser?.email || '',
          adminMustChangePassword: false,
          adminPasswordResetAt: null,
          adminPasswordUpdatedAt: changedIso
        };
        delete nextWsSettings.managerPassword;
      delete nextWsSettings.shopLogo;
        await sb.from('workshops').update({ settings: nextWsSettings }).eq('id', currentProfile.workshop_id);
        currentWorkshop.settings = nextWsSettings;
      } catch (e) {}
    }

    if (currentProfile) {
      currentProfile.must_change_password = false;
      currentProfile.password_reset_at = null;
      if (isAdmin()) currentProfile.login_password = null;
    }

    if (currentUser && currentProfile && currentWorkshop) {
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
    }

    // تحديث النسخة المعروضة في قائمة الحسابات فوراً ليظهر تاريخ التغيير الجديد مباشرةً
    if (Array.isArray(cachedMembersList) && currentUser) {
      const me = cachedMembersList.find(m => m.user_id === currentUser.id);
      if (me) {
        me.must_change_password = false;
        me.password_reset_at = null;
        if (isAdmin()) me.login_password = null;
      }
    }

    inputEl.value = '';
    inputEl.classList.remove('revealed');
    const eyeBtn = document.getElementById(eyeBtnId);
    if (eyeBtn) eyeBtn.textContent = 'إظهار';

    if (document.getElementById('accountsView')?.classList.contains('open')) {
      renderWorkshopMembersList(cachedMembersList);
      showAccAlert('تم تغيير كلمة مرور حسابك بنجاح ✓ وأصبحت محمية ومشفّرة.', true);
    }
    showToast('تم تغيير كلمة المرور بنجاح ✓');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = oldBtnTxt || 'حفظ التغيير';
    }
  }
}

// ==================== المزامنة مع Supabase والعمل أوفلاين ====================
function buildPresenceTrackPayload() {
  return {
    user_id: currentUser.id,
    workshop_id: currentProfile.workshop_id,
    display_name: currentProfile.display_name || currentProfile.email || '',
    email: currentProfile.email || '',
    role: currentProfile.role,
    device_id: getOrCreateDeviceId(),
    device_label: getFriendlyDeviceLabel(),
    online_at: new Date().toISOString()
  };
}

function rebuildOnlineMapsFromPresence() {
  onlineUsersMap.clear();
  onlineWorkshopsMap.clear();
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState() || {};
  Object.entries(state).forEach(([presenceKey, entries]) => {
    (entries || []).forEach((p, idx) => {
      if (!p || !p.user_id) return;
      const devId = String(p.device_id || p.presence_ref || `${presenceKey}_${idx}`);
      const devLabel = String(p.device_label || '').trim() || 'جهاز متصل';
      const normalized = {
        user_id: p.user_id,
        workshop_id: p.workshop_id || '',
        display_name: p.display_name || p.email || '',
        email: p.email || '',
        role: p.role || '',
        device_id: devId,
        device_label: devLabel,
        online_at: p.online_at || ''
      };

      if (!onlineUsersMap.has(p.user_id)) onlineUsersMap.set(p.user_id, []);
      const userDevs = onlineUsersMap.get(p.user_id);
      const uExistingIdx = userDevs.findIndex(d => d.device_id === devId);
      if (uExistingIdx === -1) userDevs.push(normalized);
      else userDevs[uExistingIdx] = normalized;

      if (p.workshop_id) {
        if (!onlineWorkshopsMap.has(p.workshop_id)) onlineWorkshopsMap.set(p.workshop_id, []);
        const wsDevs = onlineWorkshopsMap.get(p.workshop_id);
        const wExistingIdx = wsDevs.findIndex(d => d.user_id === p.user_id && d.device_id === devId);
        if (wExistingIdx === -1) wsDevs.push(normalized);
        else wsDevs[wExistingIdx] = normalized;
      }
    });
  });
}

function refreshOnlineIndicatorsUI() {
  if (document.getElementById('settingsView')?.classList.contains('open')) {
    updateSettingsLiveDevicesSummary();
  }
  const accOpen = document.getElementById('accountsView')?.classList.contains('open');
  if (!accOpen) return;
  const staffVisible = !document.getElementById('accStaffPanel').classList.contains('hidden');
  if (staffVisible && cachedMembersList.length > 0) {
    renderWorkshopMembersList(cachedMembersList);
  }
  const wsVisible = !document.getElementById('accWorkshopsPanel').classList.contains('hidden');
  if (wsVisible && cachedWorkshopsList.length > 0) {
    renderIsolatedWorkshopsList(cachedWorkshopsList);
  }
}

function subscribePresence() {
  if (presenceChannel) {
    try { sb.removeChannel(presenceChannel); } catch (e) {}
    presenceChannel = null;
  }
  if (!currentUser || !currentProfile || isFreeOfflineMode() || !ensureSupabaseClient() || !navigator.onLine) return;

  const myDeviceId = getOrCreateDeviceId();
  presenceChannel = sb.channel('damascus-online-presence', {
    config: { presence: { key: `${currentUser.id}::${myDeviceId}` } }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      rebuildOnlineMapsFromPresence();
      refreshOnlineIndicatorsUI();
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      rebuildOnlineMapsFromPresence();
      refreshOnlineIndicatorsUI();
      // إشعار فوري عند فتح صفحة الحسابات ودخول جهاز جديد (حتى لو على نفس حساب المدير من جهاز آخر)
      if (document.getElementById('accountsView')?.classList.contains('open')) {
        (newPresences || []).forEach(p => {
          if (!p || !p.user_id) return;
          if (p.user_id === currentUser.id && p.device_id === myDeviceId) return;
          if (p.workshop_id === currentProfile.workshop_id || isSuperAdmin()) {
            const devLbl = p.device_label ? ` — ${p.device_label}` : '';
            if (p.user_id === currentUser.id) {
              showToast(`🟢 تم فتح حسابك على جهاز إضافي${devLbl}`);
            } else {
              showToast(`🟢 ${p.display_name || p.email} متصل الآن${devLbl}`);
            }
          }
        });
      }
    })
    .on('presence', { event: 'leave' }, () => {
      rebuildOnlineMapsFromPresence();
      refreshOnlineIndicatorsUI();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await presenceChannel.track(buildPresenceTrackPayload());
        } catch (e) {}
      }
    });
}

function subscribeRealtime() {
  const client = ensureSupabaseClient();
  if (realtimeChannel && client) {
    client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (workshopStatusChannel && client) {
    client.removeChannel(workshopStatusChannel);
    workshopStatusChannel = null;
  }
  if (!currentProfile || isFreeOfflineMode() || !client || !navigator.onLine) return;

  realtimeChannel = sb
    .channel('debt-live-' + currentProfile.workshop_id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'debt_records',
      filter: `workshop_id=eq.${currentProfile.workshop_id}`
    }, () => {
      if (isUnlocked && navigator.onLine) syncData(true);
    })
    .subscribe();

  if (memberStatusChannel && client) {
    client.removeChannel(memberStatusChannel);
    memberStatusChannel = null;
  }

  workshopStatusChannel = client
    .channel('ws-status-' + currentProfile.workshop_id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workshops',
      filter: `id=eq.${currentProfile.workshop_id}`
    }, () => {
      if (isUnlocked && navigator.onLine) syncData(true);
    })
    .subscribe();

  memberStatusChannel = client
    .channel('member-status-' + currentProfile.workshop_id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workshop_members',
      filter: `workshop_id=eq.${currentProfile.workshop_id}`
    }, async (payload) => {
      const row = payload && (payload.new || payload.old);
      if (!row) return;
      // فحص فوري إذا تم إخراج حسابنا أو إيقافه من قبل المدير
      if (currentUser && row.user_id === currentUser.id) {
        if (payload.eventType === 'DELETE') {
          await handleForcedRemoteLogout('تمت إزالة هذا الحساب من الورشة.');
          return;
        }
        if (payload.new && payload.new.active === false) {
          await handleForcedRemoteLogout('تم إيقاف هذا الحساب من قبل مدير الورشة.');
          return;
        }
        if (payload.new) {
          const ok = await verifyMemberDeviceBinding(payload.new, client);
          if (!ok) return;
        }
      }
      // إشعار فوري للمدير عند محاولة فتح أي حساب موظف من جهاز ثاني
      if (isAdmin() && payload.new && payload.new.second_device_attempt_at && (!payload.old || payload.new.second_device_attempt_at !== payload.old.second_device_attempt_at)) {
        const who = payload.new.display_name || payload.new.email || 'موظف';
        showToast(`⚠️ محاولة فتح حساب "${who}" من جهاز ثاني وتم منعها`);
        if (document.getElementById('accountsView')?.classList.contains('open')) {
          loadWorkshopMembers();
        }
      }
    })
    .subscribe();

  subscribePresence();
}

function showOfflineStatusBanner(prefix = 'بدون شبكة (وضع أوفلاين)') {
  const lastTxt = getLastUpdateDisplayText();
  const full = lastTxt ? `${prefix} • ${lastTxt}` : `${prefix} • الحفظ المحلي نشط`;
  updateSyncStatusUI(full, 'off');
}

async function syncData(silent) {
  if (isFreeOfflineMode()) {
    updateFreeOfflineStatusBar();
    return;
  }
  if (isSyncing || !currentProfile) return;
  const syncBtn = document.getElementById('syncBtn');
  const client = ensureSupabaseClient();

  if (!navigator.onLine || !client) {
    showOfflineStatusBanner('بدون شبكة (بياناتك محفوظة)');
    return;
  }

  isSyncing = true;
  if (!silent) {
    syncBtn.classList.add('spinning');
    updateSyncStatusUI('جاري المزامنة...', 'off');
  }

  try {
    // 1. التحقق من أن الحساب ما زال مفعّلاً وتحديث صلاحياته وإعدادات الورشة (دون تسجيل خروج عند انقطاع الشبكة)
    const { data: memCheck, error: memCheckErr } = await client
      .from('workshop_members')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();

    if (isSupabaseNotFoundError(memCheckErr)) {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      clearSavedLastUser();
      await client.auth.signOut({ scope: 'local' });
      resetAllOpenLayersForLogout();
      showLoginScreen('تمت إزالة هذا الحساب من الورشة.');
      return;
    }
    if (memCheckErr) throw memCheckErr;
    if (memCheck && memCheck.active === false) {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      clearSavedLastUser();
      await client.auth.signOut({ scope: 'local' });
      resetAllOpenLayersForLogout();
      showLoginScreen('تم إيقاف هذا الحساب من قبل مدير الورشة.');
      return;
    }
    if (memCheck) {
      const deviceAllowed = await verifyMemberDeviceBinding(memCheck, client);
      if (!deviceAllowed) {
        isSyncing = false;
        syncBtn.classList.remove('spinning');
        return;
      }
      currentProfile = memCheck;
      applyPermissionsUI();
    }

    // رفع مواعيد التسديد المحفوظة أثناء الأوفلاين قبل سحب إعدادات الورشة
    if (pendingDueDateQueue && Object.keys(pendingDueDateQueue).length > 0) {
      const entries = Object.entries(pendingDueDateQueue);
      for (const [cName, val] of entries) {
        try {
          const { error: dErr } = await client.rpc('set_customer_due_date', {
            p_customer_name: cName,
            p_due_date: val && val.date ? val.date : null,
            p_due_note: val && val.date ? (val.note || '') : null
          });
          if (!dErr) {
            delete pendingDueDateQueue[cName];
            persistAuditData();
          } else if (isAdmin() && currentWorkshop) {
            const mergedDue = { ...(currentWorkshop.settings && currentWorkshop.settings.customerDueDates ? currentWorkshop.settings.customerDueDates : {}) };
            if (val && val.date) mergedDue[cName] = { date: val.date, note: val.note || '' };
            else delete mergedDue[cName];
            const nextS = { ...(currentWorkshop.settings || {}), customerDueDates: mergedDue };
            const { error: uErr } = await client.from('workshops').update({ settings: nextS }).eq('id', currentProfile.workshop_id);
            if (!uErr) {
              currentWorkshop.settings = nextS;
              delete pendingDueDateQueue[cName];
              persistAuditData();
            }
          }
        } catch (e) {}
      }
    }

    const { data: wsFresh, error: wsFreshErr } = await client
      .from('workshops')
      .select('*')
      .eq('id', currentProfile.workshop_id)
      .single();

    if (wsFreshErr && !isSupabaseNotFoundError(wsFreshErr)) throw wsFreshErr;

    if (wsFresh && wsFresh.settings && wsFresh.settings.frozen === true && currentProfile.role !== 'super_admin') {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      await handleForcedRemoteLogout('تم تجميد حساب هذه الورشة من قبل الإدارة.');
      return;
    }

    if (wsFresh) {
      currentWorkshop = wsFresh;
      applyWorkshopSettingsToState(wsFresh);
      applyBrandingUI();
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
    }

    if (needsForcedPasswordChange(currentProfile, currentWorkshop)) {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      showForceChangePassScreen();
      return;
    }

    // 1.5 فحص تعارض الأسماء المتطابقة المضافة أثناء الأوفلاين قبل الرفع لعدم دمجها وإظهارها معاً بعلامة تعديل
    const detectedOfflineCollisions = [];
    const offlineNewCustItems = pendingQueue.filter(
      q => (q.action === 'upsert' || q.action === 'add') && q.isNewCustomer && q.payload && q.payload.name
    );

    if (offlineNewCustItems.length > 0) {
      const { data: existingRows, error: preErr } = await client
        .from('debt_records')
        .select('id, name, created_by')
        .eq('workshop_id', currentProfile.workshop_id);

      if (!preErr && Array.isArray(existingRows)) {
        const queuedIds = new Set(
          pendingQueue.filter(q => q.payload && q.payload.id).map(q => String(q.payload.id))
        );
        const serverExactNames = new Set();
        const serverBaseKeys = new Set();
        existingRows.forEach(r => {
          if (queuedIds.has(String(r.id))) return;
          const nm = String(r.name || '').trim();
          if (!nm) return;
          serverExactNames.add(nm);
          serverBaseKeys.add(getConflictBaseKey(nm));
        });

        const collisionRenameMap = new Map();
        const offlineNewOrigNames = new Set(
          offlineNewCustItems.map(q => String(q.payload.name || '').trim())
        );

        offlineNewOrigNames.forEach(origName => {
          if (!origName) return;
          const baseKey = getConflictBaseKey(origName);
          if (serverExactNames.has(origName)) {
            // فصل داخلي غير مرئي دون إضافة أي كلمة بجانب اسم الزبون
            let cand = origName + '\u200B';
            while (serverExactNames.has(cand)) {
              cand += '\u200B';
            }
            collisionRenameMap.set(origName, cand);
            serverExactNames.add(cand);
            detectedOfflineCollisions.push(origName);
          } else if (serverBaseKeys.has(baseKey)) {
            detectedOfflineCollisions.push(origName);
          }
        });

        if (collisionRenameMap.size > 0) {
          pendingQueue.forEach(q => {
            if ((q.action === 'upsert' || q.action === 'add') && q.payload && q.payload.name) {
              const nm = String(q.payload.name).trim();
              if (collisionRenameMap.has(nm)) {
                const renamed = collisionRenameMap.get(nm);
                q.payload.name = renamed;
                const localRec = allRecords.find(r => String(r.id) === String(q.payload.id));
                if (localRec) localRec.name = renamed;
              }
            }
          });
          persistData();
        }
      }
    }

    // تسجيل الأسماء الجديدة التي ستُرفع الآن لاكتشاف أي تزامن متزامن بنفس الثانية ومنع دمج الحركات أو الهاتف
    const uploadedNewByName = new Map();
    const newCustNamesToWatch = new Set(
      pendingQueue
        .filter(q => (q.action === 'upsert' || q.action === 'add') && q.isNewCustomer && q.payload && q.payload.name)
        .map(q => String(q.payload.name).trim())
    );
    pendingQueue.forEach(q => {
      if ((q.action === 'upsert' || q.action === 'add') && q.payload && q.payload.name) {
        const nm = String(q.payload.name).trim();
        if (newCustNamesToWatch.has(nm)) {
          if (!uploadedNewByName.has(nm)) {
            uploadedNewByName.set(nm, {
              ids: new Set(),
              records: [],
              createdBy: String(q.payload.created_by || currentProfile.display_name || '').trim()
            });
          }
          const entry = uploadedNewByName.get(nm);
          entry.ids.add(String(q.payload.id));
          entry.records.push({ ...q.payload });
        }
      }
    });

    // 2. رفع العمليات المحفوظة محلياً بالترتيب
    while (pendingQueue.length > 0) {
      const item = pendingQueue[0];
      if (item.action === 'upsert' || item.action === 'add') {
        const { error } = await client
          .from('debt_records')
          .upsert(toDbRecord(item.payload), { onConflict: 'id' });
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await client
          .from('debt_records')
          .delete()
          .eq('id', String(item.id))
          .eq('workshop_id', currentProfile.workshop_id);
        if (error) throw error;
      }
      pendingQueue.shift();
      persistData();
    }

    // 3. سحب أحدث السجلات للورشة فقط
    let { data: rows, error: fetchErr } = await client
      .from('debt_records')
      .select('*')
      .eq('workshop_id', currentProfile.workshop_id)
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;

    // 3.5 حماية إضافية ضد التزامن المتزامن في نفس الثانية: فصل أي اسم جديد تطابق مع جهاز آخر بدون خلط الهاتف أو الحركات
    if (uploadedNewByName.size > 0 && Array.isArray(rows)) {
      const allServerNamesNow = new Set(rows.map(r => String(r.name || '').trim()).filter(Boolean));
      const raceFixRecords = [];

      uploadedNewByName.forEach((info, origName) => {
        const matchingRows = rows.filter(r => String(r.name || '').trim() === origName);
        const otherRows = matchingRows.filter(r => !info.ids.has(String(r.id)));
        const myRows = matchingRows.filter(r => info.ids.has(String(r.id)));
        if (otherRows.length > 0 && myRows.length > 0) {
          const earliestOtherId = otherRows.map(r => String(r.id)).sort()[0];
          const earliestMyId = myRows.map(r => String(r.id)).sort()[0];
          // الجهاز الأحدث يفصل حركاته بفاصل داخلي غير مرئي دون إضافة أي كلمة بجانب الاسم
          if (earliestMyId > earliestOtherId) {
            let cand = origName + '\u200B';
            while (allServerNamesNow.has(cand)) {
              cand += '\u200B';
            }
            allServerNamesNow.add(cand);
            detectedOfflineCollisions.push(origName);
            myRows.forEach(r => {
              const isolated = { ...r, name: cand };
              raceFixRecords.push(isolated);
            });
          }
        }
      });

      if (raceFixRecords.length > 0) {
        for (const rec of raceFixRecords) {
          await client.from('debt_records').upsert(toDbRecord(rec), { onConflict: 'id' });
        }
        const reFetch = await client
          .from('debt_records')
          .select('*')
          .eq('workshop_id', currentProfile.workshop_id)
          .order('created_at', { ascending: true });
        if (!reFetch.error && Array.isArray(reFetch.data)) {
          rows = reFetch.data;
        }
      }
    }

    const pendingDeletes = new Set(pendingQueue.filter(q => q.action === 'delete').map(q => String(q.id)));
    const serverMap = new Map();
    (rows || []).forEach(r => {
      if (!pendingDeletes.has(String(r.id))) serverMap.set(String(r.id), r);
    });
    pendingQueue.filter(q => q.action === 'upsert' || q.action === 'add').forEach(q => {
      serverMap.set(String(q.payload.id), q.payload);
    });

    allRecords = Array.from(serverMap.values());
    const nowStamp = formatDateTimeDisplay(new Date());
    saveLastSyncMeta({ syncedAt: nowStamp, localUpdatedAt: nowStamp });
    persistData();
    processAndRender();

    // 4. رفع سجل التدقيق المعلّق إلى Supabase بصمت عبر INSERT فقط (متوافق مع جدول محمي بدون UPDATE)
    if (pendingAuditQueue.length > 0) {
      while (pendingAuditQueue.length > 0) {
        const aItem = pendingAuditQueue[0];
        if (!TRACKED_AUDIT_ACTIONS.has(String(aItem.action_type || ''))) {
          pendingAuditQueue.shift();
          persistAuditData();
          continue;
        }
        const { error: audErr } = await client
          .from('audit_logs')
          .insert({
            id: String(aItem.id),
            workshop_id: currentProfile.workshop_id,
            actor_user_id: aItem.actor_user_id || currentUser.id,
            actor_name: String(aItem.actor_name || currentProfile.display_name || ''),
            action_type: String(aItem.action_type || 'edit_tx'),
            customer_name: String(aItem.customer_name || ''),
            summary: String(aItem.summary || ''),
            before_data: aItem.before_data || null,
            after_data: aItem.after_data || null,
            created_at: aItem.created_at || new Date().toISOString()
          });
        if (audErr) {
          const aMsg = String(audErr.message || '');
          if (audErr.code === '23505' || aMsg.includes('duplicate key')) {
            // مرفوع مسبقاً بنجاح
            auditTableMissingOnServer = false;
            pendingAuditQueue.shift();
            persistAuditData();
            continue;
          }
          if (aMsg.includes('audit_logs') || aMsg.includes('does not exist') || audErr.code === '42P01') {
            auditTableMissingOnServer = true;
          }
          break;
        }
        auditTableMissingOnServer = false;
        pendingAuditQueue.shift();
        persistAuditData();
      }
    }

    // تسجيل آخر نشاط للحساب + تنظيف سجل التدقيق الأقدم من 14 يوماً على السيرفر (مرة كل ساعة كحد أقصى)
    const nowMs = Date.now();
    if (nowMs - lastActivityTouchMs > 60 * 60 * 1000) {
      lastActivityTouchMs = nowMs;
      client.rpc('touch_workshop_activity').catch(() => {});
    }

    // عند المزامنة: إخفاء التاريخ والساعة (تظهر فقط في وضع الأوفلاين)
    updateSyncStatusUI('متصل ومُزامن', 'ok');
    if (detectedOfflineCollisions.length > 0) {
      showToast('⚠️ تم اكتشاف أسماء متطابقة مضافة أوفلاين — ظهرت معاً بعلامة لتعديل أحدها');
    }
    if (typeof checkAndRunDailyBackups === 'function') checkAndRunDailyBackups();

    // فحص الترحيل التلقائي من الحساب المجاني بعد تسجيل الدخول السحابي
    if (pendingAutoFreeMigrateCheck) {
      pendingAutoFreeMigrateCheck = false;
      if (isAdmin() && !isFreeOfflineMode() && typeof checkAndPromptFreeMigration === 'function') {
        setTimeout(() => checkAndPromptFreeMigration(true), 350);
      }
    }

    if (currentCustomerName && document.getElementById('detailView').classList.contains('open')) {
      renderCustomerDetail(currentCustomerName);
    }
  } catch (err) {
    console.error('Sync error:', err);
    const lastTxt = getLastUpdateDisplayText();
    updateSyncStatusUI(lastTxt ? `بدون اتصال • ${lastTxt}` : 'محفوظ على الجهاز (سيُزامن عند عودة الاتصال)', 'err');
    if (!silent) showToast('محفوظ على الجهاز، وتعذّر الوصول للخادم حالياً');
  } finally {
    isSyncing = false;
    syncBtn.classList.remove('spinning');
  }
}

// ==================== طابور العمليات (أوفلاين أولاً) ====================
function queueUpsertRecord(rec, opts = {}) {
  if (isFreeOfflineMode()) return;
  const idStr = String(rec.id);
  const dbRec = toDbRecord(rec);
  const isNewCust = Boolean(opts && opts.isNewCustomer);
  const qIdx = pendingQueue.findIndex(q => (q.action === 'upsert' || q.action === 'add') && String(q.payload.id) === idStr);
  if (qIdx !== -1) {
    const prevNew = Boolean(pendingQueue[qIdx].isNewCustomer);
    pendingQueue[qIdx] = { action: 'upsert', payload: dbRec, isNewCustomer: prevNew || isNewCust };
  } else {
    pendingQueue.push({ action: 'upsert', payload: dbRec, isNewCustomer: isNewCust });
  }
}

function queueDeleteRecord(targetId) {
  if (isFreeOfflineMode()) return;
  const idStr = String(targetId);
  const qIdx = pendingQueue.findIndex(q => (q.action === 'upsert' || q.action === 'add') && String(q.payload.id) === idStr);
  if (qIdx !== -1) pendingQueue.splice(qIdx, 1);
  pendingQueue.push({ action: 'delete', id: idStr });
}

function queueUpdateRecord(oldId, updatedFields) {
  const oldIdStr = String(oldId);
  const recIdx = allRecords.findIndex(r => String(r.id) === oldIdStr);
  if (recIdx === -1) return;
  const merged = { ...allRecords[recIdx], ...updatedFields, id: oldIdStr };
  allRecords[recIdx] = merged;
  queueUpsertRecord(merged);
}

function triggerSyncOrOfflineToast(onlineMsg, offlineMsg) {
  saveLastSyncMeta({ localUpdatedAt: formatDateTimeDisplay(new Date()) });
  if (isFreeOfflineMode()) {
    showToast('تم الحفظ على الجهاز ✓');
    updateFreeOfflineStatusBar();
    return;
  }
  if (navigator.onLine && ensureSupabaseClient()) {
    showToast(onlineMsg);
    syncData(false);
  } else {
    showToast(offlineMsg);
    showOfflineStatusBanner('بدون شبكة (محفوظ محلياً)');
  }
}

window.addEventListener('online', () => {
  if (isFreeOfflineMode()) return;
  showToast('عاد الإنترنت، جاري المزامنة التلقائية...');
  if (!ensureSupabaseClient()) {
    window.location.reload();
    return;
  }
  subscribeRealtime();
  syncData(false);
});
window.addEventListener('offline', () => {
  if (isFreeOfflineMode()) return;
  showOfflineStatusBanner('انقطع الإنترنت (بياناتك محفوظة)');
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isUnlocked && !isFreeOfflineMode() && navigator.onLine) syncData(true);
});
setInterval(() => {
  if (isUnlocked && !document.hidden && !isFreeOfflineMode() && navigator.onLine) syncData(true);
}, 30000);

// ==================== صفحة إدارة الحسابات والأجهزة والورشات ====================
function showAccAlert(msg, isOk = false) {
  const el = document.getElementById('accAlert');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.className = 'alert-banner ' + (isOk ? 'alert-ok' : 'alert-err');
  el.classList.remove('hidden');
}

function openAccountsView() {
  if (!canManageAccounts()) return showToast('إدارة الحسابات والأجهزة متاحة في النسخة السحابية فقط');
  showAccAlert('');
  document.getElementById('accWorkshopSub').textContent = settings.shopName || '';
  document.getElementById('accTabsWrap').classList.toggle('hidden', !isSuperAdmin());
  switchAccTab('staff');
  document.getElementById('accountsView').classList.add('open');
  document.getElementById('accountsView').scrollTop = 0;
  updateBodyScrollLock();
  pushLayerHistory('accountsView');
  loadWorkshopMembers();
}

function closeAccountsView(keepHistory = false) {
  document.getElementById('accountsView').classList.remove('open');
  popLayerFromUI('accountsView', keepHistory);
}

function switchAccTab(tab) {
  document.getElementById('accTabStaffBtn').classList.toggle('active', tab === 'staff');
  document.getElementById('accTabWorkshopsBtn').classList.toggle('active', tab === 'workshops');
  document.getElementById('accStaffPanel').classList.toggle('hidden', tab !== 'staff');
  document.getElementById('accWorkshopsPanel').classList.toggle('hidden', tab !== 'workshops');
  showAccAlert('');
  if (tab === 'workshops') loadIsolatedWorkshops();
  else loadWorkshopMembers();
}

function onMemberRoleChange() {
  const role = document.getElementById('memRoleSelect').value;
  const chk = document.getElementById('memCanDeleteInput');
  if (role === 'admin') {
    chk.checked = true;
    chk.disabled = true;
  } else {
    chk.disabled = false;
  }
}

function renderWorkshopMembersList(list) {
  const box = document.getElementById('membersListBox');
  const banner = document.getElementById('onlineMembersBanner');
  document.getElementById('membersCountLbl').textContent = `${list.length} حساب`;

  // حساب إجمالي الأجهزة المتصلة الآن على مستوى الورشة (بما فيها أجهزة المدير والحسابات الفرعية)
  let totalWorkshopLiveDevices = 0;
  const onlineSummaryParts = [];
  list.forEach(m => {
    const devs = getLiveDevicesForUser(m.user_id, m);
    if (devs.length > 0) {
      totalWorkshopLiveDevices += devs.length;
      const who = escapeHtml(m.display_name || m.email || 'حساب');
      onlineSummaryParts.push(`${who}: ${formatArabicDeviceCount(devs.length)}`);
    }
  });

  if (totalWorkshopLiveDevices > 0) {
    banner.innerHTML = `<span class="presence-dot online"></span><span>إجمالي الأجهزة المتصلة الآن: <strong>${formatArabicDeviceCount(totalWorkshopLiveDevices)}</strong> (${onlineSummaryParts.join(' • ')})</span>`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  // ترتيب القائمة بوضوح: حسابك (مدير الورشة) أولاً، ثم باقي المدراء، ثم الموظفين
  const sortedList = [...list].sort((a, b) => {
    const aSelf = a.user_id === currentUser.id ? 1 : 0;
    const bSelf = b.user_id === currentUser.id ? 1 : 0;
    if (bSelf !== aSelf) return bSelf - aSelf;
    const rank = (r) => (r === 'super_admin' ? 3 : (r === 'admin' ? 2 : 1));
    if (rank(b.role) !== rank(a.role)) return rank(b.role) - rank(a.role);
    return String(a.display_name || '').localeCompare(String(b.display_name || ''), 'ar');
  });

  memberCredsMap.clear();
  box.innerHTML = sortedList.map(m => {
    const isSelf = m.user_id === currentUser.id;
    const isSuper = m.role === 'super_admin';
    const isRoleAdmin = m.role === 'admin' || m.role === 'super_admin';
    const liveDevices = getLiveDevicesForUser(m.user_id, m);
    const liveCount = liveDevices.length;
    const isOnline = liveCount > 0;
    const safeUid = escapeHtml(m.user_id);
    const memEmail = String(m.email || '').trim();
    const memPass = String(m.login_password || '').trim();

    memberCredsMap.set(m.user_id, {
      display_name: m.display_name || '',
      email: memEmail,
      password: memPass
    });

    const presenceBadge = isOnline
      ? `<span class="m-badge m-online"><span class="presence-dot online"></span>متصل الآن (${formatArabicDeviceCount(liveCount)})</span>`
      : `<span class="m-badge m-offline"><span class="presence-dot offline"></span>غير متصل</span>`;

    const isBound = Boolean(m.active_device_id);
    const devLabel = String(m.active_device_label || 'جهاز واحد');
    const isSingleLocked = !isSuper && m.single_device_only !== false;
    const deviceBadge = !isSuper
      ? (isSingleLocked
          ? (isBound
              ? `<span class="m-badge m-dev-on">🔒 مقيد: ${escapeHtml(devLabel)}</span>`
              : `<span class="m-badge m-neutral">بانتظار أول جهاز</span>`)
          : `<span class="m-badge m-neutral">متعدد الأجهزة</span>`)
      : '';

    const secondAttemptHtml = m.second_device_attempt_at
      ? `<div class="second-dev-alert">
           <span>⚠️ محاولة فتح الحساب على جهاز ثاني (${escapeHtml(m.second_device_attempt_label || 'جهاز آخر')}) • ${escapeHtml(formatIsoDateTimeShort(m.second_device_attempt_at))}</span>
           <button type="button" class="ws-cred-mini-btn" onclick="clearSecondDeviceAlert('${safeUid}')">إخفاء</button>
         </div>`
      : '';

    const liveDevicesBoxHtml = isOnline ? buildLiveDevicesChipsHtml(liveDevices) : '';

    let passRowContent = '';
    if (isSelf) {
      const updatedIso = getSavedPassUpdatedAt(m.user_id, true);
      const updatedStr = updatedIso ? formatIsoDateTimeShort(updatedIso) : '';
      if (m.must_change_password === true) {
        passRowContent = `<span class="ws-pass-status temp">⏳ مؤقتة — يرجى التغيير</span>`;
      } else if (updatedStr) {
        passRowContent = `<span class="ws-pass-status private">✓ محمية ومشفّرة • تم التغيير: ${escapeHtml(updatedStr)}</span>`;
      } else {
        passRowContent = `<span class="ws-pass-status private">🔒 محمية ومشفّرة (خاصة بك)</span>`;
      }
      passRowContent += `<button type="button" id="selfPassToggleBtn_${safeUid}" class="ws-cred-mini-btn" onclick="toggleSelfPassBox('${safeUid}')">تغيير كلمة السر</button>`;
    } else if (memPass) {
      passRowContent = `
        <span class="ws-cred-val" id="memPassVal_${safeUid}" data-shown="0">••••••••</span>
        <button type="button" class="ws-cred-mini-btn" onclick="toggleMemberCardPass(this, '${safeUid}')">إظهار</button>
        <button type="button" class="ws-cred-mini-btn" onclick="copyMemberCred('${safeUid}', 'pass')">نسخ</button>`;
    } else if (isRoleAdmin) {
      passRowContent = `
        <span class="ws-pass-status private">🔒 محمية ومشفّرة</span>
        ${!isSuper ? `<button type="button" class="ws-cred-mini-btn" onclick="promptUpdateMemberPassword('${safeUid}')">تعيين جديد</button>` : ''}`;
    } else {
      passRowContent = `
        <span class="ws-cred-val unset">غير محفوظة بعد</span>
        <button type="button" class="ws-cred-mini-btn" onclick="promptUpdateMemberPassword('${safeUid}')">تعيين</button>`;
    }

    const credsBoxHtml = `
      <div class="ws-creds-box">
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">اسم المستخدم:</span>
          <span class="ws-cred-val">${escapeHtml(memEmail || '—')}</span>
          ${memEmail ? `<button type="button" class="ws-cred-mini-btn" onclick="copyMemberCred('${safeUid}', 'email')">نسخ</button>` : ''}
        </div>
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">كلمة المرور:</span>
          ${passRowContent}
        </div>
      </div>`;

    const controls = isSelf ? `
      <div id="selfPassBox_${safeUid}" class="self-pass-box hidden">
        <div class="self-pass-title">تغيير كلمة مرور حسابك</div>
        <div class="self-pass-row">
          <input type="text" id="selfNewPassInput_${safeUid}" class="input masked-pass-input" dir="ltr" minlength="6" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-form-type="other" name="self_mgr_new_secret" placeholder="كلمة المرور الجديدة (6 أحرف فأكثر)" />
          <button type="button" class="btn btn-light btn-sm" id="toggleSelfPassVis_${safeUid}" onclick="toggleMaskedInput('selfNewPassInput_${safeUid}', this)">إظهار</button>
          <button type="button" class="btn btn-primary btn-sm" id="saveSelfPassBtn_${safeUid}" style="white-space:nowrap;" onclick="changeMyPassword('selfNewPassInput_${safeUid}', 'toggleSelfPassVis_${safeUid}', 'saveSelfPassBtn_${safeUid}')">حفظ التغيير</button>
        </div>
        <div class="self-pass-hint">تُحفظ كلمة مرورك بشكل مشفّر تماماً ولا تظهر كنص صريح لأي شخص، وسيظهر هنا تاريخ آخر تغيير فور الحفظ.</div>
      </div>` : ((!isSuper) ? `
      <div class="member-actions">
        <button class="btn btn-warn-sm btn-sm" onclick="forceLogoutMemberDevice('${safeUid}')">إخراج من الجهاز</button>
        <button class="btn btn-light btn-sm" onclick="toggleMemberActive('${safeUid}', ${!!m.active})">
          ${m.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
        </button>
        ${m.role === 'staff' ? `
          <button class="btn btn-light btn-sm" onclick="toggleMemberCanDelete('${safeUid}', ${!!m.can_delete})">
            ${m.can_delete ? 'منع الحذف' : 'السماح بالحذف'}
          </button>` : ''}
        <button class="btn btn-light btn-sm" onclick="toggleMemberSingleDevice('${safeUid}', ${isSingleLocked})">
          ${isSingleLocked ? 'مقيد بجهاز واحد' : 'متعدد الأجهزة'}
        </button>
        <button class="btn btn-light btn-sm" onclick="promptUpdateMemberPassword('${safeUid}')">تغيير كلمة السر</button>
        <button class="btn btn-danger btn-sm" onclick="removeWorkshopMember('${safeUid}')">إزالة نهائية</button>
      </div>` : '');

    return `
      <div class="member-card ${isOnline ? 'is-online-card' : ''}">
        <div class="member-top">
          <div>
            <div class="member-name">${escapeHtml(m.display_name || 'بدون اسم')} ${isSelf ? '(أنت)' : ''}</div>
            <div class="member-email">${escapeHtml(memEmail)}</div>
          </div>
          <div class="member-badges">
            ${presenceBadge}
            ${deviceBadge}
            <span class="m-badge m-role">${getRoleLabel(m.role)}</span>
            <span class="m-badge ${m.active ? 'm-on' : 'm-off'}">${m.active ? 'مفعّل' : 'موقوف'}</span>
            ${m.role === 'staff' ? `<span class="m-badge m-neutral">${m.can_delete ? 'يحذف' : 'بدون حذف'}</span>` : ''}
          </div>
        </div>
        ${liveDevicesBoxHtml}
        ${secondAttemptHtml}
        ${credsBoxHtml}
        ${controls}
      </div>
    `;
  }).join('');
}

async function loadWorkshopMembers() {
  const box = document.getElementById('membersListBox');
  if (!navigator.onLine) {
    box.innerHTML = '<div class="empty-box">إدارة الحسابات تتطلب اتصالاً بالإنترنت.</div>';
    return;
  }
  box.innerHTML = '<div class="empty-box" style="padding:24px;">جاري تحميل الحسابات...</div>';
  const { data, error } = await sb
    .from('workshop_members')
    .select('*')
    .eq('workshop_id', currentProfile.workshop_id)
    .order('created_at', { ascending: true });

  if (error) {
    box.innerHTML = `<div class="alert-banner alert-err">تعذّر تحميل الحسابات: ${escapeHtml(error.message)}</div>`;
    return;
  }

  cachedMembersList = data || [];
  rebuildOnlineMapsFromPresence();
  renderWorkshopMembersList(cachedMembersList);
}

async function createWorkshopMember(ev) {
  ev.preventDefault();
  if (!navigator.onLine) return showAccAlert('يلزم الاتصال بالإنترنت لإنشاء حساب جديد.');
  showAccAlert('');

  const btn = document.getElementById('addMemberSubmitBtn');
  const display_name = document.getElementById('memNameInput').value.trim();
  const role = document.getElementById('memRoleSelect').value;
  const email = document.getElementById('memEmailInput').value.trim().toLowerCase();
  const password = document.getElementById('memPassInput').value;
  const can_delete = role === 'admin' ? true : document.getElementById('memCanDeleteInput').checked;
  const single_device_only = document.getElementById('memSingleDeviceInput') ? document.getElementById('memSingleDeviceInput').checked : true;

  btn.disabled = true;
  btn.textContent = 'جاري إنشاء الحساب...';
  try {
    const tempClient = createIsolatedAuthClient();
    const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({ email, password });
    if (signUpErr) throw signUpErr;
    if (!signUpData || !signUpData.user || !signUpData.user.id) {
      throw new Error('لم يتم إنشاء الحساب، تأكد أن البريد غير مستخدم مسبقاً.');
    }

    const memPayload = {
      user_id: signUpData.user.id,
      workshop_id: currentProfile.workshop_id,
      role,
      display_name,
      email,
      login_password: password,
      single_device_only,
      can_delete,
      active: true
    };
    let { error: memErr } = await sb.from('workshop_members').insert(memPayload);
    if (memErr && (String(memErr.message || '').includes('login_password') || String(memErr.message || '').includes('single_device_only'))) {
      delete memPayload.login_password;
      delete memPayload.single_device_only;
      const retry = await sb.from('workshop_members').insert(memPayload);
      memErr = retry.error;
    }
    if (memErr) throw memErr;

    // تفعيل بريد الموظف/الجهاز الفرعي تلقائياً بصلاحية المدير حتى يعمل فوراً حتى مع تفعيل تأكيد الإيميل للتسجيل العام
    try {
      await sb.rpc('admin_confirm_created_member', { target_user_id: signUpData.user.id });
    } catch (e) {}

    document.getElementById('addMemberForm').reset();
    onMemberRoleChange();
    showAccAlert(`تم إنشاء حساب "${display_name}" بنجاح! يمكنه تسجيل الدخول الآن بالبريد وكلمة المرور.`, true);
    loadWorkshopMembers();
  } catch (err) {
    const msg = (err.message || '').includes('already registered')
      ? 'هذا البريد مسجّل مسبقاً، اختر بريداً آخر.'
      : (err.message || 'تعذّر إنشاء الحساب');
    showAccAlert(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء الحساب وربطه فوراً';
  }
}

async function toggleMemberActive(uid, currentVal) {
  const { error } = await sb.from('workshop_members').update({ active: !currentVal }).eq('user_id', uid);
  if (error) return showToast(error.message);
  showToast(!currentVal ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب فوراً');
  loadWorkshopMembers();
}

async function toggleMemberCanDelete(uid, currentVal) {
  const { error } = await sb.from('workshop_members').update({ can_delete: !currentVal }).eq('user_id', uid);
  if (error) return showToast(error.message);
  showToast(!currentVal ? 'تم منح صلاحية الحذف' : 'تم إلغاء صلاحية الحذف');
  loadWorkshopMembers();
}

async function toggleMemberSingleDevice(uid, currentVal) {
  const nextVal = !currentVal;
  const { error } = await sb.from('workshop_members').update({ single_device_only: nextVal }).eq('user_id', uid);
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('single_device_only')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v17) في Supabase أولاً لتفعيل قفل الجهاز الواحد.');
      return;
    }
    return showToast(msg);
  }
  showToast(nextVal ? 'تم تقييد الحساب على جهاز واحد فقط' : 'تم السماح للحساب بالعمل على أكثر من جهاز');
  loadWorkshopMembers();
}

async function clearSecondDeviceAlert(uid) {
  const { error } = await sb
    .from('workshop_members')
    .update({ second_device_attempt_at: null, second_device_attempt_label: null })
    .eq('user_id', uid);
  if (error) return showToast(error.message);
  loadWorkshopMembers();
}

async function forceLogoutMemberDevice(uid) {
  const rec = memberCredsMap.get(uid);
  const label = (rec && (rec.display_name || rec.email)) || 'هذا الحساب';
  if (!confirm(`هل تريد إخراج حساب "${label}" من جهازه الحالي؟\n\nفي حال فقدان الجهاز أو تبديله، سيتم تسجيل خروجه فوراً ومسح بياناته المحلية من الجهاز القديم، ويمكنه الدخول من جهاز جديد.`)) {
    return;
  }
  showAccAlert('');
  const { error } = await sb.rpc('admin_force_logout_member', { target_user_id: uid });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('admin_force_logout_member') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v17) في Supabase أولاً لتفعيل إخراج الحساب من الجهاز المفقود.');
      return;
    }
    showAccAlert('تعذّر إخراج الحساب من الجهاز: ' + msg);
    return;
  }
  showAccAlert(`تم إخراج حساب "${label}" من جهازه القديم بنجاح ✓ ويمكنه الآن تسجيل الدخول من جهاز جديد.`, true);
  showToast('تم إخراج الحساب من الجهاز بنجاح ✓');
  loadWorkshopMembers();
}

function copyMemberCred(uid, kind) {
  const rec = memberCredsMap.get(uid);
  if (!rec) return;
  if (kind === 'email') copyCredentialValue(rec.email, 'اسم المستخدم');
  else if (kind === 'pass') copyCredentialValue(rec.password, 'كلمة المرور');
}

function toggleMemberCardPass(btn, uid) {
  const rec = memberCredsMap.get(uid);
  const el = document.getElementById('memPassVal_' + uid);
  if (!rec || !rec.password || !el) return;
  const shown = el.getAttribute('data-shown') === '1';
  if (shown) {
    el.textContent = '••••••••';
    el.setAttribute('data-shown', '0');
    btn.textContent = 'إظهار';
  } else {
    el.textContent = rec.password;
    el.setAttribute('data-shown', '1');
    btn.textContent = 'إخفاء';
  }
}

async function promptUpdateMemberPassword(uid) {
  const rec = memberCredsMap.get(uid);
  const label = (rec && (rec.display_name || rec.email)) || 'هذا المستخدم';
  const newPass = prompt(`أدخل كلمة المرور الجديدة لـ "${label}" (6 أحرف أو أرقام على الأقل):`, (rec && rec.password) || '');
  if (newPass === null) return;
  const cleanPass = String(newPass).trim();
  if (cleanPass.length < 6) return showToast('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');

  const { error } = await sb.rpc('admin_update_member_password', {
    target_user_id: uid,
    new_password: cleanPass
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('admin_update_member_password') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v16) في Supabase لتفعيل تعديل وحذف حسابات المستخدمين بالكامل.');
      return;
    }
    return showAccAlert('تعذّر تحديث كلمة المرور: ' + msg);
  }
  showAccAlert(`تم تحديث كلمة مرور "${label}" وحفظها بنجاح ✓`, true);
  loadWorkshopMembers();
}

async function removeWorkshopMember(uid) {
  const rec = memberCredsMap.get(uid);
  const name = (rec && (rec.display_name || rec.email)) || 'هذا المستخدم';
  if (!confirm(`هل تريد حذف حساب "${name}" ومسح بيانات دخوله نهائياً من السيرفر؟`)) return;

  showAccAlert('');
  const { error: rpcErr } = await sb.rpc('admin_delete_member_account', { target_user_id: uid });
  if (rpcErr) {
    const msg = String(rpcErr.message || '');
    if (msg.includes('admin_delete_member_account') || msg.includes('does not exist')) {
      showAccAlert('لم يتم تفعيل دالة الحذف النهائي من السيرفر بعد — يرجى تشغيل كود SQL المرفق في Supabase SQL Editor ثم إعادة المحاولة.');
      return;
    }
    showAccAlert('تعذّر مسح الحساب من السيرفر: ' + msg);
    return;
  }

  showAccAlert(`تم حذف حساب "${name}" ومسح جميع بياناته من السيرفر نهائياً ✓`, true);
  showToast('تم مسح الحساب من السيرفر نهائياً ✓');
  loadWorkshopMembers();
}

function copyCredentialValue(val, label) {
  if (!val) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(() => showToast(`تم نسخ ${label}`)).catch(() => fallbackCopyText(val, label));
  } else {
    fallbackCopyText(val, label);
  }
}

function fallbackCopyText(val, label) {
  try {
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`تم نسخ ${label}`);
  } catch (e) {}
}

function copyWorkshopCred(wsId, kind) {
  const rec = workshopCredsMap.get(wsId);
  if (!rec) return;
  if (kind === 'email') copyCredentialValue(rec.email, 'اسم المستخدم');
}

function openTempCredsOnceModal(wsName, email, tempPass, isReset = false) {
  tempCredsOnceData = {
    wsName: String(wsName || ''),
    email: String(email || ''),
    tempPass: String(tempPass || ''),
    isReset: Boolean(isReset)
  };
  const titleEl = document.getElementById('tempCredsTitle');
  if (titleEl) {
    titleEl.textContent = isReset ? 'تم تعيين كلمة مرور مؤقتة للطوارئ' : 'تم إنشاء الورشة — بيانات الدخول المؤقتة';
  }
  const nEl = document.getElementById('tempCredWsName');
  const eEl = document.getElementById('tempCredEmail');
  const pEl = document.getElementById('tempCredPass');
  if (nEl) nEl.textContent = tempCredsOnceData.wsName || '—';
  if (eEl) eEl.textContent = tempCredsOnceData.email || '—';
  if (pEl) pEl.textContent = tempCredsOnceData.tempPass || '—';
  openModal('tempCredsOnceModal');
}

function copyTempCredsBundle() {
  if (!tempCredsOnceData) return;
  const appUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? `${window.location.origin}${window.location.pathname}`
    : '';
  const lines = [
    `بيانات الدخول المؤقتة لورشة: ${tempCredsOnceData.wsName}`,
    `البريد الإلكتروني: ${tempCredsOnceData.email}`,
    `كلمة المرور المؤقتة: ${tempCredsOnceData.tempPass}`,
    `ملاحظة: سيطلب التطبيق منك تغيير كلمة المرور ووضع كلمة سر خاصة بك فور تسجيل الدخول لحماية خصوصية بياناتك.`
  ];
  if (appUrl) lines.push(`رابط التطبيق: ${appUrl}`);
  copyCredentialValue(lines.join('\n'), 'رسالة بيانات الدخول المؤقتة');
}

function closeTempCredsModal(keepHistory = false) {
  tempCredsOnceData = null;
  const nEl = document.getElementById('tempCredWsName');
  const eEl = document.getElementById('tempCredEmail');
  const pEl = document.getElementById('tempCredPass');
  if (nEl) nEl.textContent = '—';
  if (eEl) eEl.textContent = '—';
  if (pEl) pEl.textContent = '—';
  closeModal('tempCredsOnceModal', keepHistory);
}

function getWorkshopManagerInfo(w) {
  const wsMembers = cachedAllMembersByWs.get(w.id) || [];
  const adminMember = wsMembers.find(m => m.role === 'admin')
    || wsMembers.find(m => m.role === 'super_admin')
    || wsMembers[0]
    || null;
  const email = (adminMember && adminMember.email)
    || (w.settings && w.settings.managerEmail)
    || '';
  const mustChangePassword = Boolean(
    (adminMember && adminMember.must_change_password === true) ||
    (w.settings && w.settings.adminMustChangePassword === true)
  );
  const passwordUpdatedAt = (w.settings && w.settings.adminPasswordUpdatedAt) || '';
  return { adminMember, wsMembers, email, mustChangePassword, passwordUpdatedAt };
}

function formatBytesToMB(bytes) {
  const n = Number(bytes) || 0;
  return (n / (1024 * 1024)).toFixed(2);
}

function getWorkshopIdleDays(w) {
  const raw = (w && (w.last_active_at || w.created_at)) || '';
  if (!raw) return 0;
  const ts = Date.parse(raw);
  if (isNaN(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function isWorkshopProtectedAccount(w) {
  if (!w) return false;
  if (currentProfile && w.id === currentProfile.workshop_id) return true;
  const wsMembers = cachedAllMembersByWs.get(w.id) || [];
  return wsMembers.some(m => m.role === 'super_admin');
}

function updateLiveSystemCountersUI(list) {
  const arr = Array.isArray(list) ? list : cachedWorkshopsList;
  const myDevId = getOrCreateDeviceId();
  let liveAccCount = 0;
  let totalLiveDevs = 0;

  arr.forEach(w => {
    const isOwnWs = currentProfile && w.id === currentProfile.workshop_id;
    const onlineArr = [...(onlineWorkshopsMap.get(w.id) || [])];
    if (isOwnWs && navigator.onLine && currentUser && !onlineArr.some(d => d.user_id === currentUser.id && d.device_id === myDevId)) {
      onlineArr.push({ user_id: currentUser.id, device_id: myDevId });
    }
    if (onlineArr.length > 0) {
      liveAccCount++;
      totalLiveDevs += onlineArr.length;
    }
  });

  const wsEl = document.getElementById('sysLiveWorkshopsVal');
  const devEl = document.getElementById('sysLiveDevicesVal');
  if (wsEl) wsEl.textContent = `${liveAccCount} / ${arr.length}`;
  if (devEl) devEl.textContent = formatArabicDeviceCount(totalLiveDevs);
}

function renderSystemUsageStatsUI(stats) {
  const txtEl = document.getElementById('sysStorageText');
  const barEl = document.getElementById('sysStorageBar');
  const detEl = document.getElementById('sysStorageDetails');
  const cleanSumEl = document.getElementById('sysCleanupSummary');
  const cleanBtn = document.getElementById('cleanupInactiveBtn');

  if (!stats) {
    if (txtEl) txtEl.textContent = '— / 500 MB';
    if (detEl) detEl.textContent = 'شغّل كود SQL للتحديث v1.0 في Supabase لتفعيل عدّاد المساحة.';
    return;
  }

  const limitMB = Number(stats.limit_mb || 500);
  const usedMB = Number(stats.db_size_mb || (Number(stats.db_size_bytes || 0) / (1024 * 1024)));
  const pct = Math.min(100, Math.max(0, (usedMB / limitMB) * 100));

  if (txtEl) txtEl.textContent = `${usedMB.toFixed(2)} MB / ${limitMB} MB (${pct.toFixed(1)}%)`;
  if (barEl) {
    barEl.style.width = `${Math.max(pct, usedMB > 0 ? 2 : 0).toFixed(1)}%`;
    barEl.className = 'sys-meter-fill' + (pct >= 90 ? ' full' : (pct >= 75 ? ' warn' : ''));
  }
  if (detEl) {
    const debtMB = formatBytesToMB(stats.debt_records_bytes);
    const auditMB = formatBytesToMB(stats.audit_logs_bytes);
    detEl.innerHTML = `
      <span>الديون: <strong>${formatNum(stats.debt_records_count || 0)}</strong> (${debtMB} MB)</span>
      <span>التدقيق (14 يوم): <strong>${formatNum(stats.audit_logs_count || 0)}</strong> (${auditMB} MB)</span>
      <span>الحسابات: <strong>${formatNum(stats.workshops_count || 0)}</strong> (مثبّت: ${formatNum(stats.pinned_count || 0)})</span>
    `;
  }

  const idleCount = Number(stats.inactive_90d_count || 0);
  if (cleanSumEl) {
    cleanSumEl.innerHTML = idleCount > 0
      ? `⚠️ يوجد <strong>${idleCount}</strong> حساب خامل تجاوز ${INACTIVE_ACCOUNT_DAYS} يوماً (غير مثبّت) وجاهز للحذف`
      : `✓ لا توجد حسابات خاملة تجاوزت ${INACTIVE_ACCOUNT_DAYS} يوماً حالياً (المثبّتة محمية: ${formatNum(stats.pinned_count || 0)})`;
  }
  if (cleanBtn) {
    cleanBtn.disabled = idleCount === 0;
    cleanBtn.style.opacity = idleCount === 0 ? '0.55' : '1';
  }
}

async function loadSystemUsageStats(showToastOnOk = false) {
  if (!isSuperAdmin() || !navigator.onLine || !ensureSupabaseClient()) return;
  const btn = document.getElementById('refreshSysStatsBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const { data, error } = await sb.rpc('super_admin_get_system_stats');
    if (error) {
      renderSystemUsageStatsUI(null);
      return;
    }
    cachedSystemStats = data || null;
    renderSystemUsageStatsUI(cachedSystemStats);
    if (showToastOnOk) showToast('تم تحديث إحصائيات المساحة والاتصال ✓');
  } catch (e) {
    renderSystemUsageStatsUI(null);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'تحديث'; }
  }
}

async function toggleWorkshopPin(wsId) {
  if (!isSuperAdmin()) return;
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws) return;
  if (isWorkshopProtectedAccount(ws)) {
    return showToast('حساب المدير العام محمي ومثبّت دائماً');
  }
  const nextPinned = !Boolean(ws.is_pinned);
  const { error } = await sb.rpc('super_admin_toggle_workshop_pin', {
    target_workshop_id: wsId,
    p_pinned: nextPinned
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('super_admin_toggle_workshop_pin') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v1.0) في Supabase أولاً لتفعيل تثبيت الحسابات.');
      return;
    }
    return showAccAlert('تعذّر تحديث التثبيت: ' + msg);
  }
  ws.is_pinned = nextPinned;
  showToast(nextPinned ? `تم تثبيت «${ws.name}» — محمي من الحذف التلقائي ✓` : `تم إلغاء تثبيت «${ws.name}»`);
  renderIsolatedWorkshopsList(cachedWorkshopsList);
  loadSystemUsageStats(false);
}

async function cleanupInactiveAccounts90() {
  if (!isSuperAdmin() || !navigator.onLine) return;
  const count = cachedSystemStats ? Number(cachedSystemStats.inactive_90d_count || 0) : 0;
  if (count === 0) {
    return showToast(`لا توجد حسابات خاملة تجاوزت ${INACTIVE_ACCOUNT_DAYS} يوماً حالياً`);
  }
  if (!confirm(`هل أنت متأكد من حذف جميع الحسابات الخاملة التي لم تُستخدم منذ أكثر من ${INACTIVE_ACCOUNT_DAYS} يوماً (${count} حساب غير مثبّت) مع جميع بياناتها نهائياً؟

الحسابات المثبّتة وحسابك محمية ولن تُمس.`)) {
    return;
  }
  showAccAlert('');
  const btn = document.getElementById('cleanupInactiveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري التنظيف...'; }
  try {
    const { data, error } = await sb.rpc('super_admin_cleanup_inactive_accounts', { p_days: INACTIVE_ACCOUNT_DAYS });
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('super_admin_cleanup_inactive_accounts') || msg.includes('does not exist')) {
        showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v1.0) في Supabase أولاً.');
        return;
      }
      throw error;
    }
    const delWs = Number((data && data.deleted_workshops) || 0);
    const delUsers = Number((data && data.deleted_users) || 0);
    showAccAlert(`تم حذف ${delWs} حساب خامل (${delUsers} مستخدم) وتوفير المساحة بنجاح ✓`, true);
    showToast(`تم تنظيف ${delWs} حساب خامل ✓`);
    await loadIsolatedWorkshops();
  } catch (err) {
    showAccAlert('تعذّر حذف الحسابات الخاملة: ' + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'حذف الخاملين (+90 يوم)'; }
  }
}

function renderIsolatedWorkshopsList(list) {
  const box = document.getElementById('workshopsListBox');
  const banner = document.getElementById('onlineWorkshopsBanner');
  document.getElementById('workshopsCountLbl').textContent = `${list.length} حساب`;
  updateLiveSystemCountersUI(list);

  const activeOnlineWs = list.filter(w => {
    const onlineArr = onlineWorkshopsMap.get(w.id) || [];
    return onlineArr.length > 0;
  });

  if (activeOnlineWs.length > 0) {
    const wsNames = activeOnlineWs.map(w => escapeHtml(w.name)).join('، ');
    banner.innerHTML = `<span class="presence-dot online"></span><span>الحسابات المتصلة الآن (${activeOnlineWs.length}): ${wsNames}</span>`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  // ترتيب ذكي: حسابك أولاً، ثم المثبّتة، ثم الخاملة +90 يوم، ثم الباقي حسب الأحدث نشاطاً
  const sorted = [...list].sort((a, b) => {
    const aOwn = isWorkshopProtectedAccount(a) ? 1 : 0;
    const bOwn = isWorkshopProtectedAccount(b) ? 1 : 0;
    if (bOwn !== aOwn) return bOwn - aOwn;
    const aPin = a.is_pinned ? 1 : 0;
    const bPin = b.is_pinned ? 1 : 0;
    if (bPin !== aPin) return bPin - aPin;
    return String(b.last_active_at || b.created_at || '').localeCompare(String(a.last_active_at || a.created_at || ''));
  });

  box.innerHTML = sorted.map(w => {
    const isOwnWs = isWorkshopProtectedAccount(w);
    const isPinned = isOwnWs || Boolean(w.is_pinned);
    const isFrozen = Boolean(w.settings && w.settings.frozen === true);
    const myDevId = getOrCreateDeviceId();
    const onlineArr = (onlineWorkshopsMap.get(w.id) || []).map(d => ({
      ...d,
      isCurrentDevice: Boolean(currentUser && d.user_id === currentUser.id && d.device_id === myDevId)
    }));
    if (isOwnWs && navigator.onLine && currentUser && !onlineArr.some(d => d.user_id === currentUser.id && d.device_id === myDevId)) {
      onlineArr.unshift({
        user_id: currentUser.id,
        workshop_id: w.id,
        display_name: currentProfile.display_name || currentProfile.email || '',
        email: currentProfile.email || '',
        device_id: myDevId,
        device_label: getFriendlyDeviceLabel(),
        isCurrentDevice: true
      });
    }
    const liveDevCount = onlineArr.length;
    const isOnline = liveDevCount > 0;
    const { adminMember, wsMembers, email: mgrEmail, mustChangePassword: mgrMustChange, passwordUpdatedAt: mgrPassUpdatedAt } = getWorkshopManagerInfo(w);

    const idleDays = isOnline ? 0 : getWorkshopIdleDays(w);
    let idleBadge = '';
    if (!isOwnWs) {
      if (idleDays === 0) {
        idleBadge = `<span class="m-badge m-on">نشط اليوم</span>`;
      } else if (idleDays >= INACTIVE_ACCOUNT_DAYS && !isPinned) {
        idleBadge = `<span class="m-badge m-stale">⚠️ خامل ${idleDays} يوماً (جاهز للحذف)</span>`;
      } else if (idleDays >= 60 && !isPinned) {
        idleBadge = `<span class="m-badge m-warn-idle">خامل منذ ${idleDays} يوماً</span>`;
      } else {
        idleBadge = `<span class="m-badge m-neutral">آخر نشاط منذ ${idleDays} يوم</span>`;
      }
    }

    const onlineBadge = isOnline
      ? `<span class="m-badge m-online"><span class="presence-dot online"></span>متصل (${formatArabicDeviceCount(liveDevCount)})</span>`
      : `<span class="m-badge m-offline"><span class="presence-dot offline"></span>غير متصل</span>`;

    const stateBadge = isFrozen
      ? `<span class="m-badge m-frozen">مجمّد</span>`
      : `<span class="m-badge m-on">شغّال</span>`;

    const pinBadge = isOwnWs
      ? `<span class="m-badge m-role">حسابك (محمي)</span>`
      : (isPinned ? `<span class="m-badge m-pinned">📌 مثبّت (لا يُحذف)</span>` : '');

    const wsDeviceChips = onlineArr.map(d => {
      const icon = getDeviceIconEmoji(d.device_label);
      const who = d.display_name || d.email || 'حساب';
      const selfTag = d.isCurrentDevice ? ' <span class="live-dev-self">(هذا الجهاز)</span>' : '';
      return `<span class="live-dev-chip${d.isCurrentDevice ? ' is-self' : ''}">${icon} ${escapeHtml(who)}: ${escapeHtml(d.device_label || 'جهاز متصل')}${selfTag}</span>`;
    }).join('');
    const onlineNoteHtml = isOnline
      ? `<div class="live-devices-box">
           <div class="live-devices-head">
             <span class="presence-dot online"></span>
             <span>الأجهزة المتصلة الآن (${formatArabicDeviceCount(liveDevCount)}):</span>
           </div>
           <div class="live-devices-list">${wsDeviceChips}</div>
         </div>`
      : '';

    const adminInfoHtml = adminMember
      ? `<div class="member-email" style="direction:rtl;">المالك: ${escapeHtml(adminMember.display_name || mgrEmail)} • ${wsMembers.length} مستخدم</div>`
      : '';

    const safeWsId = escapeHtml(w.id);
    workshopCredsMap.set(w.id, { email: mgrEmail || '' });
    const credsBoxHtml = !isOwnWs ? `
      <div class="ws-creds-box">
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">البريد الإلكتروني:</span>
          <span class="ws-cred-val">${escapeHtml(mgrEmail || '—')}</span>
          ${mgrEmail ? `<button type="button" class="ws-cred-mini-btn" onclick="copyWorkshopCred('${safeWsId}', 'email')">نسخ</button>` : ''}
        </div>
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">كلمة المرور:</span>
          ${mgrMustChange
            ? `<span class="ws-pass-status temp">⏳ مؤقتة — سيُطلب تغييرها عند الدخول</span>`
            : (mgrPassUpdatedAt
                ? `<span class="ws-pass-status private">✓ محمية (غُيّرت: ${escapeHtml(formatIsoDateTimeShort(mgrPassUpdatedAt))})</span>`
                : `<span class="ws-pass-status private">🔒 محمية ومشفّرة (خاصة بصاحب الحساب)</span>`)
          }
        </div>
      </div>` : '';

    const actionsHtml = isOwnWs
      ? `<div class="member-actions">
           <button class="btn btn-light btn-sm" onclick="openEditWorkshopModal('${safeWsId}')">تعديل الاسم</button>
         </div>`
      : `<div class="member-actions">
           <button class="btn ${isPinned ? 'btn-pin-on' : 'btn-light'} btn-sm" onclick="toggleWorkshopPin('${safeWsId}')">
             ${isPinned ? '📌 مثبّت (إلغاء التثبيت)' : '📌 تثبيت (لا يُحذف)'}
           </button>
           <button class="btn btn-primary btn-sm" onclick="openEditWorkshopModal('${safeWsId}')">تعديل / كلمة مؤقتة</button>
           ${adminMember ? `<button class="btn btn-warn-sm btn-sm" onclick="forceLogoutWorkshopAdmin('${escapeHtml(adminMember.user_id)}', '${escapeHtml(w.name)}')">إخراج من الجهاز</button>` : ''}
           <button class="btn btn-light btn-sm" onclick="toggleWorkshopFreeze('${safeWsId}')">
             ${isFrozen ? 'فك التجميد' : 'تجميد الحساب'}
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteIsolatedWorkshop('${safeWsId}')">إزالة</button>
         </div>`;

    return `
      <div class="member-card ${isFrozen ? 'is-frozen-card' : (isOnline ? 'is-online-card' : '')}">
        <div class="member-top">
          <div>
            <div class="member-name">${escapeHtml(w.name)}</div>
            <div class="member-email" style="direction:rtl;">تاريخ التسجيل: ${escapeHtml((w.created_at || '').slice(0, 10))}</div>
            ${adminInfoHtml}
          </div>
          <div class="member-badges">
            ${onlineBadge}
            ${pinBadge}
            ${idleBadge}
            ${stateBadge}
          </div>
        </div>
        ${credsBoxHtml}
        ${onlineNoteHtml}
        ${actionsHtml}
      </div>
    `;
  }).join('');
}

async function forceLogoutWorkshopAdmin(adminUid, wsName) {
  if (!isSuperAdmin() || !adminUid) return;
  if (!confirm(`هل تريد إخراج صاحب حساب "${wsName}" من جهازه الحالي؟ سيتم تسجيل خروجه فوراً والسماح له بالدخول من جهاز جديد.`)) return;
  showAccAlert('');
  const { error } = await sb.rpc('admin_force_logout_member', { target_user_id: adminUid });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('admin_force_logout_member') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث في Supabase أولاً.');
      return;
    }
    return showAccAlert('تعذّر إخراج الحساب: ' + msg);
  }
  showAccAlert(`تم إخراج حساب "${wsName}" من جهازه بنجاح ✓`, true);
  showToast('تم إخراج الحساب من الجهاز بنجاح ✓');
  loadIsolatedWorkshops();
}

async function loadIsolatedWorkshops() {
  if (!isSuperAdmin()) return;
  const box = document.getElementById('workshopsListBox');
  if (!navigator.onLine) {
    box.innerHTML = '<div class="empty-box">تتطلب هذه القائمة اتصالاً بالإنترنت.</div>';
    return;
  }
  box.innerHTML = '<div class="empty-box" style="padding:24px;">جاري تحميل الحسابات...</div>';

  const [{ data, error }, { data: allMems }] = await Promise.all([
    sb.from('workshops').select('*').order('created_at', { ascending: false }),
    sb.from('workshop_members').select('*')
  ]);

  if (error) {
    box.innerHTML = `<div class="alert-banner alert-err">${escapeHtml(error.message)}</div>`;
    return;
  }

  cachedAllMembersByWs.clear();
  (allMems || []).forEach(m => {
    if (!cachedAllMembersByWs.has(m.workshop_id)) cachedAllMembersByWs.set(m.workshop_id, []);
    cachedAllMembersByWs.get(m.workshop_id).push(m);
  });

  cachedWorkshopsList = data || [];
  rebuildOnlineMapsFromPresence();
  renderIsolatedWorkshopsList(cachedWorkshopsList);
  loadSystemUsageStats(false);
}

function openEditWorkshopModal(wsId) {
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws) return;
  editingWorkshopId = wsId;
  const isOwnWs = isWorkshopProtectedAccount(ws);
  const { adminMember, email } = getWorkshopManagerInfo(ws);

  editingWorkshopAdminId = (!isOwnWs && adminMember) ? adminMember.user_id : null;
  editingWorkshopOldEmail = email || '';

  document.getElementById('editWsNameInput').value = ws.name || '';
  document.getElementById('editWsCredsWrap').classList.toggle('hidden', isOwnWs || !editingWorkshopAdminId);
  document.getElementById('editWsEmailInput').value = email || '';
  // حقل كلمة المرور المؤقتة يبقى فارغاً دائماً ولا يُعرض أي باسورد مخزّن
  document.getElementById('editWsPassInput').value = '';

  openModal('editWorkshopModal');
}

async function saveWorkshopEdit() {
  if (!isSuperAdmin() || !editingWorkshopId) return;
  const newName = document.getElementById('editWsNameInput').value.trim();
  if (!newName) return showToast('يرجى كتابة اسم الحساب');

  const ws = cachedWorkshopsList.find(w => w.id === editingWorkshopId);
  const isOwnWs = isWorkshopProtectedAccount(ws);
  const newEmail = isOwnWs ? '' : document.getElementById('editWsEmailInput').value.trim().toLowerCase();
  const tempPass = isOwnWs ? '' : document.getElementById('editWsPassInput').value.trim();

  if (!isOwnWs && editingWorkshopAdminId) {
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return showToast('يرجى كتابة بريد إلكتروني صحيح');
    }
    if (tempPass && tempPass.length < 6) {
      return showToast('كلمة المرور المؤقتة يجب أن تكون 6 أحرف أو أرقام على الأقل');
    }
  }

  const btn = document.getElementById('saveWsEditBtn');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  try {
    const emailChanged = Boolean(!isOwnWs && editingWorkshopAdminId && newEmail && newEmail !== editingWorkshopOldEmail.toLowerCase());
    const passResetRequested = Boolean(!isOwnWs && editingWorkshopAdminId && tempPass);

    if (emailChanged || passResetRequested) {
      const { error: rpcErr } = await sb.rpc('super_admin_update_member_credentials', {
        target_user_id: editingWorkshopAdminId,
        new_email: emailChanged ? newEmail : null,
        new_password: passResetRequested ? tempPass : null
      });
      if (rpcErr) {
        const msg = String(rpcErr.message || '');
        if (msg.includes('super_admin_update_member_credentials') || msg.includes('does not exist')) {
          throw new Error('يرجى تشغيل كود SQL في Supabase أولاً.');
        }
        throw rpcErr;
      }
    }

    const nextSettings = {
      ...(ws && ws.settings ? ws.settings : {}),
      shopName: newName
    };
    delete nextSettings.managerPassword;
    delete nextSettings.shopLogo;
    if (!isOwnWs) {
      if (newEmail) nextSettings.managerEmail = newEmail;
      if (passResetRequested) {
        nextSettings.adminMustChangePassword = true;
        nextSettings.adminPasswordResetAt = new Date().toISOString();
      }
    }

    const { error: wsErr } = await sb
      .from('workshops')
      .update({ name: newName, settings: nextSettings })
      .eq('id', editingWorkshopId);

    if (wsErr) throw wsErr;

    if (isOwnWs) {
      settings.shopName = newName;
      applyBrandingUI();
    }

    const finalEmailForOnce = newEmail || editingWorkshopOldEmail;
    editingWorkshopId = null;
    editingWorkshopAdminId = null;
    closeModal('editWorkshopModal');
    loadIsolatedWorkshops();

    if (passResetRequested) {
      openTempCredsOnceModal(newName, finalEmailForOnce, tempPass, true);
    } else {
      showToast('تم حفظ التعديلات بنجاح ✓');
    }
  } catch (err) {
    showAccAlert('تعذّر الحفظ: ' + (err.message || err));
    showToast(err.message || 'تعذّر حفظ التعديل');
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ التعديل';
  }
}

async function toggleWorkshopFreeze(wsId) {
  if (!isSuperAdmin()) return;
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws || isWorkshopProtectedAccount(ws)) return;

  const isCurrentlyFrozen = Boolean(ws.settings && ws.settings.frozen === true);
  const willFreeze = !isCurrentlyFrozen;
  const actionLabel = willFreeze ? 'تجميد' : 'فك تجميد';

  if (!confirm(`هل أنت متأكد من ${actionLabel} حساب "${ws.name}"؟`)) return;

  const nextSettings = { ...(ws.settings || {}), frozen: willFreeze };
  delete nextSettings.shopLogo;
  const { error } = await sb
    .from('workshops')
    .update({ settings: nextSettings })
    .eq('id', wsId);

  if (error) {
    showAccAlert(`تعذّر ${actionLabel} الحساب: ${error.message}`);
    return;
  }

  await sb.from('workshop_members').update({ active: !willFreeze }).eq('workshop_id', wsId);

  showToast(willFreeze ? `تم تجميد حساب "${ws.name}" بنجاح` : `تم فك التجميد وتفعيل حساب "${ws.name}"`);
  loadIsolatedWorkshops();
}

async function deleteIsolatedWorkshop(wsId) {
  if (!isSuperAdmin()) return;
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws || isWorkshopProtectedAccount(ws)) return;
  if (ws.is_pinned) {
    return showToast('هذا الحساب مثبّت ومحمي — ألغِ التثبيت أولاً إذا أردت حذفه');
  }

  if (!confirm(`تحذير: هل أنت متأكد من إزالة حساب "${ws.name}" ومسح جميع مستخدميه وديونه نهائياً من السيرفر؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

  showAccAlert('');
  const { error: rpcErr } = await sb.rpc('super_admin_delete_workshop_completely', { target_workshop_id: wsId });
  if (rpcErr) {
    const msg = String(rpcErr.message || '');
    if (msg.includes('super_admin_delete_workshop_completely') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث في Supabase لحذف الحساب بالكامل.');
      return;
    }
    showAccAlert('تعذّر مسح الحساب من السيرفر: ' + msg);
    return;
  }

  showAccAlert(`تم مسح حساب "${ws.name}" وجميع بياناته من السيرفر نهائياً ✓`, true);
  showToast(`تم مسح حساب "${ws.name}" نهائياً ✓`);
  loadIsolatedWorkshops();
}


// ==================== مزامنة موعد التسديد وجلب سجل التدقيق (v24) ====================
async function persistCustomerDueDateChange(custName, dueDateStr, dueNote = '') {
  const cleanName = String(custName || '').trim();
  if (!cleanName) return;

  const prevEntry = (settings.customerDueDates && settings.customerDueDates[cleanName]) || null;
  if (!settings.customerDueDates || typeof settings.customerDueDates !== 'object') {
    settings.customerDueDates = {};
  }

  if (dueDateStr) {
    settings.customerDueDates[cleanName] = {
      date: formatDate(dueDateStr),
      note: String(dueNote || '').trim(),
      updatedAt: new Date().toISOString()
    };
  } else {
    delete settings.customerDueDates[cleanName];
  }

  if (currentWorkshop) {
    currentWorkshop.settings = {
      ...(currentWorkshop.settings || {}),
      overdueDays: settings.overdueDays,
      customerDueDates: { ...settings.customerDueDates }
    };
    if (isFreeOfflineMode()) {
      saveFreeOfflineWorkshopSettings(currentWorkshop.settings);
    } else if (currentUser) {
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
    }
  }

  recordAuditEvent({
    action_type: 'set_due_date',
    customer_name: cleanName,
    summary: dueDateStr
      ? `تحديد موعد التسديد بتاريخ ${formatDate(dueDateStr)}${dueNote ? ' (' + dueNote + ')' : ''}`
      : 'إزالة موعد التسديد',
    before_data: prevEntry ? { dueDate: prevEntry.date, note: prevEntry.note || '' } : null,
    after_data: dueDateStr ? { dueDate: formatDate(dueDateStr), note: String(dueNote || '').trim() } : null
  });

  if (!isFreeOfflineMode()) {
    pendingDueDateQueue[cleanName] = dueDateStr
      ? { date: formatDate(dueDateStr), note: String(dueNote || '').trim() }
      : null;
    persistAuditData();

    if (navigator.onLine && ensureSupabaseClient()) {
      let syncedDue = false;
      try {
        const { error: rpcErr } = await sb.rpc('set_customer_due_date', {
          p_customer_name: cleanName,
          p_due_date: dueDateStr ? formatDate(dueDateStr) : null,
          p_due_note: dueDateStr ? String(dueNote || '').trim() : null
        });
        if (!rpcErr) {
          syncedDue = true;
        } else if (isAdmin() && currentWorkshop) {
          const { error: updErr } = await sb
            .from('workshops')
            .update({ settings: currentWorkshop.settings })
            .eq('id', currentProfile.workshop_id);
          if (!updErr) syncedDue = true;
        }
      } catch (e) {
        if (isAdmin() && currentWorkshop) {
          try {
            const { error: updErr2 } = await sb
              .from('workshops')
              .update({ settings: currentWorkshop.settings })
              .eq('id', currentProfile.workshop_id);
            if (!updErr2) syncedDue = true;
          } catch (err2) {}
        }
      }
      if (syncedDue) {
        delete pendingDueDateQueue[cleanName];
        persistAuditData();
      }
    }
  }
}

async function fetchAuditLogsFromServer() {
  if (isFreeOfflineMode() || !navigator.onLine || !ensureSupabaseClient() || !currentProfile) {
    return { fromServer: false, missingTable: false };
  }
  try {
    // محاولة رفع المعلّق أولاً عبر INSERT فقط
    if (pendingAuditQueue.length > 0) {
      while (pendingAuditQueue.length > 0) {
        const aItem = pendingAuditQueue[0];
        if (!TRACKED_AUDIT_ACTIONS.has(String(aItem.action_type || ''))) {
          pendingAuditQueue.shift();
          persistAuditData();
          continue;
        }
        const { error: upErr } = await sb
          .from('audit_logs')
          .insert({
            id: String(aItem.id),
            workshop_id: currentProfile.workshop_id,
            actor_user_id: aItem.actor_user_id || currentUser.id,
            actor_name: String(aItem.actor_name || currentProfile.display_name || ''),
            action_type: String(aItem.action_type || 'edit_tx'),
            customer_name: String(aItem.customer_name || ''),
            summary: String(aItem.summary || ''),
            before_data: aItem.before_data || null,
            after_data: aItem.after_data || null,
            created_at: aItem.created_at || new Date().toISOString()
          });
        if (upErr) {
          const msg = String(upErr.message || '');
          if (upErr.code === '23505' || msg.includes('duplicate key')) {
            pendingAuditQueue.shift();
            persistAuditData();
            continue;
          }
          if (msg.includes('audit_logs') || msg.includes('does not exist') || upErr.code === '42P01') {
            auditTableMissingOnServer = true;
            return { fromServer: false, missingTable: true };
          }
          break;
        }
        pendingAuditQueue.shift();
        persistAuditData();
      }
    }

    const { data, error } = await sb
      .from('audit_logs')
      .select('*')
      .eq('workshop_id', currentProfile.workshop_id)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('audit_logs') || msg.includes('does not exist') || error.code === '42P01') {
        auditTableMissingOnServer = true;
        return { fromServer: false, missingTable: true };
      }
      return { fromServer: false, missingTable: false, error: msg };
    }

    auditTableMissingOnServer = false;
    const mergedMap = new Map();
    (data || []).forEach(r => {
      if (TRACKED_AUDIT_ACTIONS.has(String(r.action_type || ''))) mergedMap.set(String(r.id), r);
    });
    (pendingAuditQueue || []).forEach(r => {
      if (TRACKED_AUDIT_ACTIONS.has(String(r.action_type || ''))) mergedMap.set(String(r.id), r);
    });
    auditLogs = Array.from(mergedMap.values())
      .filter(isAuditEntryWithinRetention)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    pruneOldLocalAuditLogs();
    persistAuditData();
    return { fromServer: true, missingTable: false };
  } catch (e) {
    return { fromServer: false, missingTable: false };
  }
}
