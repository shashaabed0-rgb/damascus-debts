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

const CURRENCIES = {
  USD: { symbol: '$', name: 'دولار' },
  SYP: { symbol: 'ل.س', name: 'ليرة سورية' }
};

const DEVICE_SETTINGS_KEY = 'debt_device_settings_sb_v1';

let settings = {
  shopName: 'مركز الدمشقي للصيانة',
  shopAddress: '',
  shopPhone: '',
  shopLogo: '',
  generalNote: '',
  shamCashEnabled: false,
  shamCashCode: '',
  currency: 'USD',
  whatsappApp: 'normal',
  lockEnabled: false,
  pin: '1234',
  bioEnabled: false,
  bioCredId: ''
};

let currentUser = null;
let currentProfile = null;
let currentWorkshop = null;
let realtimeChannel = null;

let allRecords = [];
let pendingQueue = [];
let groupedCustomers = [];
let visibleCustomers = [];
let currentFilter = 'all';
let currentCustomerName = null;
let editingTxId = null;
let confirmAction = null;
let txKind = 'debt';
let isUnlocked = false;
let isSyncing = false;
let allowAppExit = false;
let rootGuardArmed = false;
let tempSettingsCurrency = 'USD';
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
    settings.lockEnabled = !!dev.lockEnabled;
    settings.pin = dev.pin || '1234';
    settings.bioEnabled = !!dev.bioEnabled;
    settings.bioCredId = dev.bioCredId || '';
  } catch (e) {}
}

function persistDeviceSettings() {
  localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({
    whatsappApp: settings.whatsappApp,
    lockEnabled: settings.lockEnabled,
    pin: settings.pin,
    bioEnabled: settings.bioEnabled,
    bioCredId: settings.bioCredId
  }));
}

function applyWorkshopSettingsToState(ws) {
  const s = (ws && ws.settings && typeof ws.settings === 'object') ? ws.settings : {};
  settings.shopName = (ws && ws.name) || s.shopName || 'مركز الدمشقي للصيانة';
  settings.shopAddress = s.shopAddress || '';
  settings.shopPhone = s.shopPhone || '';
  settings.shopLogo = s.shopLogo || '';
  settings.generalNote = s.generalNote || '';
  settings.shamCashEnabled = !!s.shamCashEnabled;
  settings.shamCashCode = s.shamCashCode || '';
  settings.currency = s.currency === 'SYP' ? 'SYP' : 'USD';
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

function getCurr() { return CURRENCIES[settings.currency] || CURRENCIES.USD; }
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
  if (settings.lockEnabled && sessionStorage.getItem('debt_unlocked_v3') !== '1') {
    showLockScreen();
  } else {
    showMainView();
  }
}

function applyPermissionsUI() {
  document.getElementById('headerAccountsBtn').classList.toggle('hidden', !isAdmin());
  document.getElementById('settingsAccountsShortcut').classList.toggle('hidden', !isAdmin());
  document.getElementById('detailDeleteCustomerBtn').classList.toggle('hidden', !canDeleteRecords());
  document.getElementById('workshopAdminSettingsWrap').classList.toggle('hidden', !isAdmin());
  document.getElementById('currencySettingField').classList.toggle('hidden', !isAdmin());
}

async function handleLogout() {
  if (pendingQueue.length > 0) {
    if (!confirm(`يوجد ${pendingQueue.length} عملية لم تُرفع بعد للسحابة. هل تريد تسجيل الخروج رغم ذلك؟`)) return;
  }
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  await sb.auth.signOut();
  sessionStorage.removeItem('debt_unlocked_v3');
  currentUser = null;
  currentProfile = null;
  currentWorkshop = null;
  allRecords = [];
  pendingQueue = [];
  closeSettingsView();
  closeAccountsView();
  closeDetailView();
  showLoginScreen();
  showToast('تم تسجيل الخروج');
}

async function changeMyPassword() {
  const newPass = document.getElementById('setNewPassInput').value;
  if (newPass.length < 6) return showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  if (!navigator.onLine) return showToast('يلزم الاتصال بالإنترنت لتغيير كلمة المرور');
  const { error } = await sb.auth.updateUser({ password: newPass });
  if (error) return showToast(error.message);
  document.getElementById('setNewPassInput').value = '';
  showToast('تم تحديث كلمة المرور بنجاح');
}

// ==================== المزامنة مع Supabase والعمل أوفلاين ====================
function subscribeRealtime() {
  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
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

function closeAccountsView() {
  document.getElementById('accountsView').classList.remove('open');
  updateBodyScrollLock();
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

  const list = data || [];
  document.getElementById('membersCountLbl').textContent = `${list.length} حساب`;
  box.innerHTML = list.map(m => {
    const isSelf = m.user_id === currentUser.id;
    const isSuper = m.role === 'super_admin';
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
      <div class="member-card">
        <div class="member-top">
          <div>
            <div class="member-name">${escapeHtml(m.display_name || 'بدون اسم')} ${isSelf ? '(أنت)' : ''}</div>
            <div class="member-email">${escapeHtml(m.email)}</div>
          </div>
          <div class="member-badges">
            <span class="m-badge m-role">${getRoleLabel(m.role)}</span>
            <span class="m-badge ${m.active ? 'm-on' : 'm-off'}">${m.active ? 'مفعّل' : 'موقوف'}</span>
            ${m.role === 'staff' ? `<span class="m-badge m-neutral">${m.can_delete ? 'يحذف' : 'بدون حذف'}</span>` : ''}
          </div>
        </div>
        ${controls}
      </div>
    `;
  }).join('');
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

    const { error: memErr } = await sb.from('workshop_members').insert({
      user_id: signUpData.user.id,
      workshop_id: currentProfile.workshop_id,
      role,
      display_name,
      email,
      can_delete,
      active: true
    });
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

async function loadIsolatedWorkshops() {
  if (!isSuperAdmin()) return;
  const box = document.getElementById('workshopsListBox');
  if (!navigator.onLine) {
    box.innerHTML = '<div class="empty-box">تتطلب هذه القائمة اتصالاً بالإنترنت.</div>';
    return;
  }
  box.innerHTML = '<div class="empty-box" style="padding:24px;">جاري تحميل الورشات...</div>';
  const { data, error } = await sb.from('workshops').select('*').order('created_at', { ascending: false });
  if (error) {
    box.innerHTML = `<div class="alert-banner alert-err">${escapeHtml(error.message)}</div>`;
    return;
  }
  const list = data || [];
  document.getElementById('workshopsCountLbl').textContent = `${list.length} ورشة`;
  box.innerHTML = list.map(w => `
    <div class="member-card">
      <div class="member-top">
        <div>
          <div class="member-name">${escapeHtml(w.name)}</div>
          <div class="member-email" style="direction:rtl;">تاريخ الإنشاء: ${escapeHtml((w.created_at || '').slice(0, 10))}</div>
        </div>
        <span class="m-badge ${w.id === currentProfile.workshop_id ? 'm-role' : 'm-neutral'}">
          ${w.id === currentProfile.workshop_id ? 'ورشتك الحالية' : 'ورشة معزولة'}
        </span>
      </div>
    </div>
  `).join('');
}

async function createIsolatedWorkshop(ev) {
  ev.preventDefault();
  if (!isSuperAdmin() || !navigator.onLine) return;
  showAccAlert('');

  const btn = document.getElementById('addWorkshopSubmitBtn');
  const wsName = document.getElementById('wsNewName').value.trim();
  const adminName = document.getElementById('wsAdminName').value.trim();
  const email = document.getElementById('wsAdminEmail').value.trim().toLowerCase();
  const password = document.getElementById('wsAdminPass').value;

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
      .insert({ name: wsName })
      .select()
      .single();
    if (wsErr) throw wsErr;

    const { error: memErr } = await sb.from('workshop_members').insert({
      user_id: signUpData.user.id,
      workshop_id: wsData.id,
      role: 'admin',
      display_name: adminName,
      email,
      can_delete: true,
      active: true
    });
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
