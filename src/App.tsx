import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MessageSquareCode,
  Phone,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  User as UserIcon,
  X,
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
  sendForgotPinOtp,
  signInWithPhonePin,
  signUpWithPhonePin,
  verifyOtpAndResetPin,
  type ConfirmationResult,
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

const CURRENT_BUILD_NUMBER = Number(import.meta.env.VITE_APP_BUILD_NUMBER || 0);
const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/aaa347007-web/FESCO/releases/latest';

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
  { id: 'settings', label: 'My Profile', mobileLabel: 'Me', icon: UserIcon },
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

  // Automatic GitHub Update State
  const [availableUpdate, setAvailableUpdate] = useState<{
    version: string;
    downloadUrl: string;
    notes: string;
  } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Auth & Cloud Sync States
  const [authChecking, setAuthChecking] = useState(true);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isRestoringRef = useRef(false);

  // Full-Screen Welcome Gate Form States
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | 'forgot'>('signup');
  const [forgotStep, setForgotStep] = useState<'phone' | 'otp'>('phone');
  const [authShopName, setAuthShopName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authConfirmPin, setAuthConfirmPin] = useState('');
  const [authOtpCode, setAuthOtpCode] = useState('');
  const [authConfirmation, setAuthConfirmation] = useState<ConfirmationResult | null>(null);
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

  // Automatic Check for New GitHub Release APK
  useEffect(() => {
    if (!CURRENT_BUILD_NUMBER) return;
    let cancelled = false;

    const checkForAppUpdate = async () => {
      try {
        const res = await fetch(GITHUB_LATEST_RELEASE_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const tag = String(data.tag_name || '');
        const match = tag.match(/(\d+)$/);
        const latestBuild = match ? Number(match[1]) : 0;

        const assets = Array.isArray(data.assets) ? data.assets : [];
        const apkAsset = assets.find((a: { name?: string }) =>
          String(a.name || '').toLowerCase().endsWith('.apk')
        );

        if (!cancelled && latestBuild > CURRENT_BUILD_NUMBER && apkAsset?.browser_download_url) {
          setAvailableUpdate({
            version: tag,
            downloadUrl: apkAsset.browser_download_url,
            notes:
              typeof data.body === 'string' && data.body.trim()
                ? data.body.trim()
                : 'Naye features aur behtari shamil kar di gayi hain.',
          });
        }
      } catch {
        // Offline or network busy — silently ignore
      }
    };

    checkForAppUpdate();
    return () => {
      cancelled = true;
    };
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

  const switchWelcomeMode = (nextMode: 'signup' | 'signin' | 'forgot') => {
    setAuthMode(nextMode);
    setForgotStep('phone');
    setAuthError('');
    setAuthPin('');
    setAuthConfirmPin('');
    setAuthOtpCode('');
    setAuthConfirmation(null);
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

  const handleWelcomeSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const result = await sendForgotPinOtp(authPhone, 'welcome-recaptcha-container');
      setAuthConfirmation(result);
      setForgotStep('otp');
      showToast('6-hindso ka SMS OTP code aap ke mobile par bhej diya gaya hai!');
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleWelcomeVerifyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!authConfirmation) {
      setAuthError('Pehle mobile number par OTP mangwayein.');
      return;
    }
    if (authPin !== authConfirmPin) {
      setAuthError('Dono naye 6-hindso wale PIN ek jaise hone chahiye.');
      return;
    }

    setAuthBusy(true);
    try {
      const recoveredUser = await verifyOtpAndResetPin(
        authConfirmation,
        authOtpCode,
        authPhone,
        authPin
      );
      await handleCloudAuthSuccess(recoveredUser, false);
      showToast('PIN tabdeel ho gaya aur account recover ho gaya!');
      switchWelcomeMode('signin');
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

  if (!cloudUser) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-8 text-slate-900">
        <div id="welcome-recaptcha-container" />

        <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-blue-700 px-6 py-6 text-center text-white">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              {authMode === 'forgot' ? (
                <KeyRound className="h-6 w-6" />
              ) : (
                <Zap className="h-6 w-6" />
              )}
            </div>
            <h1 className="mt-3 text-xl font-extrabold tracking-tight">
              {authMode === 'forgot' ? 'PIN Recovery (SMS OTP)' : 'Pak Bill Manager'}
            </h1>
            <p className="mt-1 text-xs text-blue-100">
              {authMode === 'forgot'
                ? 'Mobile Number par SMS Code Mangwa Kar Naya PIN Lagayein'
                : 'Apne Mobile Number aur 6-Digit PIN se Account Banayein ya Login Karein'}
            </p>
          </div>

          <div className="p-6">
            {authMode === 'forgot' ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => switchWelcomeMode('signin')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Wapas Sign In par jayein</span>
                </button>

                {forgotStep === 'phone' ? (
                  <form onSubmit={handleWelcomeSendOtp} className="space-y-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                      Apna registered mobile number likhein. Aap ke number par{' '}
                      <strong>6-hindso ka free SMS OTP code</strong> aayega.
                    </div>

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
                          onChange={(e) =>
                            setAuthPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                          }
                          placeholder="03001234567"
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

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
                      <MessageSquareCode className="h-4 w-4" />
                      <span>{authBusy ? 'SMS OTP bheja ja raha hai...' : 'Send SMS OTP Code'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleWelcomeVerifyReset} className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <strong>{authPhone}</strong> par bheja gaya 6-hindso ka SMS code daalein aur
                      apna naya 6-Digit PIN set karein.
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        6-Digit SMS OTP Code
                      </label>
                      <div className="relative">
                        <MessageSquareCode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={authOtpCode}
                          onChange={(e) =>
                            setAuthOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder="123456"
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        New 6-Digit Secret PIN
                      </label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type={showAuthPin ? 'text' : 'password'}
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={authPin}
                          onChange={(e) =>
                            setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder="••••••"
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAuthPin((s) => !s)}
                          aria-label="Toggle PIN visibility"
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                        >
                          {showAuthPin ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        Confirm New 6-Digit PIN
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

                    {authError && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authBusy}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {authBusy ? 'Verify ho raha hai...' : 'Verify OTP & Save New PIN'}
                      </span>
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => switchWelcomeMode('signup')}
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
                    onClick={() => switchWelcomeMode('signin')}
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
                        onChange={(e) =>
                          setAuthPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                        }
                        placeholder="03001234567"
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        6-Digit Secret PIN
                      </label>
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => switchWelcomeMode('forgot')}
                          className="text-xs font-bold text-blue-700 hover:underline"
                        >
                          PIN Bhool Gaye? (Forgot PIN)
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showAuthPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={authPin}
                        onChange={(e) =>
                          setAuthPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="••••••"
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPin((s) => !s)}
                        aria-label="Toggle PIN visibility"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      >
                        {showAuthPin ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
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

                <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
                  Ek baar login karne ke baad aap hamesha login rahenge jab tak aap khud Logout na
                  karein.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                {settings.shop_name}
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                {emailToPhone(cloudUser.email, cloudUser.phoneNumber)}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleGlobalSearchSubmit}
            className="hidden max-w-md flex-1 items-center md:flex"
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search customer, serial #, or 14-digit ref..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
              title="Cloud Backup & Sync"
            >
              <Cloud className={`h-3.5 w-3.5 ${cloudSyncing ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">
                {cloudSyncing ? 'Syncing...' : 'Cloud Active'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleQuickLogout}
              aria-label="Logout"
              title="Logout"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="hidden border-t border-slate-100 bg-slate-50/70 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    active
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {availableUpdate && !updateDismissed && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-blue-700" />
              <span>
                <strong>New Update ({availableUpdate.version}) Available!</strong>{' '}
                {availableUpdate.notes}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={availableUpdate.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-extrabold text-white hover:bg-blue-800"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span>Download APK</span>
              </a>
              <button
                type="button"
                onClick={() => setUpdateDismissed(true)}
                className="rounded-lg p-1 text-blue-700 hover:bg-blue-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && stats && (
              <DashboardView
                stats={stats}
                months={months}
                settings={settings}
                togglingId={togglingId}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
                onNavigate={(tab) => handleTabChange(tab as NavTab)}
                onQuickPrefillAdd={(company, refNo) => {
                  setPrefillAdd({ company, refNo });
                  setActiveTab('add');
                }}
              />
            )}

            {activeTab === 'add' && (
              <AddBillView
                settings={settings}
                prefillCompany={prefillAdd.company}
                prefillRefNo={prefillAdd.refNo}
                onBillAdded={async (msg) => {
                  setPrefillAdd({ company: 'FESCO', refNo: '' });
                  await refreshData();
                  showToast(msg);
                  setActiveTab('dashboard');
                }}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}

            {activeTab === 'bills' && (
              <AllBillsView
                key={`bills-${refreshKey}`}
                settings={settings}
                initialSearch={billsSearchSeed}
                togglingId={togglingId}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
              />
            )}

            {activeTab === 'months' && (
              <MonthlyHistoryView
                key={`months-${refreshKey}`}
                months={months}
                settings={settings}
                togglingId={togglingId}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsBackupView
                key={`reports-${refreshKey}`}
                settings={settings}
                onRestored={async () => {
                  await refreshData();
                  showToast('Backup restored successfully!');
                }}
                onToast={showToast}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                user={cloudUser}
                dbInfo={dbInfo}
                onSaved={async () => {
                  await refreshData();
                  showToast('Profile updated!');
                }}
                onUserUpdated={(updatedUser) => {
                  setCloudUser(updatedUser);
                }}
                onLogout={handleQuickLogout}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xs lg:hidden">
        <div className="grid grid-cols-6 py-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-extrabold ${
                  active ? 'text-blue-700' : 'text-slate-500'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

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

      <EditBillModal
        bill={editingBill}
        settings={settings}
        onClose={() => setEditingBill(null)}
        onSaved={async () => {
          setEditingBill(null);
          await refreshData();
          showToast('Bill updated!');
        }}
        onError={(msg) => showToast(msg, 'error')}
      />

      <ConfirmModal
        open={Boolean(deletingBill)}
        title="Delete Bill?"
        message={
          deletingBill
            ? `Kya aap waqai Bill #${deletingBill.serial_number} (${deletingBill.customer_name || deletingBill.reference_number}) delete karna chahte hain?`
            : ''
        }
        confirmLabel="Yes, Delete"
        busy={deletingBusy}
        onCancel={() => setDeletingBill(null)}
        onConfirm={handleConfirmDelete}
      />

      <BillHistoryModal
        billId={historyBillId}
        settings={settings}
        onClose={() => setHistoryBillId(null)}
      />

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 lg:bottom-6">
          <div
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold text-white shadow-lg ${
              toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
