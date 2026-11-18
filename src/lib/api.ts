import type {
  AppSettings,
  BackupPayload,
  Bill,
  BillHistoryEntry,
  DashboardStats,
  MonthlySummary,
  PaymentStatus,
} from '../types/bill';
import { getLocalDateString, getLocalMonthString } from './format';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getDashboard(): Promise<DashboardStats> {
    const today = getLocalDateString();
    const month = getLocalMonthString();
    return request<DashboardStats>(
      `/api/dashboard?today=${encodeURIComponent(today)}&month=${encodeURIComponent(month)}`
    );
  },

  getNextSerial(): Promise<{ nextSerialNumber: number }> {
    return request<{ nextSerialNumber: number }>('/api/bills/next-serial');
  },

  listBills(params: {
    search?: string;
    status?: string;
    month?: string;
    date?: string;
    fromDate?: string;
    toDate?: string;
  } = {}): Promise<{ bills: Bill[] }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.month) q.set('month', params.month);
    if (params.date) q.set('date', params.date);
    if (params.fromDate) q.set('fromDate', params.fromDate);
    if (params.toDate) q.set('toDate', params.toDate);
    const qs = q.toString();
    return request<{ bills: Bill[] }>(`/api/bills${qs ? `?${qs}` : ''}`);
  },

  getBillHistory(id: number): Promise<{ bill: Bill; history: BillHistoryEntry[] }> {
    return request<{ bill: Bill; history: BillHistoryEntry[] }>(`/api/bills/${id}`);
  },

  createBill(input: {
    serial_number?: number;
    reference_number: string;
    bill_amount: number;
    commission: number;
    status: PaymentStatus;
  }): Promise<{ bill: Bill }> {
    return request<{ bill: Bill }>('/api/bills', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        localDate: getLocalDateString(),
      }),
    });
  },

  updateBill(
    id: number,
    input: {
      serial_number: number;
      reference_number: string;
      bill_amount: number;
      commission: number;
      status: PaymentStatus;
    }
  ): Promise<{ bill: Bill }> {
    return request<{ bill: Bill }>(`/api/bills/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...input,
        localDate: getLocalDateString(),
      }),
    });
  },

  setBillStatus(
    id: number,
    status: PaymentStatus
  ): Promise<{ bill: Bill; changed: boolean }> {
    return request<{ bill: Bill; changed: boolean }>(`/api/bills/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        localDate: getLocalDateString(),
      }),
    });
  },

  deleteBill(id: number): Promise<{ deletedId: number }> {
    return request<{ deletedId: number }>(`/api/bills/${id}`, {
      method: 'DELETE',
    });
  },

  getMonths(): Promise<{ months: MonthlySummary[] }> {
    const currentMonth = getLocalMonthString();
    return request<{ months: MonthlySummary[] }>(
      `/api/months?currentMonth=${encodeURIComponent(currentMonth)}`
    );
  },

  getHistory(limit = 150, billId?: number): Promise<{ history: BillHistoryEntry[] }> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (billId !== undefined) q.set('billId', String(billId));
    return request<{ history: BillHistoryEntry[] }>(`/api/history?${q.toString()}`);
  },

  getSettings(): Promise<{
    settings: AppSettings;
    dbInfo: {
      dbFile: string;
      totalBills: number;
      totalHistoryEntries: number;
      dbSizeBytes: number;
    };
  }> {
    return request('/api/settings');
  },

  updateSettings(input: Partial<AppSettings>): Promise<{
    settings: AppSettings;
    dbInfo: {
      dbFile: string;
      totalBills: number;
      totalHistoryEntries: number;
      dbSizeBytes: number;
    };
  }> {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  exportBackup(scope: 'all' | 'daily' | 'monthly' = 'all', filter?: string): Promise<BackupPayload> {
    const q = new URLSearchParams({ scope });
    if (filter) q.set('filter', filter);
    return request<BackupPayload>(`/api/backup/export?${q.toString()}`);
  },

  restoreBackup(
    payload: BackupPayload,
    mode: 'replace' | 'merge'
  ): Promise<{
    restoredBills: number;
    skippedDuplicates: number;
    totalCommissionEarned: number;
  }> {
    return request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ payload, mode }),
    });
  },
};
