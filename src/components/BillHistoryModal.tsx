import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Edit3, History, PlusCircle, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDateTime } from '../lib/format';
import type { Bill, BillHistoryEntry, HistoryAction } from '../types/bill';

interface BillHistoryModalProps {
  billId: number | null;
  currencyCode: string;
  onClose: () => void;
}

const ACTION_META: Record<
  HistoryAction,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  CREATED: { label: 'Bill Added', icon: PlusCircle, tone: 'bg-blue-50 text-blue-700' },
  MARKED_PAID: { label: 'Marked Paid', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
  MARKED_UNPAID: { label: 'Reversed to Unpaid', icon: Clock, tone: 'bg-amber-50 text-amber-700' },
  EDITED: { label: 'Bill Edited', icon: Edit3, tone: 'bg-slate-100 text-slate-700' },
  DELETED: { label: 'Bill Deleted', icon: Trash2, tone: 'bg-red-50 text-red-700' },
};

export const BillHistoryModal: React.FC<BillHistoryModalProps> = ({
  billId,
  currencyCode,
  onClose,
}) => {
  const [bill, setBill] = useState<Bill | null>(null);
  const [history, setHistory] = useState<BillHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!billId) {
      setBill(null);
      setHistory([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getBillHistory(billId)
      .then((res) => {
        if (!cancelled) {
          setBill(res.bill);
          setHistory(res.history);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load bill history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billId]);

  if (!billId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Complete Bill History</h3>
              {bill && (
                <p className="text-xs text-slate-500">
                  Serial #{bill.serial_number} · Ref {bill.reference_number}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <>
              {bill && (
                <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-slate-500">Bill Amount</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {formatCurrency(bill.bill_amount, currencyCode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Commission</div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-blue-700 tabular-nums">
                      {formatCurrency(bill.commission, currencyCode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Added Date & Time</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-800">
                      {formatDateTime(bill.added_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Payment Date & Time</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-800">
                      {bill.paid_at ? formatDateTime(bill.paid_at) : 'Not paid yet'}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {history.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No history records found for this bill.
                  </p>
                ) : (
                  history.map((entry) => {
                    const meta = ACTION_META[entry.action] ?? ACTION_META.EDITED;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {meta.label}
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {formatDateTime(entry.created_at)}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">
                              {entry.note}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500 tabular-nums">
                            {entry.previous_status && entry.new_status && (
                              <span>
                                Status: {entry.previous_status === 'PAID' ? 'Paid' : 'Unpaid'} →{' '}
                                <strong className="text-slate-800">
                                  {entry.new_status === 'PAID' ? 'Paid' : 'Unpaid'}
                                </strong>
                              </span>
                            )}
                            {entry.commission_delta !== 0 && (
                              <span
                                className={`font-semibold ${
                                  entry.commission_delta > 0 ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                Earned Commission:{' '}
                                {entry.commission_delta > 0 ? '+' : ''}
                                {formatCurrency(entry.commission_delta, currencyCode)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
