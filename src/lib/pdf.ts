import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppSettings, Bill } from '../types/bill';
import { formatCurrency, formatDateTime } from './format';

export interface PdfReportOptions {
  title: string;
  periodLabel: string;
  bills: Bill[];
  settings: AppSettings;
  filename: string;
}

export function buildReportPdf({
  title,
  periodLabel,
  bills,
  settings,
  filename,
}: PdfReportOptions): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = settings.currency_code || 'PKR';

  // Top Header Band
  doc.setFillColor(29, 78, 216); // Royal Blue
  doc.rect(0, 0, pageWidth, 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FESCO BILL MANAGER', 36, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${settings.shop_name}  |  ${settings.owner_name}`, 36, 48);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, pageWidth - 36, 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Report Date / Period: ${periodLabel}`, pageWidth - 36, 48, { align: 'right' });

  // Summary Totals
  const totalBills = bills.length;
  const paidBills = bills.filter((b) => b.status === 'PAID');
  const unpaidBills = bills.filter((b) => b.status === 'UNPAID');
  const totalBillAmount = bills.reduce((acc, b) => acc + b.bill_amount, 0);
  const earnedCommission = paidBills.reduce((acc, b) => acc + b.commission, 0);
  const pendingCommission = unpaidBills.reduce((acc, b) => acc + b.commission, 0);
  const grandTotal = totalBillAmount + earnedCommission;

  // Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(36, 82, pageWidth - 72, 48, 4, 4, 'FD');

  const summaryItems = [
    { label: 'Total Bills', value: String(totalBills) },
    { label: 'Paid / Unpaid', value: `${paidBills.length} / ${unpaidBills.length}` },
    { label: 'Total Bill Amount', value: formatCurrency(totalBillAmount, currency) },
    { label: 'Earned Commission', value: formatCurrency(earnedCommission, currency) },
    { label: 'Pending Commission', value: formatCurrency(pendingCommission, currency) },
    { label: 'Grand Total', value: formatCurrency(grandTotal, currency) },
  ];

  const colWidth = (pageWidth - 72) / summaryItems.length;
  summaryItems.forEach((item, idx) => {
    const x = 48 + idx * colWidth;
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(item.label, x, 99);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(item.value, x, 117);
  });

  // Table Rows
  const sortedBills = [...bills].sort((a, b) => a.serial_number - b.serial_number);
  const rows = sortedBills.map((b) => [
    `#${b.serial_number}`,
    b.reference_number,
    formatCurrency(b.bill_amount, currency),
    formatCurrency(b.commission, currency),
    b.status === 'PAID' ? 'Paid' : 'Unpaid',
    formatDateTime(b.added_at),
    b.paid_at ? formatDateTime(b.paid_at) : '—',
  ]);

  autoTable(doc, {
    startY: 144,
    margin: { left: 36, right: 36, bottom: 48 },
    head: [
      [
        'Serial #',
        'FESCO Reference #',
        'Bill Amount',
        'Commission',
        'Status',
        'Added Date & Time',
        'Payment Date & Time',
      ],
    ],
    body: rows.length > 0 ? rows : [['—', 'No bills found for this period', '—', '—', '—', '—', '—']],
    foot: [
      [
        'Totals',
        `${totalBills} Bills`,
        formatCurrency(totalBillAmount, currency),
        formatCurrency(earnedCommission, currency) + ' (Earned)',
        `${paidBills.length} Paid`,
        'Grand Total:',
        formatCurrency(grandTotal, currency),
      ],
    ],
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [239, 246, 255],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 4) {
        const val = String(data.cell.raw);
        if (val === 'Paid') {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'Unpaid') {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated on ${new Date().toLocaleString('en-PK')} · FESCO Bill Manager`,
      36,
      doc.internal.pageSize.getHeight() - 20
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 36,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' }
    );
  }

  return { doc, filename };
}

export function downloadReportPdf(options: PdfReportOptions): void {
  const { doc, filename } = buildReportPdf(options);
  doc.save(filename);
}

export async function shareReportPdf(options: PdfReportOptions): Promise<'shared' | 'downloaded'> {
  const { doc, filename } = buildReportPdf(options);
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      title: options.title,
      text: `FESCO Bill Manager Report (${options.periodLabel})`,
      files: [file],
    });
    return 'shared';
  }

  doc.save(filename);
  return 'downloaded';
}
