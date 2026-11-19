import React, { useState } from 'react';
import {
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Phone,
  RefreshCw,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import {
  emailToPhone,
  mapFirebaseAuthError,
  signInWithPhonePin,
  signUpWithPhonePin,
  logoutUser,
  type User,
} from '../lib/firebase';

interface CloudSyncModalProps {
  open: boolean;
  user: User | null;
  syncing: boolean;
  lastSyncedAt: string | null;
  defaultShopName: string;
  onClose: () => void;
  onAuthSuccess: (user: User, isNewAccount: boolean) => Promise<void>;
  onManualSync: () => Promise<void>;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export function CloudSyncModal({
  open,
  user,
  syncing,
  lastSyncedAt,
  defaultShopName,
  onClose,
  onAuthSuccess,
  onManualSync,
  onToast,
}: CloudSyncModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [shopName, setShopName] = useState(defaultShopName || '');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (mode === 'signup' && pin !== confirmPin) {
      setErrorMsg('Dono 6-hindso wale PIN ek jaise hone chahiye.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const newUser = await signUpWithPhonePin(phone, pin, shopName);
        await onAuthSuccess(newUser, true);
        onToast('Cloud Account ban gaya aur data backup ho gaya!');
      } else {
        const existingUser = await signInWithPhonePin(phone, pin);
        await onAuthSuccess(existingUser, false);
        onToast('Login kamyab! Cloud data sync ho gaya.');
      }
      setPin('');
      setConfirmPin('');
      onClose();
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logoutUser();
      onToast('Cloud account se logout ho gaye hain.');
      onClose();
    } catch {
      onToast('Logout mein masla aaya.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-blue-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold leading-tight">Cloud Backup & Sync</h2>
              <p className="text-xs text-blue-100">Mobile Number + 6-Digit PIN</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {user ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2.5 text-emerald-800">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Cloud Sync Active
                    </div>
                    <div className="font-mono text-base font-extrabold text-slate-900">
                      {emailToPhone(user.email)}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-emerald-800">
                  Aap ke saare bills aur commission records khud-ba-khud cloud par mehfooz ho rahe hain.
                </p>
                {lastSyncedAt && (
                  <div className="mt-2 text-[11px] font-medium text-emerald-700">
                    Last Synced: {lastSyncedAt}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    await onManualSync();
                    onToast('Cloud backup update ho gaya!');
                  }}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLogout}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode Switch Tabs */}
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMsg('');
                  }}
                  className={`h-9 rounded-lg text-xs font-extrabold transition ${
                    mode === 'signin'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In (Login)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMsg('');
                  }}
                  className={`h-9 rounded-lg text-xs font-extrabold transition ${
                    mode === 'signup'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Shop / Counter Name (Optional)
                    </label>
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="Maslan: Zahid Mobiles and Photo State"
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Mobile Number (11 Hindse)
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      inputMode="tel"
                      maxLength={11}
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="03001234567"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 font-mono text-base font-bold tracking-wider text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    6-Digit Secret PIN
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((s) => !s)}
                      aria-label="Toggle PIN visibility"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Confirm 6-Digit PIN
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 font-mono text-base font-bold tracking-widest text-slate-900 outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                    <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-extrabold text-white shadow-xs transition hover:bg-blue-800 disabled:opacity-60"
                >
                  <Cloud className="h-4 w-4" />
                  <span>
                    {busy
                      ? 'Please wait...'
                      : mode === 'signup'
                      ? 'Create Account & Backup Data'
                      : 'Sign In & Sync Data'}
                  </span>
                </button>
              </form>

              <p className="text-center text-[11px] text-slate-500">
                Bina email ke sirf apne mobile number aur 6-hindso ke PIN se apna hisab mehfooz rakhein.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
