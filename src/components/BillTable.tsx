import React from 'react';
import { CheckCircle2, Clock, Edit3, History, Trash2 } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { Bill, PaymentStatus } from '../types/bill';
import { BillCard } from './BillRowCard';

interface BillTableProps {
  bills: Bill[];
  currencyCode: string;
  togglingId: number | null;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

export const BillCollection: React.FC<BillTableProps> = ({
  bills,
  currencyCode,
  togglingId,
  onToggleStatus,
  onEdit,
  onDelete,
  onViewHistory,
  emptyTitle = 'No bill records found',
  emptyDescription = 'Add a new FESCO bill or adjust your search and filters.',
  emptyAction,
}) => {
  if (bills.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-base font-bold text-slate-900">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{emptyDescription}</p>
        {emptyAction && <div className="mt-5">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <>
      {/* Mobile & Tablet Card Stack */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
        {bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            currencyCode={currencyCode}
            togglingId={togglingId}
            onToggleStatus={onToggleStatus}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewHistory={onViewHistory}
          />
        ))}
      </div>

      {/* Desktop High-Density Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3.5">Serial #</th>
                <th className="px-4 py-3.5">FESCO Reference #</th>
                <th className="px-4 py-3.5 text-right">Bill Amount</th>
                <th className="px-4 py-3.5 text-right">Commission</th>
                <th className="px-4 py-3.5">Payment Status</th>
                <th className="px-4 py-3.5">Added Date & Time</th>
                <th className="px-4 py-3.5">Payment Date & Time</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {bills.map((bill) => {
                const isPaid = bill.status === 'PAID';
                const busy = togglingId === bill.id;
                return (
                  <tr key={bill.id} className="transition hover:bg-blue-50/35">
                    <td className="px-4 py-3 font-mono font-bold text-blue-700 tabular-nums whitespace-nowrap">
                      #{bill.serial_number}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {bill.reference_number}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatCurrency(bill.bill_amount, currencyCode)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                        isPaid ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {formatCurrency(bill.commission, currencyCode)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onToggleStatus(bill, isPaid ? 'UNPAID' : 'PAID')}
                        title={isPaid ? 'Click to mark Unpaid' : 'Click to mark Paid'}
                        className={`inline-flex min-h-[38px] min-w-[96px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-[0.98] disabled:opacity-60 ${
                          isPaid
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        {isPaid ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Paid</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            <span>Unpaid</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateTime(bill.added_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {bill.paid_at ? (
                        <span className="font-medium text-emerald-700">
                          {formatDateTime(bill.paid_at)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onViewHistory(bill.id)}
                          title="View bill history"
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <History className="h-3.5 w-3.5" />
                          <span>History</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(bill)}
                          title="Edit bill"
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(bill)}
                          title="Delete bill"
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
