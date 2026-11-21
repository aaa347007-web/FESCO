import React from 'react';
import { Calendar, CheckCircle2, Clock, Edit3, History, Phone, Trash2, User } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { Bill, PaymentAccount, PaymentStatus } from '../types/bill';

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function getAccountBadge(acc?: PaymentAccount): { label: string; className: string } {
  switch (acc) {
    case 'EASYPAISA':
      return { label: 'Easypaisa', className: 'bg-emerald-100 text-emerald-800' };
    case 'JAZZCASH':
      return { label: 'JazzCash', className: 'bg-red-100 text-red-800' };
    case 'BANK':
      return { label: 'Bank / Raast', className: 'bg-blue-100 text-blue-800' };
    default:
      return { label: 'Cash', className: 'bg-slate-100 text-slate-700' };
  }
}

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
  const todayIso = getTodayIso();
  const isOverdue = !isPaid && Boolean(bill.due_date && bill.due_date < todayIso);
  const isDueToday = !isPaid && bill.due_date === todayIso;
  const accBadge = getAccountBadge(bill.payment_account);

  const received = isPaid ? bill.bill_amount : Math.max(0, Number(bill.received_amount || 0));
  const remaining = isPaid ? 0 : Math.max(0, bill.bill_amount - received);
  const isPartialUdhar = !isPaid && received > 0 && remaining > 0;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 transition ${
        isOverdue
          ? 'border-red-300 bg-red-50/20'
          : isPartialUdhar
            ? 'border-orange-300 bg-orange-50/20'
            : isDueToday
              ? 'border-amber-300 bg-amber-50/20'
              : 'border-slate-200 hover:border-blue-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono font-bold text-blue-700">#{bill.serial_number}</span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${accBadge.className}`}>
              {accBadge.label}
            </span>
            <span>{formatDateTime(bill.added_at)}</span>
          </div>
          <div className="mt-1 font-mono text-base font-bold tracking-tight text-slate-900 break-all">
            {bill.reference_number}
          </div>

          {(bill.customer_name || bill.customer_phone || bill.due_date) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-700">
              {bill.due_date && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                    isOverdue
                      ? 'bg-red-100 text-red-800'
                      : isDueToday
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  <span>
                    {isOverdue
                      ? `Overdue: ${bill.due_date}`
                      : isDueToday
                        ? 'Due Today'
                        : `Due: ${bill.due_date}`}
                  </span>
                </span>
              )}
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
              : isPartialUdhar
                ? 'border border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100'
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
              <span>{isPartialUdhar ? 'Clear Udhar' : 'Unpaid'}</span>
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

      {isPartialUdhar && (
        <div className="mt-2.5 flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/80 px-3 py-2 text-xs font-bold">
          <span className="text-emerald-800">
            Jama: {formatCurrency(received, currencyCode)}
          </span>
          <span className="text-red-700">
            Udhar Baqaya: {formatCurrency(remaining, currencyCode)}
          </span>
        </div>
      )}

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
