import React, { useRef, useState } from 'react';
import {
  Calendar,
  CalendarRange,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  FileText,
  Share2,
  Upload,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { api } from '../lib/api';
import {
  downloadJsonFile,
  formatCurrency,
  formatDateShort,
  formatMonthLabel,
  getLocalDateString,
  getLocalMonthString,
} from '../lib/format';
import { downloadReportPdf, shareReportPdf } from '../lib/pdf';
import type { AppSettings, BackupPayload } from '../types/bill';

interface ReportsBackupViewProps {
  settings: AppSettings;
  onRestored: () => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export const ReportsBackupView: React.FC<ReportsBackupViewProps> = ({
  settings,
  onRestored,
  onToast,
}) => {
  const [dailyDate, setDailyDate] = useState(getLocalDateString());
  const [monthlyKey, setMonthlyKey] = useState(getLocalMonthString());
  const [fromDate, setFromDate] = useState(getLocalMonthString() + '-01');
  const [toDate, setToDate] = useState(getLocalDateString());
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const currencyCode = settings.currency_code || 'PKR';

  const runDailyPdf = async (share: boolean) => {
    setBusyAction('daily-pdf');
    try {
      const { bills } = await api.listBills({ date: dailyDate });
      const opts = {
        title: 'Daily FESCO Bill Report',
        periodLabel: formatDateShort(dailyDate),
        bills,
        settings,
        filename: `FESCO-Daily-${dailyDate}.pdf`,
      };
      if (share) {
        const res = await shareReportPdf(opts);
        onToast(res === 'shared' ? 'Daily PDF shared.' : 'Daily PDF downloaded.');
      } else {
        downloadReportPdf(opts);
        onToast(`Daily PDF downloaded (${bills.length} bills).`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate Daily PDF.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const runMonthlyPdf = async (share: boolean) => {
    setBusyAction('monthly-pdf');
    try {
      const { bills } = await api.listBills({ month: monthlyKey });
      const label = formatMonthLabel(monthlyKey);
      const opts = {
        title: 'Monthly FESCO Bill Report',
        periodLabel: label,
        bills,
        settings,
        filename: `FESCO-Monthly-${monthlyKey}.pdf`,
      };
      if (share) {
        const res = await shareReportPdf(opts);
        onToast(res === 'shared' ? 'Monthly PDF shared.' : 'Monthly PDF downloaded.');
      } else {
        downloadReportPdf(opts);
        onToast(`Monthly PDF downloaded (${bills.length} bills).`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate Monthly PDF.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const runRangePdf = async (share: boolean) => {
    if (fromDate > toDate) {
      onToast('Start date cannot be after end date.', 'error');
      return;
    }
    setBusyAction('range-pdf');
    try {
      const { bills } = await api.listBills({ fromDate, toDate });
      const opts = {
        title: 'Custom Period FESCO Bill Report',
        periodLabel: `${formatDateShort(fromDate)} to ${formatDateShort(toDate)}`,
        bills,
        settings,
        filename: `FESCO-Report-${fromDate}-to-${toDate}.pdf`,
      };
      if (share) {
        const res = await shareReportPdf(opts);
        onToast(res === 'shared' ? 'Range PDF shared.' : 'Range PDF downloaded.');
      } else {
        downloadReportPdf(opts);
        onToast(`Custom range PDF downloaded (${bills.length} bills).`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to generate Range PDF.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJsonExport = async (scope: 'all' | 'daily' | 'monthly', filter?: string) => {
    setBusyAction(`json-${scope}`);
    try {
      const payload = await api.exportBackup(scope, filter);
      const suffix = filter ? `${scope}-${filter}` : 'full-database';
      downloadJsonFile(payload, `fesco-backup-${suffix}.json`);
      onToast(`JSON backup exported (${payload.bills.length} bills). Existing data untouched.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'JSON backup failed.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      if (!parsed || !Array.isArray(parsed.bills)) {
        throw new Error('Invalid JSON backup file: missing bills data.');
      }
      setPendingBackup(parsed);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not read JSON backup file.', 'error');
    }
  };

  const executeRestore = async () => {
    if (!pendingBackup) return;
    setBusyAction('restore');
    try {
      const res = await api.restoreBackup(pendingBackup, restoreMode);
      setPendingBackup(null);
      setConfirmOpen(false);
      onRestored();
      onToast(
        `Restored ${res.restoredBills} bills (Earned Commission: ${formatCurrency(res.totalCommissionEarned, currencyCode)}).`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Restore failed.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: PDF Reports */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">PDF Backup & Printable Reports</h2>
          <p className="text-xs text-slate-500">
            Generate print-ready PDF statements formatted in {currencyCode} for shop records and sharing.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* A. Daily PDF Backup */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Daily PDF Backup</h3>
                  <p className="text-xs text-slate-500">All paid & unpaid bills for a date</p>
                </div>
              </div>
              <label htmlFor="daily-pdf-date" className="mt-4 block text-xs font-semibold text-slate-700">
                Select Date
              </label>
              <input
                id="daily-pdf-date"
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runDailyPdf(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runDailyPdf(true)}
                aria-label="Share daily PDF"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* B. Monthly PDF Backup */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Monthly PDF Backup</h3>
                  <p className="text-xs text-slate-500">Full month ledger & commissions</p>
                </div>
              </div>
              <label htmlFor="monthly-pdf-input" className="mt-4 block text-xs font-semibold text-slate-700">
                Select Month & Year
              </label>
              <input
                id="monthly-pdf-input"
                type="month"
                value={monthlyKey}
                onChange={(e) => setMonthlyKey(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runMonthlyPdf(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runMonthlyPdf(true)}
                aria-label="Share monthly PDF"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* C. Custom Date Range PDF */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Custom Date Range</h3>
                  <p className="text-xs text-slate-500">Export any start to end period</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="range-start" className="block text-xs font-semibold text-slate-700">
                    Start Date
                  </label>
                  <input
                    id="range-start"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="range-end" className="block text-xs font-semibold text-slate-700">
                    End Date
                  </label>
                  <input
                    id="range-end"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runRangePdf(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => runRangePdf(true)}
                aria-label="Share range PDF"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Share2 className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: JSON Data Backup & Restore */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">JSON Database Backup & Restore</h2>
              <p className="text-xs text-slate-500">
                JSON backups preserve every bill, serial number, history event, and setting for full recovery.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Target: {settings.backup_location_label}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Export Options */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Create Backup (Never Deletes Data)</h3>
            <p className="text-xs text-slate-600">
              Export your complete database or save daily/monthly JSON snapshots to your phone or PC.
            </p>
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleJsonExport('all')}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>Export Full Database Backup (JSON)</span>
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleJsonExport('daily', dailyDate)}
                  className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-blue-700" />
                  <span>Daily JSON ({dailyDate})</span>
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleJsonExport('monthly', monthlyKey)}
                  className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-blue-700" />
                  <span>Monthly JSON ({monthlyKey})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Restore Options */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Restore From Saved JSON Backup</h3>
            <p className="text-xs text-slate-600">
              Select a previously exported `.json` backup file to merge missing records or restore completely.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              <Upload className="h-4 w-4" />
              <span>Choose JSON Backup File</span>
            </button>

            {pendingBackup && (
              <div className="rounded-xl border border-blue-200 bg-white p-3.5 text-xs">
                <div className="font-bold text-slate-900">Backup File Ready</div>
                <div className="mt-1 text-slate-600 tabular-nums">
                  {pendingBackup.bills.length} bills ·{' '}
                  {pendingBackup.bill_history?.length ?? 0} history events · Exported{' '}
                  {new Date(pendingBackup.exportedAt).toLocaleString('en-PK')}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreMode('merge')}
                    className={`min-h-[38px] rounded-lg border px-2.5 text-xs font-bold ${
                      restoreMode === 'merge'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Merge Missing
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreMode('replace')}
                    className={`min-h-[38px] rounded-lg border px-2.5 text-xs font-bold ${
                      restoreMode === 'replace'
                        ? 'border-red-600 bg-red-50 text-red-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Replace Database
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingBackup(null)}
                    className="min-h-[38px] rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="min-h-[38px] rounded-lg bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-800"
                  >
                    Restore Now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirmOpen}
        title={restoreMode === 'replace' ? 'Replace Entire Database?' : 'Merge Backup Records?'}
        message={
          restoreMode === 'replace'
            ? `This will replace all current records with the ${pendingBackup?.bills.length ?? 0} bills inside the backup file and recalculate total earned commission.`
            : `This will keep all existing records and safely import any missing bills from the ${pendingBackup?.bills.length ?? 0} bills in the backup file.`
        }
        confirmLabel={restoreMode === 'replace' ? 'Replace & Restore' : 'Merge & Restore'}
        tone={restoreMode === 'replace' ? 'danger' : 'primary'}
        loading={busyAction === 'restore'}
        onConfirm={executeRestore}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
