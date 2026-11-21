import React from 'react';
import { CheckCircle2, Clock, Edit3, History, Phone, Trash2, User } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { Bill, PaymentStatus } from '../types/bill';

interface BillListItemProps {
  bill: Bill;
  currencyCode: string;
  togglingId: number | null;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
}

export const BillCard: React.FC<BillListItemProps> = ({
  bill,
  currencyCode,
  togglingId,
  onToggleStatus,
  onEdit,
  onDelete,
  onViewHistory,
}) => {
  const isPaid = bill.status === 'PAID';
  const busy = togglingId === bill.id;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-bold text-blue-700">#{bill.serial_number}</span>
            <span aria-hidden="true">·</span>
            <span>Added {formatDateTime(bill.added_at)}</span>
          </div>
          <div className="mt-1 font-mono text-base font-bold tracking-tight text-slate-900 break-all">
            {bill.reference_number}
          </div>

          {(bill.customer_name || bill.customer_phone) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-700">
              {bill.customer_name && (
                <span className="inline-flex items-center gap-1 text-slate-800">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                  <span>{bill.customer_name}</span>
                </span>
              )}
              {bill.customer_phone && (
                <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                  <Phone className="h-3 w-3 text-emerald-600" />
                  <span>{bill.customer_phone}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleStatus(bill, isPaid ? 'UNPAID' : 'PAID')}
          title={isPaid ? 'Tap to mark Unpaid' : 'Tap to mark Paid'}
          className={`inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] disabled:opacity-60 ${
            isPaid
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          {isPaid ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Paid</span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4" />
              <span>Unpaid</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
        <div>
          <div className="text-xs text-slate-500">Bill Amount</div>
          <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
            {formatCurrency(bill.bill_amount, currencyCode)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Commission</div>
          <div
            className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
              isPaid ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {formatCurrency(bill.commission, currencyCode)}
          </div>
        </div>
      </div>

      {isPaid && bill.paid_at && (
        <div className="mt-2 text-xs text-emerald-700">
          Paid on {formatDateTime(bill.paid_at)}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <button
          type="button"
          onClick={() => onViewHistory(bill.id)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <History className="h-3.5 w-3.5" />
          <span>History</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(bill)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(bill)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
