import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { formatCurrency, formatDateShort, saveToAndroidDownloads } from './format';

function buildPdfDoc(opts) {
  const { title, periodLabel, bills = [], settings = {} } = opts;
  const currency = settings.currency_code || 'PKR';
  const shopName = settings.shop_name || 'Zahid Mobiles and Photo State';
  const ownerName = settings.owner_name || 'Zahid Nawaz';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(shopName, 14, 16);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${title} — ${periodLabel}`, 14, 23);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Counter: ${ownerName} | Generated: ${new Date().toLocaleString('en-PK')}`, 14, 29);
  doc.setTextColor(0);

  const totalAmount = bills.reduce((s, b) => s + Number(b.bill_amount || 0), 0);
  const paidBills = bills.filter((b) => b.status === 'PAID');
  const earnedComm = paidBills.reduce((s, b) => s + Number(b.commission || 0), 0);
  const pendingComm = bills
    .filter((b) => b.status !== 'PAID')
    .reduce((s, b) => s + Number(b.commission || 0), 0);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total Bills: ${bills.length} (Paid: ${paidBills.length})   |   Bill Total: ${formatCurrency(totalAmount, currency)}   |   Earned Comm: ${formatCurrency(earnedComm, currency)}   |   Pending: ${formatCurrency(pendingComm, currency)}`,
    14,
    37
  );

  const rows = bills.map((b) => [
    `#${b.serial_number}`,
    String(b.reference_number || ''),
    formatDateShort(b.bill_date || (b.created_at || '').slice(0, 10)),
    formatCurrency(b.bill_amount, currency),
    formatCurrency(b.commission, currency),
    b.status === 'PAID' ? 'PAID' : 'UNPAID',
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['Serial', 'Reference #', 'Date', 'Bill Amount', 'Commission', 'Status']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
  });

  return doc;
}

async function handleNativePdf(doc, filename, openShare) {
  const dataUri = doc.output('datauristring');
  const base64Data = dataUri.split(',')[1];

  const savedToDownloads = await saveToAndroidDownloads(filename, base64Data, 'application/pdf');

  const cached = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Cache,
  });

  if (openShare || !savedToDownloads) {
    try {
      await Share.share({
        title: filename,
        text: 'FESCO Bill Manager Report',
        url: cached.uri,
        dialogTitle: 'Share or Save PDF Report',
      });
    } catch {
      // Share sheet closed
    }
  }
}

export async function downloadReportPdf(opts) {
  const doc = buildPdfDoc(opts);
  const filename = opts.filename || 'FESCO-Report.pdf';

  if (Capacitor.isNativePlatform()) {
    await handleNativePdf(doc, filename, false);
    return;
  }

  doc.save(filename);
}

export async function shareReportPdf(opts) {
  const doc = buildPdfDoc(opts);
  const filename = opts.filename || 'FESCO-Report.pdf';

  if (Capacitor.isNativePlatform()) {
    await handleNativePdf(doc, filename, true);
    return 'shared';
  }

  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return 'shared';
  }

  doc.save(filename);
  return 'downloaded';
}
