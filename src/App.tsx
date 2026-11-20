import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Phone,
  Plus,
  PlusCircle,
  Search,
  Settings as SettingsIcon,
  Store,
  Zap,
} from 'lucide-react';
import { BillHistoryModal } from './components/BillHistoryModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { EditBillModal } from './components/EditBillModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { initAdMobAndShowBanner, showInterstitialAd } from './lib/admob';
import { api } from './lib/api';
import {
  auth,
  emailToPhone,
  loadCloudBackup,
  logoutUser,
  mapFirebaseAuthError,
  onAuthStateChanged,
  saveCloudBackup,
  signInWithPhonePin,
  signUpWithPhonePin,
  type User,
} from './lib/firebase';
import { formatCurrency } from './lib/format';
import type { AppSettings, Bill, DashboardStats, MonthlySummary, PaymentStatus } from './types/bill';
import { AddBillView } from './views/AddBillView';
import { AllBillsView } from './views/AllBillsView';
import { DashboardView } from './views/DashboardView';
import { MonthlyHistoryView } from './views/MonthlyHistoryView';
import { ReportsBackupView } from './views/ReportsBackupView';
import { SettingsView } from './views/SettingsView';

type NavTab = 'dashboard' | 'add' | 'bills' | 'months' | 'reports' | 'settings';

const NAV_ITEMS: {
  id: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
  { id: 'add', label: 'Add Bill', mobileLabel: 'Add', icon: PlusCircle },
  { id: 'bills', label: 'All Bills', mobileLabel: 'Bills', icon: FileSpreadsheet },
  { id: 'months', label: 'Monthly History', mobileLabel: 'Months', icon: CalendarDays },
  { id: 'reports', label: 'Reports & Backup', mobileLabel: 'Reports', icon: DatabaseBackup },
  { id: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: SettingsIcon },
];

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  shop_name: 'Pak Bill Manager',
  owner_name: 'Shop Counter',
  currency_code: 'PKR',
  default_commission: 30,
  backup_location_label: 'Device Downloads Folder',
  auto_backup_reminder: 1,
  updated_at: '',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [months, setMonths] = useState<MonthlySummary[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [dbInfo, setDbInfo] = useState<{
    dbFile: string;
    totalBills: number;
    totalHistoryEntries: number;
    dbSizeBytes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [globalSearch, setGlobalSearch] = useState('');
  const [billsSearchSeed, setBillsSearchSeed] = useState('');
  const [prefillAdd, setPrefillAdd] = useState<{ company: string; refNo: string }>({
    company: 'FESCO',
    refNo: '',
  });

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [historyBillId, setHistoryBillId] = useState<number | null>(null);

  // Auth & Cloud Sync States
  const [authChecking, setAuthChecking] = useState(true);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isRestoringRef = useRef(false);

  // Full-Screen Welcome Gate Form States (Default to Sign Up for new users)
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authShopName, setAuthShopName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authConfirmPin, setAuthConfirmPin] = useState('');
  const [showAuthPin, setShowAuthPin] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    initAdMobAndShowBanner();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadAll = useCallback(async () => {
    try {
      const [dashRes, monthsRes, settingsRes] = await Promise.all([
        api.getDashboard(),
        api.getMonths(),
        api.getSettings(),
      ]);
      setStats(dashRes);
      setMonths(monthsRes.months);
      setSettings(settingsRes.settings);
      setDbInfo(settingsRes.dbInfo);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const syncNowToCloud = useCallback(async (targetUser?: User | null) => {
    const activeUser = targetUser ?? auth.currentUser;
    if (!activeUser || isRestoringRef.current) return;
    setCloudSyncing(true);
    try {
      const backupPayload = await api.exportBackup('all');
      await saveCloudBackup(activeUser.uid, backupPayload as Record<string, unknown>);
      setLastSyncedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      // Offline mode: local storage remains intact
    } finally {
      setCloudSyncing(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setCloudUser(u);
      setAuthChecking(false);
      if (u) {
        try {
          isRestoringRef.current = true;
          const cloudData = await loadCloudBackup(u.uid);
          if (cloudData && Array.isArray(cloudData.bills)) {
            await api.restoreBackup(cloudData as Parameters<typeof api.restoreBackup>[0], 'merge');
            await loadAll();
            setRefreshKey((k) => k + 1);
          }
        } catch {
          // Ignore offline error
        } finally {
          isRestoringRef.current = false;
        }
        await syncNowToCloud(u);
      }
    });
    return () => unsub();
  }, [loadAll, syncNowToCloud]);

  const refreshData = useCallback(async () => {
    await loadAll();
    setRefreshKey((k) => k + 1);
    await syncNowToCloud();
  }, [loadAll, syncNowToCloud]);

  const handleCloudAuthSuccess = async (loggedInUser: User, isNewAccount: boolean) => {
    setCloudUser(loggedInUser);
    isRestoringRef.current = true;
    try {
      if (!isNewAccount) {
        const cloudData = await loadCloudBackup(loggedInUser.uid);
        if (cloudData && Array.isArray(cloudData.bills)) {
          await api.restoreBackup(cloudData as Parameters<typeof api.restoreBackup>[0], 'merge');
          await loadAll();
          setRefreshKey((k) => k + 1);
        }
      }
    } finally {
      isRestoringRef.current = false;
    }
    await syncNowToCloud(loggedInUser);
  };

  const handleWelcomeGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup' && authPin !== authConfirmPin) {
      setAuthError('Dono 6-hindso wale PIN ek jaise hone chahiye.');
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const newUser = await signUpWithPhonePin(authPhone, authPin, authShopName);
        if (authShopName.trim()) {
          await api.updateSettings({ shop_name: authShopName.trim() });
          await loadAll();
        }
        await handleCloudAuthSuccess(newUser, true);
        showToast('Account ban gaya aur data cloud par mehfooz ho gaya!');
      } else {
        const existingUser = await signInWithPhonePin(authPhone, authPin);
        await handleCloudAuthSuccess(existingUser, false);
        showToast('Login kamyab! Aap ka hisab sync ho gaya.');
      }
      setAuthPin('');
      setAuthConfirmPin('');
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleQuickLogout = async () => {
    try {
      await logoutUser();
      showToast('Aap apne account se logout ho gaye hain.');
    } catch {
      showToast('Logout mein masla aaya.', 'error');
    }
  };

  const handleTabChange = async (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'reports') {
      await showInterstitialAd();
    }
  };

  const handleToggleStatus = async (bill: Bill, nextStatus: PaymentStatus) => {
    if (togglingId === bill.id) return;
    setTogglingId(bill.id);
    try {
      const res = await api.setBillStatus(bill.id, nextStatus);
      await refreshData();
      if (res.changed) {
        showToast(
          nextStatus === 'PAID'
            ? `Bill #${bill.serial_number} marked Paid (+${formatCurrency(bill.commission, settings.currency_code)}).`
            : `Bill #${bill.serial_number} marked Unpaid (-${formatCurrency(bill.commission, settings.currency_code)} reversed).`
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update payment status.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBill) return;
    setDeletingBusy(true);
    try {
      await api.deleteBill(deletingBill.id);
      const deletedSerial = deletingBill.serial_number;
      setDeletingBill(null);
      await refreshData();
      showToast(`Bill #${deletedSerial} deleted.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete bill.', 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBillsSearchSeed(globalSearch.trim());
    setActiveTab('bills');
  };

  // 1. Checking saved login session
  if (authChecking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-md">
          <Zap className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-lg font-extrabold">Pak Bill Manager</h1>
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          <span>Account check ho raha hai...</span>
        </div>
      </div>
    );
  }

  // 2. Mandatory Sign Up / Sign In Screen for logged-out / new users
  if (!cloudUser) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-8 text-slate-900">
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          {/* Top Brand Header */}
          <div className="bg-blue-700 px-6 py-6 text-center text-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Zap className="h-6 w-6" />
            </div>
            <h1 className="mt-3 text-xl font-extrabold tracking-tight">Pak Bill Manager</h1>
            <p className="mt-1 text-xs text-blue-100">
              Apne Mobile Number aur 6-Digit PIN se Account Banayein ya Login Karein
            </p>
          </div>

          <div className="p-6">
            {/* Sign Up / Sign In Switcher */}
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError('');
                }}
                className={`h-10 rounded-lg text-xs font-extrabold transition ${
                  authMode === 'signup'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account (Sign Up)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthError('');
                }}
                className={`h-10 rounded-lg text-xs font-extrabold transition ${
                  authMode === 'signin'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In (Login)
              </button>
            </div>

            <form onSubmit={handleWelcomeGateSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Shop / Counter Name
                  </label>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={authShopName}
                      onChange={(e) => setAuthShopName(e.target.value)}
                      placeholder="Maslan: Zahid Mobiles and Photo State"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Mobile Number (11 Hindse)
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={11}
                    required
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="03001234567"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  6-Digit Secret PIN
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showAuthPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPin((s) => !s)}
                    aria-label="Toggle PIN visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showAuthPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {authMode === 'signup' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Confirm 6-Digit PIN
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showAuthPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={authConfirmPin}
                      onChange={(e) =>
                        setAuthConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="••••••"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              {authError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                  <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
              >
                <Cloud className="h-4 w-4" />
                <span>
                  {authBusy
                    ? 'Please wait...'
                    : authMode === 'signup'
                      ? 'Create Account & Start'
                      : 'Sign In & Open App'}
                </span>
              </button>
            </form>

            <p className="mt-4 text-center text-[11px] text-slate-500">
              Ek baar login karne ke baad aap hamesha login rahenge jab tak aap khud Logout na karein.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currencyCode = settings.currency_code || 'PKR';
  const activeItem = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Left Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold tracking-tight text-slate-900">
              Pak Bill Manager
            </div>
            <div className="truncate text-xs text-slate-500">{settings.shop_name}</div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className="flex flex-1 items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
            >
              <div className="flex items-center gap-2 truncate">
                <Cloud className="h-4 w-4 shrink-0" />
                <span className="truncate">{emailToPhone(cloudUser.email)}</span>
              </div>
              <span className="shrink-0 text-[10px] underline">Sync</span>
            </button>
            <button
              type="button"
              onClick={handleQuickLogout}
              title="Logout"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl bg-blue-50 p-3.5">
            <div className="text-xs font-medium text-blue-800">Earned Commission</div>
            <div className="mt-1 font-mono text-lg font-extrabold text-blue-900 tabular-nums">
              {formatCurrency(stats?.totalCommissionEarned ?? 0, currencyCode)}
            </div>
            <div className="mt-0.5 text-xs text-blue-700 tabular-nums">
              {stats?.paidBills ?? 0} Paid · {stats?.unpaidBills ?? 0} Unpaid
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3.5 backdrop-blur-md lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-extrabold tracking-tight text-slate-900">
              Pak Bill Manager
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-extrabold text-emerald-700 transition"
            >
              <Cloud className={`h-3.5 w-3.5 ${cloudSyncing ? 'animate-pulse' : ''}`} />
              <span>Synced</span>
            </button>

            <button
              type="button"
              onClick={handleQuickLogout}
              aria-label="Logout"
              className="flex h-9 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>

            <PWAInstallButton variant="compact" />

            <button
              type="button"
              onClick={() => handleTabChange('bills')}
              aria-label="Search all bills"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Desktop Top Bar */}
        <header className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-6 border-b border-slate-200 bg-white/95 px-6 backdrop-blur-md lg:flex">
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            {activeItem.label}
          </h1>

          <form onSubmit={handleGlobalSearchSubmit} className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search Reference # or Serial # and press Enter..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white"
            />
          </form>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100"
            >
              <Cloud className={`h-4 w-4 ${cloudSyncing ? 'animate-pulse' : ''}`} />
              <span>Synced ({emailToPhone(cloudUser.email)})</span>
            </button>

            <button
              type="button"
              onClick={handleQuickLogout}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>

            <PWAInstallButton variant="compact" />

            <button
              type="button"
              onClick={() => handleTabChange('add')}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Bill</span>
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-36 sm:px-6 lg:py-6 lg:pb-16">
          {activeTab === 'dashboard' && (
            <DashboardView
              stats={stats}
              loading={loading}
              currencyCode={currencyCode}
              shopName={settings.shop_name}
              togglingId={togglingId}
              onNavigate={(tab) => handleTabChange(tab)}
              onQuickRecordBill={(companyId, refNo) => {
                setPrefillAdd({ company: companyId, refNo });
                setActiveTab('add');
                showToast(`Selected ${companyId} (${refNo}) — Enter Bill Amount & Save.`);
              }}
              onToggleStatus={handleToggleStatus}
              onEditBill={(bill) => setEditingBill(bill)}
              onDeleteBill={(bill) => setDeletingBill(bill)}
              onViewHistory={(id) => setHistoryBillId(id)}
            />
          )}

          {activeTab === 'add' && (
            <AddBillView
              suggestedSerial={stats?.nextSerialNumber ?? 1}
              defaultCommission={settings.default_commission}
              currencyCode={currencyCode}
              prefillCompany={prefillAdd.company}
              prefillReference={prefillAdd.refNo}
              recentBills={stats?.recentBills ?? []}
              togglingId={togglingId}
              onBillCreated={async (bill) => {
                setPrefillAdd({ company: 'FESCO', refNo: '' });
                await refreshData();
                showToast(`Added Bill #${bill.serial_number} (${bill.reference_number}).`);
              }}
              onToggleStatus={handleToggleStatus}
              onEditBill={(bill) => setEditingBill(bill)}
              onDeleteBill={(bill) => setDeletingBill(bill)}
              onViewHistory={(id) => setHistoryBillId(id)}
            />
          )}

          {activeTab === 'bills' && (
            <AllBillsView
              currencyCode={currencyCode}
              months={months}
              refreshKey={refreshKey}
              initialSearch={billsSearchSeed}
              togglingId={togglingId}
              onAddClick={() => handleTabChange('add')}
              onToggleStatus={handleToggleStatus}
              onEditBill={(bill) => setEditingBill(bill)}
              onDeleteBill={(bill) => setDeletingBill(bill)}
              onViewHistory={(id) => setHistoryBillId(id)}
            />
          )}

          {activeTab === 'months' && (
            <MonthlyHistoryView
              months={months}
              currencyCode={currencyCode}
              settings={settings}
              refreshKey={refreshKey}
              togglingId={togglingId}
              onToggleStatus={handleToggleStatus}
              onEditBill={(bill) => setEditingBill(bill)}
              onDeleteBill={(bill) => setDeletingBill(bill)}
              onViewHistory={(id) => setHistoryBillId(id)}
              onToast={showToast}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsBackupView
              settings={settings}
              onRestored={refreshData}
              onToast={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              dbInfo={dbInfo}
              onSettingsSaved={(updated) => {
                setSettings(updated);
                refreshData();
              }}
              onOpenBackupTab={() => handleTabChange('reports')}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden"
      >
        <div className="grid h-16 grid-cols-6 items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition ${
                  active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Cloud Sync & Mobile PIN Login Modal */}
      <CloudSyncModal
        open={cloudModalOpen}
        user={cloudUser}
        syncing={cloudSyncing}
        lastSyncedAt={lastSyncedAt}
        defaultShopName={settings.shop_name}
        onClose={() => setCloudModalOpen(false)}
        onAuthSuccess={handleCloudAuthSuccess}
        onManualSync={() => syncNowToCloud()}
        onToast={showToast}
      />

      {/* Modals */}
      <EditBillModal
        bill={editingBill}
        defaultCommission={settings.default_commission}
        currencyCode={currencyCode}
        onClose={() => setEditingBill(null)}
        onSaved={async (updated) => {
          setEditingBill(null);
          await refreshData();
          showToast(`Updated Bill #${updated.serial_number}.`);
        }}
      />

      <BillHistoryModal
        billId={historyBillId}
        currencyCode={currencyCode}
        onClose={() => setHistoryBillId(null)}
      />

      <ConfirmModal
        open={!!deletingBill}
        title={`Delete Bill #${deletingBill?.serial_number ?? ''}?`}
        message={
          deletingBill
            ? `Are you sure you want to delete Reference # ${deletingBill.reference_number} (${formatCurrency(deletingBill.bill_amount, currencyCode)})?${
                deletingBill.status === 'PAID'
                  ? ` Its paid commission (${formatCurrency(deletingBill.commission, currencyCode)}) will be automatically reversed from Total Earned Commission.`
                  : ''
              }`
            : ''
        }
        confirmLabel="Delete Bill"
        tone="danger"
        loading={deletingBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingBill(null)}
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-32 right-4 z-50 flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg lg:bottom-20 ${
            toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
