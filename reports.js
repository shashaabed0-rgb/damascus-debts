// ==================== واتساب (عادي أو أعمال) حسب تخصيص المستخدم ====================
function formatPhoneForWa(rawPhone) {
  let p = normalizeDigits(rawPhone || '').replace(/[^\d]/g, '');
  if (!p) return '';
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('9630')) {
    p = '963' + p.slice(4);
  } else if (p.startsWith('963')) {
    // جاهز بالرمز الدولي السوري
  } else if (p.startsWith('09') && p.length === 10) {
    p = '963' + p.slice(1);
  } else if (p.startsWith('9') && p.length === 9) {
    p = '963' + p;
  } else if (p.startsWith('0') && p.length >= 9 && p.length <= 10) {
    p = '963' + p.slice(1);
  }
  return p;
}

function getCurrencyUnitWord(code) {
  return code === 'SYP' ? 'ليرة سوري' : 'دولار';
}

function formatBalanceWaLine(balance, code) {
  const unit = getCurrencyUnitWord(code);
  if (Math.abs(balance) < 0.001) return `خالص (0 ${unit})`;
  if (balance > 0) return `المتبقي عليك: ${formatNum(balance)} ${unit}`;
  return `لك رصيد متبقي: ${formatNum(Math.abs(balance))} ${unit}`;
}

function getActiveCurrenciesForReport(cust, includeArchive = false) {
  const allCodes = ['USD', 'SYP'];
  const enabled = getEnabledCurrencyCodes();
  if (includeArchive) {
    // في الكشف الشامل / الأرشيف نظهر كل العملات التي فيها حركات (بما فيها العملة الملغاة)
    const withAny = allCodes.filter(code => cust.byCurrency[code] && cust.byCurrency[code].allRecords.length > 0);
    return withAny.length > 0 ? withAny : [enabled[0]];
  }
  // في الكشف الحالي نظهر كل عملة فيها حركات نشطة (تشمل العملة الملغاة طالما لم يتسدد رصيدها بالكامل)
  const activeList = allCodes.filter(code => cust.byCurrency[code] && cust.byCurrency[code].activeRecords.length > 0);
  if (activeList.length > 0) return activeList;
  const withEnabled = enabled.filter(code => cust.byCurrency[code] && cust.byCurrency[code].allRecords.length > 0);
  if (withEnabled.length > 0) return [withEnabled[0]];
  const withAny = allCodes.filter(code => cust.byCurrency[code] && cust.byCurrency[code].allRecords.length > 0);
  return withAny.length > 0 ? [withAny[0]] : [enabled[0]];
}

function buildWhatsAppMessageText(cust, specificTx = null, waCfgOverride = null) {
  const cfg = { ...DEFAULT_WA_CONFIG, ...(waCfgOverride || settings.waConfig || {}) };
  const activeCodes = getActiveCurrenciesForReport(cust);

  let latestTx = specificTx;
  if (!latestTx && cust.activeRecords && cust.activeRecords.length > 0) {
    latestTx = cust.activeRecords[cust.activeRecords.length - 1];
  } else if (!latestTx && cust.records && cust.records.length > 0) {
    latestTx = cust.records[cust.records.length - 1];
  }

  const lines = [];
  if (cfg.showShopName && settings.shopName) {
    lines.push(`*${settings.shopName}*`);
  }

  if (cfg.showGreeting) {
    const greet = (cfg.greetingText || 'السلام عليكم').trim();
    lines.push(`${greet} ${cleanDisplayCustomerName(cust.name)}،`);
  }

  if (cfg.showLatestTx && latestTx) {
    const txIsPay = latestTx.kind ? (latestTx.kind === 'pay') : isPayType(latestTx.type);
    const txCode = latestTx.currency || getRecordCurrency(latestTx);
    const txUnit = getCurrencyUnitWord(txCode);
    const txNote = String(latestTx.note || '').trim();
    const txDate = formatDate(latestTx.date || todayString());

    if (txIsPay) {
      const intro = (cfg.payIntroText || 'تم تسجيل دفعة جديدة في حسابك:').trim();
      lines.push(intro);
      lines.push(`• مبلغ الدفعة: ${formatNum(latestTx.amount)} ${txUnit}`);
    } else {
      const intro = (cfg.debtIntroText || 'تم تسجيل دين جديد على حسابك:').trim();
      lines.push(intro);
      lines.push(`• مبلغ الدين: ${formatNum(latestTx.amount)} ${txUnit}`);
    }
    if (cfg.showTxNote && txNote) {
      lines.push(`• البيان: ${txNote}`);
    }
    if (cfg.showTxDate) {
      lines.push(`• التاريخ: ${txDate}`);
    }
  }

  if (cfg.showSummary && (cfg.showTotalDebt || cfg.showTotalPay || cfg.showBalance)) {
    if (lines.length > 0 && cfg.showLatestTx && latestTx) lines.push(`----------------`);
    const sumTitle = (cfg.summaryTitleText || 'ملخص حسابك حتى تاريخ').trim();
    lines.push(`${sumTitle} ${todayString()}:`);

    if (activeCodes.length === 1) {
      const code = activeCodes[0];
      const info = cust.byCurrency[code];
      const unit = getCurrencyUnitWord(code);
      if (cfg.showTotalDebt) lines.push(`• إجمالي الدين: ${formatNum(info.totalDebt)} ${unit}`);
      if (cfg.showTotalPay) lines.push(`• المدفوع: ${formatNum(info.totalPay)} ${unit}`);
      if (cfg.showBalance) lines.push(`• ${formatBalanceWaLine(info.balance, code)}`);
    } else {
      activeCodes.forEach(code => {
        const info = cust.byCurrency[code];
        const unit = getCurrencyUnitWord(code);
        lines.push('');
        lines.push(`*حساب ${unit}:*`);
        if (cfg.showTotalDebt) lines.push(`• إجمالي الدين: ${formatNum(info.totalDebt)} ${unit}`);
        if (cfg.showTotalPay) lines.push(`• المدفوع: ${formatNum(info.totalPay)} ${unit}`);
        if (cfg.showBalance) lines.push(`• ${formatBalanceWaLine(info.balance, code)}`);
      });
    }
  }

  if (cfg.showShamCash && settings.shamCashEnabled && (settings.shamCashCode || '').trim()) {
    const shamLbl = (cfg.shamCashLabel || 'شام كاش:').trim();
    lines.push(`----------------`);
    lines.push(`${shamLbl} ${settings.shamCashCode.trim()}`);
  }

  if (cfg.showGeneralNote && (settings.generalNote || '').trim()) {
    lines.push(`----------------`);
    lines.push(settings.generalNote.trim());
  }

  if (cfg.showCustomNote && (cfg.customNoteText || '').trim()) {
    lines.push(`----------------`);
    lines.push(cfg.customNoteText.trim());
  }

  if (cfg.showContactInfo) {
    const phones = getShopPhonesList();
    const footerParts = [];
    if (settings.shopAddress) footerParts.push(settings.shopAddress);
    if (phones.length > 0) footerParts.push(phones.join(' / '));
    if (footerParts.length > 0) {
      lines.push(footerParts.join(' - '));
    }
  }

  return lines.join('\n');
}

function sendWhatsApp(specificTx = null, customerNameOverride = null) {
  const targetName = customerNameOverride || currentCustomerName;
  const cust = groupedCustomers.find(c => c.name === targetName);
  if (!cust) return;

  const text = buildWhatsAppMessageText(cust, specificTx);
  const msg = encodeURIComponent(text);
  const phone = formatPhoneForWa(cust.phone);
  const fallbackUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;

  if (/Android/i.test(navigator.userAgent)) {
    const pkg = settings.whatsappApp === 'business' ? 'com.whatsapp.w4b' : 'com.whatsapp';
    const query = phone ? `phone=${phone}&text=${msg}` : `text=${msg}`;
    window.location.href = `intent://send?${query}#Intent;scheme=whatsapp;package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  } else {
    window.open(fallbackUrl, '_blank');
  }
}

function buildOverdueReminderWhatsAppText(cust) {
  const activeCodes = getActiveCurrenciesForReport(cust).filter(code => cust.byCurrency[code].balance > 0.001);
  const codes = activeCodes.length > 0 ? activeCodes : getActiveCurrenciesForReport(cust);
  const dueInfo = cust.dueInfo || { status: 'none' };
  const lines = [];

  if (settings.shopName) lines.push(`*${settings.shopName}*`);
  lines.push(`السلام عليكم ${cleanDisplayCustomerName(cust.name)}،`);

  if (dueInfo.status === 'overdue' && dueInfo.dueDate) {
    lines.push(`نود تذكيركم بلطف بأن موعد تسديد الحساب المتفق عليه بتاريخ ${dueInfo.dueDate} قد مضى منذ ${formatArabicDays(dueInfo.daysOverdue)}.`);
  } else if (dueInfo.status === 'due_today' && dueInfo.dueDate) {
    lines.push(`نود تذكيركم بلطف بأن اليوم (${dueInfo.dueDate}) هو موعد تسديد الحساب المستحق لديكم.`);
  } else if (dueInfo.status === 'stale_overdue') {
    lines.push(`نود تذكيركم بلطف بتسوية الرصيد المستحق على حسابكم (آخر حركة بتاريخ ${dueInfo.lastDate || ''}).`);
  } else if (dueInfo.dueDate) {
    lines.push(`نود تذكيركم بلطف بموعد تسديد الحساب المستحق بتاريخ ${dueInfo.dueDate}.`);
  } else {
    lines.push(`نود تذكيركم بلطف بتسوية الرصيد المستحق على حسابكم.`);
  }

  lines.push(`----------------`);
  lines.push(`الرصيد المستحق حتى تاريخ ${todayString()}:`);
  codes.forEach(code => {
    const info = cust.byCurrency[code];
    if (info.balance > 0.001) {
      lines.push(`• ${formatBalanceWaLine(info.balance, code)}`);
    }
  });

  if (settings.shamCashEnabled && (settings.shamCashCode || '').trim()) {
    lines.push(`----------------`);
    lines.push(`شام كاش: ${settings.shamCashCode.trim()}`);
  }

  const phones = getShopPhonesList();
  const footerParts = [];
  if (settings.shopAddress) footerParts.push(settings.shopAddress);
  if (phones.length > 0) footerParts.push(phones.join(' / '));
  if (footerParts.length > 0) {
    lines.push(`----------------`);
    lines.push(footerParts.join(' - '));
  }
  lines.push(`شاكرين حسن تعاونكم.`);
  return lines.join('\n');
}

function sendOverdueWhatsAppReminder(encodedOrRawName = null) {
  let targetName = currentCustomerName;
  if (encodedOrRawName) {
    try { targetName = decodeURIComponent(encodedOrRawName); } catch (e) { targetName = encodedOrRawName; }
  }
  const cust = groupedCustomers.find(c => c.name === targetName);
  if (!cust) return;

  const text = buildOverdueReminderWhatsAppText(cust);
  const msg = encodeURIComponent(text);
  const phone = formatPhoneForWa(cust.phone);
  const fallbackUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;

  if (/Android/i.test(navigator.userAgent)) {
    const pkg = settings.whatsappApp === 'business' ? 'com.whatsapp.w4b' : 'com.whatsapp';
    const query = phone ? `phone=${phone}&text=${msg}` : `text=${msg}`;
    window.location.href = `intent://send?${query}#Intent;scheme=whatsapp;package=${pkg};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  } else {
    window.open(fallbackUrl, '_blank');
  }
}

// ==================== تصدير كشف PDF (سادة وخفيف الألوان للطباعة + دمج أنيق للعملتين) ====================
async function waitImagesAndPaint(rootEl) {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(res => { img.onload = res; img.onerror = res; });
  }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 90));
}

function extractCopyableAscii(rawText) {
  const t = String(rawText || '').trim();
  if (!t) return '';
  if (/^[\x20-\x7E]+$/.test(t)) return t;
  const m = t.match(/[A-Za-z0-9@._\-:+/]{3,}/g);
  return m ? m.join(' ') : '';
}

function formatPdfMoneyHtml(amount, unit, opts = {}) {
  const numStr = formatNum(amount);
  const numColor = opts.color || '#0f172a';
  const unitColor = opts.unitColor || '#475569';
  const weight = opts.weight || '800';
  const prefixHtml = opts.prefix
    ? `<span style="display:inline-block;color:${numColor};font-weight:${weight};">${escapeHtml(opts.prefix)}</span><span style="display:inline-block;width:5px;"></span>`
    : '';
  const suffixHtml = opts.suffix
    ? `<span style="display:inline-block;width:5px;"></span><span style="display:inline-block;color:#475569;font-size:11px;font-weight:700;">${escapeHtml(opts.suffix)}</span>`
    : '';
  return `<span dir="rtl" style="display:inline-block;white-space:nowrap;letter-spacing:0;">${prefixHtml}<span dir="ltr" style="display:inline-block;unicode-bidi:isolate;color:${numColor};font-weight:${weight};">${numStr}</span><span style="display:inline-block;width:5px;"></span><span style="display:inline-block;color:${unitColor};font-weight:700;">${escapeHtml(unit)}</span>${suffixHtml}</span>`;
}

function formatPdfTextHtml(rawText) {
  const s = String(rawText == null ? '' : rawText).trim();
  if (!s) return '—';
  const lines = s.split(/\r?\n/);
  const ltrRe = /[A-Za-z0-9٠-٩۰-۹]+(?:[ \t._:/\-+][A-Za-z0-9٠-٩۰-۹]+)*/g;

  return lines.map(line => {
    const parts = [];
    let lastIdx = 0;
    let m;
    ltrRe.lastIndex = 0;
    while ((m = ltrRe.exec(line)) !== null) {
      if (m.index > lastIdx) {
        parts.push({ type: 'rtl', text: line.slice(lastIdx, m.index) });
      }
      parts.push({ type: 'ltr', text: normalizeDigits(m[0]) });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < line.length) {
      parts.push({ type: 'rtl', text: line.slice(lastIdx) });
    }
    if (parts.length === 0) return '';

    const htmlParts = [];
    for (let i = 0; i < parts.length; i++) {
      const prev = parts[i - 1];
      const cur = parts[i];
      const next = parts[i + 1];

      if (cur.type === 'rtl') {
        let t = cur.text;
        if (prev && prev.type === 'ltr') t = t.replace(/^\s+/, '');
        if (next && next.type === 'ltr') t = t.replace(/\s+$/, '');
        if (t) {
          if (htmlParts.length > 0) {
            htmlParts.push('<span style="display:inline-block;width:5px;"></span>');
          }
          htmlParts.push(`<span>${escapeHtml(t)}</span>`);
        }
      } else {
        if (htmlParts.length > 0) {
          htmlParts.push('<span style="display:inline-block;width:5px;"></span>');
        }
        htmlParts.push(`<span dir="ltr" style="display:inline-block;unicode-bidi:isolate;white-space:normal;">${escapeHtml(cur.text)}</span>`);
      }
    }
    return htmlParts.join('');
  }).join('<br/>');
}

async function exportCustomerPDF(includeArchive = false) {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    return showToast('يرجى الاتصال بالإنترنت أول مرة لتحميل محرك PDF');
  }

  const isFullReport = Boolean(includeArchive);
  const activeCodes = getActiveCurrenciesForReport(cust, isFullReport);
  const headerCurrencyText = activeCodes.map(getCurrencyUnitWord).join(' / ');

  const overlay = document.getElementById('pdfBusyOverlay');
  overlay.classList.add('open');

  const prevScrollY = window.scrollY;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;top:0;left:0;width:740px;background:#ffffff;color:#111827;z-index:99990;direction:rtl;font-family:"Segoe UI",Tahoma,Arial,sans-serif;letter-spacing:0;word-spacing:normal;font-variant-ligatures:normal;padding:0;margin:0;';

  try {
    const logoHtml = settings.shopLogo
      ? `<img src="${settings.shopLogo}" style="width:58px;height:58px;object-fit:contain;border-radius:8px;border:1px solid #d1d5db;padding:3px;background:#ffffff;" />`
      : '';

    const shopPhones = getShopPhonesList();
    const shopAddressHtml = settings.shopAddress
      ? `<div style="font-size:12px;color:#4b5563;margin-top:3px;">${formatPdfTextHtml(settings.shopAddress)}</div>`
      : '';
    const shopPhonesHtml = shopPhones.length > 0
      ? `<div style="font-size:12px;color:#374151;margin-top:2px;font-weight:600;">هاتف: <span dir="ltr" style="unicode-bidi:embed;">${shopPhones.map(escapeHtml).join('  •  ')}</span></div>`
      : '';

    // 1. جدول الملخص الموحّد (مربعات بحدود شبكية كاملة وخفيفة للطباعة)
    const summaryRowsHtml = activeCodes.map(code => {
      const info = cust.byCurrency[code];
      const unit = getCurrencyUnitWord(code);

      let totalDebt = info.totalDebt;
      let totalPay = info.totalPay;
      let balance = info.balance;

      if (isFullReport) {
        totalDebt = 0;
        totalPay = 0;
        (info.allRecords || []).forEach(r => {
          if (r.kind === 'debt') totalDebt += r.amount;
          else totalPay += r.amount;
        });
        balance = totalDebt - totalPay;
      }

      let balCellHtml;
      if (Math.abs(balance) < 0.001) {
        balCellHtml = formatPdfMoneyHtml(0, unit, { color: '#334155', suffix: '(خالص)' });
      } else if (balance > 0) {
        balCellHtml = formatPdfMoneyHtml(balance, unit, { color: '#0f172a' });
      } else {
        balCellHtml = formatPdfMoneyHtml(Math.abs(balance), unit, { color: '#166534', prefix: 'له' });
      }
      return `
        <tr>
          <td style="padding:9px 10px;border:1px solid #cbd5e1;font-weight:800;color:#1e293b;text-align:right;background:#f8fafc;width:110px;">${unit}</td>
          <td style="padding:9px 10px;border:1px solid #cbd5e1;text-align:center;direction:rtl;">${formatPdfMoneyHtml(totalDebt, unit, { color: '#1f2937', weight: '700' })}</td>
          <td style="padding:9px 10px;border:1px solid #cbd5e1;text-align:center;direction:rtl;">${formatPdfMoneyHtml(totalPay, unit, { color: '#1f2937', weight: '700' })}</td>
          <td style="padding:9px 10px;border:1px solid #cbd5e1;text-align:center;direction:rtl;background:#fcfdff;">${balCellHtml}</td>
        </tr>
      `;
    }).join('');

    // 2. جدول الحركات المربع بالكامل (الحالية فقط أو كامل العمليات مع الأرشيف للمطابقة)
    const activeIdSet = new Set((cust.activeRecords || []).map(r => String(r.id)));
    let unifiedRecords;
    if (isFullReport) {
      unifiedRecords = [];
      activeCodes.forEach(code => {
        (cust.byCurrency[code].allRecords || []).forEach(r => unifiedRecords.push(r));
      });
      unifiedRecords.sort((a, b) => {
        const da = formatDate(a.date);
        const db = formatDate(b.date);
        if (da !== db) return da.localeCompare(db);
        return String(a.id).localeCompare(String(b.id));
      });
    } else {
      unifiedRecords = cust.activeRecords || [];
    }

    const txRowsHtml = unifiedRecords.map((r, i) => {
      const code = r.currency || getRecordCurrency(r);
      const unit = getCurrencyUnitWord(code);
      const isDebt = r.kind === 'debt';
      const isArchivedRow = isFullReport && !activeIdSet.has(String(r.id));
      const archBadge = isArchivedRow
        ? `<div style="font-size:10px;color:#64748b;font-weight:600;margin-top:2px;">(أرشيف)</div>`
        : '';
      return `
        <tr style="background:${i % 2 === 1 ? '#fafafa' : '#ffffff'};">
          <td style="padding:8px 6px;border:1px solid #cbd5e1;text-align:center;color:#475569;font-weight:700;">${i + 1}</td>
          <td style="padding:8px 6px;border:1px solid #cbd5e1;white-space:nowrap;color:#334155;text-align:center;"><span dir="ltr" style="display:inline-block;">${escapeHtml(formatDate(r.date))}</span></td>
          <td style="padding:8px 6px;border:1px solid #cbd5e1;font-weight:700;color:${isDebt ? '#1e293b' : '#334155'};white-space:nowrap;text-align:center;">${isDebt ? 'دين (+)' : 'دفعة (−)'}${archBadge}</td>
          <td style="padding:8px 7px;border:1px solid #cbd5e1;direction:rtl;text-align:center;white-space:nowrap;">${formatPdfMoneyHtml(r.amount, unit, { color: '#0f172a', weight: '800' })}</td>
          <td style="padding:8px 9px;border:1px solid #cbd5e1;color:#1e293b;font-size:13.5px;font-weight:600;line-height:1.6;">${r.note ? formatPdfTextHtml(r.note) : '—'}</td>
        </tr>
      `;
    }).join('');

    const mainBlock = document.createElement('div');
    mainBlock.style.cssText = 'width:740px;padding:18px 20px 14px;background:#ffffff;';
    mainBlock.innerHTML = `
      <div style="border:1.5px solid #94a3b8;border-radius:10px;padding:18px;background:#ffffff;">
        <!-- مربع الترويسة المعزول -->
        <div style="border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin-bottom:12px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHtml}
            <div>
              <div style="font-size:20px;font-weight:800;color:#1e293b;">${formatPdfTextHtml(settings.shopName || 'دفتر الديون')}</div>
              ${shopAddressHtml}
              ${shopPhonesHtml}
            </div>
          </div>
          <div style="text-align:left;font-size:12px;color:#475569;line-height:1.65;border-right:1px solid #cbd5e1;padding-right:14px;">
            <div style="font-size:14.5px;font-weight:800;color:#1e293b;">${isFullReport ? 'كشف حساب شامل (مطابقة)' : 'كشف حساب زبون'}</div>
            <div>التاريخ: ${todayString()}</div>
            <div>العملة: ${headerCurrencyText}</div>
          </div>
        </div>

        <!-- مربع بيانات الزبون المعزول -->
        <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;background:#ffffff;">
          <div>
            <span style="font-size:11.5px;color:#64748b;margin-left:6px;">اسم الزبون:</span>
            <span style="font-size:16px;font-weight:800;color:#0f172a;">${formatPdfTextHtml(cleanDisplayCustomerName(cust.name))}</span>
          </div>
          <div style="text-align:left;">
            <span style="font-size:11.5px;color:#64748b;margin-left:6px;">الهاتف:</span>
            <span style="font-size:13.5px;font-weight:700;direction:ltr;unicode-bidi:embed;color:#0f172a;">${escapeHtml(cust.phone || '—')}</span>
          </div>
        </div>

        <!-- جدول الملخص المربع -->
        <table style="width:100%;border-collapse:collapse;font-size:12.8px;margin-bottom:14px;border:1.2px solid #94a3b8;">
          <thead>
            <tr style="background:#f1f5f9;color:#1e293b;">
              <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:800;">العملة</th>
              <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">إجمالي الديون</th>
              <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">إجمالي الدفعات</th>
              <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;">الرصيد المتبقي</th>
            </tr>
          </thead>
          <tbody>${summaryRowsHtml}</tbody>
        </table>

        <!-- عنوان وجدول الحركات المربع بالكامل -->
        <div style="font-size:12.5px;font-weight:800;color:#334155;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>${isFullReport ? 'جدول كامل العمليات (الحالية + الأرشيف)' : 'جدول العمليات والحركات'}</span>
          <span style="font-size:11.5px;color:#64748b;font-weight:700;">عدد الحركات: ${unifiedRecords.length}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12.6px;border:1.2px solid #94a3b8;">
          <thead>
            <tr style="background:#f1f5f9;color:#1e293b;">
              <th style="padding:9px 6px;border:1px solid #cbd5e1;width:34px;text-align:center;font-weight:800;">#</th>
              <th style="padding:9px 6px;border:1px solid #cbd5e1;width:96px;text-align:center;font-weight:800;">التاريخ</th>
              <th style="padding:9px 6px;border:1px solid #cbd5e1;width:74px;text-align:center;font-weight:800;">النوع</th>
              <th style="padding:9px 6px;border:1px solid #cbd5e1;width:150px;text-align:center;font-weight:800;">المبلغ</th>
              <th style="padding:9px 8px;border:1px solid #cbd5e1;text-align:right;font-weight:800;">الملاحظات</th>
            </tr>
          </thead>
          <tbody>${txRowsHtml || `<tr><td colspan="5" style="padding:12px;border:1px solid #cbd5e1;text-align:center;color:#64748b;">لا توجد حركات</td></tr>`}</tbody>
        </table>
      </div>
    `;
    stage.appendChild(mainBlock);

    const generalNote = (settings.generalNote || '').trim();
    let generalNoteEl = null;
    if (generalNote) {
      generalNoteEl = document.createElement('div');
      generalNoteEl.style.cssText = 'width:740px;padding:0 20px;background:#ffffff;';
      generalNoteEl.innerHTML = `
        <div style="background:#ffffff;border:1px solid #d1d5db;border-right:3px solid #4b5563;border-radius:8px;padding:10px 14px;color:#374151;font-size:12.5px;line-height:1.6;">
          <div style="font-size:12px;font-weight:800;color:#111827;margin-bottom:2px;">ملاحظة عامة:</div>
          <div style="line-height:1.65;">${formatPdfTextHtml(generalNote)}</div>
        </div>
      `;
      stage.appendChild(generalNoteEl);
    }

    const shamEnabled = Boolean(settings.shamCashEnabled && (settings.shamCashCode || '').trim());
    const shamRaw = (settings.shamCashCode || '').trim();
    const shamAscii = extractCopyableAscii(shamRaw);
    let shamLabelEl = null;
    let shamCopyBtnEl = null;
    if (shamEnabled) {
      shamLabelEl = document.createElement('div');
      shamLabelEl.style.cssText = 'width:215px;background:#f9fafb;padding:6px 4px;text-align:center;line-height:1.4;letter-spacing:0;';
      shamLabelEl.innerHTML = `
        <div style="color:#111827;font-size:15.5px;font-weight:800;">شام كاش</div>
        <div style="color:#4b5563;font-size:11px;font-weight:700;margin-top:3px;">اضغط نسخ أو حدّد الرمز للدفع</div>
      `;
      stage.appendChild(shamLabelEl);

      shamCopyBtnEl = document.createElement('div');
      shamCopyBtnEl.style.cssText = 'width:122px;height:48px;background:#ffffff;color:#111827;font-size:14.5px;font-weight:800;border-radius:9px;display:flex;align-items:center;justify-content:center;border:2px solid #374151;letter-spacing:0;';
      shamCopyBtnEl.innerHTML = `<span>نسخ الرمز</span>`;
      stage.appendChild(shamCopyBtnEl);
    }

    document.body.appendChild(stage);
    window.scrollTo(0, 0);
    await waitImagesAndPaint(stage);

    const mainCanvas = await html2canvas(mainBlock, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      width: 740, windowWidth: 740, scrollX: 0, scrollY: 0
    });

    let genNoteCanvas = null;
    if (generalNoteEl) {
      genNoteCanvas = await html2canvas(generalNoteEl, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        width: 740, windowWidth: 740, scrollX: 0, scrollY: 0
      });
    }

    let shamLabelCanvas = null;
    let shamCopyBtnCanvas = null;
    if (shamLabelEl) {
      shamLabelCanvas = await html2canvas(shamLabelEl, {
        scale: 2, useCORS: true, backgroundColor: '#f9fafb',
        width: 215, windowWidth: 215, scrollX: 0, scrollY: 0
      });
    }
    if (shamCopyBtnEl) {
      shamCopyBtnCanvas = await html2canvas(shamCopyBtnEl, {
        scale: 2, useCORS: true, backgroundColor: '#f9fafb',
        width: 122, windowWidth: 122, scrollX: 0, scrollY: 0
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 10, marginY = 10;
    const usableW = 190, usableH = 277;

    const pagePxH = Math.floor(mainCanvas.width * (usableH / usableW));
    let renderedPx = 0;
    let curY = marginY;

    while (renderedPx < mainCanvas.height) {
      if (renderedPx > 0) doc.addPage();
      const slicePx = Math.min(pagePxH, mainCanvas.height - renderedPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = mainCanvas.width;
      sliceCanvas.height = slicePx;
      const ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(mainCanvas, 0, renderedPx, mainCanvas.width, slicePx, 0, 0, mainCanvas.width, slicePx);

      const sliceMmH = (slicePx / mainCanvas.width) * usableW;
      doc.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', marginX, marginY, usableW, sliceMmH);
      curY = marginY + sliceMmH;
      renderedPx += slicePx;
    }

    if (genNoteCanvas) {
      const noteMmH = (genNoteCanvas.height / genNoteCanvas.width) * usableW;
      if (curY + noteMmH + 4 > 286) {
        doc.addPage();
        curY = 12;
      } else {
        curY += 3;
      }
      doc.addImage(genNoteCanvas.toDataURL('image/png'), 'PNG', marginX, curY, usableW, noteMmH);
      curY += noteMmH;
    }

    if (shamEnabled) {
      const codeToWrite = shamAscii || shamRaw;
      doc.setFont('courier', 'bold');
      doc.setFontSize(12);
      const innerMargin = 5;
      const boxX = marginX + innerMargin;
      const boxW = usableW - innerMargin * 2;

      const lblW = 48;
      const lblH = shamLabelCanvas ? (shamLabelCanvas.height / shamLabelCanvas.width) * lblW : 13;
      const copyBtnW = 28;
      const copyBtnH = shamCopyBtnCanvas ? (shamCopyBtnCanvas.height / shamCopyBtnCanvas.width) * copyBtnW : 11;

      const lblX = boxX + boxW - lblW - 3;
      const copyBtnX = lblX - copyBtnW - 2.5;
      const codeBoxX = boxX + 4;
      const codeBoxW = copyBtnX - codeBoxX - 3.5;

      const codeLines = doc.splitTextToSize(codeToWrite, codeBoxW - 6);
      const boxH = Math.max(22, lblH + 4, copyBtnH + 6, codeLines.length * 6.2 + 8);

      if (curY + boxH + 7 > 286) {
        doc.addPage();
        curY = 14;
      } else {
        curY += 5;
      }

      // خلفية خفيفة جداً مناسبة للطباعة العادية والأسود والأبيض
      doc.setFillColor(249, 250, 251);
      doc.setDrawColor(156, 163, 175);
      doc.setLineWidth(0.45);
      doc.roundedRect(boxX, curY, boxW, boxH, 3, 3, 'FD');

      if (shamLabelCanvas) {
        const lblY = curY + (boxH - lblH) / 2;
        doc.addImage(shamLabelCanvas.toDataURL('image/png'), 'PNG', lblX, lblY, lblW, lblH);
      }

      const copyBtnY = curY + (boxH - copyBtnH) / 2;
      if (shamCopyBtnCanvas) {
        doc.addImage(shamCopyBtnCanvas.toDataURL('image/png'), 'PNG', copyBtnX, copyBtnY, copyBtnW, copyBtnH);
      }

      const copyUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        ? `${window.location.origin}${window.location.pathname}?copy=${encodeURIComponent(codeToWrite)}&shop=${encodeURIComponent(settings.shopName || '')}`
        : '';

      if (copyUrl) {
        doc.link(copyBtnX, copyBtnY, copyBtnW, copyBtnH, { url: copyUrl });
      }

      const codeBoxH = boxH - 5;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(156, 163, 175);
      doc.setLineWidth(0.35);
      doc.roundedRect(codeBoxX, curY + 2.5, codeBoxW, codeBoxH, 2.2, 2.2, 'FD');

      doc.setFont('courier', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      const totalTextH = codeLines.length * 6.0;
      let textY = curY + (boxH - totalTextH) / 2 + 4.6;
      codeLines.forEach(line => {
        doc.text(line, codeBoxX + codeBoxW / 2, textY, { align: 'center' });
        textY += 6.0;
      });
    }

    const displayCustName = cleanDisplayCustomerName(cust.name);
    const safeName = displayCustName.replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'كشف_حساب';
    const dateSlug = todayString().replace(/\//g, '-');
    const fileName = `${safeName}_${dateSlug}.pdf`;
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const shareLabel = `${displayCustName} - ${todayString()}`;

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({
        files: [pdfFile],
        title: shareLabel,
        text: shareLabel
      });
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast('تم تحميل كشف الحساب PDF');
    }
  } catch (err) {
    if (!err || err.name !== 'AbortError') {
      showToast('حدث خطأ أثناء إنشاء التقرير، حاول مجدداً');
    }
  } finally {
    if (stage.parentNode) stage.parentNode.removeChild(stage);
    window.scrollTo(0, prevScrollY);
    overlay.classList.remove('open');
  }
}
