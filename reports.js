// ==================== واتساب (عادي أو أعمال) مع دعم العملتين وإعلام العميل بالدين الجديد ====================
function formatPhoneForWa(rawPhone) {
  let p = String(rawPhone || '').replace(/[^\d]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('09') && p.length === 10) p = '963' + p.slice(1);
  return p;
}

function formatBalanceWaLine(balance, symbol) {
  if (Math.abs(balance) < 0.001) return `خالص (0 ${symbol})`;
  if (balance > 0) return `المتبقي عليك: ${formatNum(balance)} ${symbol}`;
  return `لك رصيد متبقي: ${formatNum(Math.abs(balance))} ${symbol}`;
}

function getActiveCurrenciesForReport(cust) {
  const enabled = getEnabledCurrencyCodes();
  const list = enabled.filter(code => cust.byCurrency[code] && cust.byCurrency[code].activeRecords.length > 0);
  if (list.length > 0) return list;
  const withAny = enabled.filter(code => cust.byCurrency[code] && cust.byCurrency[code].allRecords.length > 0);
  return withAny.length > 0 ? [withAny[0]] : [enabled[0]];
}

function sendWhatsApp(specificTx = null, customerNameOverride = null) {
  const targetName = customerNameOverride || currentCustomerName;
  const cust = groupedCustomers.find(c => c.name === targetName);
  if (!cust) return;

  const activeCodes = getActiveCurrenciesForReport(cust);

  // تحديد أحدث عملية (أو العملية المحددة) لإعلام العميل بالدين الجديد وما هو وبأي عملة
  let latestTx = specificTx;
  if (!latestTx && cust.activeRecords && cust.activeRecords.length > 0) {
    latestTx = cust.activeRecords[cust.activeRecords.length - 1];
  } else if (!latestTx && cust.records && cust.records.length > 0) {
    latestTx = cust.records[cust.records.length - 1];
  }

  const lines = [];
  if (settings.shopName) lines.push(`*${settings.shopName}*`);
  lines.push(`السلام عليكم ${cust.name}،`);

  if (latestTx) {
    const txIsPay = latestTx.kind ? (latestTx.kind === 'pay') : isPayType(latestTx.type);
    const txCurr = getCurr(latestTx.currency || getRecordCurrency(latestTx));
    const txNote = String(latestTx.note || '').trim();
    const txDate = formatDate(latestTx.date || todayString());
    if (txIsPay) {
      lines.push(`تم تسجيل *دفعة جديدة* في حسابك:`);
      lines.push(`• مبلغ الدفعة: ${formatNum(latestTx.amount)} ${txCurr.symbol}`);
    } else {
      lines.push(`تم تسجيل *دين جديد* على حسابك:`);
      lines.push(`• مبلغ الدين: ${formatNum(latestTx.amount)} ${txCurr.symbol}`);
    }
    if (txNote) {
      lines.push(`• البيان: ${txNote}`);
    }
    lines.push(`• التاريخ: ${txDate}`);
    lines.push(`----------------`);
  }

  lines.push(`ملخص حسابك حتى تاريخ ${todayString()}:`);

  if (activeCodes.length === 1) {
    const code = activeCodes[0];
    const info = cust.byCurrency[code];
    const curr = getCurr(code);
    lines.push(`• إجمالي الدين: ${formatNum(info.totalDebt)} ${curr.symbol}`);
    lines.push(`• المدفوع: ${formatNum(info.totalPay)} ${curr.symbol}`);
    lines.push(`• ${formatBalanceWaLine(info.balance, curr.symbol)}`);
  } else {
    activeCodes.forEach(code => {
      const info = cust.byCurrency[code];
      const curr = getCurr(code);
      lines.push('');
      lines.push(`*حساب ${curr.name} (${curr.symbol}):*`);
      lines.push(`• إجمالي الدين: ${formatNum(info.totalDebt)} ${curr.symbol}`);
      lines.push(`• المدفوع: ${formatNum(info.totalPay)} ${curr.symbol}`);
      lines.push(`• ${formatBalanceWaLine(info.balance, curr.symbol)}`);
    });
  }

  if (settings.shamCashEnabled && (settings.shamCashCode || '').trim()) {
    lines.push(`----------------`);
    lines.push(`شام كاش: ${settings.shamCashCode.trim()}`);
  }
  if ((settings.generalNote || '').trim()) {
    lines.push(`----------------`);
    lines.push(settings.generalNote.trim());
  }

  const phones = getShopPhonesList();
  const footerParts = [];
  if (settings.shopAddress) footerParts.push(settings.shopAddress);
  if (phones.length > 0) footerParts.push(phones.join(' / '));
  if (footerParts.length > 0) {
    lines.push(footerParts.join(' - '));
  }

  const msg = encodeURIComponent(lines.join('\n'));
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

// ==================== تصدير كشف PDF (دعم العملتين بشكل منفصل + تعدد الهواتف + نسخ شام كاش) ====================
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

function buildPdfCurrencySectionHtml(code, info, showSectionHeader) {
  const curr = getCurr(code);
  const accent = code === 'USD' ? '#1e3a8a' : '#b45309';
  const softBg = code === 'USD' ? '#eff6ff' : '#fffbeb';
  const softBorder = code === 'USD' ? '#bfdbfe' : '#fde68a';

  const balText = Math.abs(info.balance) < 0.001
    ? `0 ${curr.symbol} (خالص)`
    : (info.balance > 0 ? `${formatNum(info.balance)} ${curr.symbol}` : `له ${formatNum(Math.abs(info.balance))} ${curr.symbol}`);

  const rowsHtml = info.activeRecords.map((r, i) => `
    <tr style="background:${i % 2 === 1 ? '#f8fafc' : '#ffffff'};">
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${i + 1}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(formatDate(r.date))}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;font-weight:700;color:${r.kind === 'debt' ? '#dc2626' : '#15803d'};">${r.kind === 'debt' ? 'دين (+)' : 'دفعة (−)'}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;direction:ltr;text-align:right;font-weight:800;white-space:nowrap;">${formatNum(r.amount)} ${curr.symbol}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(r.note || '—')}</td>
    </tr>
  `).join('');

  const sectionBanner = showSectionHeader
    ? `<div style="background:${softBg};border:1px solid ${softBorder};border-right:4px solid ${accent};border-radius:9px;padding:8px 13px;margin:18px 0 11px;display:flex;justify-content:space-between;align-items:center;">
         <div style="font-size:15px;font-weight:800;color:${accent};">حساب ${curr.name} (${curr.symbol})</div>
         <div style="font-size:12px;color:#475569;font-weight:700;">${info.activeRecords.length} حركة</div>
       </div>`
    : '';

  return `
    ${sectionBanner}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
      <div style="border:1px solid #fecaca;background:#fef2f2;border-radius:9px;padding:10px;text-align:center;">
        <div style="font-size:11.5px;color:#64748b;">إجمالي الديون</div>
        <div style="font-size:16px;font-weight:800;color:#dc2626;direction:ltr;margin-top:3px;">${formatNum(info.totalDebt)} ${curr.symbol}</div>
      </div>
      <div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:9px;padding:10px;text-align:center;">
        <div style="font-size:11.5px;color:#64748b;">إجمالي الدفعات</div>
        <div style="font-size:16px;font-weight:800;color:#15803d;direction:ltr;margin-top:3px;">${formatNum(info.totalPay)} ${curr.symbol}</div>
      </div>
      <div style="border:1px solid #cbd5e1;background:#f8fafc;border-radius:9px;padding:10px;text-align:center;">
        <div style="font-size:11.5px;color:#64748b;">الرصيد المتبقي</div>
        <div style="font-size:16px;font-weight:800;color:#0f172a;direction:ltr;margin-top:3px;">${balText}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px;">
      <thead>
        <tr style="background:${accent};color:#ffffff;">
          <th style="padding:10px 8px;width:40px;text-align:center;">#</th>
          <th style="padding:10px 8px;width:110px;text-align:right;">التاريخ</th>
          <th style="padding:10px 8px;width:90px;text-align:right;">النوع</th>
          <th style="padding:10px 8px;width:130px;text-align:right;">المبلغ</th>
          <th style="padding:10px 8px;text-align:right;">الملاحظات</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || `<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;">لا توجد حركات</td></tr>`}</tbody>
    </table>
  `;
}

async function exportCustomerPDF() {
  const cust = groupedCustomers.find(c => c.name === currentCustomerName);
  if (!cust) return;
  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    return showToast('يرجى الاتصال بالإنترنت أول مرة لتحميل محرك PDF');
  }

  const activeCodes = getActiveCurrenciesForReport(cust);
  const isDualPdf = activeCodes.length > 1;
  const headerCurrencyText = isDualPdf
    ? 'دولار ($) وليرة سورية (ل.س)'
    : `${getCurr(activeCodes[0]).name} (${getCurr(activeCodes[0]).symbol})`;

  const overlay = document.getElementById('pdfBusyOverlay');
  overlay.classList.add('open');

  const prevScrollY = window.scrollY;
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;top:0;left:0;width:740px;background:#ffffff;color:#0f172a;z-index:99990;direction:rtl;font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:0;margin:0;';

  try {
    const logoHtml = settings.shopLogo
      ? `<img src="${settings.shopLogo}" style="width:62px;height:62px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:3px;background:#fff;" />`
      : '';

    const shopPhones = getShopPhonesList();
    const shopAddressHtml = settings.shopAddress
      ? `<div style="font-size:12.5px;color:#475569;margin-top:3px;">${escapeHtml(settings.shopAddress)}</div>`
      : '';
    const shopPhonesHtml = shopPhones.length > 0
      ? `<div style="font-size:12.5px;color:#334155;margin-top:3px;font-weight:600;">هاتف: <span dir="ltr" style="unicode-bidi:embed;">${shopPhones.map(escapeHtml).join('  •  ')}</span></div>`
      : '';

    const sectionsHtml = activeCodes
      .map(code => buildPdfCurrencySectionHtml(code, cust.byCurrency[code], isDualPdf))
      .join('');

    const mainBlock = document.createElement('div');
    mainBlock.style.cssText = 'width:740px;padding:26px 26px 14px;background:#ffffff;';
    mainBlock.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e3a8a;padding-bottom:14px;margin-bottom:18px;gap:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHtml}
          <div>
            <div style="font-size:22px;font-weight:800;color:#1e3a8a;">${escapeHtml(settings.shopName || 'دفتر الديون')}</div>
            ${shopAddressHtml}
            ${shopPhonesHtml}
          </div>
        </div>
        <div style="text-align:left;font-size:12.5px;color:#475569;line-height:1.6;">
          <div style="font-size:15px;font-weight:800;color:#1e3a8a;">كشف حساب زبون</div>
          <div>التاريخ: ${todayString()}</div>
          <div>العملة: ${headerCurrencyText}</div>
        </div>
      </div>

      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:11.5px;color:#64748b;">اسم الزبون</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(cust.name)}</div>
        </div>
        <div style="text-align:left;">
          <div style="font-size:11.5px;color:#64748b;">رقم الهاتف</div>
          <div style="font-size:14.5px;font-weight:700;direction:ltr;color:#0f172a;">${escapeHtml(cust.phone || '—')}</div>
        </div>
      </div>

      ${sectionsHtml}
    `;
    stage.appendChild(mainBlock);

    const generalNote = (settings.generalNote || '').trim();
    let generalNoteEl = null;
    if (generalNote) {
      generalNoteEl = document.createElement('div');
      generalNoteEl.style.cssText = 'width:740px;padding:0 26px;background:#ffffff;';
      generalNoteEl.innerHTML = `
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-right:4px solid #2563eb;border-radius:10px;padding:11px 14px;color:#334155;font-size:13px;line-height:1.6;">
          <div style="font-size:12px;font-weight:800;color:#1e3a8a;margin-bottom:3px;">ملاحظة عامة:</div>
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
      shamLabelEl.style.cssText = 'width:210px;background:#fffbeb;padding:6px 4px;text-align:center;line-height:1.35;';
      shamLabelEl.innerHTML = `
        <div style="color:#92400e;font-size:16px;font-weight:800;">شام كاش</div>
        <div style="color:#b45309;font-size:11.5px;font-weight:700;margin-top:3px;">يمكنك نسخ الرمز للدفع</div>
      `;
      stage.appendChild(shamLabelEl);

      shamCopyBtnEl = document.createElement('div');
      shamCopyBtnEl.style.cssText = 'width:104px;height:48px;background:#d97706;color:#ffffff;font-size:16px;font-weight:800;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:5px;border:2px solid #b45309;';
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
        scale: 2, useCORS: true, backgroundColor: '#fffbeb',
        width: 210, windowWidth: 210, scrollX: 0, scrollY: 0
      });
    }
    if (shamCopyBtnEl) {
      shamCopyBtnCanvas = await html2canvas(shamCopyBtnEl, {
        scale: 2, useCORS: true, backgroundColor: '#fffbeb',
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

      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.5);
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
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.35);
      doc.roundedRect(codeBoxX, curY + 2.5, codeBoxW, codeBoxH, 2.2, 2.2, 'FD');

      doc.setFont('courier', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
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
