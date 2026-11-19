import React, { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  ExternalLink,
  FileText,
  Plus,
  Search,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { BillCollection } from '../components/BillTable';
import { api } from '../lib/api';
import { formatCurrency, formatMonthLabel, getLocalMonthString } from '../lib/format';
import { PAK_UTILITY_COMPANIES } from '../lib/pakCompanies';
import type { Bill, DashboardStats, PaymentStatus } from '../types/bill';

interface NativeBrowserPlugin {
  open(options: { url: string; toolbarColor?: string }): Promise<void>;
}

const Browser = registerPlugin<NativeBrowserPlugin>('Browser');

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  currencyCode: string;
  shopName: string;
  togglingId: number | null;
  onNavigate: (tab: 'add' | 'bills' | 'months' | 'reports') => void;
  onQuickRecordBill: (companyId: string, refNo: string) => void;
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
  onQuickRecordBill,
  onToggleStatus,
  onEditBill,
  onDeleteBill,
  onViewHistory,
}) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState('FESCO');
  const [billRefInput, setBillRefInput] = useState('');
  const [billCheckerError, setBillCheckerError] = useState<string | null>(null);
  const [lastCheckedBill, setLastCheckedBill] = useState<{
    companyId: string;
    companyName: string;
    refNo: string;
    url: string;
  } | null>(null);

  const [quickSearch, setQuickSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Bill[] | null>(null);
  const [searching, setSearching] = useState(false);

  const selectedCompany =
    PAK_UTILITY_COMPANIES.find((c) => c.id === selectedCompanyId) ?? PAK_UTILITY_COMPANIES[0];

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

  const openOfficialBill = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Browser.open({ url, toolbarColor: '#1d4ed8' });
        return;
      } catch {
        // Fallback below
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCheckOnlineBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillCheckerError(null);
    const cleaned = billRefInput.trim().replace(/[\s-]+/g, '');
    if (!cleaned || cleaned.length < 8) {
      setBillCheckerError(`Please enter a valid ${selectedCompany.inputLabel}.`);
      return;
    }
    const url = selectedCompany.getBillUrl(cleaned);
    setLastCheckedBill({
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      refNo: cleaned,
      url,
    });
    await openOfficialBill(url);
  };

  const currentMonthLabel = formatMonthLabel(getLocalMonthString());

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
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
      {/* Top Section: All Pakistan Instant Online Bill Checker & PDF Downloader */}
      <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold tracking-wide text-blue-100">
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <span>ALL PAKISTAN ONLINE BILL CHECKER</span>
            </span>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
              Check & Download Official Duplicate Bill
            </h2>
            <p className="mt-0.5 text-xs text-blue-100">
              Electricity (FESCO, LESCO, MEPCO, GEPCO, IESCO, PESCO, KE), Gas (SNGPL, SSGC) & PTCL
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-xs font-bold text-white transition hover:bg-white/25 whitespace-nowrap"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Reports</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('add')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-amber-300 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Record</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleCheckOnlineBill} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label htmlFor="company-select" className="mb-1 block text-xs font-semibold text-blue-100">
              Select Utility Company
            </label>
            <select
              id="company-select"
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setBillCheckerError(null);
              }}
              className="min-h-[46px] w-full rounded-xl border border-white/20 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-400"
            >
              <optgroup label="Electricity (WAPDA & K-Electric)">
                {PAK_UTILITY_COMPANIES.filter((c) => c.category === 'Electricity').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gas Companies">
                {PAK_UTILITY_COMPANIES.filter((c) => c.category === 'Gas').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Internet & Landline">
                {PAK_UTILITY_COMPANIES.filter((c) => c.category === 'Internet / Landline').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="sm:col-span-4">
            <label htmlFor="online-ref-input" className="mb-1 block text-xs font-semibold text-blue-100">
              {selectedCompany.inputLabel}
            </label>
            <input
              id="online-ref-input"
              type="text"
              inputMode="numeric"
              value={billRefInput}
              onChange={(e) => setBillRefInput(e.target.value)}
              placeholder={selectedCompany.placeholder}
              className="min-h-[46px] w-full rounded-xl border border-white/20 bg-white px-3.5 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="flex items-end sm:col-span-3">
            <button
              type="submit"
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-emerald-400 active:scale-[0.99]"
            >
              <Search className="h-4 w-4" />
              <span>Check Bill</span>
            </button>
          </div>
        </form>

        {billCheckerError && (
          <p className="mt-2.5 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100">
            {billCheckerError}
          </p>
        )}

        {/* Quick Action Bar after checking a bill */}
        {lastCheckedBill && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-white/15 bg-white/10 p-3.5 sm:flex-row sm:items-center">
            <div className="text-xs">
              <div className="font-bold text-white">
                Last Checked: {lastCheckedBill.companyName} ({lastCheckedBill.refNo})
              </div>
              <div className="mt-0.5 text-blue-100">
                Inside the opened bill page, tap 3-dots (⋮) → Share / Print → Save as PDF
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openOfficialBill(lastCheckedBill.url)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-blue-900 hover:bg-blue-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Open / Print PDF</span>
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onQuickRecordBill(lastCheckedBill.companyId, lastCheckedBill.refNo)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-400 px-3 text-xs font-extrabold text-slate-950 hover:bg-amber-300"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add to My Records</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 8 Summary Cards */}
      <section aria-label="Dashboard Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Bill Amount</span>
            <Banknote className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-xl font-extrabold text-slate-900 tabular-nums sm:text-2xl">
            {formatCurrency(s.totalBillAmount, currencyCode)}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{shopName}</p>
        </div>

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

      {/* Quick Search in Saved Records */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Saved Records Lookup</h3>
          <p className="text-xs text-slate-500">
            Search your saved bills across all months by Reference Number or Serial Number
          </p>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Search saved Reference Number or Serial #..."
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
              emptyDescription={`No saved record matched "${quickSearch}".`}
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
          emptyDescription="Add your first utility bill to start tracking payments, commissions, and monthly history."
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
