import React, { useEffect, useState } from 'react';
import { Database, Download, Info, Save, Settings as SettingsIcon } from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { api } from '../lib/api';
import { downloadJsonFile } from '../lib/format';
import type { AppSettings } from '../types/bill';

interface SettingsViewProps {
  settings: AppSettings;
  dbInfo: {
    dbFile: string;
    totalBills: number;
    totalHistoryEntries: number;
    dbSizeBytes: number;
  } | null;
  onSettingsSaved: (updated: AppSettings) => void;
  onOpenBackupTab: () => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  dbInfo,
  onSettingsSaved,
  onOpenBackupTab,
  onToast,
}) => {
  const [shopName, setShopName] = useState(settings.shop_name);
  const [ownerName, setOwnerName] = useState(settings.owner_name);
  const [currencyCode, setCurrencyCode] = useState(settings.currency_code);
  const [defaultCommission, setDefaultCommission] = useState(String(settings.default_commission));
  const [backupLocation, setBackupLocation] = useState(settings.backup_location_label);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setShopName(settings.shop_name);
    setOwnerName(settings.owner_name);
    setCurrencyCode(settings.currency_code);
    setDefaultCommission(String(settings.default_commission));
    setBackupLocation(settings.backup_location_label);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedComm = Number(defaultCommission);
    if (!Number.isFinite(parsedComm) || parsedComm < 0) {
      onToast('Default commission must be 0 or greater.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateSettings({
        shop_name: shopName.trim() || 'FESCO Bill Manager',
        owner_name: ownerName.trim() || 'Shop Counter',
        currency_code: currencyCode === 'Rs.' ? 'Rs.' : 'PKR',
        default_commission: parsedComm,
        backup_location_label: backupLocation.trim() || 'Device Downloads Folder',
      });
      onSettingsSaved(res.settings);
      onToast('Shop settings saved successfully.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickExport = async () => {
    try {
      const payload = await api.exportBackup('all');
      downloadJsonFile(payload, 'fesco-backup-full-database.json');
      onToast(`Exported all ${payload.bills.length} bills as JSON.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    }
  };

  const formattedSize = dbInfo
    ? dbInfo.dbSizeBytes >= 1024 * 1024
      ? `${(dbInfo.dbSizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(dbInfo.dbSizeBytes / 1024))} KB`
    : '—';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Settings Form */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Shop & Currency Settings</h2>
              <p className="text-xs text-slate-500">
                Configure shop branding for PDF reports, default commission, and currency format
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="set-shop" className="mb-1.5 block text-sm font-semibold text-slate-800">
                Shop / App Title
              </label>
              <input
                id="set-shop"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="set-owner" className="mb-1.5 block text-sm font-semibold text-slate-800">
                Shopkeeper / Counter Name
              </label>
              <input
                id="set-owner"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="set-currency" className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Currency Display
                </label>
                <select
                  id="set-currency"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="PKR">PKR (PKR 4,500)</option>
                  <option value="Rs.">Rs. (Rs. 4,500)</option>
                </select>
              </div>

              <div>
                <label htmlFor="set-comm" className="mb-1.5 block text-sm font-semibold text-slate-800">
                  Default Commission ({currencyCode})
                </label>
                <input
                  id="set-comm"
                  type="number"
                  min={0}
                  step="any"
                  value={defaultCommission}
                  onChange={(e) => setDefaultCommission(e.target.value)}
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm font-bold text-slate-900 tabular-nums outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-backup-loc" className="mb-1.5 block text-sm font-semibold text-slate-800">
                Backup Location Note
              </label>
              <input
                id="set-backup-loc"
                type="text"
                value={backupLocation}
                onChange={(e) => setBackupLocation(e.target.value)}
                placeholder="e.g. Device Downloads / Google Drive"
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">
                Browser and Android saves exported PDF and JSON files to your device Downloads folder.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Data Safety, Install App & Information */}
        <div className="space-y-4 lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2.5">
              <Database className="h-5 w-5 text-blue-700" />
              <h3 className="text-base font-bold text-slate-900">Data Management & Backup</h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              All records are persisted inside a local SQLite database with atomic transactions.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleQuickExport}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
              >
                <Download className="h-4 w-4" />
                <span>Export All Data (JSON)</span>
              </button>
              <button
                type="button"
                onClick={onOpenBackupTab}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <span>Open Restore & PDF Reports</span>
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold text-slate-900">Install on Android / Device</h3>
            <p className="mt-1 text-xs text-slate-500">
              Install FESCO Bill Manager on your Android home screen for full-screen shop use.
            </p>
            <div className="mt-3">
              <PWAInstallButton variant="card" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-700" />
              <h3 className="text-base font-bold text-slate-900">App Information</h3>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Application</dt>
                <dd className="font-semibold text-slate-900">FESCO Bill Manager</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Storage Engine</dt>
                <dd className="font-mono font-semibold text-slate-900">SQLite (WAL Mode)</dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Stored Bills</dt>
                <dd className="font-mono font-bold text-slate-900 tabular-nums">
                  {dbInfo?.totalBills ?? 0}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <dt className="text-slate-500">Audit History Entries</dt>
                <dd className="font-mono font-bold text-slate-900 tabular-nums">
                  {dbInfo?.totalHistoryEntries ?? 0}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Database Size</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formattedSize}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
};
