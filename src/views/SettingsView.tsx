import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Phone,
  Save,
  ShieldCheck,
  Store,
  User as UserIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  emailToPhone,
  mapFirebaseAuthError,
  updateUserMobileAndPin,
  type User,
} from '../lib/firebase';
import type { AppSettings } from '../types/bill';

interface SettingsViewProps {
  settings: AppSettings;
  user?: User | null;
  dbInfo?: {
    dbFile: string;
    totalBills: number;
    totalHistoryEntries: number;
    dbSizeBytes: number;
  } | null;
  onSaved: () => Promise<void>;
  onUserUpdated?: (updatedUser: User) => void;
  onLogout?: () => Promise<void>;
  onError: (msg: string) => void;
}

export function SettingsView({
  settings,
  user,
  dbInfo,
  onSaved,
  onUserUpdated,
  onLogout,
  onError,
}: SettingsViewProps) {
  const currentRegisteredPhone = emailToPhone(user?.email, user?.phoneNumber);

  // Shop / Profile Details State
  const [shopName, setShopName] = useState(settings.shop_name || '');
  const [ownerName, setOwnerName] = useState(settings.owner_name || '');
  const [defaultCommission, setDefaultCommission] = useState(
    String(settings.default_commission ?? 30)
  );
  const [profileSaving, setProfileSaving] = useState(false);

  // Mobile Number & PIN Change State
  const [newPhone, setNewPhone] = useState(currentRegisteredPhone);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityMsg, setSecurityMsg] = useState('');

  useEffect(() => {
    setShopName(settings.shop_name || '');
    setOwnerName(settings.owner_name || '');
    setDefaultCommission(String(settings.default_commission ?? 30));
  }, [settings]);

  useEffect(() => {
    setNewPhone(currentRegisteredPhone);
  }, [currentRegisteredPhone]);

  const handleSaveShopProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) {
      onError('Shop / App ka naam likhna zaroori hai.');
      return;
    }

    setProfileSaving(true);
    try {
      await api.updateSettings({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim() || 'Shop Counter',
        default_commission: Math.max(0, Number(defaultCommission) || 0),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Profile save nahi ho saki.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityMsg('');

    if (newPin && newPin !== confirmNewPin) {
      onError('Dono naye 6-hindso wale PIN ek jaise hone chahiye.');
      return;
    }

    setSecuritySaving(true);
    try {
      const updatedUser = await updateUserMobileAndPin({
        currentPin,
        newPhone,
        newPin: newPin || undefined,
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setSecurityMsg('Aap ka Mobile Number / PIN kamyabi se tabdeel ho gaya hai!');
      if (onUserUpdated) {
        onUserUpdated(updatedUser);
      }
      await onSaved();
    } catch (err) {
      onError(mapFirebaseAuthError(err));
    } finally {
      setSecuritySaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Top Profile Header Card */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-5 py-6 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white shadow-inner">
              <UserIcon className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Verified Cloud Account</span>
              </div>
              <h2 className="mt-1 truncate text-xl font-extrabold tracking-tight">
                {settings.shop_name || 'Pak Bill Manager'}
              </h2>
              <p className="mt-0.5 font-mono text-sm font-bold text-blue-100">
                {currentRegisteredPhone || 'Mobile Account'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-center">
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Shopkeeper / Owner</div>
            <div className="mt-0.5 truncate text-xs font-extrabold text-slate-900">
              {settings.owner_name || 'Shop Counter'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Saved Cloud Bills</div>
            <div className="mt-0.5 text-xs font-extrabold text-blue-700">
              {dbInfo?.totalBills ?? 0} Bills Mehfooz
            </div>
          </div>
        </div>
      </div>

      {/* Card 1: Change Mobile Number & 6-Digit PIN */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Mobile Number & PIN Tabdeel Karein
            </h3>
            <p className="text-xs text-slate-500">
              Apna login mobile number ya 6-hindso wala secret PIN khud update karein
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdateCredentials} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Login Mobile Number (11 Hindse)
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                inputMode="tel"
                maxLength={11}
                required
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="03001234567"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Mojooda (Current) 6-Digit PIN *
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPins ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                required
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Purana 6-digit PIN likhein"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 font-mono text-sm font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPins((s) => !s)}
                aria-label="Toggle PIN visibility"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
              >
                {showPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Naya 6-Digit PIN (Optional)
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPins ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Confirm Naya PIN
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPins ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {securityMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{securityMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={securitySaving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white shadow-xs transition hover:bg-blue-800 disabled:opacity-60"
          >
            <Cloud className="h-4 w-4" />
            <span>
              {securitySaving ? 'Update ho raha hai...' : 'Update Mobile Number / PIN'}
            </span>
          </button>
        </form>
      </div>

      {/* Card 2: Shop & Receipt Profile Details */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Shop & Receipt Profile</h3>
            <p className="text-xs text-slate-500">
              Yeh naam aap ki app aur PDF reports par nazar aayega
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveShopProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Shop / Counter Name
            </label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Maslan: Zahid Mobiles and Photo State"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Shopkeeper / Owner Name
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Zahid Nawaz"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Default Commission (PKR)
              </label>
              <input
                type="number"
                min={0}
                value={defaultCommission}
                onChange={(e) => setDefaultCommission(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={profileSaving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{profileSaving ? 'Saving...' : 'Save Shop Profile'}</span>
          </button>
        </form>
      </div>

      {/* Logout Button */}
      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-extrabold text-red-700 transition hover:bg-red-100"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout from Account</span>
        </button>
      )}
    </div>
  );
}
