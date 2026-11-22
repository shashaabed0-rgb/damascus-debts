// ==================== شاشة النسخ السريع لرمز شام كاش (عند الضغط على زر نسخ من PDF) ====================
let quickCopyCodeValue = '';

function showQuickCopyScreen(code, shopName) {
  quickCopyCodeValue = String(code || '').trim();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('quickCopyScreen').classList.remove('hidden');

  document.getElementById('qcShopName').textContent = shopName ? `${shopName} — شام كاش` : 'شام كاش';
  document.getElementById('qcCodeBox').textContent = quickCopyCodeValue;
  copyQuickCodeNow(true);
}

async function copyQuickCodeNow(isAuto = false) {
  const code = quickCopyCodeValue;
  const statusEl = document.getElementById('qcStatusMsg');
  const btnEl = document.getElementById('qcCopyBtn');
  if (!code) return;

  let copied = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch (e) {}
  }

  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01;font-size:16px;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, 99999);
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  if (copied) {
    statusEl.textContent = '✓ تم نسخ رمز شام كاش بنجاح! يمكنك لصقه الآن للدفع.';
    statusEl.className = 'qc-status-msg ok';
    btnEl.style.background = '#15803d';
    btnEl.innerHTML = '<span>✓ تم نسخ الرمز</span>';
  } else {
    statusEl.textContent = 'اضغط على زر «نسخ الرمز» بالأسفل لنسخ الكود فوراً';
    statusEl.className = 'qc-status-msg';
  }
}

// ==================== إدارة الصفحات والخروج بالرجوع مرتين (متوافق مع حماية Chrome) ====================
let layerStack = [];
let ignoreNextPopstate = 0;
let exitPromptActive = false;
let exitPromptTimer = null;

function armRootExitGuard() {
  if (!rootGuardArmed) {
    rootGuardArmed = true;
    try {
      history.replaceState({ appState: 'exit_ready' }, '');
    } catch (e) {}
  }
  // إذا دخل المستخدم بضغطة زر (تسجيل دخول / قفل)، نفعّل حارس الرجوع فوراً مع وجود User Activation
  if (navigator.userActivation && navigator.userActivation.isActive) {
    ensureGestureExitGuard();
  }
}

function ensureGestureExitGuard() {
  if (!isUnlocked || exitPromptActive || layerStack.length > 0) return;
  if (!history.state || history.state.appState !== 'main_guard') {
    try {
      history.replaceState({ appState: 'exit_ready' }, '');
      history.pushState({ appState: 'main_guard' }, '');
    } catch (e) {}
  }
}

// تفعيل حارس الرجوع فور أول لمسة أو تفاعل حقيقي داخل التطبيق (حتى لا يتجاهله متصفح Chrome)
['touchstart', 'pointerdown', 'keydown'].forEach(evtName => {
  window.addEventListener(evtName, () => {
    if (!isUnlocked) return;
    if (exitPromptActive) {
      hideExitPrompt();
    }
    ensureGestureExitGuard();
  }, { capture: true, passive: true });
});

function showExitPrompt(msg) {
  const box = document.getElementById('exitPromptBox');
  if (!box) return;
  exitPromptActive = true;
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(exitPromptTimer);
  exitPromptTimer = setTimeout(() => {
    hideExitPrompt();
  }, 3000);
}

function hideExitPrompt() {
  exitPromptActive = false;
  clearTimeout(exitPromptTimer);
  exitPromptTimer = null;
  const box = document.getElementById('exitPromptBox');
  if (box) box.classList.remove('show');
}

function updateBodyScrollLock() {
  const anyOpen =
    document.getElementById('sideMenuBackdrop').classList.contains('open') ||
    document.getElementById('detailView').classList.contains('open') ||
    document.getElementById('settingsView').classList.contains('open') ||
    document.getElementById('accountsView').classList.contains('open') ||
    document.getElementById('addModal').classList.contains('open') ||
    document.getElementById('editCustomerModal').classList.contains('open') ||
    document.getElementById('editWorkshopModal').classList.contains('open') ||
    document.getElementById('confirmModal').classList.contains('open') ||
    document.getElementById('aboutModal').classList.contains('open') ||
    document.getElementById('freeLimitModal').classList.contains('open') ||
    document.getElementById('auditLogView').classList.contains('open') ||
    document.getElementById('migrateFreeModal').classList.contains('open');
  document.body.classList.toggle('no-scroll', anyOpen);
}

function pushLayerHistory(name) {
  if (!name) return;
  if (layerStack.length === 0 && (!history.state || history.state.appState === 'exit_ready')) {
    try {
      history.replaceState({ appState: 'exit_ready' }, '');
      history.pushState({ appState: 'main_guard' }, '');
    } catch (e) {}
  }
  if (!layerStack.includes(name)) {
    layerStack.push(name);
    try {
      if (history.state && history.state.appState === 'layer' && history.state.depth === layerStack.length) {
        history.replaceState({ appState: 'layer', layer: name, depth: layerStack.length }, '');
      } else {
        history.pushState({ appState: 'layer', layer: name, depth: layerStack.length }, '');
      }
    } catch (e) {}
  }
}

function popLayerFromUI(name, keepHistory = false) {
  const idx = layerStack.lastIndexOf(name);
  if (idx !== -1) {
    layerStack.splice(idx, 1);
    if (!keepHistory && history.state && history.state.appState === 'layer') {
      ignoreNextPopstate++;
      try {
        history.back();
      } catch (e) {
        ignoreNextPopstate = Math.max(0, ignoreNextPopstate - 1);
      }
    }
  }
  updateBodyScrollLock();
}

function hideLayerDom(name) {
  if (name === 'sideMenu') {
    document.getElementById('sideMenuBackdrop').classList.remove('open');
  } else if (name === 'detailView') {
    document.getElementById('detailView').classList.remove('open');
    currentCustomerName = null;
  } else {
    const el = document.getElementById(name);
    if (el) el.classList.remove('open');
  }
}

function resetAllOpenLayersForLogout() {
  const openCount = layerStack.length;
  layerStack.forEach(hideLayerDom);
  layerStack = [];
  hideExitPrompt();
  updateBodyScrollLock();
  if (openCount > 0 && history.state && history.state.appState === 'layer') {
    ignoreNextPopstate++;
    try { history.go(-openCount); } catch (e) { ignoreNextPopstate = Math.max(0, ignoreNextPopstate - 1); }
  }
}

function openSideMenu() {
  document.getElementById('sideMenuBackdrop').classList.add('open');
  pushLayerHistory('sideMenu');
  updateBodyScrollLock();
}

function closeSideMenu(keepHistory = false) {
  document.getElementById('sideMenuBackdrop').classList.remove('open');
  popLayerFromUI('sideMenu', keepHistory);
}

window.addEventListener('popstate', () => {
  if (ignoreNextPopstate > 0) {
    ignoreNextPopstate--;
    return;
  }

  if (layerStack.length > 0) {
    const topLayer = layerStack.pop();
    hideLayerDom(topLayer);
    updateBodyScrollLock();
    return;
  }

  // تنظيف احتياطي في حال كانت أي طبقة مفتوحة بصرياً
  const fallbackLayers = ['sideMenu', 'migrateFreeModal', 'freeLimitModal', 'aboutModal', 'confirmModal', 'editWorkshopModal', 'editCustomerModal', 'addModal', 'auditLogView', 'accountsView', 'settingsView', 'detailView'];
  for (const id of fallbackLayers) {
    const domId = id === 'sideMenu' ? 'sideMenuBackdrop' : id;
    if (document.getElementById(domId).classList.contains('open')) {
      hideLayerDom(id);
      updateBodyScrollLock();
      return;
    }
  }

  // على الشاشة الرئيسية: أظهر مربع واضح للخروج (وعند الضغط مرة ثانية سيخرج الهاتف تلقائياً)
  if (isUnlocked) {
    const msg = pendingQueue.length > 0
      ? `يوجد ${pendingQueue.length} عملية محلية — اضغط رجوع مرة أخرى للخروج`
      : 'اضغط رجوع مرة أخرى للخروج من التطبيق';
    showExitPrompt(msg);
  }
});

function openModal(id) {
  document.getElementById(id).classList.add('open');
  pushLayerHistory(id);
  updateBodyScrollLock();
}

function closeModal(id, keepHistory = false) {
  document.getElementById(id).classList.remove('open');
  popLayerFromUI(id, keepHistory);
}

// ==================== الهوية وقفل الجهاز (اختياري) ====================
function applyBrandingUI() {
  const name = settings.shopName || 'دفتر الديون';
  document.title = `دفتر الديون - ${name}`;
  document.getElementById('headerShopName').textContent = name;
  document.getElementById('lockShopName').textContent = name;
  document.getElementById('drawerShopName').textContent = name;

  if (currentProfile) {
    const uName = currentProfile.display_name || currentProfile.email || '';
    document.getElementById('drawerUserMeta').textContent = `${uName} (${getRoleLabel(currentProfile.role)})`;
  }

  document.getElementById('headerShopSub').textContent = 'دفتر الديون';

  const hLogo = document.getElementById('headerLogo');
  const dLogo = document.getElementById('drawerLogo');
  const lLogo = document.getElementById('lockLogoImg');
  const lBadge = document.getElementById('lockDefaultBadge');
  if (settings.shopLogo) {
    hLogo.src = settings.shopLogo;
    hLogo.classList.remove('hidden');
    dLogo.src = settings.shopLogo;
    dLogo.classList.remove('hidden');
    lLogo.src = settings.shopLogo;
    lLogo.classList.remove('hidden');
    lBadge.classList.add('hidden');
  } else {
    hLogo.classList.add('hidden');
    dLogo.classList.add('hidden');
    lLogo.classList.add('hidden');
    lBadge.classList.remove('hidden');
  }
}

function showLockScreen() {
  isUnlocked = false;
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('lockErr').textContent = '';
  document.getElementById('pinInput').value = '';
  document.getElementById('unlockBioBtn').classList.toggle(
    'hidden',
    !(settings.bioEnabled && settings.bioCredId && window.PublicKeyCredential)
  );
}

document.getElementById('pinInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') unlockWithPin();
});

function unlockWithPin() {
  const val = document.getElementById('pinInput').value.trim();
  if (settings.pin && val === String(settings.pin)) {
    sessionStorage.setItem('debt_unlocked_v3', '1');
    showMainView();
  } else {
    document.getElementById('lockErr').textContent = 'الرمز السري غير صحيح';
  }
}

function lockApp() {
  if (!settings.pin) return showToast('يرجى تعيين رمز سري من الإعدادات أولاً');
  sessionStorage.removeItem('debt_unlocked_v3');
  showLockScreen();
}

function refreshDrawerToolsSection() {
  const installHidden = document.getElementById('drawerInstallBtn')?.classList.contains('hidden');
  const lockHidden = document.getElementById('drawerLockBtn')?.classList.contains('hidden');
  const hideSection = Boolean(installHidden && lockHidden);
  document.getElementById('drawerToolsDivider')?.classList.toggle('hidden', hideSection);
  document.getElementById('drawerToolsLabel')?.classList.toggle('hidden', hideSection);
}

function updateHeaderLockButton() {
  document.getElementById('drawerLockBtn').classList.toggle('hidden', !(settings.lockEnabled && settings.pin));
  refreshDrawerToolsSection();
}

function bufToBase64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function base64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function setupOrDisableBio() {
  if (settings.bioEnabled) {
    settings.bioEnabled = false;
    settings.bioCredId = '';
    persistDeviceSettings();
    refreshBioSettingsUI();
    return showToast('تم إلغاء البصمة');
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return showToast('المتصفح لا يدعم البصمة (تأكد من رابط HTTPS)');
  }
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: settings.shopName || 'دفتر الديون' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: currentProfile?.email || 'owner',
          displayName: currentProfile?.display_name || 'صاحب التطبيق'
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    settings.bioEnabled = true;
    settings.bioCredId = bufToBase64(cred.rawId);
    persistDeviceSettings();
    refreshBioSettingsUI();
    showToast('تم تفعيل الدخول بالبصمة');
  } catch (err) {
    showToast('تعذّر تفعيل البصمة (تأكد من قفل الشاشة ورابط HTTPS)');
  }
}

async function unlockWithBiometrics() {
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: base64ToBuf(settings.bioCredId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    sessionStorage.setItem('debt_unlocked_v3', '1');
    showMainView();
  } catch (err) {
    document.getElementById('lockErr').textContent = 'فشل التحقق بالبصمة، يمكنك الدخول بالكود';
  }
}

function showMainView() {
  isUnlocked = true;
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('mainView').classList.remove('hidden');
  armRootExitGuard();
  applyMainFiltersVisibility();
  processAndRender();
  if (isFreeOfflineMode()) {
    updateFreeOfflineStatusBar();
    return;
  }
  if (!navigator.onLine || !ensureSupabaseClient()) {
    showOfflineStatusBanner('بدون شبكة');
  } else {
    updateSyncStatusUI('جاري المزامنة...', 'off');
  }
  subscribeRealtime();
  syncData(false);
}

// ==================== أدوات مساعدة ====================
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function formatNum(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(s)) {
    const p = s.split(/[\/\-]/);
    return `${p[0]}/${p[1].padStart(2, '0')}/${p[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }
  return s;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function toInputDate(raw) { return formatDate(raw || todayString()).replace(/\//g, '-'); }
function fromInputDate(val) { return val ? val.replace(/-/g, '/') : todayString(); }

function isPayType(typeStr) {
  const t = String(typeStr || '');
  return t.includes('دفعة') || t.toLowerCase().includes('pay');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
}

function updateSyncStatusUI(text, state = 'ok') {
  const dotCls = state === 'off' ? 'sync-dot off' : (state === 'err' ? 'sync-dot err' : 'sync-dot');
  const pend = pendingQueue.length > 0
    ? `<span class="pending-chip">بانتظار المزامنة: ${pendingQueue.length}</span>`
    : '';
  const userChip = currentProfile
    ? `<span class="user-chip">${escapeHtml(currentProfile.display_name || currentProfile.email)}</span>`
    : '';
  document.getElementById('syncStatus').innerHTML = `<span class="${dotCls}"></span><span>${text}</span>${pend}${userChip}`;
}

// ==================== تقسيم الدورات بشكل مستقل لكل عملة (دولار / ليرة سورية) ====================
function buildCurrencyCycles(rawRecords, currencyCode) {
  const ordered = rawRecords.map((r, i) => ({
    ...r,
    currency: currencyCode,
    _ord: i,
    _normDate: formatDate(r.date)
  }));
  ordered.sort((a, b) => {
    if (a._normDate !== b._normDate) return a._normDate.localeCompare(b._normDate);
    return a._ord - b._ord;
  });

  const settledCycles = [];
  let curRecords = [];
  let running = 0;
  let curDebt = 0;
  let curPay = 0;

  ordered.forEach(r => {
    curRecords.push(r);
    if (r.kind === 'debt') { curDebt += r.amount; running += r.amount; }
    else { curPay += r.amount; running -= r.amount; }

    if (Math.abs(running) < 0.001) {
      settledCycles.push({
        currency: currencyCode,
        records: curRecords,
        totalDebt: curDebt,
        totalPay: curPay,
        balance: 0,
        startDate: curRecords[0]._normDate,
        endDate: curRecords[curRecords.length - 1]._normDate
      });
      curRecords = [];
      running = 0;
      curDebt = 0;
      curPay = 0;
    }
  });

  return {
    currency: currencyCode,
    allRecords: ordered,
    openRecords: curRecords,
    openDebt: curDebt,
    openPay: curPay,
    openBalance: running,
    settledCycles
  };
}

function finalizeCustomerCurrencies(rawRecords) {
  const enabledCodes = getEnabledCurrencyCodes();
  const split = { USD: [], SYP: [] };
  rawRecords.forEach(r => {
    const code = r.currency === 'SYP' ? 'SYP' : 'USD';
    split[code].push(r);
  });

  const rawByCurr = {
    USD: buildCurrencyCycles(split.USD, 'USD'),
    SYP: buildCurrencyCycles(split.SYP, 'SYP')
  };

  // هل يوجد رصيد مفتوح غير مسدّد في أي عملة (حتى لو تم إلغاؤها من الضبط)؟
  const anyOpenBalance = ['USD', 'SYP'].some(c => rawByCurr[c].openRecords.length > 0);

  const byCurrency = {};
  const mergedActiveRecords = [];
  const mergedArchivedCycles = [];

  ['USD', 'SYP'].forEach(code => {
    const cData = rawByCurr[code];
    const isEnabled = enabledCodes.includes(code);
    let activeRecords = [];
    let archivedCycles = [];
    let totalDebt = 0;
    let totalPay = 0;
    let balance = 0;

    if (cData.openRecords.length > 0) {
      // عملة فيها رصيد مفتوح (مفعّلة أو ملغاة): لا تُخفى أبداً لحين تسديد كامل المبلغ
      activeRecords = cData.openRecords;
      archivedCycles = cData.settledCycles;
      totalDebt = cData.openDebt;
      totalPay = cData.openPay;
      balance = cData.openBalance;
    } else if (cData.settledCycles.length > 0) {
      if (!isEnabled) {
        // عملة ملغاة وتم تسديد كامل مبلغها: تُنقل جميع دوراتها للأرشيف لتبقى ظاهرة في كشوف الأرشيف
        activeRecords = [];
        archivedCycles = cData.settledCycles;
      } else if (anyOpenBalance) {
        // العملة الأخرى مفتوحة، لذلك تُطوى كل الدورات المسدّدة لهذه العملة في الأرشيف
        activeRecords = [];
        archivedCycles = cData.settledCycles;
      } else {
        // العميل خالص بالكامل: نعرض آخر دورة مسدّدة بالعملة المفعّلة ونطوي الأقدم بالأرشيف
        const lastCyc = cData.settledCycles[cData.settledCycles.length - 1];
        activeRecords = lastCyc.records;
        archivedCycles = cData.settledCycles.slice(0, -1);
        totalDebt = lastCyc.totalDebt;
        totalPay = lastCyc.totalPay;
        balance = 0;
      }
    }

    const archivedCount = archivedCycles.reduce((acc, cyc) => acc + cyc.records.length, 0);
    byCurrency[code] = {
      currency: code,
      enabled: isEnabled,
      allRecords: cData.allRecords,
      activeRecords,
      archivedCycles,
      archivedCount,
      totalDebt,
      totalPay,
      balance
    };

    // دمج الحركات النشطة (المفعّلة + الملغاة غير المسدّدة) والأرشيف (لجميع العملات)
    activeRecords.forEach(r => mergedActiveRecords.push(r));
    archivedCycles.forEach(cyc => mergedArchivedCycles.push(cyc));
  });

  mergedActiveRecords.sort((a, b) => {
    if (a._normDate !== b._normDate) return a._normDate.localeCompare(b._normDate);
    return String(a.id).localeCompare(String(b.id));
  });

  mergedArchivedCycles.sort((a, b) => a.endDate.localeCompare(b.endDate));

  const archivedCount = mergedArchivedCycles.reduce((acc, c) => acc + c.records.length, 0);
  const hasDebt = ['USD', 'SYP'].some(c => byCurrency[c].balance > 0.001);
  const hasCredit = ['USD', 'SYP'].some(c => byCurrency[c].balance < -0.001);
  const isAllZero = ['USD', 'SYP'].every(c => Math.abs(byCurrency[c].balance) < 0.001);
  const hasDisabledOpenBalance = ['USD', 'SYP'].some(c => !enabledCodes.includes(c) && Math.abs(byCurrency[c].balance) >= 0.001);
  const hasMultipleCurrenciesHistory = ['USD', 'SYP'].filter(c => byCurrency[c].allRecords.length > 0).length > 1;

  return {
    byCurrency,
    activeRecords: mergedActiveRecords,
    archivedCycles: mergedArchivedCycles,
    archivedCount,
    hasDebt,
    hasCredit,
    isAllZero,
    hasDisabledOpenBalance,
    hasMultipleCurrenciesHistory
  };
}

// ==================== حساب الديون المتأخرة ومواعيد التسديد (v24) ====================
function parseYmdToLocalMidnight(rawDate) {
  const norm = formatDate(rawDate);
  if (!norm) return null;
  const p = norm.split('/');
  if (p.length !== 3) return null;
  const y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatArabicDays(n) {
  const num = Math.abs(Math.floor(Number(n) || 0));
  if (num === 0) return 'اليوم';
  if (num === 1) return 'يوم واحد';
  if (num === 2) return 'يومين';
  if (num >= 3 && num <= 10) return `${num} أيام`;
  return `${num} يوماً`;
}

function getCustomerDueEntry(custName) {
  const map = settings.customerDueDates || {};
  if (map[custName] && map[custName].date) return map[custName];
  const clean = cleanDisplayCustomerName(custName);
  if (clean && map[clean] && map[clean].date) return map[clean];
  return null;
}

function computeCustomerDueStatus(cust) {
  if (!cust || !cust.hasDebt) {
    return { status: 'none', isDueAlert: false, severity: 0, dueDate: '', note: '', label: '' };
  }
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const manual = getCustomerDueEntry(cust.name);

  if (manual && manual.date) {
    const dueMid = parseYmdToLocalMidnight(manual.date);
    if (dueMid) {
      const diffDays = Math.round((dueMid.getTime() - todayMid.getTime()) / 86400000);
      const dueStr = formatDate(manual.date);
      const noteStr = String(manual.note || '').trim();
      if (diffDays < 0) {
        return {
          status: 'overdue',
          isDueAlert: true,
          severity: 3,
          daysOverdue: -diffDays,
          dueDate: dueStr,
          note: noteStr,
          label: `🔴 متأخر ${formatArabicDays(-diffDays)} عن الموعد (${dueStr})`
        };
      }
      if (diffDays === 0) {
        return {
          status: 'due_today',
          isDueAlert: true,
          severity: 2,
          daysOverdue: 0,
          dueDate: dueStr,
          note: noteStr,
          label: `⏰ موعد السداد اليوم (${dueStr})`
        };
      }
      if (diffDays <= 3) {
        return {
          status: 'due_soon',
          isDueAlert: false,
          severity: 1,
          daysLeft: diffDays,
          dueDate: dueStr,
          note: noteStr,
          label: `📅 السداد خلال ${formatArabicDays(diffDays)} (${dueStr})`
        };
      }
      return {
        status: 'scheduled',
        isDueAlert: false,
        severity: 0,
        daysLeft: diffDays,
        dueDate: dueStr,
        note: noteStr,
        label: `📅 موعد السداد: ${dueStr}`
      };
    }
  }

  // فحص التأخر التلقائي بناءً على آخر حركة (أو دفعة) في الدورة المفتوحة
  const threshold = Number(settings.overdueDays);
  const maxDays = (Number.isFinite(threshold) && threshold >= 0) ? threshold : 30;
  if (maxDays > 0 && cust.activeRecords && cust.activeRecords.length > 0) {
    const lastRec = cust.activeRecords[cust.activeRecords.length - 1];
    const lastDateStr = formatDate(lastRec.date);
    const lastMid = parseYmdToLocalMidnight(lastDateStr);
    if (lastMid) {
      const elapsed = Math.floor((todayMid.getTime() - lastMid.getTime()) / 86400000);
      if (elapsed >= maxDays) {
        return {
          status: 'stale_overdue',
          isDueAlert: true,
          severity: 2,
          daysOverdue: elapsed,
          lastDate: lastDateStr,
          dueDate: '',
          note: '',
          label: `⏳ متأخر بالسداد منذ ${formatArabicDays(elapsed)}`
        };
      }
    }
  }

  return { status: 'none', isDueAlert: false, severity: 0, dueDate: '', note: '', label: '' };
}

function getDueControlIds(prefix) {
  if (prefix === 'edit') {
    return {
      dateId: 'editCustDueDate',
      noteId: 'editCustDueNote',
      noteWrapId: 'editDueNoteWrap',
      textId: 'editDueSelectedText',
      clearBtnId: 'editDueClearBtn',
      chipsId: 'editDueChips',
      calBtnId: 'editDueCalBtn'
    };
  }
  return {
    dateId: 'txDueDate',
    noteId: 'txDueNote',
    noteWrapId: 'txDueNoteWrap',
    textId: 'txDueSelectedText',
    clearBtnId: 'txDueClearBtn',
    chipsId: 'txDueChips',
    calBtnId: 'txDueCalBtn'
  };
}

function openNativeDatePickerEl(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === 'function') {
      inputEl.showPicker();
    }
  } catch (e) {}
}

function openDueCalendarByPrefix(prefix) {
  const ids = getDueControlIds(prefix);
  const dateEl = document.getElementById(ids.dateId);
  if (!dateEl) return;
  try {
    if (typeof dateEl.showPicker === 'function') {
      dateEl.showPicker();
      return;
    }
  } catch (e) {}
  try {
    dateEl.focus();
    dateEl.click();
  } catch (e) {}
}

function updateDueControlUI(prefix, activeDays = null) {
  const ids = getDueControlIds(prefix);
  const dateEl = document.getElementById(ids.dateId);
  const noteWrap = document.getElementById(ids.noteWrapId);
  const textEl = document.getElementById(ids.textId);
  const clearBtn = document.getElementById(ids.clearBtnId);
  const calBtn = document.getElementById(ids.calBtnId);
  const chipsWrap = document.getElementById(ids.chipsId);

  const val = dateEl ? String(dateEl.value || '').trim() : '';
  const hasVal = Boolean(val);
  if (textEl) {
    textEl.textContent = hasVal ? fromInputDate(val) : 'بدون موعد محدد';
    textEl.classList.toggle('is-empty', !hasVal);
  }
  if (clearBtn) clearBtn.classList.toggle('hidden', !hasVal);
  if (calBtn) calBtn.classList.toggle('has-date', hasVal);
  if (noteWrap) noteWrap.classList.toggle('hidden', !hasVal);
  if (chipsWrap) {
    chipsWrap.querySelectorAll('.due-chip-btn').forEach(btn => {
      const d = Number(btn.getAttribute('data-days'));
      btn.classList.toggle('active', hasVal && activeDays !== null && d === Number(activeDays));
    });
  }
}

function selectQuickDueChip(prefix, daysToAdd, btn) {
  if (btn && btn.classList.contains('active')) {
    clearDueControl(prefix);
    return;
  }
  const ids = getDueControlIds(prefix);
  const dateEl = document.getElementById(ids.dateId);
  if (!dateEl) return;
  const d = new Date();
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  dateEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  updateDueControlUI(prefix, Number(daysToAdd));
}

function onNativeDueDatePicked(prefix) {
  updateDueControlUI(prefix, null);
}

function clearDueControl(prefix) {
  const ids = getDueControlIds(prefix);
  const dateEl = document.getElementById(ids.dateId);
  const noteEl = document.getElementById(ids.noteId);
  if (dateEl) dateEl.value = '';
  if (noteEl) noteEl.value = '';
  updateDueControlUI(prefix, null);
}

// ==================== معالجة وعرض الزبائن ====================
function processAndRender() {
  const dual = isDualCurrencyMode();
  const singleCurr = getCurr();

  const pendingAddIds = new Set(
    pendingQueue.filter(q => q.action === 'upsert' || q.action === 'add').map(q => String(q.payload.id))
  );
  const map = {};

  allRecords.forEach(r => {
    const name = String(r.name || '').trim();
    if (!name) return;
    if (!map[name]) map[name] = { name, phone: '', rawRecords: [], hasStubPending: false };
    if (r.phone && String(r.phone).trim()) {
      map[name].phone = normalizeLocalPhoneInput(r.phone);
    }
    if (isCustomerStubRecord(r)) {
      if (pendingAddIds.has(String(r.id))) map[name].hasStubPending = true;
      return;
    }
    const kind = isPayType(r.type) ? 'pay' : 'debt';
    const currency = getRecordCurrency(r);
    const amt = Number(r.amount) || 0;
    map[name].rawRecords.push({
      ...r,
      kind,
      currency,
      amount: amt,
      pending: pendingAddIds.has(String(r.id))
    });
  });

  const tempList = Object.values(map).map(entry => {
    const summary = finalizeCustomerCurrencies(entry.rawRecords);
    const item = {
      name: entry.name,
      phone: entry.phone,
      records: entry.rawRecords,
      hasNoTransactions: entry.rawRecords.length === 0,
      hasStubPending: entry.hasStubPending,
      conflictGroupKey: getConflictBaseKey(entry.name),
      isDuplicateConflict: false,
      conflictPeers: [],
      ...summary
    };
    item.dueInfo = computeCustomerDueStatus(item);
    return item;
  });

  // كشف الأسماء المتطابقة / المتشابهة (سواء المضافة أوفلاين أو المتشابهة إملائياً) لإظهارها معاً بعلامة تعديل
  const conflictGroups = new Map();
  tempList.forEach(c => {
    if (!c.conflictGroupKey) return;
    if (!conflictGroups.has(c.conflictGroupKey)) conflictGroups.set(c.conflictGroupKey, []);
    conflictGroups.get(c.conflictGroupKey).push(c);
  });

  conflictGroups.forEach(group => {
    if (group.length >= 2) {
      group.forEach(c => {
        c.isDuplicateConflict = true;
        c.conflictPeers = group.filter(x => x.name !== c.name).map(x => x.name);
      });
    }
  });

  groupedCustomers = tempList.sort((a, b) => {
    const aDup = a.isDuplicateConflict ? 1 : 0;
    const bDup = b.isDuplicateConflict ? 1 : 0;
    if (bDup !== aDup) return bDup - aDup;
    if (aDup && bDup && a.conflictGroupKey !== b.conflictGroupKey) {
      return a.conflictGroupKey.localeCompare(b.conflictGroupKey, 'ar');
    }
    const aHas = a.hasDebt ? 1 : 0;
    const bHas = b.hasDebt ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return a.name.localeCompare(b.name, 'ar');
  });

  updateDuplicateConflictBannerUI();
  updateDueReminderBannerUI();

  let grandUsd = 0;
  let grandSyp = 0;
  let indebtedCount = 0;

  groupedCustomers.forEach(c => {
    if (c.byCurrency.USD.balance > 0.001) grandUsd += c.byCurrency.USD.balance;
    if (c.byCurrency.SYP.balance > 0.001) grandSyp += c.byCurrency.SYP.balance;
    if (c.hasDebt) indebtedCount++;
  });

  // إذا كانت العملة الملغاة ما زال عليها ديون غير مسدّدة، نظهرها في الإجمالي لحين تسديدها
  const disabledHasDebt = (!dual) && ((settings.currency === 'USD' && grandSyp > 0.001) || (settings.currency === 'SYP' && grandUsd > 0.001));
  const showDualSummary = dual || disabledHasDebt;

  if (showDualSummary) {
    document.getElementById('activeCurrName').textContent = dual ? 'العملتين' : `${singleCurr.name} + أرصدة قيد التسديد`;
    document.getElementById('totalDebtVal').classList.add('hidden');
    document.getElementById('totalDebtDual').classList.remove('hidden');
    document.getElementById('totalDebtUsd').textContent = `${formatNum(grandUsd)} $`;
    document.getElementById('totalDebtSyp').textContent = `${formatNum(grandSyp)} ل.س`;
  } else {
    document.getElementById('activeCurrName').textContent = singleCurr.name;
    document.getElementById('totalDebtVal').classList.remove('hidden');
    document.getElementById('totalDebtDual').classList.add('hidden');
    const grandVal = settings.currency === 'SYP' ? grandSyp : grandUsd;
    document.getElementById('totalDebtVal').textContent = `${formatNum(grandVal)} ${singleCurr.symbol}`;
  }

  document.getElementById('indebtedCount').textContent = indebtedCount;
  const dlEl = document.getElementById('customersDatalist');
  if (dlEl) dlEl.innerHTML = '';

  renderCustomers();
  if (isFreeOfflineMode()) updateFreeOfflineStatusBar();
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('#mainFilterTabs .seg-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCustomers();
}

function applyMainFiltersVisibility() {
  const show = !!settings.showMainFilters;
  const el = document.getElementById('mainFilterTabs');
  if (el) el.classList.toggle('hidden', !show);
  if (!show && currentFilter !== 'all') {
    currentFilter = 'all';
    const btns = document.querySelectorAll('#mainFilterTabs .seg-btn');
    btns.forEach((b, idx) => b.classList.toggle('active', idx === 0));
    renderCustomers();
  }
}

function toggleShowFiltersSetting(checked) {
  settings.showMainFilters = !!checked;
  persistDeviceSettings();
  applyMainFiltersVisibility();
  showToast(settings.showMainFilters ? 'تم إظهار التصنيفات في الواجهة الرئيسية' : 'تم إخفاء التصنيفات من الواجهة الرئيسية');
}

function buildCustomerBalancePillsHtml(c) {
  const pills = [];

  ['USD', 'SYP'].forEach(code => {
    const bal = c.byCurrency[code].balance;
    const unit = code === 'USD' ? 'دولار' : 'ليرة سوري';
    if (bal > 0.001) {
      pills.push(`<span class="bal-pill bal-debt"><span class="num-ltr">${formatNum(bal)}</span><span>${unit}</span></span>`);
    } else if (bal < -0.001) {
      pills.push(`<span class="bal-pill bal-credit"><span>له</span><span class="num-ltr">${formatNum(Math.abs(bal))}</span><span>${unit}</span></span>`);
    }
  });

  if (pills.length === 0) {
    return c.hasNoTransactions
      ? `<span class="bal-pill bal-zero">بدون حركات</span>`
      : `<span class="bal-pill bal-zero">خالص</span>`;
  }
  if (pills.length === 1) return pills[0];
  return `<div class="bal-stack">${pills.join('')}</div>`;
}

let showConflictsOnly = false;
let showOverdueOnly = false;

function updateDueReminderBannerUI() {
  const banner = document.getElementById('dueReminderBanner');
  if (!banner) return;
  const alertList = groupedCustomers.filter(c => c.dueInfo && c.dueInfo.isDueAlert);
  const soonList = groupedCustomers.filter(c => c.dueInfo && c.dueInfo.status === 'due_soon');
  if (alertList.length === 0) {
    showOverdueOnly = false;
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  const soonTxt = soonList.length > 0 ? ` • وقريب الاستحقاق: ${soonList.length}` : '';
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div>⏰ تذكير بالديون المتأخرة والمستحقة (${alertList.length} زبون${soonTxt})</div>
    <button type="button" class="due-banner-btn" onclick="toggleOverdueOnlyFilter()">
      ${showOverdueOnly ? 'عرض كل الزبائن' : 'عرض المتأخرين فقط'}
    </button>
  `;
}

function toggleOverdueOnlyFilter() {
  showOverdueOnly = !showOverdueOnly;
  if (showOverdueOnly) showConflictsOnly = false;
  updateDuplicateConflictBannerUI();
  updateDueReminderBannerUI();
  renderCustomers();
}

function updateDuplicateConflictBannerUI() {
  const banner = document.getElementById('duplicateConflictBanner');
  if (!banner) return;
  const dupList = groupedCustomers.filter(c => c.isDuplicateConflict);
  if (dupList.length === 0) {
    showConflictsOnly = false;
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div>⚠️ يوجد أسماء متطابقة/متشابهة (${dupList.length} حساب) — ظهرت معاً بالأسفل لتعديل أحدها</div>
    <button type="button" class="dup-banner-btn" onclick="toggleConflictsOnlyFilter()">
      ${showConflictsOnly ? 'عرض كل الزبائن' : 'عرض المتشابهة فقط'}
    </button>
  `;
}

function toggleConflictsOnlyFilter() {
  showConflictsOnly = !showConflictsOnly;
  updateDuplicateConflictBannerUI();
  renderCustomers();
}

function renderCustomers() {
  const q = normalizeDigits(document.getElementById('searchInput').value).trim().toLowerCase();

  visibleCustomers = groupedCustomers.filter(c => {
    if (showConflictsOnly && !c.isDuplicateConflict) return false;
    if (showOverdueOnly && !(c.dueInfo && c.dueInfo.isDueAlert)) return false;
    const normPhone = normalizeDigits(c.phone || '').toLowerCase();
    const dispName = cleanDisplayCustomerName(c.name);
    const matches = !q || dispName.toLowerCase().includes(q) || normPhone.includes(q);
    if (!matches) return false;
    if (currentFilter === 'debt') return c.hasDebt;
    if (currentFilter === 'zero') return c.isAllZero;
    return true;
  });

  const listEl = document.getElementById('customerList');
  if (visibleCustomers.length === 0) {
    listEl.innerHTML = `<div class="empty-box">لا توجد حسابات مطابقة.<br><small>اضغط على "عملية جديدة" لتسجيل أول دين.</small></div>`;
    return;
  }

  listEl.innerHTML = visibleCustomers.map((c, idx) => {
    const dispName = cleanDisplayCustomerName(c.name);
    const initial = dispName.charAt(0) || c.name.charAt(0);
    const pendMark = (c.records.some(r => r.pending) || c.hasStubPending) ? ' • محلي' : '';
    const metaParts = c.hasNoTransactions
      ? [c.phone, 'بدون حركات']
      : [c.phone, `${c.activeRecords.length} حركة حالية`];
    if (c.archivedCount > 0) metaParts.push(`${c.archivedCount} بالأرشيف`);
    const meta = metaParts.filter(Boolean).join(' • ') + pendMark;
    const encName = encodeURIComponent(c.name);
    const dupRowHtml = c.isDuplicateConflict
      ? `<div class="dup-tag-row">
           <span class="dup-badge">⚠️ اسم مكرر — عدّل الاسم</span>
           <button type="button" class="dup-edit-btn" onclick="event.stopPropagation(); openEditCustomerModalByName('${encName}')">تعديل الاسم</button>
         </div>`
      : '';

    const due = c.dueInfo || { status: 'none' };
    let dueCls = '';
    let dueRowHtml = '';
    if (due.status && due.status !== 'none') {
      const badgeCls = due.status === 'overdue' || due.status === 'stale_overdue'
        ? 'overdue'
        : (due.status === 'due_today' ? 'due-today' : (due.status === 'due_soon' ? 'due-soon' : 'scheduled'));
      if (!c.isDuplicateConflict) {
        if (due.status === 'overdue' || due.status === 'stale_overdue') dueCls = ' is-overdue-card';
        else if (due.status === 'due_today') dueCls = ' is-duetoday-card';
      }
      const remindBtnHtml = due.isDueAlert
        ? `<button type="button" class="due-remind-btn" onclick="event.stopPropagation(); sendOverdueWhatsAppReminder('${encName}')">تذكير واتساب</button>`
        : '';
      dueRowHtml = `<div class="due-tag-row">
        <span class="due-badge ${badgeCls}">${escapeHtml(due.label)}</span>
        ${remindBtnHtml}
      </div>`;
    }

    return `
      <div class="cust-card${c.isDuplicateConflict ? ' is-dup-card' : ''}${dueCls}" onclick="openCustomerDetail(${idx})">
        <div class="cust-left">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div style="min-width:0;">
            <div class="cust-name">${escapeHtml(dispName)}</div>
            <div class="cust-meta">${escapeHtml(meta)}</div>
            ${dupRowHtml}
            ${dueRowHtml}
          </div>
        </div>
        ${buildCustomerBalancePillsHtml(c)}
      </div>
    `;
  }).join('');
}

// ==================== صفحة ملف الزبون ودرج الأرشيف ====================
function openCustomerDetail(idx) {
  const cust = visibleCustomers[idx];
  if (!cust) return;
  currentCustomerName = cust.name;
  document.getElementById('archiveDrawer').classList.remove('open');
  renderCustomerDetail(cust.name);
  document.getElementById('detailView').classList.add('open');
  document.getElementById('detailView').scrollTop = 0;
  updateBodyScrollLock();
  pushLayerHistory('detailView');
}

function closeDetailView(keepHistory = false) {
  document.getElementById('detailView').classList.remove('open');
  currentCustomerName = null;
  popLayerFromUI('detailView', keepHistory);
}

function toggleArchiveDrawer() {
  document.getElementById('archiveDrawer').classList.toggle('open');
}

function formatDetailBalanceHtml(balance, symbol) {
  if (Math.abs(balance) < 0.001) return `<span style="color:var(--muted)">0 ${symbol}</span>`;
  if (balance > 0) return `<span style="color:var(--danger)">${formatNum(balance)} ${symbol}</span>`;
  return `<span style="color:var(--success)">له ${formatNum(Math.abs(balance))} ${symbol}</span>`;
}

function renderDetailSummaryCards(cust) {
  const wrap = document.getElementById('detailStatsWrap');
  const enabled = getEnabledCurrencyCodes();
  const displayCodes = ['USD', 'SYP'].filter(code => cust.byCurrency[code].activeRecords.length > 0);
  const codesToShow = displayCodes.length > 0 ? displayCodes : [enabled[0]];

  const rowsHtml = codesToShow.map(code => {
    const info = cust.byCurrency[code];
    const curr = getCurr(code);
    const pillCls = code === 'USD' ? 'usd' : 'syp';
    const labelTxt = code === 'USD' ? 'دولار' : 'ليرة سوري';

    let balCls = 'bal-zero';
    let balVal = '0';
    if (info.balance > 0.001) {
      balCls = 'bal-pos';
      balVal = formatNum(info.balance);
    } else if (info.balance < -0.001) {
      balCls = 'bal-neg';
      balVal = `له ${formatNum(Math.abs(info.balance))}`;
    }

    return `
      <div class="unified-stats-row">
        <div class="unified-curr-cell">
          <span class="unified-curr-pill ${pillCls}">${labelTxt}</span>
        </div>
        <div class="unified-num debt">${formatNum(info.totalDebt)}</div>
        <div class="unified-num pay">${formatNum(info.totalPay)}</div>
        <div class="unified-num ${balCls}">${balVal}</div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="unified-stats-card">
      <div class="unified-stats-head">
        <span>العملة</span>
        <span>إجمالي الدين</span>
        <span>المدفوع</span>
        <span>المتبقي</span>
      </div>
      ${rowsHtml}
    </div>
  `;
}

function renderTxCardHtml(r, isArchived = false, showCurrencyChip = false) {
  const code = r.currency || getRecordCurrency(r);
  const curr = getCurr(code);
  const sign = r.kind === 'debt' ? '+' : '−';
  const lbl = r.kind === 'debt' ? 'دين' : 'دفعة';
  const safeId = escapeHtml(r.id);
  const byTxt = r.created_by ? ` • ${escapeHtml(r.created_by)}` : '';
  const currBadgeHtml = `<span class="curr-chip ${code === 'USD' ? 'curr-usd' : 'curr-syp'}">${code === 'USD' ? 'دولار' : 'ليرة سوري'}</span>`;
  const delBtnHtml = canDeleteRecords()
    ? `<button class="tx-btn del" title="حذف" onclick="askDeleteTx('${safeId}')">
         <svg class="ic ic-sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
       </button>`
    : '';

  return `
    <div class="tx-card ${r.kind}${isArchived ? ' archived' : ''}">
      <div class="tx-info">
        <div class="tx-top">
          <span class="tx-tag ${r.kind}">${lbl}</span>
          ${currBadgeHtml}
          <span class="tx-date">${escapeHtml(formatDate(r.date))}${byTxt}${r.pending ? ' • محلي' : ''}</span>
        </div>
        ${r.note ? `<div class="tx-note">${escapeHtml(r.note)}</div>` : ''}
      </div>
      <div class="tx-right">
        <div class="tx-amt" style="color:${r.kind === 'debt' ? 'var(--danger)' : 'var(--success)'};"><span class="num-ltr">${sign}${formatNum(r.amount)}</span><span>${curr.symbol}</span></div>
        <button class="tx-btn edit" title="تعديل" onclick="openEditTxModal('${safeId}')">
          <svg class="ic ic-sm" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        ${delBtnHtml}
      </div>
    </div>
  `;
}

function renderCustomerDetail(name) {
  const cust = groupedCustomers.find(c => c.name === name);
  if (!cust) return closeDetailView();

  document.getElementById('detailName').textContent = cleanDisplayCustomerName(cust.name);
  document.getElementById('detailPhone').textContent = cust.phone ? cust.phone : 'بدون رقم هاتف';

  const detDupBanner = document.getElementById('detailDupBanner');
  if (detDupBanner) {
    if (cust.isDuplicateConflict) {
      const peersTxt = (cust.conflictPeers || []).map(p => escapeHtml(cleanDisplayCustomerName(p))).join('، ');
      detDupBanner.classList.remove('hidden');
      detDupBanner.innerHTML = `
        <div>⚠️ هذا الاسم مطابق/مشابه لـ «<strong>${peersTxt}</strong>» — يرجى تعديل أحد الاسمين للتمييز بينهما.</div>
        <button type="button" class="dup-banner-btn" onclick="openEditCustomerModal()">تعديل الاسم</button>
      `;
    } else {
      detDupBanner.classList.add('hidden');
      detDupBanner.innerHTML = '';
    }
  }
  document.getElementById('activeSectionTitle').textContent =
    cust.archivedCount > 0 ? 'الحركات الحالية (تُدرج في كشف PDF)' : 'سجل الحركات';
  document.getElementById('detailTxCount').textContent = `${cust.activeRecords.length} حركة`;

  renderDetailSummaryCards(cust);

  const showCurrChips = isDualCurrencyMode() || cust.hasDisabledOpenBalance || cust.hasMultipleCurrenciesHistory;
  const activeList = [...cust.activeRecords].reverse();
  document.getElementById('detailTxList').innerHTML = activeList.length > 0
    ? activeList.map(r => renderTxCardHtml(r, false, showCurrChips)).join('')
    : '<div class="empty-box" style="padding:24px;">لا توجد حركات لهذا الزبون حالياً.<br><small>يمكنك تسجيل دين أو دفعة جديدة من الأزرار أعلاه.</small></div>';

  const drawer = document.getElementById('archiveDrawer');
  if (cust.archivedCycles.length > 0) {
    drawer.classList.remove('hidden');
    document.getElementById('archiveCountBadge').textContent = `${cust.archivedCount} حركة`;
    const archHtml = [...cust.archivedCycles].reverse().map((cyc, idx) => {
      const cycleNum = cust.archivedCycles.length - idx;
      const cycCurr = getCurr(cyc.currency);
      const range = cyc.startDate === cyc.endDate ? cyc.endDate : `${cyc.startDate} ← ${cyc.endDate}`;
      const rows = [...cyc.records].reverse().map(r => renderTxCardHtml(r, true, showCurrChips)).join('');
      const currTag = showCurrChips ? ` • ${cycCurr.short}` : '';
      return `
        <div class="cycle-divider">
          <span>حساب سابق #${cycleNum}${currTag} (${escapeHtml(range)})</span>
          <span class="cycle-settled-tag">مسدّد (${formatNum(cyc.totalDebt)} ${cycCurr.symbol})</span>
        </div>
        ${rows}
      `;
    }).join('');
    const fullPdfBtnHtml = `
      <div class="archive-export-bar">
        <button type="button" class="btn btn-pdf archive-pdf-btn" onclick="exportCustomerPDF(true)">
          <svg class="ic ic-sm" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>إرسال كشف شامل PDF (الأرشيف + الحالية)</span>
        </button>
      </div>
    `;
    document.getElementById('archiveBody').innerHTML = fullPdfBtnHtml + archHtml;
  } else {
    drawer.classList.add('hidden');
    drawer.classList.remove('open');
  }
}

// ==================== إضافة / تعديل حركة ====================
function setTxCurrency(code) {
  txCurrency = code === 'SYP' ? 'SYP' : 'USD';
  lastUsedTxCurrency = txCurrency;
  document.getElementById('txCurrLabel').textContent = getCurr(txCurrency).symbol;
  document.getElementById('btnCurrUsd').className = 'tx-curr-btn' + (txCurrency === 'USD' ? ' on-usd' : '');
  document.getElementById('btnCurrSyp').className = 'tx-curr-btn' + (txCurrency === 'SYP' ? ' on-syp' : '');
}

function updateTxCurrencyPickerVisibility(forceShow = false) {
  const show = forceShow || isDualCurrencyMode();
  document.getElementById('txCurrSwitch').classList.toggle('hidden', !show);
}

let txOriginCustomerName = '';
let txOriginDisplayName = '';
let txOriginCustomerPhone = '';

function normalizeArabicNameForCompare(str) {
  return normalizeDigits(String(str || ''))
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function findSimilarCustomer(rawName, excludeExactName = null) {
  const norm = normalizeArabicNameForCompare(rawName);
  if (!norm) return null;
  const normNoSpace = norm.replace(/\s+/g, '');
  const excludeTrim = excludeExactName ? String(excludeExactName).trim() : null;

  const baseNoSpace = getConflictBaseKey(rawName);
  for (const c of groupedCustomers) {
    const cName = String(c.name || '').trim();
    if (excludeTrim && cName === excludeTrim) continue;
    const cNorm = normalizeArabicNameForCompare(cName);
    if (!cNorm) continue;
    const cNoSpace = cNorm.replace(/\s+/g, '');
    const cBase = getConflictBaseKey(cName);
    if (cNorm === norm || cNoSpace === normNoSpace || (baseNoSpace && cBase === baseNoSpace)) {
      return c;
    }
  }
  return null;
}

function openExistingCustomerFromDup(encodedName) {
  const targetName = decodeURIComponent(encodedName || '');
  if (!targetName) return;
  closeModal('addModal');
  currentCustomerName = targetName;
  document.getElementById('archiveDrawer').classList.remove('open');
  renderCustomerDetail(targetName);
  document.getElementById('detailView').classList.add('open');
  document.getElementById('detailView').scrollTop = 0;
  updateBodyScrollLock();
  pushLayerHistory('detailView');
}

function checkDuplicateTxName() {
  const inp = document.getElementById('txName');
  const warnEl = document.getElementById('txNameDupWarn');
  if (!inp || !warnEl) return null;

  const val = inp.value.trim();
  const match = findSimilarCustomer(val, txOriginCustomerName || null);
  if (match) {
    const enc = encodeURIComponent(match.name);
    const matchDisp = cleanDisplayCustomerName(match.name);
    warnEl.innerHTML = `
      <div><strong>لا يمكن التثبيت:</strong> يوجد زبون باسم مطابق أو مشابه «<strong>${escapeHtml(matchDisp)}</strong>». يرجى تعديل الاسم للتمييز بينهما.</div>
      ${!editingTxId ? `<button type="button" class="btn btn-light btn-sm" style="margin-top:6px;width:auto;" onclick="openExistingCustomerFromDup('${enc}')">فتح ملف «${escapeHtml(matchDisp)}» بدلاً من ذلك</button>` : ''}
    `;
    warnEl.classList.remove('hidden');
    inp.style.borderColor = 'var(--danger)';
    return match;
  }

  warnEl.classList.add('hidden');
  warnEl.innerHTML = '';
  inp.style.borderColor = '';
  return null;
}

function onTxNameInput() {
  // عدم جلب رقم الهاتف أو أي بيانات من أي اسم قديم عند التكرار أو تغيير الاسم
  const nameVal = cleanCustomerNameInput(document.getElementById('txName').value);
  const phoneEl = document.getElementById('txPhone');
  if (txOriginCustomerName && phoneEl) {
    const curPhone = normalizeLocalPhoneInput(phoneEl.value);
    if (nameVal !== txOriginDisplayName && txOriginCustomerPhone && curPhone === txOriginCustomerPhone) {
      phoneEl.value = '';
    }
  }
  checkDuplicateTxName();
}

function checkDuplicateEditCustName() {
  const inp = document.getElementById('editCustNameInput');
  const warnEl = document.getElementById('editCustDupWarn');
  if (!inp || !warnEl) return null;

  const val = inp.value.trim();
  const match = findSimilarCustomer(val, editingCustomerTargetName || currentCustomerName || null);
  if (match) {
    warnEl.innerHTML = `<strong>لا يمكن التثبيت:</strong> يوجد زبون آخر باسم مطابق أو مشابه «<strong>${escapeHtml(cleanDisplayCustomerName(match.name))}</strong>». يرجى تغيير الاسم أولاً.`;
    warnEl.classList.remove('hidden');
    inp.style.borderColor = 'var(--danger)';
    return match;
  }

  warnEl.classList.add('hidden');
  warnEl.innerHTML = '';
  inp.style.borderColor = '';
  return null;
}

function openFreeLimitModal() {
  const phone = ((APP_META && APP_META.developerPhone) || '0994373742').trim();
  const cleanTel = phone.replace(/[^\d+]/g, '');
  const waNum = formatPhoneForWa(phone);
  const waMsg = encodeURIComponent('السلام عليكم، أرغب بالاشتراك في النسخة السحابية لتطبيق دفتر الديون (أكثر من 25 زبون).');
  const cLink = document.getElementById('limitCallLink');
  const wLink = document.getElementById('limitWaLink');
  if (cLink) cLink.href = `tel:${cleanTel}`;
  if (wLink) wLink.href = waNum ? `https://wa.me/${waNum}?text=${waMsg}` : '#';
  openModal('freeLimitModal');
}

function wouldExceedFreeCustomerLimit(candidateName, replacingOldName = null) {
  if (!isFreeOfflineMode()) return false;
  const cleanNew = cleanDisplayCustomerName(candidateName);
  if (!cleanNew) return false;
  const existingNames = new Set(groupedCustomers.map(c => c.name));
  if (replacingOldName && existingNames.has(replacingOldName)) {
    // إعادة تسمية زبون موجود لا تزيد عدد الزبائن
    return false;
  }
  if (existingNames.has(candidateName)) return false;
  return existingNames.size >= FREE_OFFLINE_MAX_CUSTOMERS;
}

function openAddModal(prefillName = '', prefillPhone = '', defaultKind = 'debt', preferredCurrency = null, allowCurrSwitch = false) {
  if (!prefillName && isFreeOfflineMode() && groupedCustomers.length >= FREE_OFFLINE_MAX_CUSTOMERS) {
    openFreeLimitModal();
    return;
  }
  editingTxId = null;
  txOriginCustomerName = String(prefillName || '').trim();
  txOriginDisplayName = cleanDisplayCustomerName(txOriginCustomerName);
  txOriginCustomerPhone = txOriginCustomerName ? normalizeLocalPhoneInput(prefillPhone) : '';
  document.getElementById('txModalTitle').textContent = 'تسجيل عملية جديدة';
  document.getElementById('saveTxBtn').textContent = 'حفظ العملية';
  document.getElementById('txName').value = txOriginDisplayName;
  document.getElementById('txPhone').value = txOriginCustomerPhone;
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';
  document.getElementById('txDate').value = toInputDate(todayString());
  document.getElementById('txDateField').classList.add('hidden');
  clearDueControl('tx');
  checkDuplicateTxName();

  const initialCurr = (isDualCurrencyMode() || allowCurrSwitch)
    ? (preferredCurrency || lastUsedTxCurrency || (settings.currency === 'SYP' ? 'SYP' : 'USD'))
    : (settings.currency === 'SYP' ? 'SYP' : 'USD');
  setTxCurrency(initialCurr);
  updateTxCurrencyPickerVisibility(allowCurrSwitch);

  setTxKind(defaultKind);
  openModal('addModal');
  setTimeout(() => {
    if (prefillName) document.getElementById('txAmount').focus();
    else document.getElementById('txName').focus();
  }, 120);
}

function openEditTxModal(id) {
  const rec = allRecords.find(r => String(r.id) === String(id));
  if (!rec) return;
  editingTxId = String(rec.id);
  txOriginCustomerName = String(rec.name || '').trim();
  txOriginDisplayName = cleanDisplayCustomerName(txOriginCustomerName);
  txOriginCustomerPhone = normalizeLocalPhoneInput(rec.phone || '');
  document.getElementById('txModalTitle').textContent = 'تعديل الحركة';
  document.getElementById('saveTxBtn').textContent = 'حفظ التعديل';
  document.getElementById('txName').value = txOriginDisplayName;
  document.getElementById('txPhone').value = txOriginCustomerPhone;
  document.getElementById('txAmount').value = rec.amount || '';
  document.getElementById('txNote').value = rec.note || '';
  document.getElementById('txDate').value = toInputDate(rec.date);
  document.getElementById('txDateField').classList.remove('hidden');
  clearDueControl('tx');
  checkDuplicateTxName();

  const recCurr = getRecordCurrency(rec);
  setTxCurrency(recCurr);
  updateTxCurrencyPickerVisibility(isDualCurrencyMode() || recCurr !== settings.currency);

  setTxKind(isPayType(rec.type) ? 'pay' : 'debt');
  openModal('addModal');
}

function quickAddForCurrent(kind) {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  let prefCurr = null;
  const hasUsd = Math.abs(cust.byCurrency.USD.balance) > 0.001;
  const hasSyp = Math.abs(cust.byCurrency.SYP.balance) > 0.001;
  // إذا كان على الزبون رصيد غير مسدّد بالعملة الملغاة، نسمح باختيار العملة لتسديد المبلغ
  const allowSwitch = isDualCurrencyMode() || cust.hasDisabledOpenBalance;
  if (allowSwitch) {
    if (kind === 'pay') {
      if (hasSyp && !hasUsd) prefCurr = 'SYP';
      else if (hasUsd && !hasSyp) prefCurr = 'USD';
      else if (cust.hasDisabledOpenBalance) prefCurr = settings.currency === 'USD' ? 'SYP' : 'USD';
    } else {
      if (isDualCurrencyMode()) {
        if (hasSyp && !hasUsd) prefCurr = 'SYP';
        else if (hasUsd && !hasSyp) prefCurr = 'USD';
      } else {
        prefCurr = settings.currency === 'SYP' ? 'SYP' : 'USD';
      }
    }
  }
  openAddModal(cust.name, cust.phone, kind, prefCurr, allowSwitch);
}

// تم تعطيل التعبئة التلقائية من الأسماء القديمة لمنع انتقال رقم الهاتف أو الحركات عند تكرار الاسم

function setTxKind(k) {
  txKind = k;
  document.getElementById('btnKindDebt').className = 'tog-btn' + (k === 'debt' ? ' on-debt' : '');
  document.getElementById('btnKindPay').className = 'tog-btn' + (k === 'pay' ? ' on-pay' : '');
  const dueWrap = document.getElementById('txDueDateField');
  if (dueWrap) {
    // إظهار موعد التسديد عند تسجيل دين جديد فقط (أما تعديل الموعد ففي تعديل ملف الزبون فقط)
    dueWrap.classList.toggle('hidden', Boolean(editingTxId) || k !== 'debt');
  }
}

async function saveTransaction() {
  const rawInputName = cleanCustomerNameInput(document.getElementById('txName').value);
  const phone = normalizeLocalPhoneInput(document.getElementById('txPhone').value);
  const amount = parseFloat(document.getElementById('txAmount').value);
  const note = document.getElementById('txNote').value.trim();

  if (!rawInputName) return showToast('يرجى كتابة اسم الزبون');
  const isKeepingOrigin = Boolean(txOriginCustomerName && rawInputName === txOriginDisplayName);
  const name = isKeepingOrigin ? txOriginCustomerName : rawInputName;

  if (!isKeepingOrigin) {
    const dupMatch = checkDuplicateTxName();
    if (dupMatch) {
      document.getElementById('txName').focus();
      return showToast(`الاسم مشابه لزبون موجود (${cleanDisplayCustomerName(dupMatch.name)}) — عدّل الاسم قبل التثبيت`);
    }
  }
  if (!isKeepingOrigin && wouldExceedFreeCustomerLimit(name, editingTxId ? txOriginCustomerName : null)) {
    closeModal('addModal');
    openFreeLimitModal();
    return;
  }
  if (!amount || amount <= 0) return showToast('يرجى إدخال مبلغ صحيح');

  const pickerVisible = !document.getElementById('txCurrSwitch').classList.contains('hidden');
  const chosenCurrCode = (isDualCurrencyMode() || pickerVisible || editingTxId)
    ? txCurrency
    : (settings.currency === 'SYP' ? 'SYP' : 'USD');
  const curr = getCurr(chosenCurrCode);
  const typeLabel = (txKind === 'debt' ? 'دين' : 'دفعة') + ` (${curr.symbol})`;

  if (editingTxId) {
    const beforeRec = allRecords.find(r => String(r.id) === String(editingTxId));
    const beforeSnap = beforeRec ? {
      name: cleanDisplayCustomerName(beforeRec.name),
      type: beforeRec.type,
      amount: Number(beforeRec.amount) || 0,
      note: beforeRec.note || '',
      date: formatDate(beforeRec.date)
    } : null;
    const dateStr = fromInputDate(document.getElementById('txDate').value);
    const afterSnap = {
      name: cleanDisplayCustomerName(name),
      type: typeLabel,
      amount,
      note,
      date: dateStr
    };
    queueUpdateRecord(editingTxId, { date: dateStr, name, phone, type: typeLabel, amount, note });
    recordAuditEvent({
      action_type: 'edit_tx',
      customer_name: name,
      summary: `تعديل حركة للزبون "${cleanDisplayCustomerName(name)}"`,
      before_data: beforeSnap,
      after_data: afterSnap
    });
    editingTxId = null;
    persistData();
    processAndRender();
    closeModal('addModal');
    if (document.getElementById('detailView').classList.contains('open')) {
      currentCustomerName = name;
      renderCustomerDetail(name);
    }
    triggerSyncOrOfflineToast('تم تعديل الحركة، جاري المزامنة...', 'تم التعديل محلياً (سيُزامن لاحقاً)');
  } else {
    const txDueInputVal = (txKind === 'debt' && document.getElementById('txDueDate')) ? document.getElementById('txDueDate').value : '';
    const txDueNoteVal = (txKind === 'debt' && document.getElementById('txDueNote')) ? document.getElementById('txDueNote').value.trim() : '';
    const formattedNewDue = txDueInputVal ? fromInputDate(txDueInputVal) : '';

    const dateStr = todayString();
    const rec = toDbRecord({
      id: genId(),
      date: dateStr,
      name,
      phone,
      type: typeLabel,
      amount,
      note,
      created_by: currentProfile.display_name || currentProfile.email || ''
    });
    // إذا كانت عملية جديدة من الواجهة الرئيسية (أو تم تغيير الاسم عن الزبون الأصلي)، يُعامل كزبون جديد معزول تماماً
    const isSameOriginCustomer = Boolean(txOriginCustomerName && name === txOriginCustomerName);
    const existedLocally = isSameOriginCustomer && groupedCustomers.some(c => c.name === name);
    // إزالة سجل «ملف_عميل» المؤقت تلقائياً عند إضافة أول حركة فعلية للزبون
    const oldStubs = allRecords.filter(r => isCustomerStubRecord(r) && String(r.name || '').trim() === name);
    if (oldStubs.length > 0) {
      oldStubs.forEach(st => queueDeleteRecord(st.id));
      allRecords = allRecords.filter(r => !(isCustomerStubRecord(r) && String(r.name || '').trim() === name));
    }
    allRecords.push(rec);
    queueUpsertRecord(rec, { isNewCustomer: !existedLocally });
    persistData();
    if (formattedNewDue) {
      await persistCustomerDueDateChange(name, formattedNewDue, txDueNoteVal);
    }
    processAndRender();
    closeModal('addModal');
    if (currentCustomerName === name && document.getElementById('detailView').classList.contains('open')) {
      renderCustomerDetail(name);
    }
    triggerSyncOrOfflineToast('تم الحفظ، جاري المزامنة...', 'تم الحفظ محلياً (سيُزامن عند عودة الإنترنت)');
  }
}

// ==================== تعديل وحذف ملف الزبون ====================
let editingCustomerTargetName = null;

function populateEditCustomerDueControl(cust) {
  const existing = cust ? getCustomerDueEntry(cust.name) : null;
  const dateEl = document.getElementById('editCustDueDate');
  const noteEl = document.getElementById('editCustDueNote');
  if (dateEl) dateEl.value = (existing && existing.date) ? toInputDate(existing.date) : '';
  if (noteEl) noteEl.value = (existing && existing.note) ? existing.note : '';
  updateDueControlUI('edit', null);
}

function openEditCustomerModalByName(encodedName) {
  const targetName = decodeURIComponent(encodedName || '');
  const cust = groupedCustomers.find(c => c.name === targetName);
  if (!cust) return;
  editingCustomerTargetName = cust.name;
  document.getElementById('editCustNameInput').value = cleanDisplayCustomerName(cust.name);
  document.getElementById('editCustPhoneInput').value = cust.phone || '';
  populateEditCustomerDueControl(cust);
  checkDuplicateEditCustName();
  openModal('editCustomerModal');
  setTimeout(() => document.getElementById('editCustNameInput').focus(), 120);
}

function openEditCustomerModal() {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  editingCustomerTargetName = cust.name;
  document.getElementById('editCustNameInput').value = cleanDisplayCustomerName(cust.name);
  document.getElementById('editCustPhoneInput').value = cust.phone || '';
  populateEditCustomerDueControl(cust);
  checkDuplicateEditCustName();
  openModal('editCustomerModal');
}

async function saveCustomerEdit() {
  const oldName = editingCustomerTargetName || currentCustomerName;
  if (!oldName) return;
  const newName = cleanCustomerNameInput(document.getElementById('editCustNameInput').value);
  const newPhone = normalizeLocalPhoneInput(document.getElementById('editCustPhoneInput').value);
  if (!newName) return showToast('يرجى كتابة اسم الزبون');
  const dupCust = checkDuplicateEditCustName();
  if (dupCust) {
    document.getElementById('editCustNameInput').focus();
    return showToast(`الاسم مشابه لزبون آخر (${cleanDisplayCustomerName(dupCust.name)}) — عدّل الاسم أولاً`);
  }

  const oldCustObj = groupedCustomers.find(c => c.name === oldName);
  const oldPhoneSnap = oldCustObj ? (oldCustObj.phone || '') : '';
  const oldDueEntry = getCustomerDueEntry(oldName);
  const oldDueDate = (oldDueEntry && oldDueEntry.date) ? formatDate(oldDueEntry.date) : '';
  const oldDueNote = (oldDueEntry && oldDueEntry.note) ? String(oldDueEntry.note).trim() : '';

  const rawEditDue = document.getElementById('editCustDueDate') ? document.getElementById('editCustDueDate').value : '';
  const newDueDate = rawEditDue ? fromInputDate(rawEditDue) : '';
  const newDueNote = newDueDate && document.getElementById('editCustDueNote')
    ? document.getElementById('editCustDueNote').value.trim()
    : '';

  const nameOrPhoneChanged = (cleanDisplayCustomerName(oldName) !== cleanDisplayCustomerName(newName)) || (oldPhoneSnap !== newPhone);
  const dueChanged = (oldDueDate !== newDueDate) || (oldDueNote !== newDueNote);

  if (nameOrPhoneChanged) {
    const affectedIds = allRecords.filter(r => String(r.name || '').trim() === oldName).map(r => r.id);
    affectedIds.forEach(id => queueUpdateRecord(id, { name: newName, phone: newPhone }));
    recordAuditEvent({
      action_type: 'edit_customer',
      customer_name: newName,
      summary: `تعديل بيانات الزبون "${cleanDisplayCustomerName(oldName)}"`,
      before_data: { name: cleanDisplayCustomerName(oldName), phone: oldPhoneSnap },
      after_data: { name: cleanDisplayCustomerName(newName), phone: newPhone }
    });
  }

  if (oldName !== newName && settings.customerDueDates && settings.customerDueDates[oldName]) {
    delete settings.customerDueDates[oldName];
    if (!isFreeOfflineMode()) {
      pendingDueDateQueue[oldName] = null;
      persistAuditData();
      if (navigator.onLine && ensureSupabaseClient()) {
        try { await sb.rpc('set_customer_due_date', { p_customer_name: oldName, p_due_date: null, p_due_note: null }); } catch (e) {}
      }
    }
  }
  if (dueChanged || (oldName !== newName && newDueDate)) {
    await persistCustomerDueDateChange(newName, newDueDate || null, newDueNote);
  }

  // إذا كان هناك حساب وحيد متبقٍ من نفس التعارض يحمل فاصلاً داخلياً غير مرئي، ننظّف اسمه تلقائياً
  const oldBaseKey = getConflictBaseKey(oldName);
  const remainingSameBase = groupedCustomers.filter(
    c => c.name !== oldName && getConflictBaseKey(c.name) === oldBaseKey
  );
  if (remainingSameBase.length === 1 && getConflictBaseKey(newName) !== oldBaseKey) {
    const peer = remainingSameBase[0];
    const cleanPeer = cleanDisplayCustomerName(peer.name);
    if (cleanPeer && cleanPeer !== peer.name) {
      const peerIds = allRecords.filter(r => String(r.name || '').trim() === peer.name).map(r => r.id);
      peerIds.forEach(id => queueUpdateRecord(id, { name: cleanPeer }));
    }
  }

  editingCustomerTargetName = null;
  const detailOpen = document.getElementById('detailView').classList.contains('open');
  if (detailOpen && currentCustomerName === oldName) {
    currentCustomerName = newName;
  }
  persistData();
  closeModal('editCustomerModal');
  processAndRender();
  if (detailOpen && currentCustomerName) {
    renderCustomerDetail(currentCustomerName);
  }
  triggerSyncOrOfflineToast('تم تعديل ملف الزبون، جاري المزامنة...', 'تم التعديل محلياً (سيُزامن لاحقاً)');
}

function setConfirmModalMode(isLastTxPrompt) {
  document.getElementById('confirmActionsStandard')?.classList.toggle('hidden', !!isLastTxPrompt);
  document.getElementById('confirmActionsLastTx')?.classList.toggle('hidden', !isLastTxPrompt);
}

function askDeleteTx(id) {
  if (!canDeleteRecords()) return showToast('ليس لديك صلاحية الحذف');
  const rec = allRecords.find(r => String(r.id) === String(id));
  if (!rec) return;
  const recName = String(rec.name || '').trim();
  const realCustomerTxs = allRecords.filter(
    r => !isCustomerStubRecord(r) && String(r.name || '').trim() === recName
  );
  const isLastTx = realCustomerTxs.length <= 1;

  if (isLastTx) {
    confirmAction = { type: 'last_tx', id: String(id), customerName: recName };
    document.getElementById('confirmTitle').textContent = 'حذف آخر حركة للزبون';
    document.getElementById('confirmMsg').textContent =
      `هذه آخر حركة في ملف "${cleanDisplayCustomerName(recName)}". هل تريد إبقاء اسم الزبون بدون حركات أم إزالة ملف الزبون بالكامل؟`;
    setConfirmModalMode(true);
  } else {
    confirmAction = { type: 'tx', id: String(id), customerName: recName };
    document.getElementById('confirmTitle').textContent = 'حذف الحركة';
    document.getElementById('confirmMsg').textContent = isFreeOfflineMode()
      ? 'هل أنت متأكد من حذف هذه الحركة من الجهاز؟'
      : 'هل أنت متأكد من حذف هذه الحركة من الجهاز والسحابة؟';
    setConfirmModalMode(false);
  }
  openModal('confirmModal');
}

function askDeleteCustomer() {
  if (!canDeleteRecords()) return showToast('ليس لديك صلاحية الحذف');
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  confirmAction = { type: 'customer', name: cust.name };
  document.getElementById('confirmTitle').textContent = 'حذف ملف الزبون بالكامل';
  document.getElementById('confirmMsg').textContent = cust.records.length > 0
    ? `هل أنت متأكد من حذف ملف "${cleanDisplayCustomerName(cust.name)}" مع جميع حركاته (${cust.records.length} حركة) نهائياً؟`
    : `هل أنت متأكد من حذف ملف "${cleanDisplayCustomerName(cust.name)}" نهائياً؟`;
  setConfirmModalMode(false);
  openModal('confirmModal');
}

async function executeConfirmedDelete(choice = null) {
  if (!confirmAction) return;
  const act = confirmAction;
  confirmAction = null;

  if (act.type === 'last_tx') {
    const delRec = allRecords.find(r => String(r.id) === act.id);
    const delSnap = delRec ? {
      name: cleanDisplayCustomerName(delRec.name),
      type: delRec.type,
      amount: Number(delRec.amount) || 0,
      note: delRec.note || '',
      date: formatDate(delRec.date)
    } : null;

    if (choice === 'keep_customer') {
      // تحويل آخر حركة إلى ملف عميل فارغ لإبقاء الاسم ورقم الهاتف بدون أي حركات (مع المزامنة)
      queueUpdateRecord(act.id, {
        type: CUSTOMER_STUB_TYPE,
        amount: 0,
        note: '',
        date: todayString()
      });
      recordAuditEvent({
        action_type: 'delete_tx',
        customer_name: act.customerName || currentCustomerName || '',
        summary: `حذف آخر حركة مع إبقاء اسم الزبون (${delSnap ? formatNum(delSnap.amount) + ' ' + delSnap.type : ''})`,
        before_data: delSnap
      });
      persistData();
      closeModal('confirmModal');
      processAndRender();
      if (currentCustomerName) renderCustomerDetail(currentCustomerName);
      triggerSyncOrOfflineToast('تم حذف الحركة وإبقاء اسم الزبون بدون حركات...', 'تم حذف الحركة وإبقاء اسم الزبون محلياً');
      return;
    }
    // choice === 'remove_customer': حذف الحركة وإزالة ملف الزبون بالكامل
    const targetName = act.customerName || currentCustomerName;
    const toDelete = allRecords.filter(r => String(r.name || '').trim() === targetName || String(r.id) === act.id);
    toDelete.forEach(r => queueDeleteRecord(r.id));
    allRecords = allRecords.filter(r => String(r.name || '').trim() !== targetName && String(r.id) !== act.id);
    if (settings.customerDueDates && settings.customerDueDates[targetName]) {
      await persistCustomerDueDateChange(targetName, null, '');
    }
    recordAuditEvent({
      action_type: 'delete_customer',
      customer_name: targetName,
      summary: `حذف آخر حركة وإزالة ملف الزبون "${cleanDisplayCustomerName(targetName)}" بالكامل`,
      before_data: delSnap
    });
    persistData();
    const backSteps = (layerStack.includes('confirmModal') ? 1 : 0) + (layerStack.includes('detailView') ? 1 : 0);
    closeModal('confirmModal', true);
    closeDetailView(true);
    if (backSteps > 0 && history.state && history.state.appState === 'layer') {
      ignoreNextPopstate++;
      try { history.go(-backSteps); } catch (e) { ignoreNextPopstate = Math.max(0, ignoreNextPopstate - 1); }
    }
    processAndRender();
    triggerSyncOrOfflineToast('تم حذف الحركة وإزالة ملف الزبون، جاري المزامنة...', 'تم حذف ملف الزبون محلياً');
    return;
  }

  if (act.type === 'tx') {
    const delRec = allRecords.find(r => String(r.id) === act.id);
    const delSnap = delRec ? {
      name: cleanDisplayCustomerName(delRec.name),
      type: delRec.type,
      amount: Number(delRec.amount) || 0,
      note: delRec.note || '',
      date: formatDate(delRec.date)
    } : null;
    allRecords = allRecords.filter(r => String(r.id) !== act.id);
    queueDeleteRecord(act.id);
    recordAuditEvent({
      action_type: 'delete_tx',
      customer_name: (delRec && delRec.name) || act.customerName || currentCustomerName || '',
      summary: `حذف حركة (${delSnap ? delSnap.type + ' ' + formatNum(delSnap.amount) : ''}${delSnap && delSnap.note ? ' — ' + delSnap.note : ''})`,
      before_data: delSnap
    });
    persistData();
    closeModal('confirmModal');
    processAndRender();
    if (currentCustomerName) renderCustomerDetail(currentCustomerName);
    triggerSyncOrOfflineToast('تم حذف الحركة، جاري المزامنة...', 'تم الحذف محلياً (سيُزامن لاحقاً)');
  } else if (act.type === 'customer') {
    const custSnapObj = groupedCustomers.find(c => c.name === act.name);
    const toDelete = allRecords.filter(r => String(r.name || '').trim() === act.name);
    toDelete.forEach(r => queueDeleteRecord(r.id));
    allRecords = allRecords.filter(r => String(r.name || '').trim() !== act.name);
    if (settings.customerDueDates && settings.customerDueDates[act.name]) {
      await persistCustomerDueDateChange(act.name, null, '');
    }
    recordAuditEvent({
      action_type: 'delete_customer',
      customer_name: act.name,
      summary: `حذف ملف الزبون "${cleanDisplayCustomerName(act.name)}" بالكامل (${toDelete.filter(r => !isCustomerStubRecord(r)).length} حركة)`,
      before_data: custSnapObj ? {
        name: cleanDisplayCustomerName(act.name),
        phone: custSnapObj.phone || '',
        usdBalance: custSnapObj.byCurrency.USD.balance,
        sypBalance: custSnapObj.byCurrency.SYP.balance,
        txCount: custSnapObj.records.length
      } : { name: cleanDisplayCustomerName(act.name), txCount: toDelete.length }
    });
    persistData();
    const backSteps = (layerStack.includes('confirmModal') ? 1 : 0) + (layerStack.includes('detailView') ? 1 : 0);
    closeModal('confirmModal', true);
    closeDetailView(true);
    if (backSteps > 0 && history.state && history.state.appState === 'layer') {
      ignoreNextPopstate++;
      try { history.go(-backSteps); } catch (e) { ignoreNextPopstate = Math.max(0, ignoreNextPopstate - 1); }
    }
    processAndRender();
    triggerSyncOrOfflineToast('تم حذف ملف الزبون، جاري المزامنة...', 'تم حذف الملف محلياً (سيُزامن لاحقاً)');
  }
}

// ==================== أرقام هواتف المحل المتعددة ====================
function renderShopPhonesInputs(phonesArr) {
  const listEl = document.getElementById('shopPhonesList');
  listEl.innerHTML = '';
  const items = (phonesArr && phonesArr.length > 0) ? phonesArr : [''];
  items.forEach(num => addShopPhoneInput(num));
}

function addShopPhoneInput(val = '') {
  const listEl = document.getElementById('shopPhonesList');
  const row = document.createElement('div');
  row.className = 'phone-row';
  const uniqueName = 'workshop_phone_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  row.innerHTML = `
    <input type="tel" inputmode="tel" pattern="[0-9+\-\s]*" name="${uniqueName}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-form-type="other" class="input shop-phone-input" dir="ltr" style="text-align:right;" placeholder="09xxxxxxxx" value="${escapeHtml(val)}" />
    <button type="button" class="phone-del-btn" title="حذف الرقم" onclick="removeShopPhoneRow(this)">✕</button>
  `;
  listEl.appendChild(row);
}

function toggleMaskedInput(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const revealed = inp.classList.toggle('revealed');
  if (btn) btn.textContent = revealed ? 'إخفاء' : 'إظهار';
}

function removeShopPhoneRow(btn) {
  const listEl = document.getElementById('shopPhonesList');
  const row = btn.closest('.phone-row');
  if (listEl.children.length <= 1) {
    const inp = row.querySelector('input');
    if (inp) inp.value = '';
  } else {
    row.remove();
  }
}

function collectShopPhonesInputs() {
  return Array.from(document.querySelectorAll('.shop-phone-input'))
    .map(inp => normalizeLocalPhoneInput(inp.value))
    .filter(Boolean);
}

// ==================== صفحة الضبط ====================
function openSettingsView() {
  tempSettingsCurrency = settings.currency;
  tempSettingsWa = settings.whatsappApp;
  tempLogoData = settings.shopLogo || '';

  document.getElementById('setShopName').value = settings.shopName || '';
  document.getElementById('setShopAddress').value = settings.shopAddress || '';
  renderShopPhonesInputs(getShopPhonesList());
  document.getElementById('setGeneralNote').value = settings.generalNote || '';
  document.getElementById('setShamCashToggle').checked = !!settings.shamCashEnabled;
  document.getElementById('setShamCashCode').value = settings.shamCashCode || '';
  const ovInp = document.getElementById('setOverdueDays');
  if (ovInp) ovInp.value = String(Number.isFinite(Number(settings.overdueDays)) ? settings.overdueDays : 30);
  populateWaSettingsDrawer();
  populateBackupSettingsDrawer();

  document.getElementById('setShowFiltersToggle').checked = !!settings.showMainFilters;
  document.getElementById('setLockToggle').checked = !!settings.lockEnabled;
  document.getElementById('setPinInput').value = settings.pin || '';
  document.getElementById('setNewPassInput').value = '';

  document.getElementById('setAccountName').textContent = currentProfile?.display_name || '—';
  document.getElementById('setAccountEmail').textContent = currentProfile?.email || currentUser?.email || '—';
  document.getElementById('setAccountRole').textContent = currentProfile ? getRoleLabel(currentProfile.role) : '—';
  if (!isFreeOfflineMode()) {
    updateSettingsLiveDevicesSummary();
    updateManualFreeMigrationButtonUI();
  }
  if (isFreeOfflineMode()) {
    updateFreeOfflineStatusBar();
    const phone = ((APP_META && APP_META.developerPhone) || '0994373742').trim();
    const cleanTel = phone.replace(/[^\d+]/g, '');
    const waNum = formatPhoneForWa(phone);
    const waMsg = encodeURIComponent('السلام عليكم، أرغب بالترقية للنسخة السحابية من تطبيق دفتر الديون.');
    const fc = document.getElementById('freeUpgradeCallLink');
    const fw = document.getElementById('freeUpgradeWaLink');
    if (fc) fc.href = `tel:${cleanTel}`;
    if (fw) fw.href = waNum ? `https://wa.me/${waNum}?text=${waMsg}` : '#';
  }

  refreshLogoPreviewUI();
  updateSettingButtonsUI();
  toggleShamCashFields();
  toggleLockFields();
  refreshBioSettingsUI();

  document.getElementById('settingsView').classList.add('open');
  document.getElementById('settingsView').scrollTop = 0;
  updateBodyScrollLock();
  pushLayerHistory('settingsView');
}

function closeSettingsView(keepHistory = false) {
  document.getElementById('settingsView').classList.remove('open');
  popLayerFromUI('settingsView', keepHistory);
}

function toggleShamCashFields() {
  document.getElementById('shamCashFields').classList.toggle(
    'hidden',
    !document.getElementById('setShamCashToggle').checked
  );
}

function handleLogoUpload(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 220;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      tempLogoData = canvas.toDataURL('image/png');
      refreshLogoPreviewUI();
      showToast('تم تجهيز الشعار، اضغط حفظ الإعدادات');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

function removeTempLogo() { tempLogoData = ''; refreshLogoPreviewUI(); }

function refreshLogoPreviewUI() {
  const img = document.getElementById('setLogoPreview');
  const rem = document.getElementById('removeLogoBtn');
  if (tempLogoData) {
    img.src = tempLogoData;
    img.classList.remove('hidden');
    rem.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    rem.classList.add('hidden');
  }
}

function selectSettingCurrency(c) { tempSettingsCurrency = c; updateSettingButtonsUI(); }
function selectSettingWa(w) { tempSettingsWa = w; updateSettingButtonsUI(); }

function updateSettingButtonsUI() {
  document.getElementById('setCurrUsd').className = 'tog-btn' + (tempSettingsCurrency === 'USD' ? ' on-opt' : '');
  document.getElementById('setCurrSyp').className = 'tog-btn' + (tempSettingsCurrency === 'SYP' ? ' on-opt' : '');
  document.getElementById('setCurrBoth').className = 'tog-btn' + (tempSettingsCurrency === 'BOTH' ? ' on-opt' : '');
  document.getElementById('setWaNormal').className = 'tog-btn' + (tempSettingsWa === 'normal' ? ' on-opt' : '');
  document.getElementById('setWaBusiness').className = 'tog-btn' + (tempSettingsWa === 'business' ? ' on-opt' : '');
  updateThemeButtonsUI();
}

function toggleLockFields() {
  document.getElementById('lockSettingsFields').classList.toggle(
    'hidden',
    !document.getElementById('setLockToggle').checked
  );
}

function refreshBioSettingsUI() {
  const txt = document.getElementById('bioStatusText');
  const btn = document.getElementById('toggleBioBtn');
  if (settings.bioEnabled && settings.bioCredId) {
    txt.textContent = 'مفعّلة على هذا الجهاز';
    btn.textContent = 'إلغاء البصمة';
    btn.className = 'btn btn-danger';
  } else {
    txt.textContent = 'غير مفعّلة';
    btn.textContent = 'تفعيل البصمة';
    btn.className = 'btn btn-light';
  }
}

async function saveSettings() {
  const lockOn = document.getElementById('setLockToggle').checked;
  const pinVal = document.getElementById('setPinInput').value.trim();
  if (lockOn && pinVal.length < 3) return showToast('أدخل رمزاً سرياً من 3 أرقام على الأقل');

  // حفظ إعدادات هذا الجهاز محلياً
  settings.whatsappApp = tempSettingsWa;
  settings.showMainFilters = !!document.getElementById('setShowFiltersToggle').checked;
  settings.lockEnabled = lockOn;
  settings.pin = lockOn ? pinVal : '';
  if (!lockOn) { settings.bioEnabled = false; settings.bioCredId = ''; }
  persistDeviceSettings();

  // إذا كان المستخدم مديراً، نحفظ إعدادات المحل سحابياً في Supabase
  if (isAdmin()) {
    const collectedPhones = collectShopPhonesInputs();
    settings.shopName = document.getElementById('setShopName').value.trim() || 'مركز الدمشقي للصيانة';
    settings.shopAddress = document.getElementById('setShopAddress').value.trim();
    settings.shopPhones = collectedPhones;
    settings.shopPhone = collectedPhones.join(' - ');
    settings.shopLogo = tempLogoData;
    settings.generalNote = document.getElementById('setGeneralNote').value.trim();
    settings.shamCashEnabled = document.getElementById('setShamCashToggle').checked;
    settings.shamCashCode = document.getElementById('setShamCashCode').value.trim();
    settings.waConfig = readWaConfigFromForm();
    settings.currency = tempSettingsCurrency;
    const ovVal = parseInt(document.getElementById('setOverdueDays')?.value, 10);
    settings.overdueDays = (Number.isFinite(ovVal) && ovVal >= 0) ? Math.min(365, ovVal) : 30;

    const wsSettingsObj = {
      ...(currentWorkshop && currentWorkshop.settings ? currentWorkshop.settings : {}),
      shopName: settings.shopName,
      shopAddress: settings.shopAddress,
      shopPhone: settings.shopPhone,
      shopPhones: settings.shopPhones,
      shopLogo: settings.shopLogo,
      generalNote: settings.generalNote,
      shamCashEnabled: settings.shamCashEnabled,
      shamCashCode: settings.shamCashCode,
      waConfig: settings.waConfig,
      currency: settings.currency,
      overdueDays: settings.overdueDays,
      customerDueDates: settings.customerDueDates || {},
      frozen: Boolean(currentWorkshop && currentWorkshop.settings && currentWorkshop.settings.frozen)
    };

    if (currentWorkshop) {
      currentWorkshop.name = settings.shopName;
      currentWorkshop.settings = wsSettingsObj;
      if (isFreeOfflineMode()) {
        saveFreeOfflineWorkshopSettings(wsSettingsObj);
      } else {
        localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
          profile: currentProfile,
          workshop: currentWorkshop
        }));
      }
    }

    if (!isFreeOfflineMode() && navigator.onLine && ensureSupabaseClient()) {
      const btn = document.getElementById('saveSettingsBtn');
      btn.disabled = true;
      btn.textContent = 'جاري الحفظ...';
      const { error } = await sb
        .from('workshops')
        .update({ name: settings.shopName, settings: wsSettingsObj })
        .eq('id', currentProfile.workshop_id);
      btn.disabled = false;
      btn.textContent = 'حفظ الإعدادات';
      if (error) {
        showToast('تعذّر حفظ إعدادات الورشة سحابياً: ' + error.message);
        return;
      }
    }
  }

  applyBrandingUI();
  applyMainFiltersVisibility();
  updateHeaderLockButton();
  processAndRender();
  closeSettingsView();
  showToast('تم حفظ الإعدادات بنجاح');
}

// إغلاق النوافذ المنبثقة عند الضغط خارجها
document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) closeModal(el.id);
  });
});





// ==================== أدراج الضبط وتخصيص رسالة واتساب ====================
function toggleSettingsDrawer(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
  if (id === 'waSettingsDrawer' && el.classList.contains('open')) {
    updateWaLivePreview();
  }
  if (id === 'backupSettingsDrawer' && el.classList.contains('open')) {
    renderLocalSnapshotsUI();
    updateBackupStatusUI();
  }
}

function populateWaSettingsDrawer() {
  const cfg = { ...DEFAULT_WA_CONFIG, ...(settings.waConfig || {}) };
  document.getElementById('waOptShopName').checked = !!cfg.showShopName;
  document.getElementById('waOptGreeting').checked = !!cfg.showGreeting;
  document.getElementById('waTxtGreeting').value = cfg.greetingText || 'السلام عليكم';
  document.getElementById('waOptLatestTx').checked = !!cfg.showLatestTx;
  document.getElementById('waTxtDebtIntro').value = cfg.debtIntroText || 'تم تسجيل دين جديد على حسابك:';
  document.getElementById('waTxtPayIntro').value = cfg.payIntroText || 'تم تسجيل دفعة جديدة في حسابك:';
  document.getElementById('waOptTxNote').checked = !!cfg.showTxNote;
  document.getElementById('waOptTxDate').checked = !!cfg.showTxDate;
  document.getElementById('waOptSummary').checked = !!cfg.showSummary;
  document.getElementById('waTxtSummaryTitle').value = cfg.summaryTitleText || 'ملخص حسابك حتى تاريخ';
  document.getElementById('waOptTotalDebt').checked = !!cfg.showTotalDebt;
  document.getElementById('waOptTotalPay').checked = !!cfg.showTotalPay;
  document.getElementById('waOptBalance').checked = !!cfg.showBalance;
  document.getElementById('waOptShamCash').checked = !!cfg.showShamCash;
  document.getElementById('waTxtShamLabel').value = cfg.shamCashLabel || 'شام كاش:';
  document.getElementById('waOptGeneralNote').checked = !!cfg.showGeneralNote;
  document.getElementById('waOptContactInfo').checked = !!cfg.showContactInfo;
  document.getElementById('waOptCustomNote').checked = !!cfg.showCustomNote;
  document.getElementById('waTxtCustomNote').value = cfg.customNoteText || '';
  toggleWaSubOptions();
  updateWaLivePreview();
}

function toggleWaSubOptions() {
  document.getElementById('waLatestTxSub').classList.toggle('hidden', !document.getElementById('waOptLatestTx').checked);
  document.getElementById('waSummarySub').classList.toggle('hidden', !document.getElementById('waOptSummary').checked);
}

function readWaConfigFromForm() {
  return {
    showShopName: document.getElementById('waOptShopName').checked,
    showGreeting: document.getElementById('waOptGreeting').checked,
    greetingText: document.getElementById('waTxtGreeting').value.trim() || 'السلام عليكم',
    showLatestTx: document.getElementById('waOptLatestTx').checked,
    debtIntroText: document.getElementById('waTxtDebtIntro').value.trim() || 'تم تسجيل دين جديد على حسابك:',
    payIntroText: document.getElementById('waTxtPayIntro').value.trim() || 'تم تسجيل دفعة جديدة في حسابك:',
    showTxNote: document.getElementById('waOptTxNote').checked,
    showTxDate: document.getElementById('waOptTxDate').checked,
    showSummary: document.getElementById('waOptSummary').checked,
    summaryTitleText: document.getElementById('waTxtSummaryTitle').value.trim() || 'ملخص حسابك حتى تاريخ',
    showTotalDebt: document.getElementById('waOptTotalDebt').checked,
    showTotalPay: document.getElementById('waOptTotalPay').checked,
    showBalance: document.getElementById('waOptBalance').checked,
    showShamCash: document.getElementById('waOptShamCash').checked,
    shamCashLabel: document.getElementById('waTxtShamLabel').value.trim() || 'شام كاش:',
    showGeneralNote: document.getElementById('waOptGeneralNote').checked,
    showContactInfo: document.getElementById('waOptContactInfo').checked,
    showCustomNote: document.getElementById('waOptCustomNote').checked,
    customNoteText: document.getElementById('waTxtCustomNote').value.trim()
  };
}

function updateWaLivePreview() {
  const el = document.getElementById('waLivePreview');
  if (!el) return;
  const cfg = readWaConfigFromForm();
  const sampleCust = {
    name: 'أبو محمد',
    phone: '0999000000',
    byCurrency: {
      USD: {
        activeRecords: [{ date: todayString(), kind: 'debt', currency: 'USD', amount: 25, note: 'صيانة انفرتر' }],
        allRecords: [{ date: todayString(), kind: 'debt', currency: 'USD', amount: 25, note: 'صيانة انفرتر' }],
        totalDebt: 50,
        totalPay: 10,
        balance: 40
      },
      SYP: {
        activeRecords: [],
        allRecords: [],
        totalDebt: 0,
        totalPay: 0,
        balance: 0
      }
    },
    activeRecords: [{ date: todayString(), kind: 'debt', currency: 'USD', amount: 25, note: 'صيانة انفرتر' }],
    records: [{ date: todayString(), kind: 'debt', currency: 'USD', amount: 25, note: 'صيانة انفرتر' }]
  };
  const previewText = buildWhatsAppMessageText(sampleCust, sampleCust.activeRecords[0], cfg);
  el.textContent = previewText || '(الرسالة فارغة — يرجى تفعيل خيار واحد على الأقل)';
}

// ==================== النسخ الاحتياطي (حفظ واستعادة على الجهاز) ====================
function getLocalSnapshotsKey() {
  return wsKey('daily_snaps_v1');
}

function getLocalSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(getLocalSnapshotsKey()) || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalSnapshots(list) {
  try {
    localStorage.setItem(getLocalSnapshotsKey(), JSON.stringify(list.slice(0, 14)));
  } catch (e) {}
}

function buildBackupPayloadObject() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    backupDate: todayString(),
    workshopId: currentProfile ? currentProfile.workshop_id : '',
    shopName: settings.shopName || 'دفتر الديون',
    totalRecords: allRecords.filter(r => !isCustomerStubRecord(r)).length,
    totalCustomers: groupedCustomers.length,
    records: allRecords.map(r => ({
      id: String(r.id),
      date: formatDate(r.date),
      name: String(r.name || '').trim(),
      phone: String(r.phone || '').trim(),
      type: String(r.type || ''),
      amount: Number(r.amount) || 0,
      note: String(r.note || '').trim(),
      created_by: String(r.created_by || '')
    }))
  };
}

function buildBackupCsvText(recordsArr) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const headers = ['المعرف', 'التاريخ', 'اسم الزبون', 'رقم الهاتف', 'النوع', 'المبلغ', 'الملاحظة', 'المُدخل'];
  const rows = (recordsArr || []).map(r => [
    r.id,
    formatDate(r.date),
    cleanDisplayCustomerName(r.name || ''),
    r.phone || '',
    isCustomerStubRecord(r) ? 'ملف عميل (بدون حركات)' : (r.type || ''),
    r.amount || 0,
    r.note || '',
    r.created_by || ''
  ].map(esc).join(','));
  return '\uFEFF' + [headers.map(esc).join(','), ...rows].join('\r\n');
}

function triggerFileDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function buildJsonBackupFile(customRecords = null, customDate = null) {
  const payload = buildBackupPayloadObject();
  if (customRecords) {
    payload.records = customRecords;
    payload.totalRecords = customRecords.length;
  }
  const datePart = (customDate || todayString()).replace(/\//g, '-');
  const safeShop = (settings.shopName || 'دفتر_الديون').replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'دفتر_الديون';
  const fileName = `نسخة_احتياطية_${safeShop}_${datePart}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  return { blob, fileName };
}

function downloadLocalJsonBackup(customRecords = null, customDate = null) {
  const { blob, fileName } = buildJsonBackupFile(customRecords, customDate);
  triggerFileDownload(blob, fileName);
  saveDailyLocalSnapshot(true);
  updateBackupStatusUI();
  renderLocalSnapshotsUI();
  showToast('تم حفظ النسخة الاحتياطية على الجهاز ✓');
}

async function shareLocalJsonBackup() {
  const { blob, fileName } = buildJsonBackupFile();
  const file = new File([blob], fileName, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `نسخة احتياطية - ${settings.shopName}`,
        text: `نسخة احتياطية لدفتر الديون بتاريخ ${todayString()}`
      });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  triggerFileDownload(blob, fileName);
  showToast('تم حفظ النسخة الاحتياطية على الجهاز ✓');
}

function downloadLocalCsvBackup(customRecords = null, customDate = null) {
  const recs = customRecords || allRecords;
  const csv = buildBackupCsvText(recs);
  const datePart = (customDate || todayString()).replace(/\//g, '-');
  const safeShop = (settings.shopName || 'دفتر_الديون').replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'دفتر_الديون';
  const fileName = `دفتر_الديون_${safeShop}_${datePart}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerFileDownload(blob, fileName);
  showToast('تم تصدير ملف Excel (CSV) على الجهاز ✓');
}

function saveDailyLocalSnapshot(force = false) {
  if (!currentProfile || allRecords.length === 0) return false;
  const today = todayString();
  const snaps = getLocalSnapshots();
  const existingIdx = snaps.findIndex(s => s.date === today);
  if (existingIdx !== -1 && !force) return false;

  const snapEntry = {
    date: today,
    savedAt: new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }),
    count: allRecords.filter(r => !isCustomerStubRecord(r)).length,
    records: buildBackupPayloadObject().records
  };

  if (existingIdx !== -1) snaps[existingIdx] = snapEntry;
  else snaps.unshift(snapEntry);

  saveLocalSnapshots(snaps);
  return true;
}

function populateBackupSettingsDrawer() {
  updateBackupStatusUI();
  renderLocalSnapshotsUI();
}

function updateBackupStatusUI() {
  const box = document.getElementById('backupStatusSummary');
  if (!box) return;
  const snaps = getLocalSnapshots();
  const lastSnapTxt = snaps.length > 0 ? `${snaps[0].date} (${snaps[0].savedAt}) — ${snaps[0].count} حركة` : 'لا توجد بعد';
  box.innerHTML = `
    <div><strong>موعد النسخ التلقائي:</strong> <span class="midnight-pill">12:00 ليلاً يومياً</span></div>
    <div><strong>إجمالي السجلات الحالية:</strong> ${allRecords.filter(r => !isCustomerStubRecord(r)).length} حركة (${groupedCustomers.length} زبون)</div>
    <div><strong>آخر نسخة محفوظة على الجهاز:</strong> ${escapeHtml(lastSnapTxt)}</div>
  `;
}

function renderLocalSnapshotsUI() {
  const listEl = document.getElementById('localSnapsList');
  const countEl = document.getElementById('localSnapsCount');
  if (!listEl || !countEl) return;
  const snaps = getLocalSnapshots();
  countEl.textContent = `${snaps.length} نسخة`;
  if (snaps.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">سيتم حفظ نسخة يومية تلقائياً على الجهاز عند توفر حركات.</div>';
    return;
  }
  listEl.innerHTML = snaps.map((s, idx) => `
    <div class="snap-row">
      <div class="snap-info">
        <strong>نسخة ${escapeHtml(s.date)}</strong>
        <span>الساعة ${escapeHtml(s.savedAt)} • ${s.count} حركة</span>
      </div>
      <div class="snap-btns">
        <button type="button" class="btn btn-light btn-sm" onclick="downloadSnapshotByIndex(${idx})">تحميل</button>
        ${isAdmin() ? `<button type="button" class="btn btn-wa btn-sm" onclick="restoreSnapshotByIndex(${idx})">استعادة</button>` : ''}
      </div>
    </div>
  `).join('');
}

function downloadSnapshotByIndex(idx) {
  const snaps = getLocalSnapshots();
  const snap = snaps[idx];
  if (!snap) return;
  downloadLocalJsonBackup(snap.records, snap.date);
}

async function restoreSnapshotByIndex(idx) {
  if (!isAdmin()) return showToast('الاستعادة مخصصة للمدير فقط');
  const snaps = getLocalSnapshots();
  const snap = snaps[idx];
  if (!snap || !Array.isArray(snap.records)) return;
  if (!confirm(`هل تريد استعادة نسخة تاريخ ${snap.date} (${snap.records.length} حركة) ودمجها مع السحابة؟`)) return;
  await restoreRecordsArray(snap.records);
}

async function handleRestoreBackupFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (!isAdmin()) return showToast('الاستعادة مخصصة للمدير فقط');
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const recs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : null);
    if (!recs || recs.length === 0) {
      return showToast('الملف لا يحتوي على سجلات صالحة للاستعادة');
    }
    if (!confirm(`تم العثور على ${recs.length} حركة داخل الملف. هل تريد استعادتها ومزامنتها مع السحابة؟`)) return;
    await restoreRecordsArray(recs);
  } catch (err) {
    showToast('ملف النسخة الاحتياطية غير صالح');
  }
}

async function restoreRecordsArray(recs) {
  if (isFreeOfflineMode()) {
    const mergedNames = new Set(allRecords.map(r => String(r.name || '').trim()).filter(Boolean));
    recs.forEach(raw => {
      if (raw && raw.name && String(raw.name).trim()) mergedNames.add(String(raw.name).trim());
    });
    if (mergedNames.size > FREE_OFFLINE_MAX_CUSTOMERS) {
      openFreeLimitModal();
      return showToast(`الحساب المجاني يدعم حتى ${FREE_OFFLINE_MAX_CUSTOMERS} زبون فقط — الملف يحتوي على ${mergedNames.size} زبون`);
    }
  }
  let restoredCount = 0;
  const existingMap = new Map(allRecords.map(r => [String(r.id), r]));
  recs.forEach((raw, i) => {
    if (!raw || !raw.name) return;
    const rec = toDbRecord({
      id: raw.id || genId(i),
      date: formatDate(raw.date || todayString()),
      name: raw.name,
      phone: raw.phone || '',
      type: raw.type || 'دين ($)',
      amount: Number(raw.amount) || 0,
      note: raw.note || '',
      created_by: raw.created_by || currentProfile.display_name || ''
    });
    existingMap.set(String(rec.id), rec);
    queueUpsertRecord(rec);
    restoredCount++;
  });
  allRecords = Array.from(existingMap.values());
  recordAuditEvent({
    action_type: 'restore_backup',
    customer_name: 'النظام',
    summary: `استعادة نسخة احتياطية (${restoredCount} حركة)`
  });
  persistData();
  processAndRender();
  saveDailyLocalSnapshot(true);
  renderLocalSnapshotsUI();
  updateBackupStatusUI();
  triggerSyncOrOfflineToast(
    `تمت استعادة ${restoredCount} حركة، جاري المزامنة مع السحابة...`,
    `تمت استعادة ${restoredCount} حركة محلياً (ستُزامن عند عودة الإنترنت)`
  );
}

let midnightBackupTimer = null;

function scheduleMidnightBackupTimer() {
  clearTimeout(midnightBackupTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5, 0);
  const delayMs = Math.max(5000, nextMidnight.getTime() - now.getTime());
  midnightBackupTimer = setTimeout(() => {
    if (isUnlocked && currentProfile && allRecords.length > 0) {
      saveDailyLocalSnapshot(true);
      updateBackupStatusUI();
      renderLocalSnapshotsUI();
    }
    scheduleMidnightBackupTimer();
  }, delayMs);
}

function checkAndRunDailyBackups() {
  if (!currentProfile || !isUnlocked) return;
  if (allRecords.length > 0) {
    const saved = saveDailyLocalSnapshot(false);
    if (saved) {
      updateBackupStatusUI();
      renderLocalSnapshotsUI();
    }
  }
  if (!midnightBackupTimer) scheduleMidnightBackupTimer();
}

scheduleMidnightBackupTimer();
setInterval(() => {
  if (isUnlocked && currentProfile) checkAndRunDailyBackups();
}, 10 * 60 * 1000);


// ==================== نافذة حول التطبيق والمطور ====================
function openAboutModal() {
  const appName = (APP_META && APP_META.appName) || 'دفتر الديون السحابي';
  const ver = (APP_META && APP_META.version) || 'v26.0';
  const org = (APP_META && APP_META.developerOrg) || 'مركز الدمشقي للصيانة';
  const devName = (APP_META && APP_META.developerName) || 'أبو العز';
  const shopPhones = getShopPhonesList();
  const phone = ((APP_META && APP_META.developerPhone) || '').trim() || (shopPhones[0] || '');

  document.getElementById('aboutAppName').textContent = appName;
  document.getElementById('aboutVersionPill').textContent = `الإصدار ${ver}`;
  document.getElementById('aboutDevOrg').textContent = org;
  document.getElementById('aboutDevName').textContent = devName;
  document.getElementById('aboutCopyright').textContent = `© ${new Date().getFullYear()} ${org} — جميع الحقوق محفوظة`;

  const phoneRow = document.getElementById('aboutPhoneRow');
  const contactBtns = document.getElementById('aboutContactBtns');
  if (phone) {
    document.getElementById('aboutDevPhone').textContent = phone;
    phoneRow.classList.remove('hidden');
    contactBtns.classList.remove('hidden');
    const cleanTel = phone.replace(/[^\d+]/g, '');
    document.getElementById('aboutCallLink').href = `tel:${cleanTel}`;
    const waNum = formatPhoneForWa(phone);
    document.getElementById('aboutWaLink').href = waNum ? `https://wa.me/${waNum}` : '#';
  } else {
    phoneRow.classList.add('hidden');
    contactBtns.classList.add('hidden');
  }

  openModal('aboutModal');
}

function syncLoginDevCardUI() {
  const ver = (APP_META && APP_META.version) || 'v26.0';
  const org = (APP_META && APP_META.developerOrg) || 'مركز الدمشقي للصيانة';
  const devName = (APP_META && APP_META.developerName) || 'أبو العز';
  const phone = ((APP_META && APP_META.developerPhone) || '').trim();

  const vBadge = document.getElementById('loginVersionBadge');
  if (vBadge) vBadge.textContent = ver;
  const orgEl = document.getElementById('loginDevOrg');
  if (orgEl) orgEl.textContent = org;
  const nameEl = document.getElementById('loginDevName');
  if (nameEl) nameEl.textContent = devName;

  const phoneRow = document.getElementById('loginPhoneRow');
  const contactBtns = document.getElementById('loginContactBtns');
  if (phone) {
    const pEl = document.getElementById('loginDevPhone');
    if (pEl) pEl.textContent = phone;
    if (phoneRow) phoneRow.classList.remove('hidden');
    if (contactBtns) contactBtns.classList.remove('hidden');
    const cleanTel = phone.replace(/[^\d+]/g, '');
    const cLink = document.getElementById('loginCallLink');
    if (cLink) cLink.href = `tel:${cleanTel}`;
    const waNum = formatPhoneForWa(phone);
    const wLink = document.getElementById('loginWaLink');
    if (wLink) wLink.href = waNum ? `https://wa.me/${waNum}` : '#';
  } else {
    if (phoneRow) phoneRow.classList.add('hidden');
    if (contactBtns) contactBtns.classList.add('hidden');
  }
}

function syncAppVersionBadges() {
  const ver = (APP_META && APP_META.version) || 'v26.0';
  const org = (APP_META && APP_META.developerOrg) || 'مركز الدمشقي للصيانة';
  const dBadge = document.getElementById('drawerVersionBadge');
  if (dBadge) dBadge.textContent = ver;
  const sSub = document.getElementById('settingsAboutSub');
  if (sSub) sSub.textContent = `${org} • الإصدار ${ver}`;
  syncLoginDevCardUI();
}

// ==================== مظهر التطبيق (ليلي / نهاري / تلقائي حسب الجهاز) ====================
const systemDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolveEffectiveTheme(mode) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return (systemDarkQuery && systemDarkQuery.matches) ? 'dark' : 'light';
}

function updateThemeButtonsUI() {
  const mode = settings.themeMode || 'auto';
  const dAuto = document.getElementById('drawerThemeAuto');
  const dLight = document.getElementById('drawerThemeLight');
  const dDark = document.getElementById('drawerThemeDark');
  if (dAuto) dAuto.className = 'theme-seg-btn' + (mode === 'auto' ? ' active' : '');
  if (dLight) dLight.className = 'theme-seg-btn' + (mode === 'light' ? ' active' : '');
  if (dDark) dDark.className = 'theme-seg-btn' + (mode === 'dark' ? ' active' : '');
}

function applyThemeMode(mode = null) {
  const chosen = (mode === 'light' || mode === 'dark' || mode === 'auto') ? mode : (settings.themeMode || 'auto');
  const effective = resolveEffectiveTheme(chosen);
  document.documentElement.setAttribute('data-theme', effective);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', effective === 'dark' ? '#16243d' : '#2a4570');
  }
  updateThemeButtonsUI();
}

function selectThemeMode(mode) {
  settings.themeMode = (mode === 'light' || mode === 'dark' || mode === 'auto') ? mode : 'auto';
  persistDeviceSettings();
  applyThemeMode(settings.themeMode);
  const labels = { auto: 'الوضع التلقائي (حسب الجهاز)', light: 'الوضع النهاري', dark: 'الوضع الليلي' };
  showToast(`تم التبديل إلى ${labels[settings.themeMode]}`);
}

if (systemDarkQuery) {
  const onSysThemeChange = () => {
    if ((settings.themeMode || 'auto') === 'auto') {
      applyThemeMode('auto');
    }
  };
  if (typeof systemDarkQuery.addEventListener === 'function') {
    systemDarkQuery.addEventListener('change', onSysThemeChange);
  } else if (typeof systemDarkQuery.addListener === 'function') {
    systemDarkQuery.addListener(onSysThemeChange);
  }
}


// ==================== تثبيت التطبيق (PWA) والتحديث التلقائي ====================
let deferredInstallPrompt = null;

function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updatePwaInstallUI() {
  const drawerBtn = document.getElementById('drawerInstallBtn');
  if (!drawerBtn) return;
  if (isRunningStandalone() || !deferredInstallPrompt) {
    drawerBtn.classList.add('hidden');
  } else {
    drawerBtn.classList.remove('hidden');
  }
  refreshDrawerToolsSection();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updatePwaInstallUI();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updatePwaInstallUI();
  showToast('تم تثبيت التطبيق على جهازك بنجاح ✓');
});

async function triggerPwaInstall() {
  if (!deferredInstallPrompt) {
    showToast('اضغط قائمة المتصفح (⋮) واختر «تثبيت التطبيق»');
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice && choice.outcome === 'accepted') {
    showToast('جاري تثبيت التطبيق...');
  }
  deferredInstallPrompt = null;
  updatePwaInstallUI();
}

function registerPwaServiceWorker() {
  updatePwaInstallUI();
  if (!('serviceWorker' in navigator)) return;

  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // محاولة تفعيل فحص دوري بالخلفية (على أندرويد عند تثبيت التطبيق) لإبقاء السيرفر نشطاً
    if ('periodicSync' in reg) {
      reg.periodicSync.register('supabase-keepalive', { minInterval: 24 * 60 * 60 * 1000 }).catch(() => {});
    }
    // فحص وجود تحديث عند كل رجوع للتطبيق
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) {
        reg.update().catch(() => {});
      }
    });
  }).catch((err) => {
    console.warn('SW registration skipped:', err);
  });
}

// ==================== منع التحديد والنسخ العشوائي خارج مربعات الإدخال ====================
function isSelectableField(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .qc-code-box'));
}

document.addEventListener('selectstart', (e) => {
  if (!isSelectableField(e.target)) {
    e.preventDefault();
  }
});


// ==================== صفحة سجل التدقيق والمتابعة (v24) ====================
let currentAuditFilter = 'all';

function openAuditLogView() {
  if (!isAdmin()) return showToast('سجل التدقيق والمتابعة مخصص للمدير فقط');
  document.getElementById('auditWorkshopSub').textContent = settings.shopName || 'سجل محمي للتعديلات والحذف';
  document.getElementById('auditSearchInput').value = '';
  currentAuditFilter = 'all';
  document.querySelectorAll('#auditFilterTabs .audit-filter-btn').forEach((b, idx) => b.classList.toggle('active', idx === 0));
  document.getElementById('auditServerWarn').classList.add('hidden');
  document.getElementById('auditLogView').classList.add('open');
  const bodyEl = document.getElementById('auditLogBody');
  if (bodyEl) bodyEl.scrollTop = 0;
  updateBodyScrollLock();
  pushLayerHistory('auditLogView');
  loadAuditLogs(false);
}

function closeAuditLogView(keepHistory = false) {
  document.getElementById('auditLogView').classList.remove('open');
  popLayerFromUI('auditLogView', keepHistory);
}

function setAuditFilter(f, btn) {
  currentAuditFilter = f;
  document.querySelectorAll('#auditFilterTabs .audit-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAuditLogsList();
}

async function loadAuditLogs(showRefreshToast = false) {
  renderAuditLogsList();
  if (isFreeOfflineMode() || !navigator.onLine) {
    if (showRefreshToast && !isFreeOfflineMode()) showToast('تُعرض السجلات المحفوظة محلياً (بدون شبكة)');
    return;
  }
  const res = await fetchAuditLogsFromServer();
  const warnEl = document.getElementById('auditServerWarn');
  if (warnEl) {
    if (res.missingTable || auditTableMissingOnServer) {
      warnEl.textContent = 'السجل المحلي يعمل الآن — ولتفعيل مزامنة سجل التدقيق بين جميع الأجهزة وحمايته على السيرفر، شغّل كود SQL الخاص بالتحديث (v24) في Supabase.';
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }
  renderAuditLogsList();
  if (showRefreshToast && res.fromServer) showToast('تم تحديث سجل التدقيق ✓');
}

function getAuditActionMeta(actionType) {
  switch (actionType) {
    case 'edit_tx': return { label: 'تعديل حركة', cls: 'edit', group: 'edit' };
    case 'delete_tx': return { label: 'حذف حركة', cls: 'del', group: 'del' };
    case 'edit_customer': return { label: 'تعديل زبون', cls: 'edit', group: 'edit' };
    case 'delete_customer': return { label: 'حذف زبون', cls: 'del', group: 'del' };
    case 'set_due_date': return { label: 'موعد تسديد', cls: 'sys', group: 'due' };
    default: return null;
  }
}

function formatAuditSnapLine(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const parts = [];
  if (obj.type) parts.push(obj.type);
  if (typeof obj.amount !== 'undefined' && obj.amount !== null) parts.push(`المبلغ: ${formatNum(obj.amount)}`);
  if (obj.date) parts.push(`التاريخ: ${obj.date}`);
  if (obj.dueDate) parts.push(`الموعد: ${obj.dueDate}`);
  if (obj.phone) parts.push(`هاتف: ${obj.phone}`);
  if (obj.note) parts.push(`بيان: ${obj.note}`);
  if (typeof obj.txCount !== 'undefined') parts.push(`الحركات: ${obj.txCount}`);
  if (typeof obj.usdBalance !== 'undefined' && Math.abs(obj.usdBalance) > 0.001) parts.push(`رصيد $: ${formatNum(obj.usdBalance)}`);
  if (typeof obj.sypBalance !== 'undefined' && Math.abs(obj.sypBalance) > 0.001) parts.push(`رصيد ل.س: ${formatNum(obj.sypBalance)}`);
  return parts.join(' • ');
}

function renderAuditLogsList() {
  const box = document.getElementById('auditListBox');
  const countEl = document.getElementById('auditCountLbl');
  if (!box || !countEl) return;

  const q = normalizeDigits(document.getElementById('auditSearchInput')?.value || '').trim().toLowerCase();
  const list = (auditLogs || []).filter(item => {
    const meta = getAuditActionMeta(item.action_type);
    if (!meta) return false;
    if (currentAuditFilter !== 'all' && meta.group !== currentAuditFilter) return false;
    if (!q) return true;
    const hay = `${item.customer_name || ''} ${item.actor_name || ''} ${item.summary || ''} ${meta.label}`.toLowerCase();
    return hay.includes(q);
  });

  countEl.textContent = `${list.length} سجل`;
  if (list.length === 0) {
    box.innerHTML = '<div class="empty-box">لا توجد سجلات مطابقة حتى الآن.</div>';
    return;
  }

  box.innerHTML = list.map(item => {
    const meta = getAuditActionMeta(item.action_type);
    const timeStr = formatIsoDateTimeShort(item.created_at) || '';
    const beforeTxt = formatAuditSnapLine(item.before_data);
    const afterTxt = formatAuditSnapLine(item.after_data);
    let diffHtml = '';
    if (beforeTxt || afterTxt) {
      diffHtml = `<div class="audit-diff-box">
        ${beforeTxt ? `<div class="audit-diff-old"><strong>قبل:</strong> ${escapeHtml(beforeTxt)}</div>` : ''}
        ${afterTxt ? `<div class="audit-diff-new"><strong>${beforeTxt ? 'بعد:' : 'التفاصيل:'}</strong> ${escapeHtml(afterTxt)}</div>` : ''}
      </div>`;
    }
    return `
      <div class="audit-card">
        <div class="audit-top">
          <span class="audit-badge ${meta.cls}">${escapeHtml(meta.label)}</span>
          <span class="audit-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="audit-main">${escapeHtml(item.customer_name ? item.customer_name + ' — ' : '')}${escapeHtml(item.summary || '')}</div>
        <div class="audit-actor">بواسطة: <strong>${escapeHtml(item.actor_name || '—')}</strong></div>
        ${diffHtml}
      </div>
    `;
  }).join('');
}

// ==================== الترحيل من الحساب المجاني الأوفلاين إلى السحابي (v24) ====================
function getFreeOfflineMigrationInfo() {
  let freeRecords = [];
  let freeSettings = null;
  try {
    freeRecords = JSON.parse(localStorage.getItem(`debt_sb_records_${FREE_OFFLINE_WORKSHOP_ID}`) || '[]');
    if (!Array.isArray(freeRecords)) freeRecords = [];
  } catch (e) { freeRecords = []; }
  try {
    freeSettings = JSON.parse(localStorage.getItem(FREE_OFFLINE_WS_SETTINGS_KEY) || 'null');
  } catch (e) { freeSettings = null; }

  const widPrefix = currentProfile && currentProfile.workshop_id ? String(currentProfile.workshop_id).slice(0, 6) : 'cloud';
  const existingIds = new Set((allRecords || []).map(r => String(r.id)));
  const unmigratedRecords = freeRecords.filter(r => {
    if (!r || !r.name) return false;
    const rawId = String(r.id || '');
    const migId = `mig_${widPrefix}_${rawId}`;
    return !existingIds.has(rawId) && !existingIds.has(migId);
  });

  const uniqueCustomers = new Set(
    unmigratedRecords.map(r => cleanDisplayCustomerName(r.name || '')).filter(Boolean)
  );
  const realTxCount = unmigratedRecords.filter(r => !isCustomerStubRecord(r)).length;

  return {
    hasData: unmigratedRecords.length > 0,
    totalRawCount: freeRecords.length,
    unmigratedRecords,
    realTxCount,
    customerCount: uniqueCustomers.size,
    freeSettings
  };
}

function updateManualFreeMigrationButtonUI() {
  const wrap = document.getElementById('migrateFreeManualWrap');
  const btn = document.getElementById('migrateFreeManualBtn');
  if (!wrap || !btn) return;
  if (isFreeOfflineMode() || !isAdmin()) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  const info = getFreeOfflineMigrationInfo();
  if (info.hasData) {
    btn.textContent = `ترحيل بيانات الحساب المجاني للسحابة (${info.customerCount} زبون • ${info.realTxCount} حركة)`;
  } else {
    btn.textContent = 'ترحيل بيانات الحساب المجاني إلى السحابة';
  }
}

function checkAndPromptFreeMigration(isAuto = false) {
  if (isFreeOfflineMode() || !isAdmin()) return;
  const info = getFreeOfflineMigrationInfo();
  if (!info.hasData) return;
  if (isAuto && currentProfile) {
    const dismissKey = 'debt_free_mig_dismissed_' + currentProfile.workshop_id;
    const prevCount = Number(localStorage.getItem(dismissKey) || '0');
    if (prevCount === info.unmigratedRecords.length) return;
  }
  openMigrateFreeModal(isAuto);
}

function openMigrateFreeModal(isAuto = false) {
  if (isFreeOfflineMode() || !isAdmin()) {
    return showToast('الترحيل متاح لمدير الحساب السحابي فقط');
  }
  const info = getFreeOfflineMigrationInfo();
  if (!info.hasData) {
    return showToast('لا توجد بيانات جديدة محفوظة في الحساب المجاني على هذا الجهاز');
  }
  const box = document.getElementById('migrateFreeSummaryBox');
  if (box) {
    box.innerHTML = `تم العثور على بيانات في الحساب المجاني الأوفلاين على هذا الجهاز:<br><strong>${info.customerCount} زبون</strong> و <strong>${info.realTxCount} حركة</strong> جاهزة للترحيل إلى ورشة «${escapeHtml(settings.shopName || '')}».`;
  }
  const incSetChk = document.getElementById('migrateIncludeSettingsChk');
  if (incSetChk) {
    // تفعيل خيار ترحيل الإعدادات تلقائياً فقط إذا كانت الورشة السحابية فارغة وجديدة
    incSetChk.checked = (allRecords.length === 0 && Boolean(info.freeSettings && info.freeSettings.shopName && info.freeSettings.shopName !== 'دفتر الديون (مجاني)'));
  }
  const clearChk = document.getElementById('migrateClearFreeChk');
  if (clearChk) clearChk.checked = true;
  openModal('migrateFreeModal');
}

function dismissFreeMigrationModal() {
  try {
    if (currentProfile) {
      const info = getFreeOfflineMigrationInfo();
      localStorage.setItem('debt_free_mig_dismissed_' + currentProfile.workshop_id, String(info.unmigratedRecords.length));
    }
  } catch (e) {}
  closeModal('migrateFreeModal');
}

async function executeFreeToCloudMigration() {
  if (isFreeOfflineMode() || !isAdmin()) return;
  const info = getFreeOfflineMigrationInfo();
  if (!info.hasData) {
    closeModal('migrateFreeModal');
    return showToast('لا توجد بيانات جديدة للترحيل');
  }

  const includeSettings = Boolean(document.getElementById('migrateIncludeSettingsChk')?.checked);
  const clearFreeAfter = Boolean(document.getElementById('migrateClearFreeChk')?.checked);
  const btn = document.getElementById('confirmMigrateFreeBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الترحيل...'; }

  try {
    const widPrefix = String(currentProfile.workshop_id || 'cloud').slice(0, 6);
    let migratedCount = 0;

    info.unmigratedRecords.forEach((raw, idx) => {
      const safeRawId = String(raw.id || genId(idx));
      const newId = safeRawId.startsWith(`mig_${widPrefix}_`) ? safeRawId : `mig_${widPrefix}_${safeRawId}`;
      const rec = toDbRecord({
        id: newId,
        date: formatDate(raw.date || todayString()),
        name: cleanCustomerNameInput(raw.name || ''),
        phone: raw.phone || '',
        type: raw.type || 'دين ($)',
        amount: Number(raw.amount) || 0,
        note: raw.note || '',
        created_by: currentProfile.display_name || currentProfile.email || ''
      });
      if (!rec.name) return;
      allRecords.push(rec);
      queueUpsertRecord(rec, { isNewCustomer: false });
      migratedCount++;
    });

    // ترحيل مواعيد التسديد الموجودة في الحساب المجاني
    const freeDueDates = (info.freeSettings && info.freeSettings.customerDueDates && typeof info.freeSettings.customerDueDates === 'object')
      ? info.freeSettings.customerDueDates
      : {};
    let settingsChanged = false;
    if (Object.keys(freeDueDates).length > 0) {
      settings.customerDueDates = { ...freeDueDates, ...(settings.customerDueDates || {}) };
      settingsChanged = true;
    }

    if (includeSettings && info.freeSettings) {
      const fs = info.freeSettings;
      if (fs.shopName && fs.shopName !== 'دفتر الديون (مجاني)') settings.shopName = fs.shopName;
      if (fs.shopAddress) settings.shopAddress = fs.shopAddress;
      if (Array.isArray(fs.shopPhones) && fs.shopPhones.length > 0) {
        settings.shopPhones = fs.shopPhones;
        settings.shopPhone = fs.shopPhones.join(' - ');
      }
      if (fs.shopLogo) settings.shopLogo = fs.shopLogo;
      if (fs.generalNote) settings.generalNote = fs.generalNote;
      if (fs.shamCashEnabled && fs.shamCashCode) {
        settings.shamCashEnabled = true;
        settings.shamCashCode = fs.shamCashCode;
      }
      if (fs.currency === 'USD' || fs.currency === 'SYP' || fs.currency === 'BOTH') {
        settings.currency = fs.currency;
      }
      if (Number.isFinite(Number(fs.overdueDays))) settings.overdueDays = Number(fs.overdueDays);
      settingsChanged = true;
    }

    if (settingsChanged && currentWorkshop) {
      const mergedWsSettings = {
        ...(currentWorkshop.settings || {}),
        shopName: settings.shopName,
        shopAddress: settings.shopAddress,
        shopPhone: settings.shopPhone,
        shopPhones: settings.shopPhones,
        shopLogo: settings.shopLogo,
        generalNote: settings.generalNote,
        shamCashEnabled: settings.shamCashEnabled,
        shamCashCode: settings.shamCashCode,
        currency: settings.currency,
        overdueDays: settings.overdueDays,
        customerDueDates: settings.customerDueDates || {}
      };
      currentWorkshop.name = settings.shopName;
      currentWorkshop.settings = mergedWsSettings;
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
      if (navigator.onLine && ensureSupabaseClient()) {
        try {
          await sb.from('workshops').update({ name: settings.shopName, settings: mergedWsSettings }).eq('id', currentProfile.workshop_id);
        } catch (e) {}
      }
      applyBrandingUI();
    }

    recordAuditEvent({
      action_type: 'migrate_free',
      customer_name: 'الحساب المجاني',
      summary: `ترحيل ${info.customerCount} زبون (${migratedCount} سجل) من الحساب المجاني الأوفلاين إلى السحابة`
    });

    if (clearFreeAfter) {
      try {
        localStorage.removeItem(`debt_sb_records_${FREE_OFFLINE_WORKSHOP_ID}`);
        localStorage.removeItem(`debt_sb_queue_${FREE_OFFLINE_WORKSHOP_ID}`);
        localStorage.removeItem(`debt_sb_last_sync_meta_${FREE_OFFLINE_WORKSHOP_ID}`);
        localStorage.removeItem(FREE_OFFLINE_WS_SETTINGS_KEY);
      } catch (e) {}
    }

    persistData();
    closeModal('migrateFreeModal');
    processAndRender();
    updateManualFreeMigrationButtonUI();
    triggerSyncOrOfflineToast(
      `تم ترحيل ${info.customerCount} زبون (${migratedCount} سجل) بنجاح، جاري الرفع للسحابة...`,
      `تم ترحيل ${info.customerCount} زبون محلياً وسيُرفع تلقائياً عند عودة الإنترنت`
    );
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'ترحيل البيانات الآن للسحابة'; }
  }
}

syncAppVersionBadges();
registerPwaServiceWorker();

// بدء تشغيل التطبيق بعد تحميل كل الملفات
initApp();
