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
  Plus,
  PlusCircle,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Store,
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
