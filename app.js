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

  if (!copied && !isAuto) {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, code.length);
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
    document.getElementById('confirmModal').classList.contains('open');
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
  const fallbackLayers = ['sideMenu', 'confirmModal', 'editWorkshopModal', 'editCustomerModal', 'addModal', 'accountsView', 'settingsView', 'detailView'];
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
  processAndRender();
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

  // هل يوجد رصيد مفتوح في أي عملة مفعّلة؟
  const anyOpenBalance = enabledCodes.some(c => rawByCurr[c].openRecords.length > 0);

  const byCurrency = {};
  const mergedActiveRecords = [];
  const mergedArchivedCycles = [];

  ['USD', 'SYP'].forEach(code => {
    const cData = rawByCurr[code];
    let activeRecords = [];
    let archivedCycles = [];
    let totalDebt = 0;
    let totalPay = 0;
    let balance = 0;

    if (cData.openRecords.length > 0) {
      activeRecords = cData.openRecords;
      archivedCycles = cData.settledCycles;
      totalDebt = cData.openDebt;
      totalPay = cData.openPay;
      balance = cData.openBalance;
    } else if (cData.settledCycles.length > 0) {
      if (anyOpenBalance) {
        // العملة الأخرى مفتوحة، لذلك تُطوى كل الدورات المسددة لهذه العملة في الأرشيف
        activeRecords = [];
        archivedCycles = cData.settledCycles;
      } else {
        // العميل خالص بالكامل: نعرض آخر دورة مسددة كحركات حالية ونطوي الأقدم
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
      allRecords: cData.allRecords,
      activeRecords,
      archivedCycles,
      archivedCount,
      totalDebt,
      totalPay,
      balance
    };

    if (enabledCodes.includes(code)) {
      activeRecords.forEach(r => mergedActiveRecords.push(r));
      archivedCycles.forEach(cyc => mergedArchivedCycles.push(cyc));
    }
  });

  // ترتيب الحركات النشطة المدمجة زمنياً (الأقدم أولاً، وعند العرض نعكسها للأحدث أولاً)
  mergedActiveRecords.sort((a, b) => {
    if (a._normDate !== b._normDate) return a._normDate.localeCompare(b._normDate);
    return String(a.id).localeCompare(String(b.id));
  });

  // ترتيب الدورات المؤرشفة زمنياً حسب تاريخ الإغلاق
  mergedArchivedCycles.sort((a, b) => a.endDate.localeCompare(b.endDate));

  const archivedCount = mergedArchivedCycles.reduce((acc, c) => acc + c.records.length, 0);
  const hasDebt = enabledCodes.some(c => byCurrency[c].balance > 0.001);
  const hasCredit = enabledCodes.some(c => byCurrency[c].balance < -0.001);
  const isAllZero = enabledCodes.every(c => Math.abs(byCurrency[c].balance) < 0.001);

  return {
    byCurrency,
    activeRecords: mergedActiveRecords,
    archivedCycles: mergedArchivedCycles,
    archivedCount,
    hasDebt,
    hasCredit,
    isAllZero
  };
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
    if (!map[name]) map[name] = { name, phone: '', rawRecords: [] };
    if (r.phone && String(r.phone).trim()) {
      map[name].phone = String(r.phone).replace(/^'/, '').trim();
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

  const enabledCodes = getEnabledCurrencyCodes();

  groupedCustomers = Object.values(map).map(entry => {
    const summary = finalizeCustomerCurrencies(entry.rawRecords);
    return {
      name: entry.name,
      phone: entry.phone,
      records: entry.rawRecords,
      ...summary
    };
  }).filter(c => {
    // في وضع العملة الواحدة نظهر فقط من لديه سجل في تلك العملة (أو لو الكل لديه سجلات)
    if (dual) return true;
    return c.byCurrency[enabledCodes[0]].allRecords.length > 0;
  }).sort((a, b) => {
    const aHas = a.hasDebt ? 1 : 0;
    const bHas = b.hasDebt ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return a.name.localeCompare(b.name, 'ar');
  });

  let grandUsd = 0;
  let grandSyp = 0;
  let indebtedCount = 0;

  groupedCustomers.forEach(c => {
    if (c.byCurrency.USD.balance > 0.001) grandUsd += c.byCurrency.USD.balance;
    if (c.byCurrency.SYP.balance > 0.001) grandSyp += c.byCurrency.SYP.balance;
    if (c.hasDebt) indebtedCount++;
  });

  if (dual) {
    document.getElementById('activeCurrName').textContent = 'العملتين';
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
  document.getElementById('customersDatalist').innerHTML =
    groupedCustomers.map(c => `<option value="${escapeHtml(c.name)}"></option>`).join('');

  renderCustomers();
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('#mainView .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCustomers();
}

function buildCustomerBalancePillsHtml(c) {
  const enabled = getEnabledCurrencyCodes();
  const pills = [];

  enabled.forEach(code => {
    const bal = c.byCurrency[code].balance;
    const unit = code === 'USD' ? 'دولار' : 'ليرة سوري';
    if (bal > 0.001) {
      pills.push(`<span class="bal-pill bal-debt">${formatNum(bal)} ${unit}</span>`);
    } else if (bal < -0.001) {
      pills.push(`<span class="bal-pill bal-credit">له ${formatNum(Math.abs(bal))} ${unit}</span>`);
    }
  });

  if (pills.length === 0) {
    return `<span class="bal-pill bal-zero">خالص</span>`;
  }
  if (pills.length === 1) return pills[0];
  return `<div class="bal-stack">${pills.join('')}</div>`;
}

function renderCustomers() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  visibleCustomers = groupedCustomers.filter(c => {
    const matches = !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
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
    const initial = c.name.charAt(0);
    const pendMark = c.records.some(r => r.pending) ? ' • محلي' : '';
    const metaParts = [c.phone, `${c.activeRecords.length} حركة حالية`];
    if (c.archivedCount > 0) metaParts.push(`${c.archivedCount} بالأرشيف`);
    const meta = metaParts.filter(Boolean).join(' • ') + pendMark;

    return `
      <div class="cust-card" onclick="openCustomerDetail(${idx})">
        <div class="cust-left">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div style="min-width:0;">
            <div class="cust-name">${escapeHtml(c.name)}</div>
            <div class="cust-meta">${escapeHtml(meta)}</div>
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
  const displayCodes = enabled.filter(code => cust.byCurrency[code].activeRecords.length > 0);
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
        <div class="tx-amt" style="color:${r.kind === 'debt' ? 'var(--danger)' : 'var(--success)'};">${sign}${formatNum(r.amount)} ${curr.symbol}</div>
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

  document.getElementById('detailName').textContent = cust.name;
  document.getElementById('detailPhone').textContent = cust.phone ? cust.phone : 'بدون رقم هاتف';
  document.getElementById('activeSectionTitle').textContent =
    cust.archivedCount > 0 ? 'الحركات الحالية (تُدرج في كشف PDF)' : 'سجل الحركات';
  document.getElementById('detailTxCount').textContent = `${cust.activeRecords.length} حركة`;

  renderDetailSummaryCards(cust);

  const showCurrChips = isDualCurrencyMode();
  const activeList = [...cust.activeRecords].reverse();
  document.getElementById('detailTxList').innerHTML = activeList.length > 0
    ? activeList.map(r => renderTxCardHtml(r, false, showCurrChips)).join('')
    : '<div class="empty-box" style="padding:24px;">لا توجد حركات نشطة حالياً.</div>';

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
    document.getElementById('archiveBody').innerHTML = archHtml;
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

function openAddModal(prefillName = '', prefillPhone = '', defaultKind = 'debt', preferredCurrency = null) {
  editingTxId = null;
  document.getElementById('txModalTitle').textContent = 'تسجيل عملية جديدة';
  document.getElementById('saveTxBtn').textContent = 'حفظ العملية';
  document.getElementById('txName').value = prefillName;
  document.getElementById('txPhone').value = prefillPhone;
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';
  document.getElementById('txDate').value = toInputDate(todayString());
  document.getElementById('txDateField').classList.add('hidden');

  const initialCurr = isDualCurrencyMode()
    ? (preferredCurrency || lastUsedTxCurrency || 'USD')
    : (settings.currency === 'SYP' ? 'SYP' : 'USD');
  setTxCurrency(initialCurr);
  updateTxCurrencyPickerVisibility(false);

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
  document.getElementById('txModalTitle').textContent = 'تعديل الحركة';
  document.getElementById('saveTxBtn').textContent = 'حفظ التعديل';
  document.getElementById('txName').value = rec.name || '';
  document.getElementById('txPhone').value = String(rec.phone || '').replace(/^'/, '');
  document.getElementById('txAmount').value = rec.amount || '';
  document.getElementById('txNote').value = rec.note || '';
  document.getElementById('txDate').value = toInputDate(rec.date);
  document.getElementById('txDateField').classList.remove('hidden');

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
  if (isDualCurrencyMode()) {
    const hasUsd = cust.byCurrency.USD.balance > 0.001;
    const hasSyp = cust.byCurrency.SYP.balance > 0.001;
    if (hasSyp && !hasUsd) prefCurr = 'SYP';
    else if (hasUsd && !hasSyp) prefCurr = 'USD';
  }
  openAddModal(cust.name, cust.phone, kind, prefCurr);
}

function autoFillPhone() {
  const val = document.getElementById('txName').value.trim();
  const found = groupedCustomers.find(c => c.name === val);
  if (found && found.phone) document.getElementById('txPhone').value = found.phone;
}

function setTxKind(k) {
  txKind = k;
  document.getElementById('btnKindDebt').className = 'tog-btn' + (k === 'debt' ? ' on-debt' : '');
  document.getElementById('btnKindPay').className = 'tog-btn' + (k === 'pay' ? ' on-pay' : '');
}

function saveTransaction() {
  const name = document.getElementById('txName').value.trim();
  const phone = document.getElementById('txPhone').value.trim();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const note = document.getElementById('txNote').value.trim();

  if (!name) return showToast('يرجى كتابة اسم الزبون');
  if (!amount || amount <= 0) return showToast('يرجى إدخال مبلغ صحيح');

  const chosenCurrCode = isDualCurrencyMode() ? txCurrency : (editingTxId ? txCurrency : (settings.currency === 'SYP' ? 'SYP' : 'USD'));
  const curr = getCurr(chosenCurrCode);
  const typeLabel = (txKind === 'debt' ? 'دين' : 'دفعة') + ` (${curr.symbol})`;

  if (editingTxId) {
    const dateStr = fromInputDate(document.getElementById('txDate').value);
    queueUpdateRecord(editingTxId, { date: dateStr, name, phone, type: typeLabel, amount, note });
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
    allRecords.push(rec);
    queueUpsertRecord(rec);
    persistData();
    processAndRender();
    closeModal('addModal');
    if (currentCustomerName === name && document.getElementById('detailView').classList.contains('open')) {
      renderCustomerDetail(name);
    }
    triggerSyncOrOfflineToast('تم الحفظ، جاري المزامنة...', 'تم الحفظ محلياً (سيُزامن عند عودة الإنترنت)');
  }
}

// ==================== تعديل وحذف ملف الزبون ====================
function openEditCustomerModal() {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  document.getElementById('editCustNameInput').value = cust.name;
  document.getElementById('editCustPhoneInput').value = cust.phone || '';
  openModal('editCustomerModal');
}

function saveCustomerEdit() {
  const oldName = currentCustomerName;
  const newName = document.getElementById('editCustNameInput').value.trim();
  const newPhone = document.getElementById('editCustPhoneInput').value.trim();
  if (!newName) return showToast('يرجى كتابة اسم الزبون');

  const affectedIds = allRecords.filter(r => String(r.name || '').trim() === oldName).map(r => r.id);
  affectedIds.forEach(id => queueUpdateRecord(id, { name: newName, phone: newPhone }));

  currentCustomerName = newName;
  persistData();
  closeModal('editCustomerModal');
  processAndRender();
  renderCustomerDetail(newName);
  triggerSyncOrOfflineToast('تم تعديل ملف الزبون، جاري المزامنة...', 'تم التعديل محلياً (سيُزامن لاحقاً)');
}

function askDeleteTx(id) {
  if (!canDeleteRecords()) return showToast('ليس لديك صلاحية الحذف');
  confirmAction = { type: 'tx', id: String(id) };
  document.getElementById('confirmTitle').textContent = 'حذف الحركة';
  document.getElementById('confirmMsg').textContent = 'هل أنت متأكد من حذف هذه الحركة من الجهاز والسحابة؟';
  openModal('confirmModal');
}

function askDeleteCustomer() {
  if (!canDeleteRecords()) return showToast('ليس لديك صلاحية الحذف');
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  confirmAction = { type: 'customer', name: cust.name };
  document.getElementById('confirmTitle').textContent = 'حذف ملف الزبون بالكامل';
  document.getElementById('confirmMsg').textContent = `هل أنت متأكد من حذف ملف "${cust.name}" مع جميع حركاته (${cust.records.length} حركة) نهائياً؟`;
  openModal('confirmModal');
}

function executeConfirmedDelete() {
  if (!confirmAction) return;
  const act = confirmAction;
  confirmAction = null;

  if (act.type === 'tx') {
    allRecords = allRecords.filter(r => String(r.id) !== act.id);
    queueDeleteRecord(act.id);
    persistData();
    closeModal('confirmModal');
    processAndRender();
    if (currentCustomerName) renderCustomerDetail(currentCustomerName);
    triggerSyncOrOfflineToast('تم حذف الحركة، جاري المزامنة...', 'تم الحذف محلياً (سيُزامن لاحقاً)');
  } else if (act.type === 'customer') {
    const toDelete = allRecords.filter(r => String(r.name || '').trim() === act.name);
    toDelete.forEach(r => queueDeleteRecord(r.id));
    allRecords = allRecords.filter(r => String(r.name || '').trim() !== act.name);
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
  row.innerHTML = `
    <input type="tel" class="input shop-phone-input" dir="ltr" style="text-align:right;" placeholder="09xxxxxxxx" value="${escapeHtml(val)}" />
    <button type="button" class="phone-del-btn" title="حذف الرقم" onclick="removeShopPhoneRow(this)">✕</button>
  `;
  listEl.appendChild(row);
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
    .map(inp => inp.value.trim())
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
  populateWaSettingsDrawer();
  populateBackupSettingsDrawer();

  document.getElementById('setLockToggle').checked = !!settings.lockEnabled;
  document.getElementById('setPinInput').value = settings.pin || '';
  document.getElementById('setNewPassInput').value = '';

  document.getElementById('setAccountName').textContent = currentProfile?.display_name || '—';
  document.getElementById('setAccountEmail').textContent = currentProfile?.email || currentUser?.email || '—';
  document.getElementById('setAccountRole').textContent = currentProfile ? getRoleLabel(currentProfile.role) : '—';

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
    settings.backupConfig = {
      ...(settings.backupConfig || DEFAULT_BACKUP_CONFIG),
      driveEmail: document.getElementById('setDriveEmail').value.trim(),
      driveScriptUrl: document.getElementById('setDriveScriptUrl').value.trim(),
      autoDailyEnabled: document.getElementById('setAutoDailyBackup').checked
    };
    settings.currency = tempSettingsCurrency;

    const wsSettingsObj = {
      shopName: settings.shopName,
      shopAddress: settings.shopAddress,
      shopPhone: settings.shopPhone,
      shopPhones: settings.shopPhones,
      shopLogo: settings.shopLogo,
      generalNote: settings.generalNote,
      shamCashEnabled: settings.shamCashEnabled,
      shamCashCode: settings.shamCashCode,
      waConfig: settings.waConfig,
      backupConfig: settings.backupConfig,
      currency: settings.currency,
      frozen: Boolean(currentWorkshop && currentWorkshop.settings && currentWorkshop.settings.frozen)
    };

    if (currentWorkshop) {
      currentWorkshop.name = settings.shopName;
      currentWorkshop.settings = wsSettingsObj;
      localStorage.setItem('debt_ctx_sb_' + currentUser.id, JSON.stringify({
        profile: currentProfile,
        workshop: currentWorkshop
      }));
    }

    if (navigator.onLine) {
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

// ==================== النسخ الاحتياطي (Google Drive + النسخ اليومي على الجوال) ====================
let isDriveBackingUp = false;

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
    localStorage.setItem(getLocalSnapshotsKey(), JSON.stringify(list.slice(0, 7)));
  } catch (e) {}
}

function buildBackupPayloadObject() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    backupDate: todayString(),
    workshopId: currentProfile ? currentProfile.workshop_id : '',
    shopName: settings.shopName || 'دفتر الديون',
    driveEmail: (settings.backupConfig && settings.backupConfig.driveEmail) || '',
    totalRecords: allRecords.length,
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
    r.name || '',
    r.phone || '',
    r.type || '',
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

function downloadLocalJsonBackup(customRecords = null, customDate = null) {
  const payload = buildBackupPayloadObject();
  if (customRecords) {
    payload.records = customRecords;
    payload.totalRecords = customRecords.length;
  }
  const datePart = (customDate || todayString()).replace(/\//g, '-');
  const safeShop = (settings.shopName || 'دفتر_الديون').replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'دفتر_الديون';
  const fileName = `نسخة_احتياطية_${safeShop}_${datePart}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  triggerFileDownload(blob, fileName);
  showToast('تم حفظ النسخة الاحتياطية على الجوال ✓');
}

function downloadLocalCsvBackup(customRecords = null, customDate = null) {
  const recs = customRecords || allRecords;
  const csv = buildBackupCsvText(recs);
  const datePart = (customDate || todayString()).replace(/\//g, '-');
  const safeShop = (settings.shopName || 'دفتر_الديون').replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'دفتر_الديون';
  const fileName = `دفتر_الديون_${safeShop}_${datePart}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerFileDownload(blob, fileName);
  showToast('تم تصدير ملف Excel (CSV) على الجوال ✓');
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
    count: allRecords.length,
    records: buildBackupPayloadObject().records
  };

  if (existingIdx !== -1) snaps[existingIdx] = snapEntry;
  else snaps.unshift(snapEntry);

  saveLocalSnapshots(snaps);
  return true;
}

function populateBackupSettingsDrawer() {
  const bCfg = { ...DEFAULT_BACKUP_CONFIG, ...(settings.backupConfig || {}) };
  const emailEl = document.getElementById('setDriveEmail');
  const urlEl = document.getElementById('setDriveScriptUrl');
  const autoEl = document.getElementById('setAutoDailyBackup');
  if (emailEl) emailEl.value = bCfg.driveEmail || '';
  if (urlEl) urlEl.value = bCfg.driveScriptUrl || '';
  if (autoEl) autoEl.checked = bCfg.autoDailyEnabled !== false;
  updateBackupStatusUI();
  renderLocalSnapshotsUI();
}

function updateBackupStatusUI() {
  const box = document.getElementById('backupStatusSummary');
  if (!box) return;
  const bCfg = { ...DEFAULT_BACKUP_CONFIG, ...(settings.backupConfig || {}) };
  const lastDriveLocal = localStorage.getItem(wsKey('last_drive_backup_at')) || bCfg.lastDriveBackupAt || '';
  const snaps = getLocalSnapshots();
  const lastSnapTxt = snaps.length > 0 ? `${snaps[0].date} (${snaps[0].savedAt}) — ${snaps[0].count} حركة` : 'لا توجد بعد';
  const driveTxt = lastDriveLocal ? lastDriveLocal : 'لم يتم الرفع بعد';
  const emailLine = bCfg.driveEmail ? `<div><strong>حساب Google Drive:</strong> <span dir="ltr">${escapeHtml(bCfg.driveEmail)}</span></div>` : '';
  box.innerHTML = `
    ${emailLine}
    <div><strong>آخر حفظ على Google Drive:</strong> ${escapeHtml(driveTxt)}</div>
    <div><strong>آخر نسخة يومية على الجوال:</strong> ${escapeHtml(lastSnapTxt)}</div>
  `;
}

function renderLocalSnapshotsUI() {
  const listEl = document.getElementById('localSnapsList');
  const countEl = document.getElementById('localSnapsCount');
  if (!listEl || !countEl) return;
  const snaps = getLocalSnapshots();
  countEl.textContent = `${snaps.length} نسخة`;
  if (snaps.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">سيتم حفظ نسخة يومية تلقائياً على الجوال عند توفر حركات.</div>';
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

async function backupToGoogleDriveNow(silent = false) {
  if (isDriveBackingUp || !currentProfile) return;
  const inputUrlEl = document.getElementById('setDriveScriptUrl');
  const scriptUrl = (inputUrlEl && document.getElementById('settingsView').classList.contains('open')
    ? inputUrlEl.value.trim()
    : ((settings.backupConfig && settings.backupConfig.driveScriptUrl) || '').trim());

  if (!scriptUrl || !scriptUrl.toLowerCase().startsWith('http')) {
    if (!silent) showToast('يرجى إدخال رابط سكربت Google Drive أولاً');
    return;
  }
  if (!navigator.onLine) {
    if (!silent) showToast('يلزم الاتصال بالإنترنت للنسخ إلى Google Drive');
    return;
  }

  const btn = document.getElementById('backupDriveNowBtn');
  isDriveBackingUp = true;
  if (!silent && btn) {
    btn.disabled = true;
    btn.querySelector('span').textContent = 'جاري الرفع إلى Google Drive...';
  }

  try {
    const payload = buildBackupPayloadObject();
    payload.action = 'backup';
    payload.csvContent = buildBackupCsvText(payload.records);

    const res = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const txt = await res.text();
    let json = {};
    try { json = JSON.parse(txt); } catch (e) {}
    if (json.status && json.status !== 'ok') {
      throw new Error(json.message || 'DRIVE_ERR');
    }

    const stamp = `${todayString()} (${new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })})`;
    localStorage.setItem(wsKey('last_drive_backup_date'), todayString());
    localStorage.setItem(wsKey('last_drive_backup_at'), stamp);
    saveDailyLocalSnapshot(true);
    updateBackupStatusUI();
    renderLocalSnapshotsUI();
    if (!silent) showToast('تم حفظ النسخة الاحتياطية في Google Drive بنجاح ✓');
  } catch (err) {
    console.error('Drive backup error:', err);
    if (!silent) showToast('تعذّر الرفع إلى Google Drive، تأكد من الرابط وصلاحية النشر');
  } finally {
    isDriveBackingUp = false;
    if (!silent && btn) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'نسخ احتياطي إلى Google Drive الآن';
    }
  }
}

function checkAndRunDailyBackups() {
  if (!currentProfile || !isUnlocked) return;
  // 1. حفظ نسخة يومية تلقائية على الجوال نفسه (يعمل لكل جهاز/موظف)
  if (allRecords.length > 0) {
    saveDailyLocalSnapshot(false);
  }
  // 2. رفع نسخة يومية تلقائية إلى Google Drive بعد الساعة 12:00 ليلاً إذا كان الرابط مضبوطاً
  const bCfg = settings.backupConfig || DEFAULT_BACKUP_CONFIG;
  if (isAdmin() && bCfg.autoDailyEnabled !== false && bCfg.driveScriptUrl && navigator.onLine && allRecords.length > 0) {
    const lastDate = localStorage.getItem(wsKey('last_drive_backup_date')) || '';
    if (lastDate !== todayString()) {
      backupToGoogleDriveNow(true);
    }
  }
}

// فحص كل 10 دقائق في حال بقي التطبيق مفتوحاً عند مرور الساعة 12:00 ليلاً
setInterval(() => {
  if (isUnlocked && currentProfile) checkAndRunDailyBackups();
}, 10 * 60 * 1000);


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

registerPwaServiceWorker();

// بدء تشغيل التطبيق بعد تحميل كل الملفات
initApp();
