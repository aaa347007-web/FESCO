import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Plus,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { BillCollection } from '../components/BillTable';
import { api } from '../lib/api';
import { formatCurrency, formatMonthLabel, getLocalMonthString } from '../lib/format';
import type { Bill, DashboardStats, PaymentStatus } from '../types/bill';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  currencyCode: string;
  shopName: string;
  togglingId: number | null;
  onNavigate: (tab: 'add' | 'bills' | 'months' | 'reports') => void;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  loading,
  currencyCode,
  shopName,
  togglingId,
  onNavigate,
  onToggleStatus,
  onEditBill,
  onDeleteBill,
  onViewHistory,
}) => {
  const [quickSearch, setQuickSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Bill[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = quickSearch.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .listBills({ search: trimmed })
        .then((res) => setSearchResults(res.bills))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [quickSearch, stats]);

  const currentMonthLabel = formatMonthLabel(getLocalMonthString());

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  const s = stats ?? {
    totalBills: 0,
    totalBillAmount: 0,
    totalCommissionEarned: 0,
    pendingCommission: 0,
    paidBills: 0,
    unpaidBills: 0,
    todayBills: 0,
    todayCommission: 0,
    currentMonthCommission: 0,
    nextSerialNumber: 1,
    recentBills: [],
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            {shopName} · {currentMonthLabel}
          </p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Daily Counter & Commission Overview
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
          >
            <FileText className="h-4 w-4 text-blue-700" />
            <span>PDF Reports</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('add')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.99] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add New Bill</span>
          </button>
        </div>
      </section>

      {/* 8 Summary Cards */}
      <section aria-label="Dashboard Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {/* 1. Total Commission Earned (Primary Focal Card) */}
        <div className="col-span-2 rounded-2xl bg-blue-700 p-5 text-white sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-100">Total Commission Earned</span>
            <Coins className="h-5 w-5 text-blue-200" />
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold tracking-tight tabular-nums">
            {formatCurrency(s.totalCommissionEarned, currencyCode)}
          </div>
          <p className="mt-1.5 text-xs text-blue-100 tabular-nums">
            Pending: {formatCurrency(s.pendingCommission, currencyCode)}
          </p>
        </div>

        {/* 2. Total Bills */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Bills</span>
            <FileText className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
            {s.totalBills}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Next Serial #{s.nextSerialNumber}</p>
        </div>

        {/* 3. Total Bill Amount */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Bill Amount</span>
            <Banknote className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-xl font-extrabold text-slate-900 tabular-nums sm:text-2xl">
            {formatCurrency(s.totalBillAmount, currencyCode)}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">All recorded bills</p>
        </div>

        {/* 4. Current Month Commission */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Current Month Commission</span>
            <CalendarDays className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-xl font-extrabold text-blue-700 tabular-nums sm:text-2xl">
            {formatCurrency(s.currentMonthCommission, currencyCode)}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{currentMonthLabel}</p>
        </div>

        {/* 5. Paid Bills */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Paid Bills</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-emerald-700 tabular-nums">
            {s.paidBills}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Collected & verified</p>
        </div>

        {/* 6. Unpaid Bills */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Unpaid Bills</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-amber-700 tabular-nums">
            {s.unpaidBills}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Awaiting payment</p>
        </div>

        {/* 7. Today's Bills */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Today&apos;s Bills</span>
            <FileText className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
            {s.todayBills}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Added today</p>
        </div>

        {/* 8. Today's Commission */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Today&apos;s Commission</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-xl font-extrabold text-emerald-700 tabular-nums sm:text-2xl">
            {formatCurrency(s.todayCommission, currencyCode)}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Earned today</p>
        </div>
      </section>

      {/* Quick Search by Reference # or Serial # */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Quick Bill Lookup</h3>
            <p className="text-xs text-slate-500">
              Search across all months and years by FESCO Reference Number or Serial Number
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Enter FESCO Reference Number or Bill Serial #..."
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/15"
          />
          {quickSearch && (
            <button
              type="button"
              onClick={() => setQuickSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchResults !== null && (
          <div className="mt-4">
            <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>
                {searching
                  ? 'Searching all records...'
                  : `${searchResults.length} matching bill${searchResults.length === 1 ? '' : 's'} found`}
              </span>
            </div>
            <BillCollection
              bills={searchResults}
              currencyCode={currencyCode}
              togglingId={togglingId}
              onToggleStatus={onToggleStatus}
              onEdit={onEditBill}
              onDelete={onDeleteBill}
              onViewHistory={onViewHistory}
              emptyTitle="No matching bill found"
              emptyDescription={`No record matched "${quickSearch}". Check the reference number or serial number.`}
            />
          </div>
        )}
      </section>

      {/* Recent Bills Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recent Bills</h3>
            <p className="text-xs text-slate-500">
              Tap Paid or Unpaid to update status and commission immediately
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('bills')}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
          >
            <span>View All Bills</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <BillCollection
          bills={s.recentBills}
          currencyCode={currencyCode}
          togglingId={togglingId}
          onToggleStatus={onToggleStatus}
          onEdit={onEditBill}
          onDelete={onDeleteBill}
          onViewHistory={onViewHistory}
          emptyTitle="No bills added yet"
          emptyDescription="Add your first FESCO electricity bill to start tracking payments, commissions, and monthly history."
          emptyAction={
            <button
              type="button"
              onClick={() => onNavigate('add')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Bill</span>
            </button>
          }
        />
      </section>
    </div>
  );
};
