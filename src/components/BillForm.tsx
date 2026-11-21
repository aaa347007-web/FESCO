import React, { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  Banknote,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Hash,
  ImagePlus,
  Loader2,
  Phone,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  User,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { PAK_UTILITY_COMPANIES } from '../lib/pakCompanies';
import type { Bill, PaymentAccount, PaymentStatus } from '../types/bill';

interface BillOcrPlugin {
  scanImage(options: { base64Data: string }): Promise<{ text: string }>;
}

const BillOcr = registerPlugin<BillOcrPlugin>('BillOcr');

const ELECTRIC_14_DIGIT_COMPANIES = new Set([
  'FESCO',
  'LESCO',
  'MEPCO',
  'GEPCO',
  'IESCO',
  'PESCO',
  'HESCO',
  'SEPCO',
  'QESCO',
  'TESCO',
]);

const ACCOUNT_OPTIONS: {
  id: PaymentAccount;
  label: string;
  activeClass: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'CASH',
    label: 'Cash',
    activeClass: 'border-slate-800 bg-slate-800 text-white',
    icon: Banknote,
  },
  {
    id: 'EASYPAISA',
    label: 'Easypaisa',
    activeClass: 'border-emerald-600 bg-emerald-600 text-white',
    icon: Smartphone,
  },
  {
    id: 'JAZZCASH',
    label: 'JazzCash',
    activeClass: 'border-red-600 bg-red-600 text-white',
    icon: Smartphone,
  },
  {
    id: 'BANK',
    label: 'Bank / Raast',
    activeClass: 'border-blue-700 bg-blue-700 text-white',
    icon: Building2,
  },
];

const MONTH_MAP: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

function parsePakBillDate(dayStr: string, monStr: string, yearStr: string): string {
  const day = dayStr.padStart(2, '0');
  const mon = MONTH_MAP[monStr.toUpperCase().slice(0, 3)];
  if (!mon) return '';
  const yr = yearStr.length === 2 ? `20${yearStr}` : yearStr;
  if (Number(day) < 1 || Number(day) > 31) return '';
  return `${yr}-${mon}-${day}`;
}

function cleanOcrNumericToken(token: string): string {
  return token
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/,/g, '')
    .trim();
}

function extractUtilityBillData(
  rawText: string,
  companyId: string
): { referenceNumber: string; billAmount: string; dueDate: string } {
  const text = rawText.replace(/\r/g, '\n');
  let referenceNumber = '';
  let billAmount = '';
  let dueDate = '';

  const is14DigitElectric = ELECTRIC_14_DIGIT_COMPANIES.has((companyId || 'FESCO').toUpperCase());

  const barcodeLineMatch = text.match(
    /\b([0-9Oo]{2}\s*[0-9Oo]{5}\s*[0-9Oo]{7})\s*[-–—]\s*([0-9Oo]{6,10})\s*[-–—]\s*([0-9]{1,2})\s*([A-Z]{3})\s*([0-9]{2,4})/i
  );

  if (barcodeLineMatch) {
    const cleanedRef = cleanOcrNumericToken(barcodeLineMatch[1]).replace(/\s+/g, '');
    const cleanedAmt = cleanOcrNumericToken(barcodeLineMatch[2]).replace(/^0+/, '');
    if (cleanedRef.length === 14 && !cleanedRef.startsWith('03')) {
      referenceNumber = cleanedRef;
    }
    if (cleanedAmt && Number(cleanedAmt) >= 50) {
      billAmount = cleanedAmt;
    }
    const parsedStubDate = parsePakBillDate(
      barcodeLineMatch[3],
      barcodeLineMatch[4],
      barcodeLineMatch[5]
    );
    if (parsedStubDate) {
      dueDate = parsedStubDate;
    }
  }

  if (!referenceNumber && is14DigitElectric) {
    const spaced14Matches =
      text.match(/\b([0-9]{2}[\s-]*[0-9]{5}[\s-]*[0-9]{7})(?:\s*[A-Z])?\b/g) || [];
    for (const candidate of spaced14Matches) {
      const digitsOnly = candidate.replace(/\D/g, '');
      if (digitsOnly.length === 14 && !digitsOnly.startsWith('03')) {
        referenceNumber = digitsOnly;
        break;
      }
    }

    if (!referenceNumber) {
      const refLabelMatch = text.match(
        /REFERENCE\s*(?:NO|NUMBER|#)?[\s:.-]*([0-9][0-9\s-]{12,20}[0-9])/i
      );
      if (refLabelMatch) {
        const digitsOnly = refLabelMatch[1].replace(/\D/g, '');
        if (digitsOnly.length === 14) {
          referenceNumber = digitsOnly;
        }
      }
    }

    if (!referenceNumber) {
      const allNumberBlocks = text.match(/[0-9][0-9\s-]{12,18}[0-9]/g) || [];
      for (const block of allNumberBlocks) {
        const digitsOnly = block.replace(/\D/g, '');
        if (digitsOnly.length === 14 && !digitsOnly.startsWith('03')) {
          referenceNumber = digitsOnly;
          break;
        }
      }
    }
  }

  if (!referenceNumber && !is14DigitElectric) {
    const refMatches = text.match(/\b([0-9]{10,13})\b/g) || [];
    for (const candidate of refMatches) {
      const digitsOnly = candidate.replace(/\D/g, '');
      if (digitsOnly.length >= 10 && digitsOnly.length <= 13 && !digitsOnly.startsWith('03')) {
        referenceNumber = digitsOnly;
        break;
      }
    }
  }

  if (!billAmount) {
    const paddedMatch = text.match(/[-–—]\s*([0-9Oo]{4,6}[1-9][0-9]{1,5})\s*[-–—]/);
    if (paddedMatch) {
      const amt = cleanOcrNumericToken(paddedMatch[1]).replace(/^0+/, '');
      if (Number(amt) >= 50) {
        billAmount = amt;
      }
    }
  }

  if (!billAmount) {
    const withinSectionMatch = text.match(/PAYABLE\s+WITHIN\s+DUE\s+DATE([\s\S]{0,180})/i);
    if (withinSectionMatch) {
      const nums =
        withinSectionMatch[1].match(/\b([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{2,6})\b/g) || [];
      for (const rawNum of nums) {
        const val = Number(rawNum.replace(/,/g, ''));
        if (val >= 50 && val <= 5000000 && !(val >= 2024 && val <= 2035)) {
          billAmount = String(val);
          break;
        }
      }
    }
  }

  if (!billAmount) {
    const genericSectionMatch = text.match(
      /(?:WITHIN\s+DUE\s+DATE|PAYABLE\s+BY\s+DUE\s+DATE|TOTAL\s+PAYABLE)([\s\S]{0,150})/i
    );
    if (genericSectionMatch) {
      const nums =
        genericSectionMatch[1].match(/\b([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{2,6})\b/g) || [];
      for (const rawNum of nums) {
        const val = Number(rawNum.replace(/,/g, ''));
        if (val >= 50 && val <= 5000000 && !(val >= 2024 && val <= 2035)) {
          billAmount = String(val);
          break;
        }
      }
    }
  }

  if (!dueDate) {
    const dueMatch = text.match(
      /DUE\s+DATE[\s\S]{0,80}?\b([0-9]{1,2})[\s/-]+([A-Z]{3})[\s/-]+([0-9]{2,4})\b/i
    );
    if (dueMatch) {
      dueDate = parsePakBillDate(dueMatch[1], dueMatch[2], dueMatch[3]);
    }
  }

  return { referenceNumber, billAmount, dueDate };
}

function fileToResizedBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read selected image'));
    reader.readAsDataURL(file);
  });
}

interface BillFormProps {
  mode: 'create' | 'edit';
  initialBill?: Bill | null;
  prefillCompany?: string;
  prefillReference?: string;
  suggestedSerial: number;
  defaultCommission: number;
  currencyCode: string;
  onSuccess: (bill: Bill) => void;
  onCancel?: () => void;
}

export const BillForm: React.FC<BillFormProps> = ({
  mode,
  initialBill,
  prefillCompany,
  prefillReference,
  suggestedSerial,
  defaultCommission,
  currencyCode,
  onSuccess,
  onCancel,
}) => {
  const [selectedCompany, setSelectedCompany] = useState<string>(prefillCompany || 'FESCO');
  const [serialNumber, setSerialNumber] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.serial_number) : String(suggestedSerial)
  );
  const [referenceNumber, setReferenceNumber] = useState<string>(
    mode === 'edit' && initialBill ? initialBill.reference_number : prefillReference || ''
  );
  const [billAmount, setBillAmount] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.bill_amount) : ''
  );
  const [receivedAmount, setReceivedAmount] = useState<string>(
    mode === 'edit' && initialBill
      ? String(
          initialBill.status === 'PAID'
            ? initialBill.bill_amount
            : initialBill.received_amount ?? ''
        )
      : ''
  );
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccount>(
    mode === 'edit' && initialBill ? initialBill.payment_account || 'CASH' : 'CASH'
  );
  const [customerName, setCustomerName] = useState<string>(
    mode === 'edit' && initialBill ? initialBill.customer_name || '' : ''
  );
  const [customerPhone, setCustomerPhone] = useState<string>(
    mode === 'edit' && initialBill ? initialBill.customer_phone || '' : ''
  );
  const [dueDate, setDueDate] = useState<string>(
    mode === 'edit' && initialBill ? initialBill.due_date || '' : ''
  );
  const [commission, setCommission] = useState<string>(
    mode === 'edit' && initialBill ? String(initialBill.commission) : String(defaultCommission)
  );
  const [status, setStatus] = useState<PaymentStatus>(
    mode === 'edit' && initialBill ? initialBill.status : 'UNPAID'
  );
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'create' && prefillCompany) {
      setSelectedCompany(prefillCompany);
    }
  }, [prefillCompany, mode]);

  useEffect(() => {
    if (mode === 'create' && prefillReference) {
      setReferenceNumber(prefillReference);
    }
  }, [prefillReference, mode]);

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

  const parsedAmountNum = Math.max(0, Number(billAmount) || 0);
  const parsedReceivedNum =
    status === 'PAID'
      ? parsedAmountNum
      : Math.min(parsedAmountNum, Math.max(0, Number(receivedAmount) || 0));
  const remainingUdharNum = Math.max(0, parsedAmountNum - parsedReceivedNum);

  const handleReceivedChange = (val: string) => {
    setReceivedAmount(val);
    const num = Number(val) || 0;
    if (parsedAmountNum > 0 && num >= parsedAmountNum) {
      setStatus('PAID');
    } else if (num > 0 && num < parsedAmountNum) {
      setStatus('UNPAID');
    }
  };

  const handleStatusSelect = (next: PaymentStatus) => {
    setStatus(next);
    if (next === 'PAID' && parsedAmountNum > 0) {
      setReceivedAmount(String(parsedAmountNum));
    } else if (next === 'UNPAID' && Number(receivedAmount) >= parsedAmountNum) {
      setReceivedAmount('');
    }
  };

  const handleBillImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setScanNotice(null);
    setScanning(true);

    try {
      const base64Data = await fileToResizedBase64(file);
      let recognizedText = '';

      if (Capacitor.isNativePlatform()) {
        const res = await BillOcr.scanImage({ base64Data });
        recognizedText = res?.text || '';
      } else {
        throw new Error('Bill photo auto-scan works inside the Android APK.');
      }

      const extracted = extractUtilityBillData(recognizedText, selectedCompany);

      if (!extracted.referenceNumber && !extracted.billAmount) {
        setError(
          'Could not read Reference Number or Bill Amount clearly. Please take a sharper photo.'
        );
        return;
      }

      if (extracted.referenceNumber) {
        setReferenceNumber(extracted.referenceNumber);
      }
      if (extracted.billAmount) {
        setBillAmount(extracted.billAmount);
      }
      if (extracted.dueDate) {
        setDueDate(extracted.dueDate);
      }

      const parts: string[] = [];
      if (extracted.referenceNumber) parts.push(`Ref: ${extracted.referenceNumber}`);
      if (extracted.billAmount) parts.push(`Amount: ${currencyCode} ${extracted.billAmount}`);
      if (extracted.dueDate) parts.push(`Due: ${extracted.dueDate}`);
      setScanNotice(`Scanned (${parts.join(' · ')}) — Verify details & Save.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to scan bill image.');
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedSerial = Number(serialNumber);
    const cleanedRef = referenceNumber.trim().replace(/\s+/g, '');
    const cleanedName = customerName.trim();
    const cleanedPhone = customerPhone.trim();
    const cleanedDueDate = dueDate.trim();
    const parsedAmount = Number(billAmount);
    const parsedCommission = Number(commission);

    if (!Number.isInteger(parsedSerial) || parsedSerial <= 0) {
      setError('Bill Serial Number must be a positive whole number.');
      return;
    }
    if (!cleanedRef) {
      setError('Please enter the Bill Reference or Consumer Number.');
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

    const storedRef =
      mode === 'create' && selectedCompany && !cleanedRef.includes(':')
        ? `${selectedCompany}: ${cleanedRef}`
        : cleanedRef;

    const finalReceived =
      status === 'PAID'
        ? parsedAmount
        : Math.min(parsedAmount, Math.max(0, Number(receivedAmount) || 0));
    const finalStatus: PaymentStatus = finalReceived >= parsedAmount ? 'PAID' : status;

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const res = await api.createBill({
          serial_number: parsedSerial,
          reference_number: storedRef,
          customer_name: cleanedName,
          customer_phone: cleanedPhone,
          due_date: cleanedDueDate,
          payment_account: paymentAccount,
          bill_amount: parsedAmount,
          received_amount: finalReceived,
          commission: parsedCommission,
          status: finalStatus,
        });
        setReferenceNumber('');
        setCustomerName('');
        setCustomerPhone('');
        setDueDate('');
        setBillAmount('');
        setReceivedAmount('');
        setCommission(String(defaultCommission));
        setStatus('UNPAID');
        setScanNotice(null);
        onSuccess(res.bill);
      } else if (initialBill) {
        const res = await api.updateBill(initialBill.id, {
          serial_number: parsedSerial,
          reference_number: cleanedRef,
          customer_name: cleanedName,
          customer_phone: cleanedPhone,
          due_date: cleanedDueDate,
          payment_account: paymentAccount,
          bill_amount: parsedAmount,
          received_amount: finalReceived,
          commission: parsedCommission,
          status: finalStatus,
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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleBillImageSelected}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleBillImageSelected}
        className="hidden"
      />

      {/* Smart Bill Photo Scanner Bar */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
            <Sparkles className="h-4 w-4 shrink-0 text-blue-700" />
            <span>Auto-Fill Reference #, Amount & Due Date from Photo</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              disabled={scanning}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <span>{scanning ? 'Reading...' : 'Scan Camera'}</span>
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={() => galleryInputRef.current?.click()}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100/60 disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              <span>Upload Photo</span>
            </button>
          </div>
        </div>
      </div>

      {scanNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          {scanNotice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      {/* 1. Utility Company & Serial Number */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mode === 'create' && (
          <div>
            <label
              htmlFor="bill-company"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              Utility Company
            </label>
            <select
              id="bill-company"
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            >
              {PAK_UTILITY_COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={mode === 'edit' ? 'sm:col-span-2' : ''}>
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
        </div>
      </div>

      {/* 2. Reference Number & Bill Amount */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="bill-ref"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Bill Reference / Consumer Number
          </label>
          <input
            id="bill-ref"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 01134620074301"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            required
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>

        <div>
          <label
            htmlFor="bill-amount"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Total Bill Amount ({currencyCode})
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
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-base font-extrabold text-slate-900 tabular-nums placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      </div>

      {/* 3. Payment Account / Source Selector */}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-800">
          Payment Account / Source <span className="text-xs font-normal text-slate-500">(Kis Account Se Pay Hua)</span>
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACCOUNT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = paymentAccount === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPaymentAccount(opt.id)}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold transition ${
                  selected
                    ? `${opt.activeClass} shadow-xs`
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Udhar / Partial Payment Box */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="bill-received-amount"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              Received Amount <span className="text-xs font-normal text-slate-500">(Jama Shuda)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Wallet className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <input
                  id="bill-received-amount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="0 (Agar kuch nahi diya)"
                  value={receivedAmount}
                  onChange={(e) => handleReceivedChange(e.target.value)}
                  className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 font-mono text-sm font-bold text-emerald-700 tabular-nums placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600"
                />
              </div>
              {parsedAmountNum > 0 && (
                <button
                  type="button"
                  onClick={() => handleReceivedChange(String(parsedAmountNum))}
                  className="min-h-[46px] shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100"
                >
                  Full
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-500">
              Remaining Balance (Baqaya Udhar)
            </span>
            <span
              className={`mt-0.5 font-mono text-lg font-extrabold tabular-nums ${
                remainingUdharNum > 0 && parsedReceivedNum > 0
                  ? 'text-red-600'
                  : remainingUdharNum === 0 && parsedAmountNum > 0
                    ? 'text-emerald-700'
                    : 'text-slate-800'
              }`}
            >
              {currencyCode} {remainingUdharNum.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-500">
              {remainingUdharNum > 0 && parsedReceivedNum > 0
                ? 'Partial payment — Baqaya Udhar mein save hoga'
                : remainingUdharNum === 0 && parsedAmountNum > 0
                  ? 'Mukammal adaigi ho gayi'
                  : 'Customer ne abhi raqam nahi di'}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Due Date & Customer Name */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="bill-due-date"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Due Date <span className="text-xs font-normal text-slate-500">(Aakhri Tareekh)</span>
          </label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600" />
            <input
              id="bill-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 font-mono text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="bill-customer-name"
            className="mb-1.5 block text-sm font-semibold text-slate-800"
          >
            Customer Name (Jis ke naam bill hai)
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="bill-customer-name"
              type="text"
              placeholder="e.g. Muhammad Ali"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>
        </div>
      </div>

      {/* 6. Phone Number (Optional) */}
      <div>
        <label
          htmlFor="bill-customer-phone"
          className="mb-1.5 block text-sm font-semibold text-slate-800"
        >
          Phone / WhatsApp <span className="text-xs font-normal text-slate-500">(Optional)</span>
        </label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="bill-customer-phone"
            type="tel"
            inputMode="tel"
            maxLength={15}
            placeholder="03001234567 (Optional)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="min-h-[46px] w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 font-mono text-sm font-semibold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      </div>

      {/* 7. Commission & Payment Status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-slate-800">Payment Status</span>
          <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            <button
              type="button"
              onClick={() => handleStatusSelect('PAID')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition ${
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
              onClick={() => handleStatusSelect('UNPAID')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition ${
                status === 'UNPAID'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{parsedReceivedNum > 0 && remainingUdharNum > 0 ? 'Udhar' : 'Unpaid'}</span>
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {status === 'PAID'
              ? 'Full amount received; commission added immediately.'
              : parsedReceivedNum > 0 && remainingUdharNum > 0
                ? `Udhar Baqaya: ${currencyCode} ${remainingUdharNum.toLocaleString()}`
                : 'Commission stays pending until marked Paid.'}
          </p>
        </div>
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
