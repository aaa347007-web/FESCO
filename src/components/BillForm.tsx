import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Hash, RotateCcw, Save } from 'lucide-react';
import { api } from '../lib/api';
import type { Bill, PaymentStatus } from '../types/bill';

interface BillFormProps {
  mode: 'create' | 'edit';
  initialBill?: Bill | null;
  suggestedSerial: number;
  defaultCommission: number;
  currencyCode: string;
  onSuccess: (bill: Bill) => void;
  onCancel?: () => void;
}

export const BillForm: React.FC<BillFormProps> = ({
  mode,
  initialBill,
  suggestedSerial,
  defaultCommission,
  currencyCode,
  onSuccess,
  onCancel,
}) => {
  const [serialNumber, setSerialNumber] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.serial_number) : String(suggestedSerial)
  );
  const [referenceNumber, setReferenceNumber] = useState<string>(
    mode === 'edit' && initialBill ? initialBill.reference_number : ''
  );
  const [billAmount, setBillAmount] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.bill_amount) : ''
  );
  const [commission, setCommission] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.commission) : String(defaultCommission)
  );
  const [status, setStatus] = useState<PaymentStatus>(
    mode === 'edit' && initialBill ? initialBill.status : 'UNPAID'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'create') {
      setSerialNumber(String(suggestedSerial));
    }
  }, [suggestedSerial, mode]);

  useEffect(() => {
    if (mode === 'create' && !billAmount) {
      setCommission(String(defaultCommission));
    }
  }, [defaultCommission, mode, billAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedSerial = Number(serialNumber);
    const cleanedRef = referenceNumber.trim().replace(/\s+/g, '');
    const parsedAmount = Number(billAmount);
    const parsedCommission = Number(commission);

    if (!Number.isInteger(parsedSerial) || parsedSerial <= 0) {
      setError('Bill Serial Number must be a positive whole number.');
      return;
    }
    if (!cleanedRef) {
      setError('Please enter the FESCO Reference Number.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid Bill Amount greater than 0.');
      return;
    }
    if (!Number.isFinite(parsedCommission) || parsedCommission < 0) {
      setError('Commission must be 0 or greater.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const res = await api.createBill({
          serial_number: parsedSerial,
          reference_number: cleanedRef,
          bill_amount: parsedAmount,
          commission: parsedCommission,
          status,
        });
        setReferenceNumber('');
        setBillAmount('');
        setCommission(String(defaultCommission));
        setStatus('UNPAID');
        onSuccess(res.bill);
      } else if (initialBill) {
        const res = await api.updateBill(initialBill.id, {
          serial_number: parsedSerial,
          reference_number: cleanedRef,
          bill_amount: parsedAmount,
          commission: parsedCommission,
          status,
        });
        onSuccess(res.bill);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save bill.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickCommissions = [20, 30, 50, 100];

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="bill-serial"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Bill Serial Number
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="bill-serial"
                type="number"
                min={1}
                step={1}
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                required
                className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 font-mono text-sm font-semibold text-slate-900 tabular-nums outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
            {mode === 'create' && (
              <button
                type="button"
                onClick={() => setSerialNumber(String(suggestedSerial))}
                title="Reset to next automatic serial number"
                className="inline-flex min-h-[46px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Auto #{suggestedSerial}</span>
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Auto-generated sequentially; editable by admin.
          </p>
        </div>

        <div>
          <label
            htmlFor="bill-ref"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            FESCO Reference Number
          </label>
          <input
            id="bill-ref"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 12131415161718"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            required
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm font-semibold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
          <p className="mt-1 text-xs text-slate-500">
            Must be unique across records; searchable anytime.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="bill-amount"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Bill Amount ({currencyCode})
          </label>
          <input
            id="bill-amount"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={billAmount}
            onChange={(e) => setBillAmount(e.target.value)}
            required
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-base font-bold text-slate-900 tabular-nums placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <div>
          <label
            htmlFor="bill-commission"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Commission ({currencyCode})
          </label>
          <input
            id="bill-commission"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            required
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-base font-bold text-blue-700 tabular-nums placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {quickCommissions.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setCommission(String(val))}
                className={`min-h-[32px] rounded-lg border px-2.5 text-xs font-semibold tabular-nums transition ${
                  Number(commission) === val
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {currencyCode} {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-slate-800">Payment Status</span>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
          <button
            type="button"
            onClick={() => setStatus('PAID')}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
              status === 'PAID'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Paid</span>
          </button>
          <button
            type="button"
            onClick={() => setStatus('UNPAID')}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
              status === 'UNPAID'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Unpaid</span>
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {status === 'PAID'
            ? 'Commission will be added immediately to Total Earned Commission.'
            : 'Commission remains pending until this bill is marked Paid.'}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-[46px] rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.99] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          <span>
            {submitting
              ? 'Saving...'
              : mode === 'create'
                ? 'Save Bill Record'
                : 'Update Bill Record'}
          </span>
        </button>
      </div>
    </form>
  );
};
