import React, { useState } from 'react';
import { CheckCircle2, PlusCircle } from 'lucide-react';
import { BillForm } from '../components/BillForm';
import { BillCollection } from '../components/BillTable';
import { formatCurrency } from '../lib/format';
import type { Bill, PaymentStatus } from '../types/bill';

interface AddBillViewProps {
  suggestedSerial: number;
  defaultCommission: number;
  currencyCode: string;
  recentBills: Bill[];
  togglingId: number | null;
  onBillCreated: (bill: Bill) => void;
  onToggleStatus: (bill: Bill, nextStatus: PaymentStatus) => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (bill: Bill) => void;
  onViewHistory: (billId: number) => void;
}

export const AddBillView: React.FC<AddBillViewProps> = ({
  suggestedSerial,
  defaultCommission,
  currencyCode,
  recentBills,
  togglingId,
  onBillCreated,
  onToggleStatus,
  onEditBill,
  onDeleteBill,
  onViewHistory,
}) => {
  const [lastAdded, setLastAdded] = useState<Bill | null>(null);

  const handleSuccess = (bill: Bill) => {
    setLastAdded(bill);
    onBillCreated(bill);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Form Card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7">
          <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Add New FESCO Bill</h2>
              <p className="text-xs text-slate-500">
                Duplicate reference numbers are automatically blocked
              </p>
            </div>
          </div>

          {lastAdded && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-bold">
                  Saved Bill #{lastAdded.serial_number} ({lastAdded.reference_number})
                </div>
                <div className="mt-0.5 text-xs text-emerald-800 tabular-nums">
                  Amount: {formatCurrency(lastAdded.bill_amount, currencyCode)} · Commission:{' '}
                  {formatCurrency(lastAdded.commission, currencyCode)} · Status:{' '}
                  {lastAdded.status === 'PAID' ? 'Paid' : 'Unpaid'}
                </div>
              </div>
            </div>
          )}

          <BillForm
            mode="create"
            suggestedSerial={suggestedSerial}
            defaultCommission={defaultCommission}
            currencyCode={currencyCode}
            onSuccess={handleSuccess}
          />
        </section>

        {/* Quick Reference Panel */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <h3 className="text-base font-bold text-slate-900">Commission & Entry Rules</h3>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-700" />
              <span>
                <strong>Automatic Serials:</strong> Next bill defaults to{' '}
                <span className="font-mono font-bold text-blue-700">#{suggestedSerial}</span>, and
                can be edited anytime.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-700" />
              <span>
                <strong>Duplicate Protection:</strong> If a FESCO Reference Number already exists in
                any month, the system prevents accidental duplicate entry.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-700" />
              <span>
                <strong>Accurate Commission:</strong> Earned commission updates inside a database
                transaction only when a bill is Paid, and reverses cleanly if changed back to Unpaid.
              </span>
            </li>
          </ul>
        </aside>
      </div>

      {/* Latest Added Bills */}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">Latest Bills Added</h3>
        <BillCollection
          bills={recentBills.slice(0, 6)}
          currencyCode={currencyCode}
          togglingId={togglingId}
          onToggleStatus={onToggleStatus}
          onEdit={onEditBill}
          onDelete={onDeleteBill}
          onViewHistory={onViewHistory}
          emptyTitle="No bills recorded yet"
          emptyDescription="Fill out the form above to record your first FESCO electricity bill."
        />
      </section>
    </div>
  );
};
