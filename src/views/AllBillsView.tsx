import React, { useEffect, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { BillCollection } from '../components/BillTable';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/format';
import type { Bill, MonthlySummary, PaymentStatus } from '../types/bill';

interface AllBillsViewProps {
  currencyCode: string;
  months: MonthlySummary[];
  refreshKey: number;
  initialSearch?: string;
  togglingId: number | null;
  onAddClick: () => void;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
}

export const AllBillsView: React.FC<AllBillsViewProps> = ({
  currencyCode,
  months,
  refreshKey,
  initialSearch = '',
  togglingId,
  onAddClick,
  onToggleStatus,
  onEditBill,
  onDeleteBill,
  onViewHistory,
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'UDHAR'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .listBills({
          search: search.trim() || undefined,
          status: statusFilter,
          month: monthFilter !== 'ALL' ? monthFilter : undefined,
        })
        .then((res) => {
          if (!cancelled) setBills(res.bills);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, statusFilter, monthFilter, refreshKey]);

  const totalAmount = bills.reduce((sum, b) => sum + b.bill_amount, 0);
  const totalUdhar = bills
    .filter((b) => b.status !== 'PAID')
    .reduce((sum, b) => {
      const rec = Math.max(0, Number(b.received_amount || 0));
      const rem = Math.max(0, b.bill_amount - rec);
      return rec > 0 && rem > 0 ? sum + rem : sum;
    }, 0);
  const earnedCommission = bills
    .filter((b) => b.status === 'PAID')
    .reduce((sum, b) => sum + b.commission, 0);
  const pendingCommission = bills
    .filter((b) => b.status === 'UNPAID')
    .reduce((sum, b) => sum + b.commission, 0);

  return (
    <div className="space-y-5">
      {/* Search & Filter Toolbar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Reference #, Customer Name, Phone or Serial #..."
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(['ALL', 'PAID', 'UNPAID', 'UDHAR'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`min-h-[38px] rounded-lg px-3 text-xs font-bold transition whitespace-nowrap ${
                    statusFilter === tab
                      ? tab === 'UDHAR'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'ALL'
                    ? 'All'
                    : tab === 'PAID'
                      ? 'Paid'
                      : tab === 'UNPAID'
                        ? 'Unpaid'
                        : 'Udhar'}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="ALL">All Months</option>
              {months.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.label} ({m.totalBills})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600 tabular-nums">
          <span>
            Showing <strong className="text-slate-900">{bills.length}</strong> bills
          </span>
          <span>
            Bill Total:{' '}
            <strong className="font-mono text-slate-900">
              {formatCurrency(totalAmount, currencyCode)}
            </strong>
          </span>
          {totalUdhar > 0 && (
            <span>
              Udhar Baqaya:{' '}
              <strong className="font-mono text-red-600">
                {formatCurrency(totalUdhar, currencyCode)}
              </strong>
            </span>
          )}
          <span>
            Earned Commission:{' '}
            <strong className="font-mono text-emerald-700">
              {formatCurrency(earnedCommission, currencyCode)}
            </strong>
          </span>
          <span>
            Pending Commission:{' '}
            <strong className="font-mono text-amber-700">
              {formatCurrency(pendingCommission, currencyCode)}
            </strong>
          </span>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      ) : (
        <BillCollection
          bills={bills}
          currencyCode={currencyCode}
          togglingId={togglingId}
          onToggleStatus={onToggleStatus}
          onEdit={onEditBill}
          onDelete={onDeleteBill}
          onViewHistory={onViewHistory}
          emptyTitle={search ? 'No matching bills found' : 'No bills in this view'}
          emptyDescription={
            search
              ? `No bill matched "${search}" across any month or year.`
              : 'Add a new utility bill to populate your shop ledger.'
          }
          emptyAction={
            !search ? (
              <button
                type="button"
                onClick={onAddClick}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" />
                <span>Add Bill</span>
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
};
