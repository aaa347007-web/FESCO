import React from 'react';
import { Edit3, X } from 'lucide-react';
import type { Bill } from '../types/bill';
import { BillForm } from './BillForm';

interface EditBillModalProps {
  bill: Bill | null;
  defaultCommission: number;
  currencyCode: string;
  onClose: () => void;
  onSaved: (updated: Bill) => void;
}

export const EditBillModal: React.FC<EditBillModalProps> = ({
  bill,
  defaultCommission,
  currencyCode,
  onClose,
  onSaved,
}) => {
  if (!bill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Edit Bill #{bill.serial_number}</h3>
              <p className="text-xs text-slate-500">
                Changes are recorded permanently in bill history
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit modal"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <BillForm
            mode="edit"
            initialBill={bill}
            suggestedSerial={bill.serial_number}
            defaultCommission={defaultCommission}
            currencyCode={currencyCode}
            onSuccess={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
};
