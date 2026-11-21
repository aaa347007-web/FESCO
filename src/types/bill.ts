export type PaymentStatus = 'PAID' | 'UNPAID';

export type HistoryAction =
  | 'CREATED'
  | 'MARKED_PAID'
  | 'MARKED_UNPAID'
  | 'EDITED'
  | 'DELETED';

export interface Bill {
  id: number;
  serial_number: number;
  reference_number: string;
  customer_name?: string;
  customer_phone?: string;
  due_date?: string;
  bill_amount: number;
  received_amount?: number;
  remaining_amount?: number;
  commission: number;
  status: PaymentStatus;
  added_at: string;
  added_date: string;
  paid_at: string | null;
  paid_date: string | null;
  bill_month: string;
  updated_at: string;
}

export interface BillHistoryEntry {
  id: number;
  bill_id: number | null;
  serial_number: number;
  reference_number: string;
  action: HistoryAction;
  previous_status: PaymentStatus | null;
  new_status: PaymentStatus | null;
  previous_amount: number | null;
  new_amount: number | null;
  previous_commission: number | null;
  new_commission: number | null;
  commission_delta: number;
  note: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalBills: number;
  totalBillAmount: number;
  totalCommissionEarned: number;
  pendingCommission: number;
  paidBills: number;
  unpaidBills: number;
  todayBills: number;
  todayCommission: number;
  currentMonthCommission: number;
  nextSerialNumber: number;
  recentBills: Bill[];
  urgentUnpaidBills?: Bill[];
  totalUdharAmount?: number;
  udharBillsCount?: number;
}

export interface MonthlySummary {
  monthKey: string;
  label: string;
  totalBills: number;
  totalBillAmount: number;
  paidBills: number;
  unpaidBills: number;
  earnedCommission: number;
  pendingCommission: number;
}

export interface AppSettings {
  id: number;
  shop_name: string;
  owner_name: string;
  currency_code: string;
  default_commission: number;
  backup_location_label: string;
  auto_backup_reminder: number;
  updated_at: string;
}

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: string;
  scope: 'all' | 'daily' | 'monthly';
  scopeFilter?: string;
  settings: AppSettings;
  bills: Bill[];
  bill_history: BillHistoryEntry[];
  ledger_totals: {
    total_earned_commission: number;
    updated_at: string;
  };
}
