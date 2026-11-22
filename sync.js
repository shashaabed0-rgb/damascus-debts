// ==================== إعدادات Supabase والحالة المشتركة ====================
const SUPABASE_URL = 'https://oeojvcikwiyiwmenozew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Qescc0we7OizukGkCGc29w_kIiBhUHU';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

function createIsolatedAuthClient() {
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
  version: 'v12.0',
  developerOrg: 'مركز الدمشقي للصيانة',
  developerName: 'أبو العز',
  developerPhone: '' // ضع رقم التواصل هنا لتثبيته لجميع الورشات (أو يُؤخذ تلقائياً من هاتف المحل)
};

const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'دولار', short: 'دولار' },
  SYP: { code: 'SYP', symbol: 'ل.س', name: 'ليرة سوري', short: 'ليرة سوري' }
};

const DEVICE_SETTINGS_KEY = 'debt_device_settings_sb_v1';

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
function isAdmin() {
  return !!(currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'super_admin'));
}
function isSuperAdmin() {
  return !!(currentProfile && currentProfile.role === 'super_admin');
}
function canDeleteRecords() {
  return isAdmin() || !!(currentProfile && currentProfile.can_delete);
}
function getRoleLabel(role) {
  if (role === 'super_admin') return 'مدير عام';
  if (role === 'admin') return 'مدير';
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

function loadWorkshopLocalData() {
  try {
    allRecords = JSON.parse(localStorage.getItem(wsKey('records')) || '[]');
    pendingQueue = JSON.parse(localStorage.getItem(wsKey('queue')) || '[]');
  } catch (e) {
    allRecords = [];
    pendingQueue = [];
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
function genId(salt = 0) { return String(Date.now()) + '_' + salt + '_' + Math.floor(Math.random() * 10000); }

function toDbRecord(rec) {
  return {
    id: String(rec.id),
    workshop_id: currentProfile.workshop_id,
    date: String(rec.date || todayString()),
    name: String(rec.name || '').trim(),
    phone: String(rec.phone || '').trim(),
    type: String(rec.type || 'دين ($)'),
    amount: Number(rec.amount) || 0,
    note: String(rec.note || '').trim(),
    created_by: String(rec.created_by || currentProfile.display_name || currentProfile.email || '')
  };
}

// ==================== المصادقة وتسجيل الدخول ====================
async function initApp() {
  const params = new URLSearchParams(window.location.search);
  const copyParam = params.get('copy');
  if (copyParam) {
    showQuickCopyScreen(copyParam, params.get('shop') || '');
    return;
  }
  loadDeviceSettings();
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !session.user) {
    showLoginScreen();
    return;
  }
  await loadUserWorkspace(session.user);
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

  btn.disabled = true;
  btn.textContent = 'جاري التحقق...';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadUserWorkspace(data.user);
  } catch (err) {
    document.getElementById('loginErr').textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  } finally {
    btn.disabled = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

async function loadUserWorkspace(user) {
  currentUser = user;
  const ctxCacheKey = 'debt_ctx_sb_' + user.id;
  let profile = null;
  let workshop = null;

  if (navigator.onLine) {
    try {
      const { data: mem, error: memErr } = await sb
        .from('workshop_members')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (memErr || !mem) {
        await sb.auth.signOut();
        showLoginScreen('هذا الحساب غير مرتبط بأي ورشة مفعّلة.');
        return;
      }
      if (!mem.active) {
        await sb.auth.signOut();
        showLoginScreen('تم إيقاف هذا الحساب من قبل مدير الورشة.');
        return;
      }

      const { data: ws, error: wsErr } = await sb
        .from('workshops')
        .select('*')
        .eq('id', mem.workshop_id)
        .single();

      if (wsErr || !ws) throw wsErr;
      if (ws.settings && ws.settings.frozen === true && mem.role !== 'super_admin') {
        await sb.auth.signOut({ scope: 'local' });
        showLoginScreen('تم تجميد حساب هذه الورشة من قبل الإدارة.');
        return;
      }

      profile = mem;
      workshop = ws;
      localStorage.setItem(ctxCacheKey, JSON.stringify({ profile, workshop }));
    } catch (err) {
      const cached = localStorage.getItem(ctxCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        profile = parsed.profile;
        workshop = parsed.workshop;
      } else {
        showLoginScreen('تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً.');
        return;
      }
    }
  } else {
    const cached = localStorage.getItem(ctxCacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      profile = parsed.profile;
      workshop = parsed.workshop;
    } else {
      showLoginScreen('يلزم الاتصال بالإنترنت لتسجيل الدخول لأول مرة على هذا الجهاز.');
      return;
    }
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
  document.getElementById('drawerAccountsBtn').classList.toggle('hidden', !isAdmin());
  document.getElementById('settingsAccountsShortcut').classList.toggle('hidden', !isAdmin());
  document.getElementById('detailDeleteCustomerBtn').classList.toggle('hidden', !canDeleteRecords());
  document.getElementById('workshopAdminSettingsWrap').classList.toggle('hidden', !isAdmin());
  document.getElementById('currencySettingField').classList.toggle('hidden', !isAdmin());
  document.getElementById('restoreBackupWrap')?.classList.toggle('hidden', !isAdmin());
}

async function handleLogout() {
  if (pendingQueue.length > 0) {
    if (!confirm(`يوجد ${pendingQueue.length} عملية لم تُرفع بعد للسحابة. هل تريد تسجيل الخروج رغم ذلك؟`)) return;
  }
  try {
    if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
    if (presenceChannel) { sb.removeChannel(presenceChannel); presenceChannel = null; }
    if (workshopStatusChannel) { sb.removeChannel(workshopStatusChannel); workshopStatusChannel = null; }
  } catch (e) {}
  onlineUsersMap.clear();
  onlineWorkshopsMap.clear();
  try {
    await sb.auth.signOut({ scope: 'local' });
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
  if (!currentUser || !currentProfile) return;

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
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (workshopStatusChannel) {
    sb.removeChannel(workshopStatusChannel);
    workshopStatusChannel = null;
  }
  if (!currentProfile) return;

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

  workshopStatusChannel = sb
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

  subscribePresence();
}

async function syncData(silent) {
  if (isSyncing || !currentProfile) return;
  const syncBtn = document.getElementById('syncBtn');

  if (!navigator.onLine) {
    updateSyncStatusUI('وضع أوفلاين (الحفظ المحلي نشط)', 'off');
    return;
  }

  isSyncing = true;
  if (!silent) {
    syncBtn.classList.add('spinning');
    updateSyncStatusUI('جاري المزامنة...', 'off');
  }

  try {
    // 1. التحقق من أن الحساب ما زال مفعّلاً وتحديث صلاحياته وإعدادات الورشة
    const { data: memCheck } = await sb
      .from('workshop_members')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();

    if (!memCheck || !memCheck.active) {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      await sb.auth.signOut();
      showLoginScreen('تم إيقاف هذا الحساب من قبل مدير الورشة.');
      return;
    }
    currentProfile = memCheck;
    applyPermissionsUI();

    const { data: wsFresh } = await sb
      .from('workshops')
      .select('*')
      .eq('id', currentProfile.workshop_id)
      .single();

    if (wsFresh && wsFresh.settings && wsFresh.settings.frozen === true && currentProfile.role !== 'super_admin') {
      isSyncing = false;
      syncBtn.classList.remove('spinning');
      await sb.auth.signOut({ scope: 'local' });
      resetAllOpenLayersForLogout();
      showLoginScreen('تم تجميد حساب هذه الورشة من قبل الإدارة.');
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

    // 2. رفع العمليات المحفوظة محلياً بالترتيب
    while (pendingQueue.length > 0) {
      const item = pendingQueue[0];
      if (item.action === 'upsert' || item.action === 'add') {
        const { error } = await sb
          .from('debt_records')
          .upsert(toDbRecord(item.payload), { onConflict: 'id' });
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await sb
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
    const { data: rows, error: fetchErr } = await sb
      .from('debt_records')
      .select('*')
      .eq('workshop_id', currentProfile.workshop_id)
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;

    const pendingDeletes = new Set(pendingQueue.filter(q => q.action === 'delete').map(q => String(q.id)));
    const serverMap = new Map();
    (rows || []).forEach(r => {
      if (!pendingDeletes.has(String(r.id))) serverMap.set(String(r.id), r);
    });
    pendingQueue.filter(q => q.action === 'upsert' || q.action === 'add').forEach(q => {
      serverMap.set(String(q.payload.id), q.payload);
    });

    allRecords = Array.from(serverMap.values());
    persistData();
    processAndRender();

    const now = new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
    updateSyncStatusUI(`متصل ومُزامن (${now})`, 'ok');
    if (typeof checkAndRunDailyBackups === 'function') checkAndRunDailyBackups();

    if (currentCustomerName && document.getElementById('detailView').classList.contains('open')) {
      renderCustomerDetail(currentCustomerName);
    }
  } catch (err) {
    console.error('Sync error:', err);
    updateSyncStatusUI('محفوظ على الجهاز (سيُزامن عند عودة الاتصال)', 'err');
    if (!silent) showToast('محفوظ على الجهاز، وتعذّر الوصول للخادم حالياً');
  } finally {
    isSyncing = false;
    syncBtn.classList.remove('spinning');
  }
}

// ==================== طابور العمليات (أوفلاين أولاً) ====================
function queueUpsertRecord(rec) {
  const idStr = String(rec.id);
  const dbRec = toDbRecord(rec);
  const qIdx = pendingQueue.findIndex(q => (q.action === 'upsert' || q.action === 'add') && String(q.payload.id) === idStr);
  if (qIdx !== -1) pendingQueue[qIdx] = { action: 'upsert', payload: dbRec };
  else pendingQueue.push({ action: 'upsert', payload: dbRec });
}

function queueDeleteRecord(targetId) {
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
  if (navigator.onLine) {
    showToast(onlineMsg);
    syncData(false);
  } else {
    showToast(offlineMsg);
    updateSyncStatusUI('وضع أوفلاين (الحفظ المحلي نشط)', 'off');
  }
}

window.addEventListener('online', () => {
  showToast('عاد الإنترنت، جاري المزامنة التلقائية...');
  syncData(false);
});
window.addEventListener('offline', () => {
  updateSyncStatusUI('انقطع الإنترنت (الحفظ المحلي نشط)', 'off');
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isUnlocked && navigator.onLine) syncData(true);
});
setInterval(() => {
  if (isUnlocked && !document.hidden && navigator.onLine) syncData(true);
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
  if (!isAdmin()) return showToast('هذه الصفحة مخصصة للمدير فقط');
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

  box.innerHTML = list.map(m => {
    const isSelf = m.user_id === currentUser.id;
    const isSuper = m.role === 'super_admin';
    const isOnline = (isSelf && navigator.onLine) || onlineUsersMap.has(m.user_id);

    const presenceBadge = isOnline
      ? `<span class="m-badge m-online"><span class="presence-dot online"></span>متصل الآن</span>`
      : `<span class="m-badge m-offline"><span class="presence-dot offline"></span>غير متصل</span>`;

    const onlineNotice = (!isSelf && isOnline)
      ? `<div class="member-online-note"><span class="presence-dot online"></span><span>${escapeHtml(m.display_name || m.email)} موجود الآن على الإنترنت</span></div>`
      : '';

    const controls = (!isSelf && !isSuper) ? `
      <div class="member-actions">
        <button class="btn btn-light btn-sm" onclick="toggleMemberActive('${escapeHtml(m.user_id)}', ${!!m.active})">
          ${m.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
        </button>
        ${m.role === 'staff' ? `
          <button class="btn btn-light btn-sm" onclick="toggleMemberCanDelete('${escapeHtml(m.user_id)}', ${!!m.can_delete})">
            ${m.can_delete ? 'منع الحذف' : 'السماح بالحذف'}
          </button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="removeWorkshopMember('${escapeHtml(m.user_id)}', '${escapeHtml(m.display_name || m.email)}')">إزالة</button>
      </div>` : '';

    return `
      <div class="member-card ${isOnline && !isSelf ? 'is-online-card' : ''}">
        <div class="member-top">
          <div>
            <div class="member-name">${escapeHtml(m.display_name || 'بدون اسم')} ${isSelf ? '(أنت)' : ''}</div>
            <div class="member-email">${escapeHtml(m.email)}</div>
          </div>
          <div class="member-badges">
            ${presenceBadge}
            <span class="m-badge m-role">${getRoleLabel(m.role)}</span>
            <span class="m-badge ${m.active ? 'm-on' : 'm-off'}">${m.active ? 'مفعّل' : 'موقوف'}</span>
            ${m.role === 'staff' ? `<span class="m-badge m-neutral">${m.can_delete ? 'يحذف' : 'بدون حذف'}</span>` : ''}
          </div>
        </div>
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
      can_delete,
      active: true
    };
    let { error: memErr } = await sb.from('workshop_members').insert(memPayload);
    if (memErr && String(memErr.message || '').includes('login_password')) {
      delete memPayload.login_password;
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

async function removeWorkshopMember(uid, name) {
  if (!confirm(`هل تريد إزالة حساب "${name}" من الورشة؟ لن يتمكن من الوصول لبيانات الورشة بعد الآن.`)) return;
  const { error } = await sb.from('workshop_members').delete().eq('user_id', uid);
  if (error) return showToast(error.message);
  showToast('تمت إزالة الحساب');
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

function toggleWsCardPass(btn, wsId) {
  const el = document.getElementById('wsPassVal_' + wsId);
  if (!el) return;
  const realPass = el.getAttribute('data-pass') || '';
  if (!realPass) return;
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
    const credsBoxHtml = !isOwnWs ? `
      <div class="ws-creds-box">
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">الإيميل:</span>
          <span class="ws-cred-val">${escapeHtml(mgrEmail || '—')}</span>
          ${mgrEmail ? `<button type="button" class="ws-cred-mini-btn" onclick="copyCredentialValue('${escapeHtml(mgrEmail)}', 'الإيميل')">نسخ</button>` : ''}
        </div>
        <div class="ws-cred-row">
          <span class="ws-cred-lbl">كلمة السر:</span>
          ${mgrPass
            ? `<span class="ws-cred-val" id="wsPassVal_${safeWsId}" data-pass="${escapeHtml(mgrPass)}" data-shown="0">••••••••</span>
               <button type="button" class="ws-cred-mini-btn" onclick="toggleWsCardPass(this, '${safeWsId}')">إظهار</button>
               <button type="button" class="ws-cred-mini-btn" onclick="copyCredentialValue('${escapeHtml(mgrPass)}', 'كلمة السر')">نسخ</button>`
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

  if (!confirm(`تحذير: هل أنت متأكد من إزالة ورشة "${ws.name}" نهائياً مع جميع حساباتها وديونها؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

  showAccAlert('');
  await sb.from('debt_records').delete().eq('workshop_id', wsId);
  const { error: memDelErr } = await sb.from('workshop_members').delete().eq('workshop_id', wsId);
  if (memDelErr) {
    showAccAlert('تعذّر إزالة حسابات الورشة: ' + memDelErr.message);
    return;
  }
  const { error: wsDelErr } = await sb.from('workshops').delete().eq('id', wsId);
  if (wsDelErr) {
    showAccAlert('تعذّر إزالة الورشة: ' + wsDelErr.message);
    return;
  }

  showToast(`تمت إزالة ورشة "${ws.name}" بنجاح`);
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
