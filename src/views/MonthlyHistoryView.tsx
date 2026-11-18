import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Download,
  History,
  Search,
  Share2,
} from 'lucide-react';
import { BillCollection } from '../components/BillTable';
import { api } from '../lib/api';
import { formatCurrency, formatDateTime, formatMonthLabel } from '../lib/format';
import { downloadReportPdf, shareReportPdf } from '../lib/pdf';
import type {
  AppSettings,
  Bill,
  BillHistoryEntry,
  MonthlySummary,
  PaymentStatus,
} from '../types/bill';

interface MonthlyHistoryViewProps {
  months: MonthlySummary[];
  currencyCode: string;
  settings: AppSettings;
  refreshKey: number;
  togglingId: number | null;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export const MonthlyHistoryView: React.FC<MonthlyHistoryViewProps> = ({
  months,
  currencyCode,
  settings,
  refreshKey,
  togglingId,
  onToggleStatus,
  onEditBill,
  onDeleteBill,
  onViewHistory,
  onToast,
}) => {
  const [viewMode, setViewMode] = useState<'months' | 'audit'>('months');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthBills, setMonthBills] = useState<Bill[]>([]);
  const [monthSearch, setMonthSearch] = useState('');
  const [monthStatus, setMonthStatus] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  const [loadingBills, setLoadingBills] = useState(false);

  const [auditEntries, setAuditEntries] = useState<BillHistoryEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setLoadingBills(true);
    api
      .listBills({
        month: selectedMonth,
        status: monthStatus,
        search: monthSearch.trim() || undefined,
      })
      .then((res) => {
        if (!cancelled) setMonthBills(res.bills);
      })
      .finally(() => {
        if (!cancelled) setLoadingBills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, monthStatus, monthSearch, refreshKey]);

  useEffect(() => {
    if (viewMode !== 'audit') return;
    let cancelled = false;
    setLoadingAudit(true);
    api
      .getHistory(200)
      .then((res) => {
        if (!cancelled) setAuditEntries(res.history);
      })
      .finally(() => {
        if (!cancelled) setLoadingAudit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, refreshKey]);

  const activeSummary = months.find((m) => m.monthKey === selectedMonth);

  const handleDownloadMonthPdf = async (share = false) => {
    if (!selectedMonth) return;
    try {
      const { bills } = await api.listBills({ month: selectedMonth });
      const label = formatMonthLabel(selectedMonth);
      const opts = {
        title: `Monthly FESCO Bill Report`,
        periodLabel: label,
        bills,
        settings,
        filename: `FESCO-Monthly-${selectedMonth}.pdf`,
      };
      if (share) {
        const res = await shareReportPdf(opts);
        onToast(res === 'shared' ? 'Monthly PDF ready to share.' : 'Monthly PDF downloaded.');
      } else {
        downloadReportPdf(opts);
        onToast(`Downloaded PDF for ${label}.`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PDF export failed.', 'error');
    }
  };

  if (selectedMonth) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(null);
                setMonthSearch('');
                setMonthStatus('ALL');
              }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              aria-label="Back to months"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                {formatMonthLabel(selectedMonth)}
              </h2>
              {activeSummary && (
                <p className="text-xs text-slate-500 tabular-nums">
                  {activeSummary.totalBills} Bills · Earned:{' '}
                  {formatCurrency(activeSummary.earnedCommission, currencyCode)} · Pending:{' '}
                  {formatCurrency(activeSummary.pendingCommission, currencyCode)}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadMonthPdf(false)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadMonthPdf(true)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Share2 className="h-4 w-4" />
              <span>Share</span>
            </button>
          </div>
        </div>

        {/* Month Filter Bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={monthSearch}
              onChange={(e) => setMonthSearch(e.target.value)}
              placeholder={`Search within ${formatMonthLabel(selectedMonth)} by Reference # or Serial #...`}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(['ALL', 'PAID', 'UNPAID'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMonthStatus(tab)}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-bold transition ${
                  monthStatus === tab ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab === 'PAID' ? 'Paid' : 'Unpaid'}
              </button>
            ))}
          </div>
        </div>

        {loadingBills ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          </div>
        ) : (
          <BillCollection
            bills={monthBills}
            currencyCode={currencyCode}
            togglingId={togglingId}
            onToggleStatus={onToggleStatus}
            onEdit={onEditBill}
            onDelete={onDeleteBill}
            onViewHistory={onViewHistory}
            emptyTitle={`No bills in ${formatMonthLabel(selectedMonth)}`}
            emptyDescription="Records added during this month appear here permanently."
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* View Switcher */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Monthly Records & History</h2>
          <p className="text-xs text-slate-500">
            Previous months are never deleted automatically. Open any month to inspect or export.
          </p>
        </div>
        <div className="flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-slate-50 p-1 sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('months')}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition whitespace-nowrap ${
              viewMode === 'months' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Monthly Ledgers</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('audit')}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition whitespace-nowrap ${
              viewMode === 'audit' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Complete Audit Log</span>
          </button>
        </div>
      </div>

      {viewMode === 'months' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {months.map((m) => (
            <button
              key={m.monthKey}
              type="button"
              onClick={() => setSelectedMonth(m.monthKey)}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-400"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-700">
                    {m.label}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {m.totalBills} Total Bills · {m.paidBills} Paid · {m.unpaidBills} Unpaid
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                  <ChevronRight className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <div className="text-xs text-slate-500">Bill Amount</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {formatCurrency(m.totalBillAmount, currencyCode)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Earned Comm.</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(m.earnedCommission, currencyCode)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Pending Comm.</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-amber-700 tabular-nums">
                    {formatCurrency(m.pendingCommission, currencyCode)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="text-base font-bold text-slate-900">Permanent Transaction & Edit Log</h3>
            <p className="text-xs text-slate-500">
              Chronological record of all bill additions, payments, reversals, edits, and deletions
            </p>
          </div>
          {loadingAudit ? (
            <div className="space-y-3 p-5">
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No history events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between gap-2 px-5 py-3.5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="font-mono text-blue-700">#{entry.serial_number}</span>
                      <span className="font-mono">{entry.reference_number}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.action.replace('_', ' ')}</span>
                    </div>
                    {entry.note && <p className="mt-0.5 text-xs text-slate-600">{entry.note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums sm:text-right">
                    {entry.commission_delta !== 0 && (
                      <span
                        className={`font-mono font-bold ${
                          entry.commission_delta > 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {entry.commission_delta > 0 ? '+' : ''}
                        {formatCurrency(entry.commission_delta, currencyCode)}
                      </span>
                    )}
                    <span className="text-slate-500">{formatDateTime(entry.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
