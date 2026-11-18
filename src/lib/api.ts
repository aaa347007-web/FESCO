import type {
  AppSettings,
  BackupPayload,
  Bill,
  BillHistoryEntry,
  DashboardStats,
  MonthlySummary,
  PaymentStatus,
} from '../types/bill';

const BILLS_KEY = 'fesco_bills_v2';
const HISTORY_KEY = 'fesco_bill_history_v2';
const SETTINGS_KEY = 'fesco_settings_v2';

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  shop_name: 'Zahid Mobiles and Photo State',
  owner_name: 'Zahid Nawaz',
  currency_code: 'PKR',
  default_commission: 30,
  backup_location_label: 'Device Downloads Folder',
  auto_backup_reminder: 1,
  updated_at: new Date().toISOString(),
};

function getTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthStr(dateStr?: string): string {
  if (dateStr && dateStr.length >= 7) return dateStr.slice(0, 7);
  return getTodayStr().slice(0, 7);
}

function formatMonthText(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const idx = Number(m) - 1;
  return `${names[idx] || m} ${y}`;
}

function readBills(): Bill[] {
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeBills(bills: Bill[]) {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}

function readHistory(): BillHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: BillHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

function addHistoryEntry(entry: Omit<BillHistoryEntry, 'id' | 'created_at'>) {
  const list = readHistory();
  const item: BillHistoryEntry = {
    ...entry,
    id: Date.now() + Math.floor(Math.random() * 1000),
    created_at: new Date().toISOString(),
  } as BillHistoryEntry;
  list.unshift(item);
  writeHistory(list);
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const api = {
  async getDashboard(): Promise<DashboardStats> {
    const bills = readBills();
    const today = getTodayStr();
    const currentMonth = getMonthStr();

    const paidBillsList = bills.filter((b) => b.status === 'PAID');
    const unpaidBillsList = bills.filter((b) => b.status !== 'PAID');

    const totalBillAmount = bills.reduce((sum, b) => sum + Number(b.bill_amount || 0), 0);
    const totalCommissionEarned = paidBillsList.reduce((sum, b) => sum + Number(b.commission || 0), 0);
    const pendingCommission = unpaidBillsList.reduce((sum, b) => sum + Number(b.commission || 0), 0);

    const todayBillsList = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(today));
    const todayCommission = todayBillsList
      .filter((b) => b.status === 'PAID')
      .reduce((sum, b) => sum + Number(b.commission || 0), 0);

    const currentMonthCommission = paidBillsList
      .filter((b) => getMonthStr(b.bill_date || b.created_at) === currentMonth)
      .reduce((sum, b) => sum + Number(b.commission || 0), 0);

    const maxSerial = bills.reduce((max, b) => Math.max(max, Number(b.serial_number || 0)), 0);

    const sortedRecent = [...bills].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return {
      totalBills: bills.length,
      totalBillAmount,
      totalCommissionEarned,
      pendingCommission,
      paidBills: paidBillsList.length,
      unpaidBills: unpaidBillsList.length,
      todayBills: todayBillsList.length,
      todayCommission,
      currentMonthCommission,
      nextSerialNumber: maxSerial + 1,
      recentBills: sortedRecent.slice(0, 10),
    } as DashboardStats;
  },

  async listBills(params?: {
    search?: string;
    status?: 'ALL' | 'PAID' | 'UNPAID' | string;
    month?: string;
    date?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{ bills: Bill[] }> {
    let bills = readBills();

    if (params?.status && params.status !== 'ALL') {
      bills = bills.filter((b) => b.status === params.status);
    }

    if (params?.month) {
      bills = bills.filter((b) => getMonthStr(b.bill_date || b.created_at) === params.month);
    }

    if (params?.date) {
      bills = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(params.date!));
    }

    if (params?.fromDate) {
      bills = bills.filter((b) => {
        const d = (b.bill_date || b.created_at || '').slice(0, 10);
        return d >= params.fromDate!;
      });
    }

    if (params?.toDate) {
      bills = bills.filter((b) => {
        const d = (b.bill_date || b.created_at || '').slice(0, 10);
        return d <= params.toDate!;
      });
    }

    if (params?.search) {
      const q = params.search.toLowerCase();
      bills = bills.filter(
        (b) =>
          String(b.reference_number || '').toLowerCase().includes(q) ||
          String(b.serial_number || '').toLowerCase().includes(q) ||
          String((b as unknown as { customer_name?: string }).customer_name || '')
            .toLowerCase()
            .includes(q)
      );
    }

    bills.sort((a, b) => Number(b.serial_number || 0) - Number(a.serial_number || 0));
    return { bills };
  },

  async createBill(data: Partial<Bill>): Promise<{ bill: Bill }> {
    const bills = readBills();
    const ref = String(data.reference_number || '').trim();
    if (ref && bills.some((b) => String(b.reference_number).trim() === ref)) {
      throw new Error(`Reference number ${ref} already exists.`);
    }

    const now = new Date().toISOString();
    const status: PaymentStatus = data.status === 'PAID' ? 'PAID' : 'UNPAID';
    const commission = Number(data.commission ?? readSettings().default_commission);

    const newBill: Bill = {
      id: Date.now(),
      serial_number: Number(data.serial_number || bills.length + 1),
      reference_number: ref,
      customer_name: (data as unknown as { customer_name?: string }).customer_name || '',
      bill_amount: Number(data.bill_amount || 0),
      commission,
      status,
      bill_date: data.bill_date || getTodayStr(),
      due_date: (data as unknown as { due_date?: string }).due_date || '',
      paid_at: status === 'PAID' ? now : null,
      notes: (data as unknown as { notes?: string }).notes || '',
      created_at: now,
      updated_at: now,
    } as unknown as Bill;

    bills.unshift(newBill);
    writeBills(bills);

    addHistoryEntry({
      bill_id: newBill.id,
      serial_number: newBill.serial_number,
      reference_number: newBill.reference_number,
      action: 'CREATED',
      old_status: null,
      new_status: status,
      commission_delta: status === 'PAID' ? commission : 0,
      note: `Bill added (${status})`,
    } as Omit<BillHistoryEntry, 'id' | 'created_at'>);

    return { bill: newBill };
  },

  async updateBill(id: number, data: Partial<Bill>): Promise<{ bill: Bill }> {
    const bills = readBills();
    const idx = bills.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bill not found.');

    const existing = bills[idx];
    const nextStatus: PaymentStatus = (data.status as PaymentStatus) || existing.status;
    const nextComm = data.commission !== undefined ? Number(data.commission) : existing.commission;

    const oldEarned = existing.status === 'PAID' ? Number(existing.commission || 0) : 0;
    const newEarned = nextStatus === 'PAID' ? nextComm : 0;

    const updated: Bill = {
      ...existing,
      ...data,
      bill_amount: data.bill_amount !== undefined ? Number(data.bill_amount) : existing.bill_amount,
      commission: nextComm,
      status: nextStatus,
      paid_at:
        nextStatus === 'PAID'
          ? existing.paid_at || new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    };

    bills[idx] = updated;
    writeBills(bills);

    addHistoryEntry({
      bill_id: updated.id,
      serial_number: updated.serial_number,
      reference_number: updated.reference_number,
      action: 'UPDATED',
      old_status: existing.status,
      new_status: updated.status,
      commission_delta: newEarned - oldEarned,
      note: 'Bill details updated',
    } as Omit<BillHistoryEntry, 'id' | 'created_at'>);

    return { bill: updated };
  },

  async setBillStatus(
    id: number,
    nextStatus: PaymentStatus
  ): Promise<{ bill: Bill; changed: boolean }> {
    const bills = readBills();
    const idx = bills.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bill not found.');

    const existing = bills[idx];
    if (existing.status === nextStatus) {
      return { bill: existing, changed: false };
    }

    const delta =
      nextStatus === 'PAID'
        ? Number(existing.commission || 0)
        : -Number(existing.commission || 0);

    const updated: Bill = {
      ...existing,
      status: nextStatus,
      paid_at: nextStatus === 'PAID' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    bills[idx] = updated;
    writeBills(bills);

    addHistoryEntry({
      bill_id: updated.id,
      serial_number: updated.serial_number,
      reference_number: updated.reference_number,
      action: nextStatus === 'PAID' ? 'MARKED_PAID' : 'MARKED_UNPAID',
      old_status: existing.status,
      new_status: nextStatus,
      commission_delta: delta,
      note: nextStatus === 'PAID' ? 'Payment collected' : 'Reverted to unpaid',
    } as Omit<BillHistoryEntry, 'id' | 'created_at'>);

    return { bill: updated, changed: true };
  },

  async deleteBill(id: number): Promise<{ deleted: boolean }> {
    const bills = readBills();
    const target = bills.find((b) => b.id === id);
    if (!target) return { deleted: false };

    writeBills(bills.filter((b) => b.id !== id));

    addHistoryEntry({
      bill_id: target.id,
      serial_number: target.serial_number,
      reference_number: target.reference_number,
      action: 'DELETED',
      old_status: target.status,
      new_status: null,
      commission_delta: target.status === 'PAID' ? -Number(target.commission || 0) : 0,
      note: 'Bill deleted',
    } as Omit<BillHistoryEntry, 'id' | 'created_at'>);

    return { deleted: true };
  },

  async getMonths(): Promise<{ months: MonthlySummary[] }> {
    const bills = readBills();
    const map = new Map<string, MonthlySummary>();

    for (const b of bills) {
      const key = getMonthStr(b.bill_date || b.created_at);
      if (!map.has(key)) {
        map.set(key, {
          monthKey: key,
          label: formatMonthText(key),
          totalBills: 0,
          paidBills: 0,
          unpaidBills: 0,
          totalBillAmount: 0,
          earnedCommission: 0,
          pendingCommission: 0,
        });
      }
      const m = map.get(key)!;
      m.totalBills += 1;
      m.totalBillAmount += Number(b.bill_amount || 0);
      if (b.status === 'PAID') {
        m.paidBills += 1;
        m.earnedCommission += Number(b.commission || 0);
      } else {
        m.unpaidBills += 1;
        m.pendingCommission += Number(b.commission || 0);
      }
    }

    const months = Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return { months };
  },

  async getHistory(limit = 200): Promise<{ history: BillHistoryEntry[] }> {
    return { history: readHistory().slice(0, limit) };
  },

  async getBillHistory(billId: number): Promise<{ bill?: Bill; history: BillHistoryEntry[] }> {
    const bill = readBills().find((b) => b.id === billId);
    const history = readHistory().filter((h) => h.bill_id === billId);
    return { bill, history };
  },

  async getSettings(): Promise<{
    settings: AppSettings;
    dbInfo: {
      dbFile: string;
      totalBills: number;
      totalHistoryEntries: number;
      dbSizeBytes: number;
    };
  }> {
    const bills = readBills();
    const history = readHistory();
    const sizeBytes = new Blob([JSON.stringify({ bills, history })]).size;
