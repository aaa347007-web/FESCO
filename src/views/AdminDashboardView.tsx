import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  MessageSquareCode,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react';
import {
  adminFetchAllUsers,
  adminFetchPendingRequests,
  adminResetUserPin,
  adminResolveProRequest,
  adminSetUserProPlan,
  type AdminUserRecord,
  type ProPaymentRequest,
} from '../lib/firebase';

interface AdminDashboardViewProps {
  onToast: (message: string, tone?: 'success' | 'error') => void;
  onAdminSelfPlanChanged?: () => void;
}

export function AdminDashboardView({
  onToast,
  onAdminSelfPlanChanged,
}: AdminDashboardViewProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ProPaymentRequest[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pro' | 'free'>('all');
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  // Quick Manual Activation / PIN Reset states
  const [manualPhone, setManualPhone] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinResetPhone, setPinResetPhone] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [list, reqs] = await Promise.all([
        adminFetchAllUsers(),
        adminFetchPendingRequests(),
      ]);
      setUsers(list);
      setPendingRequests(reqs);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : 'Data load karne mein masla aaya. Firestore Rules check karein.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const stats = useMemo(() => {
    const total = users.length;
    const proCount = users.filter((u) => u.isPro).length;
    const yearlyCount = users.filter((u) => u.isPro && u.planType === 'yearly').length;
    const monthlyCount = users.filter((u) => u.isPro && u.planType === 'monthly').length;
    return {
      total,
      proCount,
      freeCount: total - proCount,
      estimatedRevenue: yearlyCount * 2000 + monthlyCount * 300,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'pro' && !u.isPro) return false;
      if (filter === 'free' && u.isPro) return false;
      if (!q) return true;
      return (
        u.phone.includes(q) ||
        u.shopName.toLowerCase().includes(q) ||
        u.ownerName.toLowerCase().includes(q)
      );
    });
  }, [users, search, filter]);

  const handleRequestAction = async (
    req: ProPaymentRequest,
    decision: 'approve' | 'reject'
  ) => {
    setBusyPhone(req.phone);
    try {
      const msg = await adminResolveProRequest(req, decision);
      onToast(msg);
      await loadUsers();
      if (req.phone === '03417208670' && onAdminSelfPlanChanged) {
        onAdminSelfPlanChanged();
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Request process nahi ho saki.', 'error');
    } finally {
      setBusyPhone(null);
    }
  };

  const handlePlanUpdate = async (
    targetPhone: string,
    planType: 'monthly' | 'yearly' | 'free'
  ) => {
    setBusyPhone(targetPhone);
    try {
      const msg = await adminSetUserProPlan(targetPhone, planType);
      onToast(msg);
      await loadUsers();
      if (targetPhone === '03417208670' && onAdminSelfPlanChanged) {
        onAdminSelfPlanChanged();
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Plan update nahi ho saka.', 'error');
    } finally {
      setBusyPhone(null);
    }
  };

  const handleManualActivate = async (planType: 'monthly' | 'yearly' | 'free') => {
    const digits = manualPhone.replace(/\D/g, '');
    if (digits.length !== 11) {
      onToast('Sahi 11-hindso wala mobile number likhein.', 'error');
      return;
    }
    await handlePlanUpdate(digits, planType);
    setManualPhone('');
  };

  const handleSaveNewPin = async (targetPhone: string) => {
    const cleanPin = newPinInput.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      onToast('Naya PIN 6 hindso ka hona chahiye.', 'error');
      return;
    }
    setBusyPhone(targetPhone);
    try {
      const msg = await adminResetUserPin(targetPhone, cleanPin);
      onToast(msg);
      setPinResetPhone(null);
      setNewPinInput('');
      await loadUsers();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PIN update mein masla aaya.', 'error');
    } finally {
      setBusyPhone(null);
    }
  };

  const openUserWhatsApp = (u: AdminUserRecord) => {
    const msg = encodeURIComponent(
      `Assalam-o-Alaikum${u.shopName ? ` (${u.shopName})` : ''}!\n\nMain *Pak Bill Manager* Admin (Zahid Nawaz) baat kar raha hoon. Aap ko app istemal karne mein koi madad chahiye to zaroor batayein.`
    );
    window.open(`https://wa.me/92${u.phone.slice(1)}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Super Admin Dashboard — Zahid Nawaz
            </h2>
            <p className="text-xs text-slate-300">
              Payment Screenshots Approve karein, Users dekhein, aur Support dein
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          disabled={loading}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-xs font-extrabold text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* PENDING PAYMENT SCREENSHOTS SECTION */}
      {pendingRequests.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-400 bg-amber-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black text-amber-950">
            <Clock className="h-5 w-5 text-amber-600" />
            <span>
              Nayi Payment Requests ({pendingRequests.length}) — Screenshot Check Karke Approve Karein
            </span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pendingRequests.map((req) => {
              const isBusy = busyPhone === req.phone;
              return (
                <div
                  key={req.id}
                  className="flex flex-col justify-between rounded-2xl border border-amber-300 bg-white p-4 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-extrabold text-slate-900">{req.shopName}</div>
                      <div className="font-mono text-xs font-bold text-blue-700">{req.phone}</div>
                      <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-900">
                        {req.planType === 'yearly'
                          ? 'Yearly Pro — Rs. 2,000'
                          : 'Monthly Pro — Rs. 300'}
                      </div>
                      {req.transactionId && (
                        <div className="text-[11px] font-semibold text-slate-600">
                          TID: <span className="font-mono font-bold">{req.transactionId}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {new Date(req.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPreviewImage(req.screenshotBase64)}
                      className="group relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-100"
                      title="Full Screenshot Dekhein"
                    >
                      <img
                        src={req.screenshotBase64}
                        alt="Payment Proof"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-[9px] font-bold text-white">
                        Zoom
                      </span>
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRequestAction(req, 'approve')}
                      className="flex h-9 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      <span>Approve & Activate</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRequestAction(req, 'reject')}
                      className="flex h-9 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Users className="h-4 w-4 text-blue-700" />
            <span>Total Users</span>
          </div>
          <div className="mt-1.5 text-2xl font-black text-slate-900">{stats.total}</div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
            <Crown className="h-4 w-4 text-amber-600" />
            <span>Pro VIP Users</span>
          </div>
          <div className="mt-1.5 text-2xl font-black text-amber-950">{stats.proCount}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-slate-500" />
            <span>Free Users</span>
          </div>
          <div className="mt-1.5 text-2xl font-black text-slate-900">{stats.freeCount}</div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs">
          <div className="text-xs font-bold text-emerald-800">Active Pro Value</div>
          <div className="mt-1.5 text-2xl font-black text-emerald-950">
            Rs. {stats.estimatedRevenue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Quick Direct Activation Box */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
        <div className="text-xs font-extrabold text-blue-950">
          Direct Number Se Pro Activate Karein (11 Hindse):
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            type="tel"
            maxLength={11}
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="03001234567"
            className="h-10 w-44 rounded-xl border border-blue-300 bg-white px-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
          />
          <button
            type="button"
            disabled={busyPhone !== null}
            onClick={() => handleManualActivate('monthly')}
            className="h-10 rounded-xl bg-blue-700 px-3.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            + 1 Month Pro (Rs. 300)
          </button>
          <button
            type="button"
            disabled={busyPhone !== null}
            onClick={() => handleManualActivate('yearly')}
            className="h-10 rounded-xl bg-emerald-600 px-3.5 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            + 1 Year Pro (Rs. 2,000)
          </button>
          <button
            type="button"
            disabled={busyPhone !== null}
            onClick={() => handleManualActivate('free')}
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Set Free
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mobile number ya shop name search karein..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl bg-slate-200/70 p-1">
          {(['all', 'pro', 'free'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold capitalize transition ${
                filter === tab
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'all'
                ? `All (${stats.total})`
                : tab === 'pro'
                ? `Pro (${stats.proCount})`
                : `Free (${stats.freeCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="flex min-h-[25vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs font-semibold text-slate-500">
          Koi user nahi mila.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredUsers.map((u) => {
            const isBusy = busyPhone === u.phone;
            return (
              <div
                key={u.phone}
                className={`rounded-2xl border bg-white p-4 shadow-2xs transition ${
                  u.isPro ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-blue-700" />
                      <span className="text-sm font-extrabold text-slate-900">
                        {u.shopName || 'Unnamed Shop'}
                      </span>
                      {u.isPro ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                          <Crown className="h-3 w-3 text-amber-600" />
                          {u.planType === 'yearly' ? 'YEARLY PRO' : 'MONTHLY PRO'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          FREE
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-800">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {u.phone}
                      </span>
                      <span>
                        Bills: <strong>{u.totalBills}</strong>
                      </span>
                      {u.customPin && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                          PIN: {u.customPin}
                        </span>
                      )}
                    </div>

                    {u.isPro && u.proExpiresAt && (
                      <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                        Expiry: {new Date(u.proExpiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openUserWhatsApp(u)}
                    title="WhatsApp Customer"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                  >
                    <MessageSquareCode className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handlePlanUpdate(u.phone, 'monthly')}
                    className="h-8 rounded-lg bg-blue-700 px-2.5 text-[11px] font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    1 Month Pro
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handlePlanUpdate(u.phone, 'yearly')}
                    className="h-8 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    1 Year Pro
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handlePlanUpdate(u.phone, 'free')}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Set Free
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPinResetPhone(pinResetPhone === u.phone ? null : u.phone);
                      setNewPinInput('');
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11px] font-extrabold text-amber-900 hover:bg-amber-100"
                  >
                    <KeyRound className="h-3 w-3" />
                    <span>Reset PIN</span>
                  </button>
                </div>

                {pinResetPhone === u.phone && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPinInput}
                      onChange={(e) =>
                        setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Naya 6-Digit PIN"
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-bold tracking-widest outline-none focus:border-blue-600"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSaveNewPin(u.phone)}
                      className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Save PIN
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Screen Screenshot Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <div className="relative max-h-[90vh] max-w-md overflow-hidden rounded-2xl bg-white p-2">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 rounded-full bg-black/70 p-1.5 text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewImage}
              alt="Full Payment Proof"
              className="max-h-[82vh] w-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
