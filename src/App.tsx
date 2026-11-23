import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Crown,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileSpreadsheet,
  ImagePlus,
  KeyRound,
  Languages,
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
  Upload,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { BillHistoryModal } from './components/BillHistoryModal';
import { ConfirmModal } from './components/ConfirmModal';
import { EditBillModal } from './components/EditBillModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { hideBannerAd, initAdMobAndShowBanner, showInterstitialAd } from './lib/admob';
import { api } from './lib/api';
import {
  auth,
  emailToPhone,
  getUserPendingProRequest,
  getUserProStatus,
  loadCloudBackup,
  logoutUser,
  mapFirebaseAuthError,
  onAuthStateChanged,
  saveCloudBackup,
  sendForgotPinOtp,
  signInWithPhonePin,
  signUpWithPhonePin,
  submitProPaymentProof,
  verifyOtpAndResetPin,
  type ConfirmationResult,
  type ProPaymentRequest,
  type ProSubscription,
  type User,
} from './lib/firebase';
import { formatCurrency } from './lib/format';
import type { AppSettings, Bill, DashboardStats, MonthlySummary, PaymentStatus } from './types/bill';
import { AddBillView } from './views/AddBillView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { AllBillsView } from './views/AllBillsView';
import { DashboardView } from './views/DashboardView';
import { MonthlyHistoryView } from './views/MonthlyHistoryView';
import { ReportsBackupView } from './views/ReportsBackupView';
import { SettingsView } from './views/SettingsView';

type NavTab = 'dashboard' | 'add' | 'bills' | 'months' | 'reports' | 'settings' | 'admin';
type AppLang = 'en' | 'ur';

const ADMIN_PHONE = '03417208670';
const PAYMENT_ACCOUNT_TITLE = 'Zahid Nawaz';
const PAYMENT_NUMBER = '03417208670';

const CURRENT_BUILD_NUMBER = Number(import.meta.env.VITE_APP_BUILD_NUMBER || 0);
const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/aaa347007-web/FESCO/releases/latest';

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

async function compressScreenshotToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 720;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => reject(new Error('Image load nahi ho saki.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('File read nahi ho saki.'));
    reader.readAsDataURL(file);
  });
}

async function wipeLocalAppStorage(): Promise<void> {
  const savedLang = localStorage.getItem('pakbill_lang');
  try {
    localStorage.clear();
    if (savedLang) localStorage.setItem('pakbill_lang', savedLang);
  } catch {
    // Ignore
  }
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs.map((dbInfo) => {
          if (!dbInfo.name || dbInfo.name.toLowerCase().includes('firebase')) {
            return Promise.resolve();
          }
          return new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(dbInfo.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        })
      );
    }
  } catch {
    // Ignore
  }
}

export default function App() {
  const [lang, setLang] = useState<AppLang>(() => {
    const saved = localStorage.getItem('pakbill_lang');
    return saved === 'ur' ? 'ur' : 'en';
  });
  const isUr = lang === 'ur';

  const toggleLanguage = () => {
    const next: AppLang = lang === 'en' ? 'ur' : 'en';
    setLang(next);
    try {
      localStorage.setItem('pakbill_lang', next);
    } catch {
      // Ignore
    }
    showToast(next === 'ur' ? 'زبان اردو منتخب کر لی گئی ہے' : 'Language switched to English');
  };

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

  // Pro Subscription & Direct Screenshot Upload States
  const [proStatus, setProStatus] = useState<ProSubscription>({
    isPro: false,
    planType: 'free',
    expiresAt: null,
  });
  const [proModalOpen, setProModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [screenshotData, setScreenshotData] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [existingRequest, setExistingRequest] = useState<ProPaymentRequest | null>(null);

  // Auth & Silent Auto Cloud Sync States
  const [authChecking, setAuthChecking] = useState(true);
  const [splashStep, setSplashStep] = useState(1);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const isRestoringRef = useRef(false);
  const isFreshSignUpRef = useRef(false);

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

  // Step-by-step animated checkmarks on Style 3 Splash Screen
  useEffect(() => {
    if (!authChecking) return;
    const t1 = setTimeout(() => setSplashStep(2), 450);
    const t2 = setTimeout(() => setSplashStep(3), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [authChecking]);

  const currentUserPhone = cloudUser
    ? emailToPhone(cloudUser.email, cloudUser.phoneNumber).replace(/\D/g, '')
    : '';
  const isAdminUser = currentUserPhone === ADMIN_PHONE;

  const baseNavItems: {
    id: NavTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'dashboard',
      label: isUr ? 'ڈیش بورڈ' : 'Dashboard',
      mobileLabel: isUr ? 'ہوم' : 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'add',
      label: isUr ? 'نیا بل' : 'Add Bill',
      mobileLabel: isUr ? 'اندراج' : 'Add',
      icon: PlusCircle,
    },
    {
      id: 'bills',
      label: isUr ? 'تمام بلز' : 'All Bills',
      mobileLabel: isUr ? 'بلز' : 'Bills',
      icon: FileSpreadsheet,
    },
    {
      id: 'months',
      label: isUr ? 'ماہانہ ریکارڈ' : 'Monthly History',
      mobileLabel: isUr ? 'ماہانہ' : 'Months',
      icon: CalendarDays,
    },
    {
      id: 'reports',
      label: isUr ? 'رپورٹس اور بیک اپ' : 'Reports & Backup',
      mobileLabel: isUr ? 'رپورٹس' : 'Reports',
      icon: DatabaseBackup,
    },
    {
      id: 'settings',
      label: isUr ? 'میری پروفائل' : 'My Profile',
      mobileLabel: isUr ? 'پروفائل' : 'Me',
      icon: UserIcon,
    },
  ];

  const navItems = isAdminUser
    ? [
        ...baseNavItems,
        {
          id: 'admin' as NavTab,
          label: isUr ? 'ایڈمن پینل' : 'Admin Panel',
          mobileLabel: isUr ? 'ایڈمن' : 'Admin',
          icon: ShieldCheck,
        },
      ]
    : baseNavItems;

  // Control AdMob Ads based on Pro Status
  useEffect(() => {
    if (proStatus.isPro) {
      hideBannerAd();
    } else if (!authChecking && cloudUser) {
      initAdMobAndShowBanner();
    }
  }, [proStatus.isPro, authChecking, cloudUser]);

  // Load user's pending request when opening Pro modal
  useEffect(() => {
    if (!proModalOpen || !currentUserPhone || proStatus.isPro) return;
    getUserPendingProRequest(currentUserPhone).then((req) => {
      setExistingRequest(req);
    });
  }, [proModalOpen, currentUserPhone, proStatus.isPro]);

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
        // Offline or network busy
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
    try {
      const backupPayload = await api.exportBackup('all');
      await saveCloudBackup(activeUser.uid, backupPayload as Record<string, unknown>);
    } catch {
      // Offline mode: local storage remains intact
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setCloudUser(u);
      setAuthChecking(false);
      if (u) {
        const phoneStr = emailToPhone(u.email, u.phoneNumber);
        const sub = await getUserProStatus(u.uid, phoneStr);
        setProStatus(sub);

        if (isFreshSignUpRef.current) {
          isFreshSignUpRef.current = false;
          return;
        }

        try {
          isRestoringRef.current = true;
          const cloudData = await loadCloudBackup(u.uid);
          if (cloudData && Array.isArray(cloudData.bills)) {
            await api.restoreBackup(cloudData as Parameters<typeof api.restoreBackup>[0], 'replace');
          } else {
            await wipeLocalAppStorage();
          }
          await loadAll();
          setRefreshKey((k) => k + 1);
        } catch {
          // Ignore offline error
        } finally {
          isRestoringRef.current = false;
        }
        await syncNowToCloud(u);
      } else {
        setProStatus({ isPro: false, planType: 'free', expiresAt: null });
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
    const phoneStr = emailToPhone(loggedInUser.email, loggedInUser.phoneNumber);
    const sub = await getUserProStatus(loggedInUser.uid, phoneStr);
    setProStatus(sub);

    isRestoringRef.current = true;
    try {
      if (isNewAccount) {
        await wipeLocalAppStorage();
        await api.updateSettings({
          shop_name: authShopName.trim() || 'Pak Bill Manager',
          owner_name: 'Shop Counter',
        });
        await loadAll();
        setRefreshKey((k) => k + 1);
      } else {
        const cloudData = await loadCloudBackup(loggedInUser.uid);
        if (cloudData && Array.isArray(cloudData.bills)) {
          await api.restoreBackup(cloudData as Parameters<typeof api.restoreBackup>[0], 'replace');
        } else {
          await wipeLocalAppStorage();
        }
        await loadAll();
        setRefreshKey((k) => k + 1);
      }
    } finally {
      isRestoringRef.current = false;
    }
    await syncNowToCloud(loggedInUser);
  };

  const handleScreenshotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressScreenshotToBase64(file);
      setScreenshotData(compressed);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Screenshot select nahi ho saka.', 'error');
    }
  };

  const handleSubmitPaymentProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudUser || !currentUserPhone) return;
    if (!screenshotData) {
      showToast('Pehle payment ka screenshot select karein.', 'error');
      return;
    }

    setUploadingProof(true);
    try {
      await submitProPaymentProof({
        uid: cloudUser.uid,
        phone: currentUserPhone,
        shopName: settings.shop_name,
        planType: selectedPlan,
        transactionId,
        screenshotBase64: screenshotData,
      });
      const updatedReq = await getUserPendingProRequest(currentUserPhone);
      setExistingRequest(updatedReq);
      setScreenshotData('');
      setTransactionId('');
      showToast('Screenshot upload ho gaya! Admin approve karte hi Pro active ho jayega.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Screenshot upload mein masla aaya.', 'error');
    } finally {
      setUploadingProof(false);
    }
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
        isFreshSignUpRef.current = true;
        await wipeLocalAppStorage();
        const newUser = await signUpWithPhonePin(authPhone, authPin, authShopName);
        await handleCloudAuthSuccess(newUser, true);
        showToast('Naya account ban gaya! Aap ka apna fresh hisab shuru ho gaya hai.');
      } else {
        await wipeLocalAppStorage();
        const existingUser = await signInWithPhonePin(authPhone, authPin);
        await handleCloudAuthSuccess(existingUser, false);
        showToast('Login kamyab! Aap ka hisab sync ho gaya.');
      }
      setAuthPin('');
      setAuthConfirmPin('');
    } catch (err) {
      isFreshSignUpRef.current = false;
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
      showToast('6-hindso ka WhatsApp OTP code aap ke WhatsApp par bhej diya gaya hai!');
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
      setAuthError('Pehle apne WhatsApp number par OTP mangwayein.');
      return;
    }
    if (authPin !== authConfirmPin) {
      setAuthError('Dono naye 6-hindso wale PIN ek jaise hone chahiye.');
      return;
    }

    setAuthBusy(true);
    try {
      await wipeLocalAppStorage();
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
      await wipeLocalAppStorage();
      setStats(null);
      setMonths([]);
      setSettings(DEFAULT_SETTINGS);
      setActiveTab('dashboard');
      await logoutUser();
      showToast('Aap logout ho gaye hain aur local data saaf kar diya gaya hai.');
    } catch {
      showToast('Logout mein masla aaya.', 'error');
    }
  };

  const handleTabChange = async (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'reports' && !proStatus.isPro) {
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

  // STYLE 3: CLEAN MODERN GLASS CARD SPLASH SCREEN
  if (authChecking) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-gradient-to-b from-sky-50 via-white to-blue-50/80 px-5 py-10 text-slate-900">
        {/* Subtle geometric grid backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] opacity-45"
        />

        <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white/90 px-3.5 py-1 text-[11px] font-extrabold text-blue-800 shadow-2xs">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
          <span>PAKISTAN&apos;S SMART SHOP KHATA</span>
        </div>

        <div className="relative z-10 flex w-full max-w-xs flex-col items-center text-center">
          {/* 3D Floating Cobalt-Blue Icon Card */}
          <div className="relative">
            <div className="absolute -inset-2.5 animate-pulse rounded-3xl bg-blue-500/15 blur-md" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl shadow-blue-700/25 ring-4 ring-white">
              <Zap className="h-10 w-10" />
            </div>
          </div>

          <h1 className="mt-5 text-2xl font-black tracking-tight text-slate-900">
            Pak Bill Manager
          </h1>
          <p className="mt-1 text-xs font-bold text-blue-800">
            پاک بل مینیجر — بجلی، گیس اور پی ٹی سی ایل کھاتہ
          </p>

          {/* Compact White Glass Status Card with Animated Green Checkmarks */}
          <div className="mt-6 w-full space-y-2.5 rounded-3xl border border-slate-200/90 bg-white/85 p-4 text-left shadow-lg shadow-slate-200/60 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                {isUr ? 'اکاؤنٹ کی تصدیق' : 'Account Verified'}
              </span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-3.5 w-3.5 stroke-[3]" />
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span
                className={`font-bold transition-colors ${
                  splashStep >= 2 ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {isUr ? 'کلاؤڈ بیک اپ محفوظ' : 'Cloud Synced'}
              </span>
              {splashStep >= 2 ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span
                className={`font-bold transition-colors ${
                  splashStep >= 3 ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {isUr ? 'کاؤنٹر تیار ہے' : 'Ready'}
              </span>
              {splashStep >= 3 ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 text-center text-[11px] font-bold text-slate-400">
          Powered by Pak Fintechs
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
              {authMode === 'forgot' ? 'PIN Recovery (WhatsApp OTP)' : 'Pak Bill Manager'}
            </h1>
            <p className="mt-1 text-xs text-blue-100">
              {authMode === 'forgot'
                ? 'Apne WhatsApp Number par Verification Code Mangwa Kar Naya PIN Lagayein'
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
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                      Apna registered <strong>WhatsApp number</strong> likhein. Aap ke WhatsApp par{' '}
                      <strong>6-hindso ka free OTP code</strong> aayega.
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        WhatsApp Number (11 Hindse)
                      </label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
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
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-emerald-600"
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
                      <MessageSquareCode className="h-4 w-4" />
                      <span>
                        {authBusy ? 'WhatsApp OTP bheja ja raha hai...' : 'Send WhatsApp OTP Code'}
                      </span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleWelcomeVerifyReset} className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      Aap ke WhatsApp number <strong>{authPhone}</strong> par 6-hindso ka code bhej
                      diya gaya hai. Code daal kar apna naya 6-Digit PIN set karein.
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        6-Digit WhatsApp OTP Code
                      </label>
                      <div className="relative">
                        <MessageSquareCode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
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
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-emerald-600"
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
                      WhatsApp / Mobile Number (11 Hindse)
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
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                  {settings.shop_name}
                </h1>
                {proStatus.isPro && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                    <Crown className="h-3 w-3 text-amber-600" />
                    PRO
                  </span>
                )}
              </div>
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
                placeholder={
                  isUr
                    ? 'کسٹمر کا نام، سیریل نمبر یا حوالہ نمبر تلاش کریں...'
                    : 'Search customer, serial #, or 14-digit ref...'
                }
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
          </form>

          <div className="flex items-center gap-2">
            <PWAInstallButton />

            {isAdminUser ? (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-extrabold text-amber-400 shadow-xs transition hover:bg-slate-800"
                title="Open Super Admin Dashboard"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isUr ? 'ایڈمن پینل' : 'Admin Panel'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setProModalOpen(true)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition ${
                  proStatus.isPro
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs hover:opacity-95'
                }`}
                title="Pro Ad-Free Version"
              >
                <Crown className="h-3.5 w-3.5" />
                <span>
                  {proStatus.isPro ? (isUr ? 'پرو VIP' : 'Pro VIP') : isUr ? 'پرو بنیں' : 'Go Pro'}
                </span>
              </button>
            )}

            {/* URDU / ENGLISH LANGUAGE TOGGLE BUTTON */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100"
              title="Switch Language (English / اردو)"
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{isUr ? 'EN' : 'اردو'}</span>
            </button>

            <button
              type="button"
              onClick={handleQuickLogout}
              aria-label="Logout"
              title={isUr ? 'لاگ آؤٹ' : 'Logout'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="hidden border-t border-slate-100 bg-slate-50/70 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-1.5">
            {navItems.map((item) => {
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
                suggestedSerial={stats?.nextSerialNumber ?? (dbInfo?.totalBills ?? 0) + 1}
                defaultCommission={settings.default_commission}
                currencyCode={settings.currency_code}
                prefillCompany={prefillAdd.company}
                prefillReference={prefillAdd.refNo}
                recentBills={stats?.recentBills ?? []}
                togglingId={togglingId}
                onBillCreated={async (bill) => {
                  setPrefillAdd({ company: 'FESCO', refNo: '' });
                  await refreshData();
                  showToast(`Bill #${bill.serial_number} saved!`);
                }}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
              />
            )}

            {activeTab === 'bills' && (
              <AllBillsView
                currencyCode={settings.currency_code}
                months={months}
                refreshKey={refreshKey}
                initialSearch={billsSearchSeed}
                togglingId={togglingId}
                onAddClick={() => setActiveTab('add')}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
              />
            )}

            {activeTab === 'months' && (
              <MonthlyHistoryView
                months={months}
                currencyCode={settings.currency_code}
                settings={settings}
                refreshKey={refreshKey}
                togglingId={togglingId}
                onToggleStatus={handleToggleStatus}
                onEditBill={setEditingBill}
                onDeleteBill={setDeletingBill}
                onViewHistory={setHistoryBillId}
                onToast={showToast}
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

            {activeTab === 'admin' && isAdminUser && (
              <AdminDashboardView
                onToast={showToast}
                onAdminSelfPlanChanged={async () => {
                  const updated = await getUserProStatus(cloudUser.uid, currentUserPhone);
                  setProStatus(updated);
                }}
              />
            )}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xs lg:hidden">
        <div className={`grid py-1 ${isAdminUser ? 'grid-cols-7' : 'grid-cols-6'}`}>
          {navItems.map((item) => {
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

      {/* GO PRO (AD-FREE SUBSCRIPTION) WITH DIRECT SCREENSHOT UPLOAD */}
      {proModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                <h2 className="text-base font-extrabold">
                  {isUr ? 'پاک بل مینیجر — پرو (بغیر اشتہار)' : 'Pak Bill Manager — Pro (No Ads)'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setProModalOpen(false)}
                className="rounded-lg p-1 text-white/90 hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {proStatus.isPro ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-5 w-5" />
                  </div>
                  <h3 className="mt-2 text-sm font-extrabold text-emerald-950">
                    {isUr ? 'آپ کا پرو VIP ورژن فعال ہے!' : 'Aap Ka Pro VIP Version Active Hai!'}
                  </h3>
                  <p className="mt-1 text-xs text-emerald-800">
                    Plan: <strong>{proStatus.planType === 'yearly' ? 'Yearly Pro' : 'Monthly Pro'}</strong>{' '}
                    (100% Ad-Free)
                  </p>
                  {proStatus.expiresAt && (
                    <p className="mt-1 text-[11px] text-emerald-700">
                      Valid Till: {new Date(proStatus.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        {isUr
                          ? '100% اشتہارات ختم (کوئی بینر یا پوپ اپ ایڈ نہیں آئے گا)'
                          : '100% Ads Khatam (Koi Banner ya Popup Ad nahi aayega)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        {isUr
                          ? 'تیز ترین دکان کاؤنٹر تجربہ + VIP پرو بیج'
                          : 'Tez-tareen Shop Counter Experience + VIP Pro Badge'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        {isUr
                          ? '24/7 ترجیحی واٹس ایپ سپورٹ'
                          : '24/7 Priority WhatsApp Support'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('monthly')}
                      className={`rounded-2xl border-2 p-3 text-left transition ${
                        selectedPlan === 'monthly'
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-slate-500">
                        {isUr ? 'ماہانہ پلان' : 'Monthly Plan'}
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-900">Rs. 300</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {isUr ? '1 مہینہ بغیر اشتہار' : '1 Mahina Ad-Free'}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPlan('yearly')}
                      className={`relative rounded-2xl border-2 p-3 text-left transition ${
                        selectedPlan === 'yearly'
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span className="absolute -top-2.5 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-extrabold text-white">
                        Save Rs. 1,600
                      </span>
                      <div className="text-[11px] font-bold text-amber-800">
                        {isUr ? 'سالانہ بہترین پلان' : 'Yearly Best Value'}
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-900">Rs. 2,000</div>
                      <div className="text-[10px] font-semibold text-emerald-700">
                        {isUr ? 'پورا سال بغیر اشتہار' : 'Poora Saal Ad-Free'}
                      </div>
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                    <div className="font-extrabold text-slate-900">
                      {isUr
                        ? 'جاز کیش / ایزی پیسہ اکاؤنٹ تفصیلات:'
                        : 'JazzCash / Easypaisa Account Details:'}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-slate-600">
                        {isUr ? 'اکاؤنٹ نمبر:' : 'Account Number:'}
                      </span>
                      <span className="font-mono text-sm font-black text-blue-700">
                        {PAYMENT_NUMBER}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-slate-600">
                        {isUr ? 'اکاؤنٹ نام:' : 'Account Title:'}
                      </span>
                      <span className="font-bold text-slate-900">{PAYMENT_ACCOUNT_TITLE}</span>
                    </div>
                  </div>

                  {existingRequest && existingRequest.status === 'pending' && (
                    <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                      <div>
                        <strong>Aap ki Request Pending Hai!</strong> Aap ne{' '}
                        <strong>
                          {existingRequest.planType === 'yearly' ? 'Yearly (Rs. 2,000)' : 'Monthly (Rs. 300)'}
                        </strong>{' '}
                        ka screenshot upload kar diya hai — Admin jald verify karke Pro active kar dega.
                      </div>
                    </div>
                  )}

                  {/* DIRECT PAYMENT SCREENSHOT UPLOAD SECTION */}
                  <form
                    onSubmit={handleSubmitPaymentProof}
                    className="space-y-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-3.5"
                  >
                    <div className="text-xs font-extrabold text-emerald-950">
                      {isUr
                        ? 'ادائیگی کا اسکرین شاٹ اپ لوڈ کریں:'
                        : 'Payment Screenshot Upload Karein:'}
                    </div>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-emerald-300 bg-white p-3 text-center transition hover:bg-emerald-50">
                      {screenshotData ? (
                        <div className="space-y-1.5">
                          <img
                            src={screenshotData}
                            alt="Selected Screenshot"
                            className="mx-auto max-h-36 rounded-lg object-contain shadow-2xs"
                          />
                          <div className="text-[11px] font-bold text-emerald-700">
                            {isUr
                              ? 'اسکرین شاٹ منتخب ہو گیا (تبدیل کرنے کے لیے دبائیں)'
                              : 'Screenshot select ho gaya (Tabdeel karne ke liye tap karein)'}
                          </div>
                        </div>
                      ) : (
                        <>
                          <ImagePlus className="h-7 w-7 text-emerald-600" />
                          <span className="mt-1 text-xs font-extrabold text-slate-800">
                            {isUr
                              ? 'گیلری سے ادائیگی کا اسکرین شاٹ چنیں'
                              : 'Gallery se Payment Screenshot Chunein'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {isUr
                              ? 'جاز کیش / ایزی پیسہ رسید کی تصویر اپ لوڈ کریں'
                              : 'JazzCash / Easypaisa receipt ki tasveer upload karein'}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotFileChange}
                        className="hidden"
                      />
                    </label>

                    <div>
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        placeholder={
                          isUr
                            ? 'ٹرانزیکشن آئی ڈی / TID (اختیاری)'
                            : 'Transaction ID / TID (Optional)'
                        }
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-emerald-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingProof || !screenshotData}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      <span>
                        {uploadingProof
                          ? isUr
                            ? 'اپ لوڈ ہو رہا ہے...'
                            : 'Upload ho raha hai...'
                          : isUr
                          ? 'اسکرین شاٹ جمع کروائیں'
                          : 'Submit Payment Screenshot'}
                      </span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
