// ==================== إعدادات Supabase والحالة المشتركة ====================
const SUPABASE_URL = 'https://oeojvcikwiyiwmenozew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qescc0we7OizukGkCGc29w_kIiBhUHU';

let sb = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  : null;

function ensureSupabaseClient() {
  if (!sb && window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
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
  version: 'v22.0',
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
  whatsappApp: 'normal',
  themeMode: 'auto',
  showMainFilters: false,
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
let editingWorkshopOldPass = '';

let allRecords = [];
let pendingQueue = [];
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
  settings.shopLogo = s.shopLogo || '';
  settings.generalNote = s.generalNote || '';
  settings.shamCashEnabled = !!s.shamCashEnabled;
  settings.shamCashCode = s.shamCashCode || '';
  settings.waConfig = { ...DEFAULT_WA_CONFIG, ...(s.waConfig && typeof s.waConfig === 'object' ? s.waConfig : {}) };
  settings.currency = (s.currency === 'USD' || s.currency === 'SYP' || s.currency === 'BOTH') ? s.currency : 'BOTH';
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
    lastSyncMeta = JSON.parse(localStorage.getItem(wsKey('last_sync_meta')) || '{"syncedAt":"","localUpdatedAt":"","lastAction":""}');
  } catch (e) {
    allRecords = [];
    pendingQueue = [];
    lastSyncMeta = { syncedAt: '', localUpdatedAt: '', lastAction: '' };
  }
}

function persistData() {
  if (!currentProfile) return;
  localStorage.setItem(wsKey('records'), JSON.stringify(allRecords));
  localStorage.setItem(wsKey('queue'), JSON.stringify(pendingQueue));
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

function getFriendlyDeviceLabel() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) {
    const m = ua.match(/Android[^;]*;\s*([^;)]+)/i);
    const model = m && m[1] ? m[1].replace(/Build\/.*/i, '').trim() : '';
    return model && model.length <= 24 ? `أندرويد (${model})` : 'هاتف أندرويد';
  }
  if (/iPhone/i.test(ua)) return 'هاتف آيفون';
  if (/iPad/i.test(ua)) return 'جهاز آيباد';
  if (/Windows/i.test(ua)) return 'كمبيوتر Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'كمبيوتر Mac';
  if (/Linux/i.test(ua)) return 'كمبيوتر Linux';
  return 'جهاز آخر';
}

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

  if (localStorage.getItem(FREE_OFFLINE_MODE_KEY) === '1') {
    enterFreeOfflineMode(true);
    return;
  }

  let activeUser = null;
  const client = ensureSupabaseClient();
  if (client) {
    try {
      const sessionRes = await Promise.race([
        client.auth.getSession(),
        new Promise((resolve) => setTimeout(() => resolve({ data: { session: null }, timedOut: true }), 2500))
      ]);
      if (sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.user) {
        activeUser = sessionRes.data.session.user;
        saveLastUser(activeUser);
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
  await loadUserWorkspace(activeUser);
}

function showLoginScreen(errMsg = '') {
  isUnlocked = false;
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginErr').textContent = errMsg;
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
    saveLastUser(data.user);
    await loadUserWorkspace(data.user, true);
  } catch (err) {
    document.getElementById('loginErr').textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  } finally {
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

async function loadUserWorkspace(user, forceNetworkCheck = false) {
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
      const { data: mem, error: memErr } = await client
        .from('workshop_members')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (isSupabaseNotFoundError(memErr)) {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('هذا الحساب غير مرتبط بأي ورشة مفعّلة.');
        return;
      }
      if (memErr) throw memErr;
      if (!mem) throw new Error('تعذّر قراءة بيانات الحساب');
      if (!mem.active) {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('تم إيقاف هذا الحساب من قبل مدير الورشة.');
        return;
      }

      const { data: ws, error: wsErr } = await client
        .from('workshops')
        .select('*')
        .eq('id', mem.workshop_id)
        .single();

      if (wsErr || !ws) throw wsErr || new Error('تعذّر قراءة بيانات الورشة');
      if (ws.settings && ws.settings.frozen === true && mem.role !== 'super_admin') {
        clearSavedLastUser();
        await client.auth.signOut({ scope: 'local' });
        showLoginScreen('تم تجميد حساب هذه الورشة من قبل الإدارة.');
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
  if (settings.lockEnabled && settings.pin && sessionStorage.getItem('debt_unlocked_v3') !== '1') {
    showLockScreen();
  } else {
    showMainView();
  }
}

function applyPermissionsUI() {
  const freeMode = isFreeOfflineMode();
  document.getElementById('drawerAccountsBtn').classList.toggle('hidden', !canManageAccounts());
  document.getElementById('settingsAccountsShortcut').classList.toggle('hidden', !canManageAccounts());
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
      try { await client.rpc('release_my_device', { p_device_id: getOrCreateDeviceId() }); } catch (e) {}
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
    if (client) await client.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('SignOut warning:', e);
  }
  sessionStorage.removeItem('debt_unlocked_v3');
  currentUser = null;
  currentProfile = null;
  currentWorkshop = null;
  allRecords = [];
  pendingQueue = [];
  resetAllOpenLayersForLogout();
  showLoginScreen();
  showToast('تم تسجيل الخروج');
}

async function changeMyPassword() {
  const inputEl = document.getElementById('setNewPassInput');
  const newPass = (inputEl.value || '').trim();
  if (newPass.length < 6) return showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  if (!navigator.onLine) return showToast('يلزم الاتصال بالإنترنت لتغيير كلمة المرور');

  const { error } = await sb.auth.updateUser({ password: newPass });
  if (error) return showToast(error.message);

  // حفظ كلمة المرور الجديدة لتبقى ظاهرة عند المدير العام عند الحاجة
  try {
    await sb.rpc('sync_my_saved_password', { new_password: newPass });
  } catch (e) {}

  // حفظ نسخة احتياطية إضافية داخل إعدادات الورشة إذا كان المستخدم مدير ورشة
  if (isAdmin() && !isSuperAdmin() && currentWorkshop) {
    try {
      const nextWsSettings = {
        ...(currentWorkshop.settings || {}),
        managerEmail: currentProfile?.email || currentUser?.email || '',
        managerPassword: newPass
      };
      await sb.from('workshops').update({ settings: nextWsSettings }).eq('id', currentProfile.workshop_id);
      currentWorkshop.settings = nextWsSettings;
    } catch (e) {}
  }

  inputEl.value = '';
  inputEl.classList.remove('revealed');
  const eyeBtn = document.getElementById('toggleMyPassVisBtn');
  if (eyeBtn) eyeBtn.textContent = 'إظهار';
  showToast('تم تحديث كلمة المرور بنجاح ✓');
}

// ==================== المزامنة مع Supabase والعمل أوفلاين ====================
function rebuildOnlineMapsFromPresence() {
  onlineUsersMap.clear();
  onlineWorkshopsMap.clear();
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState() || {};
  Object.values(state).forEach(entries => {
    (entries || []).forEach(p => {
      if (!p || !p.user_id) return;
      onlineUsersMap.set(p.user_id, p);
      if (p.workshop_id) {
        if (!onlineWorkshopsMap.has(p.workshop_id)) onlineWorkshopsMap.set(p.workshop_id, []);
        const arr = onlineWorkshopsMap.get(p.workshop_id);
        if (!arr.some(u => u.user_id === p.user_id)) arr.push(p);
      }
    });
  });
}

function refreshOnlineIndicatorsUI() {
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

  presenceChannel = sb.channel('damascus-online-presence', {
    config: { presence: { key: currentUser.id } }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      rebuildOnlineMapsFromPresence();
      refreshOnlineIndicatorsUI();
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      rebuildOnlineMapsFromPresence();
      refreshOnlineIndicatorsUI();
      // إشعار أخضر فوري عند فتح صفحة الحسابات ودخول أحد الموظفين/المدراء أو الورشات على النت
      if (document.getElementById('accountsView')?.classList.contains('open')) {
        (newPresences || []).forEach(p => {
          if (!p || p.user_id === currentUser.id) return;
          if (p.workshop_id === currentProfile.workshop_id || isSuperAdmin()) {
            showToast(`🟢 ${p.display_name || p.email} متصل الآن على الإنترنت`);
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
          await presenceChannel.track({
            user_id: currentUser.id,
            workshop_id: currentProfile.workshop_id,
            display_name: currentProfile.display_name || currentProfile.email || '',
            email: currentProfile.email || '',
            role: currentProfile.role,
            online_at: new Date().toISOString()
          });
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

    // عند المزامنة: إخفاء التاريخ والساعة (تظهر فقط في وضع الأوفلاين)
    updateSyncStatusUI('متصل ومُزامن', 'ok');
    if (detectedOfflineCollisions.length > 0) {
      showToast('⚠️ تم اكتشاف أسماء متطابقة مضافة أوفلاين — ظهرت معاً بعلامة لتعديل أحدها');
    }
    if (typeof checkAndRunDailyBackups === 'function') checkAndRunDailyBackups();

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

  const onlineOthers = list.filter(m => m.user_id !== currentUser.id && onlineUsersMap.has(m.user_id));
  if (onlineOthers.length > 0) {
    const names = onlineOthers.map(m => escapeHtml(m.display_name || m.email)).join('، ');
    banner.innerHTML = `<span class="presence-dot online"></span><span>متصل الآن على الإنترنت: ${names}</span>`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  memberCredsMap.clear();
  box.innerHTML = list.map(m => {
    const isSelf = m.user_id === currentUser.id;
    const isSuper = m.role === 'super_admin';
    const isOnline = (isSelf && navigator.onLine) || onlineUsersMap.has(m.user_id);
    const safeUid = escapeHtml(m.user_id);
    const memEmail = String(m.email || '').trim();
    const memPass = String(m.login_password || '').trim();

    memberCredsMap.set(m.user_id, {
      display_name: m.display_name || '',
      email: memEmail,
      password: memPass
    });

    const presenceBadge = isOnline
      ? `<span class="m-badge m-online"><span class="presence-dot online"></span>متصل الآن</span>`
      : `<span class="m-badge m-offline"><span class="presence-dot offline"></span>غير متصل</span>`;

    const isBound = Boolean(m.active_device_id);
    const devLabel = String(m.active_device_label || 'جهاز واحد');
    const isSingleLocked = !isSuper && m.single_device_only !== false;
    const deviceBadge = !isSuper
      ? (isBound
          ? `<span class="m-badge m-dev-on">📱 مفتوح: ${escapeHtml(devLabel)}</span>`
          : `<span class="m-badge m-neutral">غير مرتبط بجهاز</span>`)
      : '';

    const secondAttemptHtml = m.second_device_attempt_at
      ? `<div class="second-dev-alert">
           <span>⚠️ محاولة فتح الحساب على جهاز ثاني (${escapeHtml(m.second_device_attempt_label || 'جهاز آخر')}) • ${escapeHtml(formatIsoDateTimeShort(m.second_device_attempt_at))}</span>
           <button type="button" class="ws-cred-mini-btn" onclick="clearSecondDeviceAlert('${safeUid}')">إخفاء</button>
         </div>`
      : '';

    const onlineNotice = (!isSelf && isOnline)
      ? `<div class="member-online-note"><span class="presence-dot online"></span><span>${escapeHtml(m.display_name || m.email)} موجود الآن على الإنترنت</span></div>`
      : '';

    const credsBoxHtml = `
      <div class="ws-creds-box">
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">اسم المستخدم:</span>
          <span class="ws-cred-val">${escapeHtml(memEmail || '—')}</span>
          ${memEmail ? `<button type="button" class="ws-cred-mini-btn" onclick="copyMemberCred('${safeUid}', 'email')">نسخ</button>` : ''}
        </div>
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">كلمة المرور:</span>
          ${memPass
            ? `<span class="ws-cred-val" id="memPassVal_${safeUid}" data-shown="0">••••••••</span>
               <button type="button" class="ws-cred-mini-btn" onclick="toggleMemberCardPass(this, '${safeUid}')">إظهار</button>
               <button type="button" class="ws-cred-mini-btn" onclick="copyMemberCred('${safeUid}', 'pass')">نسخ</button>`
            : `<span class="ws-cred-val unset">غير محفوظة بعد</span>
               ${(!isSelf && !isSuper) ? `<button type="button" class="ws-cred-mini-btn" onclick="promptUpdateMemberPassword('${safeUid}')">تعيين</button>` : ''}`
          }
        </div>
      </div>`;

    const controls = (!isSelf && !isSuper) ? `
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
      </div>` : '';

    return `
      <div class="member-card ${isOnline && !isSelf ? 'is-online-card' : ''}">
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
        ${secondAttemptHtml}
        ${credsBoxHtml}
        ${onlineNotice}
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
  else if (kind === 'pass') copyCredentialValue(rec.password, 'كلمة المرور');
}

function toggleWsCardPass(btn, wsId) {
  const rec = workshopCredsMap.get(wsId);
  const el = document.getElementById('wsPassVal_' + wsId);
  const realPass = (rec && rec.password) || (el && el.getAttribute('data-pass')) || '';
  if (!el || !realPass) return;
  const shown = el.getAttribute('data-shown') === '1';
  if (shown) {
    el.textContent = '••••••••';
    el.setAttribute('data-shown', '0');
    btn.textContent = 'إظهار';
  } else {
    el.textContent = realPass;
    el.setAttribute('data-shown', '1');
    btn.textContent = 'إخفاء';
  }
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
  const password = (adminMember && adminMember.login_password)
    || (w.settings && w.settings.managerPassword)
    || '';
  return { adminMember, wsMembers, email, password };
}

function renderIsolatedWorkshopsList(list) {
  const box = document.getElementById('workshopsListBox');
  const banner = document.getElementById('onlineWorkshopsBanner');
  document.getElementById('workshopsCountLbl').textContent = `${list.length} ورشة`;

  const activeOnlineWs = list.filter(w => {
    const onlineArr = onlineWorkshopsMap.get(w.id) || [];
    return onlineArr.length > 0;
  });

  if (activeOnlineWs.length > 0) {
    const wsNames = activeOnlineWs.map(w => escapeHtml(w.name)).join('، ');
    banner.innerHTML = `<span class="presence-dot online"></span><span>الورشات المتصلة الآن (${activeOnlineWs.length}): ${wsNames}</span>`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  box.innerHTML = list.map(w => {
    const isOwnWs = w.id === currentProfile.workshop_id;
    const isFrozen = Boolean(w.settings && w.settings.frozen === true);
    const onlineArr = onlineWorkshopsMap.get(w.id) || [];
    const isOnline = (isOwnWs && navigator.onLine) || onlineArr.length > 0;
    const { adminMember, wsMembers, email: mgrEmail, password: mgrPass } = getWorkshopManagerInfo(w);

    const onlineBadge = isOnline
      ? `<span class="m-badge m-online"><span class="presence-dot online"></span>متصلة (${Math.max(1, onlineArr.length)})</span>`
      : `<span class="m-badge m-offline"><span class="presence-dot offline"></span>غير متصلة</span>`;

    const stateBadge = isFrozen
      ? `<span class="m-badge m-frozen">مجمّدة</span>`
      : `<span class="m-badge m-on">شغّالة</span>`;

    const onlineNamesList = onlineArr.map(u => escapeHtml(u.display_name || u.email)).filter(Boolean);
    const onlineNoteHtml = (isOnline && onlineNamesList.length > 0)
      ? `<div class="member-online-note"><span class="presence-dot online"></span><span>متصل الآن: ${onlineNamesList.join('، ')}</span></div>`
      : '';

    const adminInfoHtml = adminMember
      ? `<div class="member-email" style="direction:rtl;">المدير: ${escapeHtml(adminMember.display_name || mgrEmail)} • ${wsMembers.length} حساب</div>`
      : '';

    const safeWsId = escapeHtml(w.id);
    workshopCredsMap.set(w.id, { email: mgrEmail || '', password: mgrPass || '' });
    const credsBoxHtml = !isOwnWs ? `
      <div class="ws-creds-box">
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">اسم المستخدم:</span>
          <span class="ws-cred-val">${escapeHtml(mgrEmail || '—')}</span>
          ${mgrEmail ? `<button type="button" class="ws-cred-mini-btn" onclick="copyWorkshopCred('${safeWsId}', 'email')">نسخ</button>` : ''}
        </div>
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">كلمة المرور:</span>
          ${mgrPass
            ? `<span class="ws-cred-val" id="wsPassVal_${safeWsId}" data-shown="0">••••••••</span>
               <button type="button" class="ws-cred-mini-btn" onclick="toggleWsCardPass(this, '${safeWsId}')">إظهار</button>
               <button type="button" class="ws-cred-mini-btn" onclick="copyWorkshopCred('${safeWsId}', 'pass')">نسخ</button>`
            : `<span class="ws-cred-val unset">غير محفوظة بعد — اضغط تعديل لتعيينها</span>`
          }
        </div>
      </div>` : '';

    const actionsHtml = isOwnWs
      ? `<div class="member-actions">
           <button class="btn btn-light btn-sm" onclick="openEditWorkshopModal('${safeWsId}')">تعديل الاسم</button>
         </div>`
      : `<div class="member-actions">
           <button class="btn btn-primary btn-sm" onclick="openEditWorkshopModal('${safeWsId}')">تعديل الورشة / كلمة السر</button>
           ${adminMember ? `<button class="btn btn-warn-sm btn-sm" onclick="forceLogoutWorkshopAdmin('${escapeHtml(adminMember.user_id)}', '${escapeHtml(w.name)}')">إخراج من الجهاز</button>` : ''}
           <button class="btn btn-light btn-sm" onclick="toggleWorkshopFreeze('${safeWsId}')">
             ${isFrozen ? 'فك التجميد' : 'تجميد الورشة'}
           </button>
           <button class="btn btn-danger btn-sm" onclick="deleteIsolatedWorkshop('${safeWsId}')">إزالة</button>
         </div>`;

    return `
      <div class="member-card ${isFrozen ? 'is-frozen-card' : (isOnline ? 'is-online-card' : '')}">
        <div class="member-top">
          <div>
            <div class="member-name">${escapeHtml(w.name)}</div>
            <div class="member-email" style="direction:rtl;">تاريخ الإنشاء: ${escapeHtml((w.created_at || '').slice(0, 10))}</div>
            ${adminInfoHtml}
          </div>
          <div class="member-badges">
            ${onlineBadge}
            ${stateBadge}
            <span class="m-badge ${isOwnWs ? 'm-role' : 'm-neutral'}">${isOwnWs ? 'ورشتك' : 'معزولة'}</span>
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
  if (!confirm(`هل تريد إخراج مدير ورشة "${wsName}" من جهازه الحالي؟ سيتم تسجيل خروجه فوراً والسماح له بالدخول من جهاز جديد.`)) return;
  showAccAlert('');
  const { error } = await sb.rpc('admin_force_logout_member', { target_user_id: adminUid });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('admin_force_logout_member') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v17) في Supabase أولاً.');
      return;
    }
    return showAccAlert('تعذّر إخراج الحساب: ' + msg);
  }
  showAccAlert(`تم إخراج مدير ورشة "${wsName}" من جهازه بنجاح ✓`, true);
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
  box.innerHTML = '<div class="empty-box" style="padding:24px;">جاري تحميل الورشات...</div>';

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
}

function openEditWorkshopModal(wsId) {
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws) return;
  editingWorkshopId = wsId;
  const isOwnWs = wsId === currentProfile.workshop_id;
  const { adminMember, email, password } = getWorkshopManagerInfo(ws);

  editingWorkshopAdminId = (!isOwnWs && adminMember) ? adminMember.user_id : null;
  editingWorkshopOldEmail = email || '';
  editingWorkshopOldPass = password || '';

  document.getElementById('editWsNameInput').value = ws.name || '';
  document.getElementById('editWsCredsWrap').classList.toggle('hidden', isOwnWs || !editingWorkshopAdminId);
  document.getElementById('editWsEmailInput').value = email || '';
  document.getElementById('editWsPassInput').value = password || '';

  openModal('editWorkshopModal');
}

async function saveWorkshopEdit() {
  if (!isSuperAdmin() || !editingWorkshopId) return;
  const newName = document.getElementById('editWsNameInput').value.trim();
  if (!newName) return showToast('يرجى كتابة اسم الورشة');

  const isOwnWs = editingWorkshopId === currentProfile.workshop_id;
  const newEmail = isOwnWs ? '' : document.getElementById('editWsEmailInput').value.trim().toLowerCase();
  const newPass = isOwnWs ? '' : document.getElementById('editWsPassInput').value.trim();

  if (!isOwnWs && editingWorkshopAdminId) {
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return showToast('يرجى كتابة بريد إلكتروني صحيح');
    }
    if (newPass && newPass.length < 6) {
      return showToast('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل');
    }
  }

  const ws = cachedWorkshopsList.find(w => w.id === editingWorkshopId);
  const btn = document.getElementById('saveWsEditBtn');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  try {
    // 1. إذا تغير إيميل أو كلمة مرور مدير الورشة الجانبية، ننفّذ التحديث عبر دالة Supabase الآمنة
    const emailChanged = Boolean(!isOwnWs && editingWorkshopAdminId && newEmail && newEmail !== editingWorkshopOldEmail.toLowerCase());
    const passChanged = Boolean(!isOwnWs && editingWorkshopAdminId && newPass && newPass !== editingWorkshopOldPass);

    if (emailChanged || passChanged) {
      const { error: rpcErr } = await sb.rpc('super_admin_update_member_credentials', {
        target_user_id: editingWorkshopAdminId,
        new_email: emailChanged ? newEmail : null,
        new_password: passChanged ? newPass : null
      });
      if (rpcErr) {
        const msg = String(rpcErr.message || '');
        if (msg.includes('super_admin_update_member_credentials') || msg.includes('does not exist')) {
          throw new Error('يرجى تشغيل كود SQL الخاص بتحديث الإيميل وكلمة المرور في Supabase أولاً.');
        }
        throw rpcErr;
      }
    }

    // 2. تحديث اسم الورشة وحفظ نسخة من الإيميل/كلمة السر ضمن إعدادات الورشة
    const nextSettings = {
      ...(ws && ws.settings ? ws.settings : {}),
      shopName: newName
    };
    if (!isOwnWs) {
      if (newEmail) nextSettings.managerEmail = newEmail;
      if (newPass) nextSettings.managerPassword = newPass;
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

    editingWorkshopId = null;
    editingWorkshopAdminId = null;
    closeModal('editWorkshopModal');
    showToast('تم حفظ تعديلات الورشة وبيانات المدير بنجاح ✓');
    loadIsolatedWorkshops();
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
  if (!ws || wsId === currentProfile.workshop_id) return;

  const isCurrentlyFrozen = Boolean(ws.settings && ws.settings.frozen === true);
  const willFreeze = !isCurrentlyFrozen;
  const actionLabel = willFreeze ? 'تجميد' : 'فك تجميد';

  if (!confirm(`هل أنت متأكد من ${actionLabel} ورشة "${ws.name}"؟`)) return;

  const nextSettings = { ...(ws.settings || {}), frozen: willFreeze };
  const { error } = await sb
    .from('workshops')
    .update({ settings: nextSettings })
    .eq('id', wsId);

  if (error) {
    showAccAlert(`تعذّر ${actionLabel} الورشة: ${error.message}`);
    return;
  }

  await sb.from('workshop_members').update({ active: !willFreeze }).eq('workshop_id', wsId);

  showToast(willFreeze ? `تم تجميد ورشة "${ws.name}" بنجاح` : `تم فك التجميد وتفعيل ورشة "${ws.name}"`);
  loadIsolatedWorkshops();
}

async function deleteIsolatedWorkshop(wsId) {
  if (!isSuperAdmin()) return;
  const ws = cachedWorkshopsList.find(w => w.id === wsId);
  if (!ws || wsId === currentProfile.workshop_id) return;

  if (!confirm(`تحذير: هل أنت متأكد من إزالة ورشة "${ws.name}" ومسح جميع حساباتها ومستخدميها وديونها نهائياً من السيرفر؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

  showAccAlert('');
  const { error: rpcErr } = await sb.rpc('super_admin_delete_workshop_completely', { target_workshop_id: wsId });
  if (rpcErr) {
    const msg = String(rpcErr.message || '');
    if (msg.includes('super_admin_delete_workshop_completely') || msg.includes('does not exist')) {
      showAccAlert('يرجى تشغيل كود SQL الخاص بالتحديث (v16) في Supabase لحذف الورشة وجميع مستخدميها من السيرفر بالكامل.');
      return;
    }
    showAccAlert('تعذّر مسح الورشة من السيرفر: ' + msg);
    return;
  }

  showAccAlert(`تم مسح ورشة "${ws.name}" وجميع مستخدميها وبياناتها من السيرفر نهائياً ✓`, true);
  showToast(`تم مسح ورشة "${ws.name}" من السيرفر نهائياً ✓`);
  loadIsolatedWorkshops();
}

async function createIsolatedWorkshop(ev) {
  ev.preventDefault();
  if (!isSuperAdmin() || !navigator.onLine) return;
  showAccAlert('');

  const btn = document.getElementById('addWorkshopSubmitBtn');
  const wsName = document.getElementById('wsNewName').value.trim();
  const adminName = document.getElementById('wsAdminName').value.trim();
  const email = document.getElementById('wsAdminEmail').value.trim().toLowerCase();
  const password = document.getElementById('wsAdminPass').value.trim();

  btn.disabled = true;
  btn.textContent = 'جاري إنشاء الورشة...';
  try {
    const tempClient = createIsolatedAuthClient();
    const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({ email, password });
    if (signUpErr) throw signUpErr;
    if (!signUpData || !signUpData.user || !signUpData.user.id) {
      throw new Error('تعذّر إنشاء حساب المدير، تحقق من البريد.');
    }

    const { data: wsData, error: wsErr } = await sb
      .from('workshops')
      .insert({
        name: wsName,
        settings: {
          shopName: wsName,
          currency: 'BOTH',
          frozen: false,
          managerEmail: email,
          managerPassword: password
        }
      })
      .select()
      .single();
    if (wsErr) throw wsErr;

    const memPayload = {
      user_id: signUpData.user.id,
      workshop_id: wsData.id,
      role: 'admin',
      display_name: adminName,
      email,
      login_password: password,
      can_delete: true,
      active: true
    };
    let { error: memErr } = await sb.from('workshop_members').insert(memPayload);
    if (memErr && String(memErr.message || '').includes('login_password')) {
      delete memPayload.login_password;
      const retry = await sb.from('workshop_members').insert(memPayload);
      memErr = retry.error;
    }
    if (memErr) throw memErr;

    document.getElementById('addWorkshopForm').reset();
    showAccAlert(`تم إنشاء الورشة المعزولة "${wsName}" وحساب مديرها بنجاح!`, true);
    loadIsolatedWorkshops();
  } catch (err) {
    const msg = (err.message || '').includes('already registered')
      ? 'بريد مدير الورشة مسجّل مسبقاً، اختر بريداً آخر.'
      : (err.message || 'تعذّر إنشاء الورشة');
    showAccAlert(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء الورشة وحساب مديرها';
  }
}
