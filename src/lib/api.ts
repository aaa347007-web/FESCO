const BILLS_KEY = 'fesco_bills_v2';
const HISTORY_KEY = 'fesco_bill_history_v2';
const SETTINGS_KEY = 'fesco_settings_v2';

const DEFAULT_SETTINGS = {
  id: 1,
  shop_name: 'Zahid Mobiles and Photo State',
  owner_name: 'Zahid Nawaz',
  currency_code: 'PKR',
  default_commission: 30,
  backup_location_label: 'Device Documents / Downloads Folder',
  auto_backup_reminder: 1,
  updated_at: new Date().toISOString(),
};

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthStr(dateStr) {
  return dateStr && dateStr.length >= 7 ? dateStr.slice(0, 7) : getTodayStr().slice(0, 7);
}

function formatMonthText(monthKey) {
  const [y, m] = monthKey.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] || m} ${y}`;
}

function readBills() {
  try {
    return JSON.parse(localStorage.getItem(BILLS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeBills(bills) {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function addHistory(entry) {
  const list = readHistory();
  list.unshift({
    ...entry,
    id: Date.now() + Math.floor(Math.random() * 1000),
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const api = {
  async getDashboard() {
    const bills = readBills();
    const today = getTodayStr();
    const currentMonth = getMonthStr();
    const paid = bills.filter((b) => b.status === 'PAID');
    const unpaid = bills.filter((b) => b.status !== 'PAID');
    const todayBills = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(today));
    const maxSerial = bills.reduce((max, b) => Math.max(max, Number(b.serial_number || 0)), 0);
    const recent = [...bills].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return {
      totalBills: bills.length,
      totalBillAmount: bills.reduce((s, b) => s + Number(b.bill_amount || 0), 0),
      totalCommissionEarned: paid.reduce((s, b) => s + Number(b.commission || 0), 0),
      pendingCommission: unpaid.reduce((s, b) => s + Number(b.commission || 0), 0),
      paidBills: paid.length,
      unpaidBills: unpaid.length,
      todayBills: todayBills.length,
      todayCommission: todayBills.filter((b) => b.status === 'PAID').reduce((s, b) => s + Number(b.commission || 0), 0),
      currentMonthCommission: paid.filter((b) => getMonthStr(b.bill_date || b.created_at) === currentMonth).reduce((s, b) => s + Number(b.commission || 0), 0),
      nextSerialNumber: maxSerial + 1,
      recentBills: recent.slice(0, 10),
    };
  },

  async listBills(params = {}) {
    let bills = readBills();
    if (params.status && params.status !== 'ALL') bills = bills.filter((b) => b.status === params.status);
    if (params.month) bills = bills.filter((b) => getMonthStr(b.bill_date || b.created_at) === params.month);
    if (params.date) bills = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(params.date));
    if (params.fromDate) bills = bills.filter((b) => (b.bill_date || b.created_at || '').slice(0, 10) >= params.fromDate);
    if (params.toDate) bills = bills.filter((b) => (b.bill_date || b.created_at || '').slice(0, 10) <= params.toDate);
    if (params.search) {
      const q = params.search.toLowerCase();
      bills = bills.filter(
        (b) =>
          String(b.reference_number || '').toLowerCase().includes(q) ||
          String(b.serial_number || '').toLowerCase().includes(q) ||
          String(b.customer_name || '').toLowerCase().includes(q)
      );
    }
    bills.sort((a, b) => Number(b.serial_number || 0) - Number(a.serial_number || 0));
    return { bills };
  },

  async createBill(data) {
    const bills = readBills();
    const ref = String(data.reference_number || '').trim();
    if (ref && bills.some((b) => String(b.reference_number).trim() === ref)) {
      throw new Error(`Reference number ${ref} already exists.`);
    }
    const now = new Date().toISOString();
    const status = data.status === 'PAID' ? 'PAID' : 'UNPAID';
    const commission = Number(data.commission ?? readSettings().default_commission);
    const bill = {
      id: Date.now(),
      serial_number: Number(data.serial_number || bills.length + 1),
      reference_number: ref,
      customer_name: data.customer_name || '',
      bill_amount: Number(data.bill_amount || 0),
      commission,
      status,
      bill_date: data.bill_date || getTodayStr(),
      due_date: data.due_date || '',
      paid_at: status === 'PAID' ? now : null,
      notes: data.notes || '',
      created_at: now,
      updated_at: now,
    };
    bills.unshift(bill);
    writeBills(bills);
    addHistory({
      bill_id: bill.id,
      serial_number: bill.serial_number,
      reference_number: bill.reference_number,
      action: 'CREATED',
      old_status: null,
      new_status: status,
      commission_delta: status === 'PAID' ? commission : 0,
      note: `Bill added (${status})`,
    });
    return { bill };
  },

  async updateBill(id, data) {
    const bills = readBills();
    const idx = bills.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bill not found.');
    const old = bills[idx];
    const status = data.status || old.status;
    const comm = data.commission !== undefined ? Number(data.commission) : old.commission;
    const delta = (status === 'PAID' ? comm : 0) - (old.status === 'PAID' ? Number(old.commission || 0) : 0);
    const bill = {
      ...old,
      ...data,
      bill_amount: data.bill_amount !== undefined ? Number(data.bill_amount) : old.bill_amount,
      commission: comm,
      status,
      paid_at: status === 'PAID' ? old.paid_at || new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    bills[idx] = bill;
    writeBills(bills);
    addHistory({
      bill_id: bill.id,
      serial_number: bill.serial_number,
      reference_number: bill.reference_number,
      action: 'UPDATED',
      old_status: old.status,
      new_status: status,
      commission_delta: delta,
      note: 'Bill updated',
    });
    return { bill };
  },

  async setBillStatus(id, nextStatus) {
    const bills = readBills();
    const idx = bills.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Bill not found.');
    const old = bills[idx];
    if (old.status === nextStatus) return { bill: old, changed: false };
    const delta = nextStatus === 'PAID' ? Number(old.commission || 0) : -Number(old.commission || 0);
    const bill = {
      ...old,
      status: nextStatus,
      paid_at: nextStatus === 'PAID' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    bills[idx] = bill;
    writeBills(bills);
    addHistory({
      bill_id: bill.id,
      serial_number: bill.serial_number,
      reference_number: bill.reference_number,
      action: nextStatus === 'PAID' ? 'MARKED_PAID' : 'MARKED_UNPAID',
      old_status: old.status,
      new_status: nextStatus,
      commission_delta: delta,
      note: nextStatus === 'PAID' ? 'Payment collected' : 'Marked unpaid',
    });
    return { bill, changed: true };
  },

  async deleteBill(id) {
    const bills = readBills();
    const target = bills.find((b) => b.id === id);
    if (!target) return { deleted: false };
    writeBills(bills.filter((b) => b.id !== id));
    addHistory({
      bill_id: target.id,
      serial_number: target.serial_number,
      reference_number: target.reference_number,
      action: 'DELETED',
      old_status: target.status,
      new_status: null,
      commission_delta: target.status === 'PAID' ? -Number(target.commission || 0) : 0,
      note: 'Bill deleted',
    });
    return { deleted: true };
  },

  async getMonths() {
    const bills = readBills();
    const map = new Map();
    for (const b of bills) {
      const key = getMonthStr(b.bill_date || b.created_at);
      if (!map.has(key)) {
        map.set(key, { monthKey: key, label: formatMonthText(key), totalBills: 0, paidBills: 0, unpaidBills: 0, totalBillAmount: 0, earnedCommission: 0, pendingCommission: 0 });
      }
      const m = map.get(key);
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
    return { months: Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey)) };
  },

  async getHistory(limit = 200) {
    return { history: readHistory().slice(0, limit) };
  },

  async getBillHistory(billId) {
    return {
      bill: readBills().find((b) => b.id === billId),
      history: readHistory().filter((h) => h.bill_id === billId),
    };
  },

  async getSettings() {
    const bills = readBills();
    const history = readHistory();
    return {
      settings: readSettings(),
      dbInfo: {
        dbFile: 'Device Local Storage',
        totalBills: bills.length,
        totalHistoryEntries: history.length,
        dbSizeBytes: new Blob([JSON.stringify({ bills, history })]).size,
      },
    };
  },

  async updateSettings(patch) {
    const updated = { ...readSettings(), ...patch, updated_at: new Date().toISOString() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return { settings: updated };
  },

  async exportBackup(scope = 'all', filter) {
    let bills = readBills();
    if (scope === 'daily' && filter) bills = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(filter));
    if (scope === 'monthly' && filter) bills = bills.filter((b) => getMonthStr(b.bill_date || b.created_at) === filter);
    return { version: 1, exportedAt: new Date().toISOString(), settings: readSettings(), bills, bill_history: readHistory() };
  },

  async restoreBackup(payload, mode = 'merge') {
    const incoming = Array.isArray(payload.bills) ? payload.bills : [];
    let finalBills = incoming;
    if (mode !== 'replace') {
      const existing = readBills();
      const refs = new Set(existing.map((b) => String(b.reference_number)));
      finalBills = [...existing, ...incoming.filter((b) => !refs.has(String(b.reference_number)))];
    }
    writeBills(finalBills);
    if (Array.isArray(payload.bill_history) && mode === 'replace') localStorage.setItem(HISTORY_KEY, JSON.stringify(payload.bill_history));
    if (payload.settings && mode === 'replace') localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...payload.settings }));
    return {
      restoredBills: incoming.length,
      totalCommissionEarned: finalBills.filter((b) => b.status === 'PAID').reduce((s, b) => s + Number(b.commission || 0), 0),
    };
  },
};
