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
  const fallbackLayers = ['sideMenu', 'confirmModal', 'editCustomerModal', 'addModal', 'accountsView', 'settingsView', 'detailView'];
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

// ==================== تقسيم الدورات (طي العمليات المسدّدة القديمة) ====================
function buildCustomerCycles(rawRecords) {
  const ordered = rawRecords.map((r, i) => ({ ...r, _ord: i, _normDate: formatDate(r.date) }));
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

  let activeCycle;
  let archivedCycles;

  if (curRecords.length > 0) {
    activeCycle = { records: curRecords, totalDebt: curDebt, totalPay: curPay, balance: running };
    archivedCycles = settledCycles;
  } else if (settledCycles.length > 0) {
    activeCycle = settledCycles[settledCycles.length - 1];
    archivedCycles = settledCycles.slice(0, -1);
  } else {
    activeCycle = { records: [], totalDebt: 0, totalPay: 0, balance: 0 };
    archivedCycles = [];
  }

  return { activeCycle, archivedCycles };
}

// ==================== معالجة وعرض الزبائن ====================
function processAndRender() {
  const curr = getCurr();
  document.getElementById('activeCurrName').textContent = curr.name;
  document.getElementById('txCurrLabel').textContent = curr.symbol;

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
    const amt = Number(r.amount) || 0;
    map[name].rawRecords.push({ ...r, kind, amount: amt, pending: pendingAddIds.has(String(r.id)) });
  });

  groupedCustomers = Object.values(map).map(entry => {
    const { activeCycle, archivedCycles } = buildCustomerCycles(entry.rawRecords);
    const archivedCount = archivedCycles.reduce((acc, c) => acc + c.records.length, 0);
    return {
      name: entry.name,
      phone: entry.phone,
      records: entry.rawRecords,
      activeRecords: activeCycle.records,
      archivedCycles,
      archivedCount,
      totalDebt: activeCycle.totalDebt,
      totalPay: activeCycle.totalPay,
      balance: activeCycle.balance
    };
  }).sort((a, b) => {
    const aHas = a.balance > 0.001 ? 1 : 0;
    const bHas = b.balance > 0.001 ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return a.name.localeCompare(b.name, 'ar');
  });

  let grandTotal = 0, indebtedCount = 0;
  groupedCustomers.forEach(c => {
    if (c.balance > 0.001) { grandTotal += c.balance; indebtedCount++; }
  });

  document.getElementById('totalDebtVal').textContent = `${formatNum(grandTotal)} ${curr.symbol}`;
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

function renderCustomers() {
  const curr = getCurr();
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  visibleCustomers = groupedCustomers.filter(c => {
    const matches = !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
    if (!matches) return false;
    if (currentFilter === 'debt') return c.balance > 0.001;
    if (currentFilter === 'zero') return Math.abs(c.balance) < 0.001;
    return true;
  });

  const listEl = document.getElementById('customerList');
  if (visibleCustomers.length === 0) {
    listEl.innerHTML = `<div class="empty-box">لا توجد حسابات مطابقة.<br><small>اضغط على "عملية جديدة" لتسجيل أول دين.</small></div>`;
    return;
  }

  listEl.innerHTML = visibleCustomers.map((c, idx) => {
    let pill = `<span class="bal-pill bal-zero">خالص</span>`;
    if (c.balance > 0.001) pill = `<span class="bal-pill bal-debt">${formatNum(c.balance)} ${curr.symbol}</span>`;
    else if (c.balance < -0.001) pill = `<span class="bal-pill bal-credit">له ${formatNum(Math.abs(c.balance))} ${curr.symbol}</span>`;

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
        ${pill}
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

function renderTxCardHtml(r, curr, isArchived = false) {
  const sign = r.kind === 'debt' ? '+' : '−';
  const lbl = r.kind === 'debt' ? 'دين' : 'دفعة';
  const safeId = escapeHtml(r.id);
  const byTxt = r.created_by ? ` • ${escapeHtml(r.created_by)}` : '';
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
  const curr = getCurr();

  document.getElementById('detailName').textContent = cust.name;
  document.getElementById('detailPhone').textContent = cust.phone ? cust.phone : 'بدون رقم هاتف';
  document.getElementById('detailTotalDebt').textContent = `${formatNum(cust.totalDebt)} ${curr.symbol}`;
  document.getElementById('detailTotalPay').textContent = `${formatNum(cust.totalPay)} ${curr.symbol}`;
  document.getElementById('activeSectionTitle').textContent =
    cust.archivedCount > 0 ? 'الحركات الحالية (تُدرج في كشف PDF)' : 'سجل الحركات';
  document.getElementById('detailTxCount').textContent = `${cust.activeRecords.length} حركة`;

  const balEl = document.getElementById('detailBalance');
  if (Math.abs(cust.balance) < 0.001) {
    balEl.innerHTML = `<span style="color:var(--muted)">0 ${curr.symbol}</span>`;
  } else if (cust.balance > 0) {
    balEl.innerHTML = `<span style="color:var(--danger)">${formatNum(cust.balance)} ${curr.symbol}</span>`;
  } else {
    balEl.innerHTML = `<span style="color:var(--success)">له ${formatNum(Math.abs(cust.balance))} ${curr.symbol}</span>`;
  }

  const activeList = [...cust.activeRecords].reverse();
  document.getElementById('detailTxList').innerHTML = activeList.map(r => renderTxCardHtml(r, curr, false)).join('');

  const drawer = document.getElementById('archiveDrawer');
  if (cust.archivedCycles.length > 0) {
    drawer.classList.remove('hidden');
    document.getElementById('archiveCountBadge').textContent = `${cust.archivedCount} حركة`;
    const archHtml = [...cust.archivedCycles].reverse().map((cyc, idx) => {
      const cycleNum = cust.archivedCycles.length - idx;
      const range = cyc.startDate === cyc.endDate ? cyc.endDate : `${cyc.startDate} ← ${cyc.endDate}`;
      const rows = [...cyc.records].reverse().map(r => renderTxCardHtml(r, curr, true)).join('');
      return `
        <div class="cycle-divider">
          <span>حساب سابق #${cycleNum} (${escapeHtml(range)})</span>
          <span class="cycle-settled-tag">مسدّد (${formatNum(cyc.totalDebt)} ${curr.symbol})</span>
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
function openAddModal(prefillName = '', prefillPhone = '', defaultKind = 'debt') {
  editingTxId = null;
  document.getElementById('txModalTitle').textContent = 'تسجيل عملية جديدة';
  document.getElementById('saveTxBtn').textContent = 'حفظ العملية';
  document.getElementById('txName').value = prefillName;
  document.getElementById('txPhone').value = prefillPhone;
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';
  document.getElementById('txDate').value = toInputDate(todayString());
  document.getElementById('txDateField').classList.add('hidden');
  document.getElementById('txCurrLabel').textContent = getCurr().symbol;
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
  document.getElementById('txCurrLabel').textContent = getCurr().symbol;
  setTxKind(isPayType(rec.type) ? 'pay' : 'debt');
  openModal('addModal');
}

function quickAddForCurrent(kind) {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  openAddModal(cust.name, cust.phone, kind);
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

  const curr = getCurr();
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
      currency: settings.currency
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
