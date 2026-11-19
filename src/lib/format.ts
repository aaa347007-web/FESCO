import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const PublicDownload = registerPlugin('PublicDownload');

export function formatCurrency(amount, currencyCode = 'PKR') {
  const num = Number(amount) || 0;
  const formatted = num.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currencyCode === 'Rs.' ? `Rs. ${formatted}` : `PKR ${formatted}`;
}

export function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLocalMonthString(date = new Date()) {
  return getLocalDateString(date).slice(0, 7);
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = Number(parts[1]) - 1;
  return `${parts[2]} ${months[mIdx] || parts[1]} ${parts[0]}`;
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(isoStr);
  }
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '';
  const [y, m] = String(monthKey).split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const idx = Number(m) - 1;
  return `${names[idx] || m} ${y}`;
}

export async function saveToAndroidDownloads(filename, base64Data, mimeType) {
  try {
    await PublicDownload.saveFile({ filename, base64Data, mimeType });
    return true;
  } catch {
    return false;
  }
}

export async function downloadJsonFile(payload, filename = 'fesco-backup.json') {
  const jsonText = JSON.stringify(payload, null, 2);

  if (Capacitor.isNativePlatform()) {
    const base64Data = btoa(unescape(encodeURIComponent(jsonText)));
    const savedToDownloads = await saveToAndroidDownloads(filename, base64Data, 'application/json');

    const cached = await Filesystem.writeFile({
      path: filename,
      data: jsonText,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    if (!savedToDownloads) {
      await Share.share({
        title: filename,
        text: 'FESCO JSON Backup',
        url: cached.uri,
        dialogTitle: 'Save or Share JSON Backup',
      });
    }
    return;
  }

  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
