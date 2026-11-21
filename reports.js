// ==================== واتساب (عادي أو أعمال) حسب تخصيص المستخدم ====================
function formatPhoneForWa(rawPhone) {
  let p = String(rawPhone || '').replace(/[^\d]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('09') && p.length === 10) p = '963' + p.slice(1);
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

function getActiveCurrenciesForReport(cust) {
  const enabled = getEnabledCurrencyCodes();
  const list = enabled.filter(code => cust.byCurrency[code] && cust.byCurrency[code].activeRecords.length > 0);
  if (list.length > 0) return list;
  const withAny = enabled.filter(code => cust.byCurrency[code] && cust.byCurrency[code].allRecords.length > 0);
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
    lines.push(`${greet} ${cust.name}،`);
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

async function exportCustomerPDF() {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    return showToast('يرجى الاتصال بالإنترنت أول مرة لتحميل محرك PDF');
  }

  const activeCodes = getActiveCurrenciesForReport(cust);
  const headerCurrencyText = activeCodes.map(getCurrencyUnitWord).join(' / ');

  const overlay = document.getElementById('pdfBusyOverlay');
  overlay.classList.add('open');

  const prevScrollY = window.scrollY;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;top:0;left:0;width:740px;background:#ffffff;color:#111827;z-index:99990;direction:rtl;font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:0;margin:0;';

  try {
    const logoHtml = settings.shopLogo
      ? `<img src="${settings.shopLogo}" style="width:58px;height:58px;object-fit:contain;border-radius:8px;border:1px solid #d1d5db;padding:3px;background:#ffffff;" />`
      : '';

    const shopPhones = getShopPhonesList();
    const shopAddressHtml = settings.shopAddress
      ? `<div style="font-size:12px;color:#4b5563;margin-top:3px;">${escapeHtml(settings.shopAddress)}</div>`
      : '';
    const shopPhonesHtml = shopPhones.length > 0
      ? `<div style="font-size:12px;color:#374151;margin-top:2px;font-weight:600;">هاتف: <span dir="ltr" style="unicode-bidi:embed;">${shopPhones.map(escapeHtml).join('  •  ')}</span></div>`
      : '';

    // 1. جدول الملخص الموحّد (دولار + ليرة سوري فوق بعض بألوان خفيفة مناسبة للطباعة)
    const summaryRowsHtml = activeCodes.map((code, idx) => {
      const info = cust.byCurrency[code];
      const unit = getCurrencyUnitWord(code);
      const balText = Math.abs(info.balance) < 0.001
        ? `0 ${unit} (خالص)`
        : (info.balance > 0 ? `${formatNum(info.balance)} ${unit}` : `له ${formatNum(Math.abs(info.balance))} ${unit}`);
      const borderTop = idx > 0 ? 'border-top:1px solid #e5e7eb;' : '';
      return `
        <tr style="${borderTop}">
          <td style="padding:9px 10px;font-weight:800;color:#111827;text-align:right;width:110px;">${unit}</td>
          <td style="padding:9px 10px;text-align:center;font-weight:700;color:#1f2937;direction:ltr;">${formatNum(info.totalDebt)} ${unit}</td>
          <td style="padding:9px 10px;text-align:center;font-weight:700;color:#1f2937;direction:ltr;">${formatNum(info.totalPay)} ${unit}</td>
          <td style="padding:9px 10px;text-align:center;font-weight:800;color:#111827;direction:ltr;">${balText}</td>
        </tr>
      `;
    }).join('');

    // 2. جدول الحركات الموحّد والأنيق (سادة وخفيف الألوان للطباعة)
    const unifiedRecords = cust.activeRecords || [];
    const txRowsHtml = unifiedRecords.map((r, i) => {
      const code = r.currency || getRecordCurrency(r);
      const unit = getCurrencyUnitWord(code);
      const isDebt = r.kind === 'debt';
      return `
        <tr style="background:${i % 2 === 1 ? '#fafafa' : '#ffffff'};">
          <td style="padding:8px 7px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;">${i + 1}</td>
          <td style="padding:8px 7px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:#374151;">${escapeHtml(formatDate(r.date))}</td>
          <td style="padding:8px 7px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${isDebt ? '#374151' : '#4b5563'};white-space:nowrap;">${isDebt ? 'دين (+)' : 'دفعة (−)'}</td>
          <td style="padding:8px 7px;border-bottom:1px solid #e5e7eb;direction:ltr;text-align:right;font-weight:800;color:#111827;white-space:nowrap;">${formatNum(r.amount)} ${unit}</td>
          <td style="padding:8px 7px;border-bottom:1px solid #e5e7eb;color:#374151;">${escapeHtml(r.note || '—')}</td>
        </tr>
      `;
    }).join('');

    const mainBlock = document.createElement('div');
    mainBlock.style.cssText = 'width:740px;padding:24px 26px 14px;background:#ffffff;';
    mainBlock.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #374151;padding-bottom:12px;margin-bottom:14px;gap:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHtml}
          <div>
            <div style="font-size:21px;font-weight:800;color:#111827;">${escapeHtml(settings.shopName || 'دفتر الديون')}</div>
            ${shopAddressHtml}
            ${shopPhonesHtml}
          </div>
        </div>
        <div style="text-align:left;font-size:12px;color:#4b5563;line-height:1.6;">
          <div style="font-size:15px;font-weight:800;color:#111827;">كشف حساب زبون</div>
          <div>التاريخ: ${todayString()}</div>
          <div>العملة: ${headerCurrencyText}</div>
        </div>
      </div>

      <div style="border:1px solid #d1d5db;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;background:#ffffff;">
        <div>
          <span style="font-size:11.5px;color:#6b7280;margin-left:6px;">اسم الزبون:</span>
          <span style="font-size:16.5px;font-weight:800;color:#111827;">${escapeHtml(cust.name)}</span>
        </div>
        <div style="text-align:left;">
          <span style="font-size:11.5px;color:#6b7280;margin-left:6px;">الهاتف:</span>
          <span style="font-size:13.5px;font-weight:700;direction:ltr;unicode-bidi:embed;color:#111827;">${escapeHtml(cust.phone || '—')}</span>
        </div>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;color:#111827;border-bottom:1px solid #cbd5e1;">
              <th style="padding:8px 10px;text-align:right;font-weight:800;">العملة</th>
              <th style="padding:8px 10px;text-align:center;font-weight:800;">إجمالي الديون</th>
              <th style="padding:8px 10px;text-align:center;font-weight:800;">إجمالي الدفعات</th>
              <th style="padding:8px 10px;text-align:center;font-weight:800;">الرصيد المتبقي</th>
            </tr>
          </thead>
          <tbody>${summaryRowsHtml}</tbody>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12.8px;border:1px solid #d1d5db;">
        <thead>
          <tr style="background:#f3f4f6;color:#111827;border-bottom:1.5px solid #9ca3af;">
            <th style="padding:9px 7px;width:36px;text-align:center;font-weight:800;">#</th>
            <th style="padding:9px 7px;width:102px;text-align:right;font-weight:800;">التاريخ</th>
            <th style="padding:9px 7px;width:82px;text-align:right;font-weight:800;">النوع</th>
            <th style="padding:9px 7px;width:155px;text-align:right;font-weight:800;">المبلغ</th>
            <th style="padding:9px 7px;text-align:right;font-weight:800;">الملاحظات</th>
          </tr>
        </thead>
        <tbody>${txRowsHtml || `<tr><td colspan="5" style="padding:12px;text-align:center;color:#6b7280;">لا توجد حركات</td></tr>`}</tbody>
      </table>
    `;
    stage.appendChild(mainBlock);

    const generalNote = (settings.generalNote || '').trim();
    let generalNoteEl = null;
    if (generalNote) {
      generalNoteEl = document.createElement('div');
      generalNoteEl.style.cssText = 'width:740px;padding:0 26px;background:#ffffff;';
      generalNoteEl.innerHTML = `
        <div style="background:#ffffff;border:1px solid #d1d5db;border-right:3px solid #4b5563;border-radius:8px;padding:10px 14px;color:#374151;font-size:12.5px;line-height:1.6;">
          <div style="font-size:12px;font-weight:800;color:#111827;margin-bottom:2px;">ملاحظة عامة:</div>
          <div style="white-space:pre-wrap;">${escapeHtml(generalNote)}</div>
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
      shamLabelEl.style.cssText = 'width:210px;background:#f9fafb;padding:6px 4px;text-align:center;line-height:1.35;';
      shamLabelEl.innerHTML = `
        <div style="color:#111827;font-size:15.5px;font-weight:800;">شام كاش</div>
        <div style="color:#4b5563;font-size:11.5px;font-weight:700;margin-top:3px;">يمكنك نسخ الرمز للدفع</div>
      `;
      stage.appendChild(shamLabelEl);

      shamCopyBtnEl = document.createElement('div');
      shamCopyBtnEl.style.cssText = 'width:104px;height:46px;background:#ffffff;color:#111827;font-size:15.5px;font-weight:800;border-radius:9px;display:flex;align-items:center;justify-content:center;border:2px solid #374151;';
      shamCopyBtnEl.innerHTML = `<span>نسخ</span>`;
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
        width: 210, windowWidth: 210, scrollX: 0, scrollY: 0
      });
    }
    if (shamCopyBtnEl) {
      shamCopyBtnCanvas = await html2canvas(shamCopyBtnEl, {
        scale: 2, useCORS: true, backgroundColor: '#f9fafb',
        width: 104, windowWidth: 104, scrollX: 0, scrollY: 0
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
      const innerMargin = 7;
      const boxX = marginX + innerMargin;
      const boxW = usableW - innerMargin * 2;

      const lblW = 46;
      const lblH = shamLabelCanvas ? (shamLabelCanvas.height / shamLabelCanvas.width) * lblW : 13;
      const copyBtnW = 22;
      const copyBtnH = shamCopyBtnCanvas ? (shamCopyBtnCanvas.height / shamCopyBtnCanvas.width) * copyBtnW : 10;

      const lblX = boxX + boxW - lblW - 3;
      const copyBtnX = lblX - copyBtnW - 2.5;
      const codeBoxX = boxX + 4;
      const codeBoxW = copyBtnX - codeBoxX - 3.5;

      const codeLines = doc.splitTextToSize(codeToWrite, codeBoxW - 6);
      const boxH = Math.max(20, lblH + 4, copyBtnH + 6, codeLines.length * 6.0 + 8);

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

    const safeName = cust.name.replace(/[^\u0600-\u06FFa-zA-Z0-9_\- ]/g, '').trim() || 'كشف_حساب';
    const fileName = `كشف_حساب_${safeName}.pdf`;
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({
        files: [pdfFile],
        title: `كشف حساب ${cust.name}`,
        text: `كشف حساب ${cust.name} - ${settings.shopName}`
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
