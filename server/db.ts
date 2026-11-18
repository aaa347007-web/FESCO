import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  BackupPayload,
  Bill,
  BillHistoryEntry,
  DashboardStats,
  MonthlySummary,
  PaymentStatus,
} from '../src/types/bill.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'fesco-bills.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number INTEGER NOT NULL,
    reference_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
    bill_amount REAL NOT NULL CHECK(bill_amount >= 0),
    commission REAL NOT NULL CHECK(commission >= 0),
    status TEXT NOT NULL CHECK(status IN ('PAID', 'UNPAID')),
    added_at TEXT NOT NULL,
    added_date TEXT NOT NULL,
    paid_at TEXT NULL,
    paid_date TEXT NULL,
    bill_month TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bills_month ON bills(bill_month);
  CREATE INDEX IF NOT EXISTS idx_bills_added_date ON bills(added_date);
  CREATE INDEX IF NOT EXISTS idx_bills_paid_date ON bills(paid_date);
  CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
  CREATE INDEX IF NOT EXISTS idx_bills_serial ON bills(serial_number);

  CREATE TABLE IF NOT EXISTS bill_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NULL,
    serial_number INTEGER NOT NULL,
    reference_number TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('CREATED', 'MARKED_PAID', 'MARKED_UNPAID', 'EDITED', 'DELETED')),
    previous_status TEXT NULL,
    new_status TEXT NULL,
    previous_amount REAL NULL,
    new_amount REAL NULL,
    previous_commission REAL NULL,
    new_commission REAL NULL,
    commission_delta REAL NOT NULL DEFAULT 0,
    note TEXT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_bill_id ON bill_history(bill_id);
  CREATE INDEX IF NOT EXISTS idx_history_created_at ON bill_history(created_at DESC);

  CREATE TABLE IF NOT EXISTS ledger_totals (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    total_earned_commission REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    shop_name TEXT NOT NULL DEFAULT 'FESCO Bill Manager',
    owner_name TEXT NOT NULL DEFAULT 'Shop Counter',
    currency_code TEXT NOT NULL DEFAULT 'PKR',
    default_commission REAL NOT NULL DEFAULT 30,
    backup_location_label TEXT NOT NULL DEFAULT 'Device Downloads Folder',
    auto_backup_reminder INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
`);

function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return monthKey;
  }
  const d = new Date(year, monthIdx, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function normalizeRef(ref: string): string {
  return ref.trim().replace(/\s+/g, '');
}

function ensureSingletons(): void {
  const now = new Date().toISOString();
  const ledgerRow = db.prepare('SELECT id FROM ledger_totals WHERE id = 1').get();
  if (!ledgerRow) {
    const sumRow = db
      .prepare("SELECT COALESCE(SUM(commission), 0) AS total FROM bills WHERE status = 'PAID'")
      .get() as { total: number };
    db.prepare(
      'INSERT INTO ledger_totals (id, total_earned_commission, updated_at) VALUES (1, ?, ?)'
    ).run(sumRow.total, now);
  }

  const settingsRow = db.prepare('SELECT id FROM app_settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(
      `INSERT INTO app_settings (id, shop_name, owner_name, currency_code, default_commission, backup_location_label, auto_backup_reminder, updated_at)
       VALUES (1, 'FESCO Bill Manager', 'Shop Counter', 'PKR', 30, 'Device Downloads Folder', 1, ?)`
    ).run(now);
  }
}

ensureSingletons();

function syncLedgerTotals(nowIso: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(commission), 0) AS total FROM bills WHERE status = 'PAID'")
    .get() as { total: number };
  const total = Math.round(row.total * 100) / 100;
  db.prepare('UPDATE ledger_totals SET total_earned_commission = ?, updated_at = ? WHERE id = 1').run(
    total,
    nowIso
  );
  return total;
}

export class AppError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;
  constructor(message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getNextSerialNumber(): number {
  const row = db.prepare('SELECT COALESCE(MAX(serial_number), 0) + 1 AS nextSerial FROM bills').get() as {
    nextSerial: number;
  };
  return row.nextSerial;
}

export function getDashboardStats(todayInput?: string, monthInput?: string): DashboardStats {
  const today = todayInput && /^\d{4}-\d{2}-\d{2}$/.test(todayInput) ? todayInput : formatLocalDate();
  const currentMonth =
    monthInput && /^\d{4}-\d{2}$/.test(monthInput) ? monthInput : today.slice(0, 7);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS totalBills,
         COALESCE(SUM(bill_amount), 0) AS totalBillAmount,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paidBills,
         SUM(CASE WHEN status = 'UNPAID' THEN 1 ELSE 0 END) AS unpaidBills,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission ELSE 0 END), 0) AS totalCommissionEarned,
         COALESCE(SUM(CASE WHEN status = 'UNPAID' THEN commission ELSE 0 END), 0) AS pendingCommission,
         SUM(CASE WHEN added_date = ? THEN 1 ELSE 0 END) AS todayBills,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND paid_date = ? THEN commission ELSE 0 END), 0) AS todayCommission,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND bill_month = ? THEN commission ELSE 0 END), 0) AS currentMonthCommission
       FROM bills`
    )
    .get(today, today, currentMonth) as {
    totalBills: number;
    totalBillAmount: number;
    paidBills: number | null;
    unpaidBills: number | null;
    totalCommissionEarned: number;
    pendingCommission: number;
    todayBills: number | null;
    todayCommission: number;
    currentMonthCommission: number;
  };

  const recentBills = db
    .prepare('SELECT * FROM bills ORDER BY added_at DESC, id DESC LIMIT 8')
    .all() as Bill[];

  return {
    totalBills: summary.totalBills ?? 0,
    totalBillAmount: summary.totalBillAmount ?? 0,
    totalCommissionEarned: summary.totalCommissionEarned ?? 0,
    pendingCommission: summary.pendingCommission ?? 0,
    paidBills: summary.paidBills ?? 0,
    unpaidBills: summary.unpaidBills ?? 0,
    todayBills: summary.todayBills ?? 0,
    todayCommission: summary.todayCommission ?? 0,
    currentMonthCommission: summary.currentMonthCommission ?? 0,
    nextSerialNumber: getNextSerialNumber(),
    recentBills,
  };
}

export interface ListBillsFilter {
  search?: string;
  status?: string;
  month?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
}

export function listBills(filter: ListBillsFilter = {}): Bill[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.search && filter.search.trim().length > 0) {
    const raw = filter.search.trim();
    const rawNoHash = raw.startsWith('#') ? raw.slice(1).trim() : raw;
    const cleanedRef = normalizeRef(rawNoHash);
    const serialNum = /^\d+$/.test(rawNoHash) ? Number(rawNoHash) : null;
    if (raw.startsWith('#') && serialNum !== null) {
      conditions.push('serial_number = ?');
      params.push(serialNum);
    } else if (serialNum !== null) {
      conditions.push('(reference_number LIKE ? OR serial_number = ?)');
      params.push(`%${cleanedRef}%`, serialNum);
    } else {
      conditions.push('reference_number LIKE ?');
      params.push(`%${cleanedRef}%`);
    }
  }

  if (filter.status === 'PAID' || filter.status === 'UNPAID') {
    conditions.push('status = ?');
    params.push(filter.status);
  }

  if (filter.month && /^\d{4}-\d{2}$/.test(filter.month)) {
    conditions.push('bill_month = ?');
    params.push(filter.month);
  }

  if (filter.date && /^\d{4}-\d{2}-\d{2}$/.test(filter.date)) {
    conditions.push('added_date = ?');
    params.push(filter.date);
  }

  if (filter.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filter.fromDate)) {
    conditions.push('added_date >= ?');
    params.push(filter.fromDate);
  }

  if (filter.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filter.toDate)) {
    conditions.push('added_date <= ?');
    params.push(filter.toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM bills ${whereClause} ORDER BY added_at DESC, serial_number DESC, id DESC`)
    .all(...params) as Bill[];
}

export function getBillWithHistory(id: number): { bill: Bill; history: BillHistoryEntry[] } {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
  if (!bill) {
    throw new AppError('Bill not found', 404);
  }
  const history = db
    .prepare(
      'SELECT * FROM bill_history WHERE bill_id = ? OR reference_number = ? ORDER BY created_at DESC, id DESC'
    )
    .all(id, bill.reference_number) as BillHistoryEntry[];
  return { bill, history };
}

export interface CreateBillInput {
  serial_number?: number;
  reference_number: string;
  bill_amount: number;
  commission: number;
  status: PaymentStatus;
  localDate?: string;
}

const createBillTx = db.transaction((input: CreateBillInput): Bill => {
  const ref = normalizeRef(input.reference_number || '');
  if (!ref) {
    throw new AppError('FESCO Reference Number is required.', 400);
  }
  if (!Number.isFinite(input.bill_amount) || input.bill_amount < 0) {
    throw new AppError('Bill Amount must be a valid non-negative number.', 400);
  }
  if (!Number.isFinite(input.commission) || input.commission < 0) {
    throw new AppError('Commission must be a valid non-negative number.', 400);
  }
  if (input.status !== 'PAID' && input.status !== 'UNPAID') {
    throw new AppError('Payment status must be PAID or UNPAID.', 400);
  }

  const existing = db
    .prepare('SELECT id, serial_number, reference_number, added_date, status FROM bills WHERE reference_number = ?')
    .get(ref) as Pick<Bill, 'id' | 'serial_number' | 'reference_number' | 'added_date' | 'status'> | undefined;

  if (existing) {
    throw new AppError(
      `Duplicate Reference Number "${ref}" already exists (Serial #${existing.serial_number}, added ${existing.added_date}, ${existing.status}).`,
      409,
      { existingBill: existing }
    );
  }

  const serialNumber =
    input.serial_number !== undefined && Number.isInteger(input.serial_number) && input.serial_number > 0
      ? input.serial_number
      : getNextSerialNumber();

  const nowIso = new Date().toISOString();
  const addedDate =
    input.localDate && /^\d{4}-\d{2}-\d{2}$/.test(input.localDate)
      ? input.localDate
      : formatLocalDate();
  const billMonth = addedDate.slice(0, 7);
  const paidAt = input.status === 'PAID' ? nowIso : null;
  const paidDate = input.status === 'PAID' ? addedDate : null;

  const info = db
    .prepare(
      `INSERT INTO bills (serial_number, reference_number, bill_amount, commission, status, added_at, added_date, paid_at, paid_date, bill_month, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      serialNumber,
      ref,
      input.bill_amount,
      input.commission,
      input.status,
      nowIso,
      addedDate,
      paidAt,
      paidDate,
      billMonth,
      nowIso
    );

  const billId = Number(info.lastInsertRowid);
  const commissionDelta = input.status === 'PAID' ? input.commission : 0;

  db.prepare(
    `INSERT INTO bill_history (bill_id, serial_number, reference_number, action, previous_status, new_status, previous_amount, new_amount, previous_commission, new_commission, commission_delta, note, created_at)
     VALUES (?, ?, ?, 'CREATED', NULL, ?, NULL, ?, NULL, ?, ?, ?, ?)`
  ).run(
    billId,
    serialNumber,
    ref,
    input.status,
    input.bill_amount,
    input.commission,
    commissionDelta,
    input.status === 'PAID' ? 'Bill added and marked Paid' : 'Bill added as Unpaid',
    nowIso
  );

  syncLedgerTotals(nowIso);
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as Bill;
});

export function createBill(input: CreateBillInput): Bill {
  return createBillTx(input);
}

const setBillStatusTx = db.transaction(
  (id: number, targetStatus: PaymentStatus, localDate?: string): { bill: Bill; changed: boolean } => {
    const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
    if (!existing) {
      throw new AppError('Bill not found.', 404);
    }

    if (existing.status === targetStatus) {
      return { bill: existing, changed: false };
    }

    const nowIso = new Date().toISOString();
    const actionDate =
      localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : formatLocalDate();

    const paidAt = targetStatus === 'PAID' ? nowIso : null;
    const paidDate = targetStatus === 'PAID' ? actionDate : null;
    const commissionDelta =
      targetStatus === 'PAID' ? existing.commission : -existing.commission;

    db.prepare(
      'UPDATE bills SET status = ?, paid_at = ?, paid_date = ?, updated_at = ? WHERE id = ?'
    ).run(targetStatus, paidAt, paidDate, nowIso, id);

    db.prepare(
      `INSERT INTO bill_history (bill_id, serial_number, reference_number, action, previous_status, new_status, previous_amount, new_amount, previous_commission, new_commission, commission_delta, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      existing.serial_number,
      existing.reference_number,
      targetStatus === 'PAID' ? 'MARKED_PAID' : 'MARKED_UNPAID',
      existing.status,
      targetStatus,
      existing.bill_amount,
      existing.bill_amount,
      existing.commission,
      existing.commission,
      commissionDelta,
      targetStatus === 'PAID'
        ? `Payment collected; commission +${existing.commission}`
        : `Payment reversed to Unpaid; commission -${existing.commission}`,
      nowIso
    );

    syncLedgerTotals(nowIso);
    const updated = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill;
    return { bill: updated, changed: true };
  }
);

export function setBillStatus(
  id: number,
  targetStatus: PaymentStatus,
  localDate?: string
): { bill: Bill; changed: boolean } {
  return setBillStatusTx(id, targetStatus, localDate);
}

export interface UpdateBillInput {
  serial_number: number;
  reference_number: string;
  bill_amount: number;
  commission: number;
  status: PaymentStatus;
  localDate?: string;
}

const updateBillTx = db.transaction((id: number, input: UpdateBillInput): Bill => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
  if (!existing) {
    throw new AppError('Bill not found.', 404);
  }

  const ref = normalizeRef(input.reference_number || '');
  if (!ref) {
    throw new AppError('FESCO Reference Number is required.', 400);
  }
  if (!Number.isInteger(input.serial_number) || input.serial_number <= 0) {
    throw new AppError('Bill Serial Number must be a positive whole number.', 400);
  }
  if (!Number.isFinite(input.bill_amount) || input.bill_amount < 0) {
    throw new AppError('Bill Amount must be non-negative.', 400);
  }
  if (!Number.isFinite(input.commission) || input.commission < 0) {
    throw new AppError('Commission must be non-negative.', 400);
  }
  if (input.status !== 'PAID' && input.status !== 'UNPAID') {
    throw new AppError('Payment status must be PAID or UNPAID.', 400);
  }

  const dup = db
    .prepare('SELECT id, serial_number FROM bills WHERE reference_number = ? AND id != ?')
    .get(ref, id) as { id: number; serial_number: number } | undefined;

  if (dup) {
    throw new AppError(
      `Another bill (Serial #${dup.serial_number}) already uses Reference Number "${ref}".`,
      409
    );
  }

  const nowIso = new Date().toISOString();
  const actionDate =
    input.localDate && /^\d{4}-\d{2}-\d{2}$/.test(input.localDate) ? input.localDate : formatLocalDate();

  let paidAt = existing.paid_at;
  let paidDate = existing.paid_date;
  if (existing.status === 'UNPAID' && input.status === 'PAID') {
    paidAt = nowIso;
    paidDate = actionDate;
  } else if (existing.status === 'PAID' && input.status === 'UNPAID') {
    paidAt = null;
    paidDate = null;
  }

  const prevEarned = existing.status === 'PAID' ? existing.commission : 0;
  const nextEarned = input.status === 'PAID' ? input.commission : 0;
  const commissionDelta = nextEarned - prevEarned;

  db.prepare(
    `UPDATE bills
     SET serial_number = ?, reference_number = ?, bill_amount = ?, commission = ?, status = ?, paid_at = ?, paid_date = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.serial_number,
    ref,
    input.bill_amount,
    input.commission,
    input.status,
    paidAt,
    paidDate,
    nowIso,
    id
  );

  const notes: string[] = [];
  if (existing.serial_number !== input.serial_number) {
    notes.push(`Serial #${existing.serial_number} -> #${input.serial_number}`);
  }
  if (existing.reference_number !== ref) {
    notes.push(`Ref ${existing.reference_number} -> ${ref}`);
  }
  if (existing.bill_amount !== input.bill_amount) {
    notes.push(`Amount ${existing.bill_amount} -> ${input.bill_amount}`);
  }
  if (existing.commission !== input.commission) {
    notes.push(`Commission ${existing.commission} -> ${input.commission}`);
  }
  if (existing.status !== input.status) {
    notes.push(`Status ${existing.status} -> ${input.status}`);
  }

  db.prepare(
    `INSERT INTO bill_history (bill_id, serial_number, reference_number, action, previous_status, new_status, previous_amount, new_amount, previous_commission, new_commission, commission_delta, note, created_at)
     VALUES (?, ?, ?, 'EDITED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.serial_number,
    ref,
    existing.status,
    input.status,
    existing.bill_amount,
    input.bill_amount,
    existing.commission,
    input.commission,
    commissionDelta,
    notes.length > 0 ? notes.join('; ') : 'Bill details updated',
    nowIso
  );

  syncLedgerTotals(nowIso);
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill;
});

export function updateBill(id: number, input: UpdateBillInput): Bill {
  return updateBillTx(id, input);
}

const deleteBillTx = db.transaction((id: number): { deletedId: number } => {
  const existing = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
  if (!existing) {
    throw new AppError('Bill not found.', 404);
  }

  const nowIso = new Date().toISOString();
  const commissionDelta = existing.status === 'PAID' ? -existing.commission : 0;

  db.prepare(
    `INSERT INTO bill_history (bill_id, serial_number, reference_number, action, previous_status, new_status, previous_amount, new_amount, previous_commission, new_commission, commission_delta, note, created_at)
     VALUES (?, ?, ?, 'DELETED', ?, NULL, ?, NULL, ?, NULL, ?, ?, ?)`
  ).run(
    id,
    existing.serial_number,
    existing.reference_number,
    existing.status,
    existing.bill_amount,
    existing.commission,
    commissionDelta,
    `Deleted bill Serial #${existing.serial_number} (${existing.reference_number})`,
    nowIso
  );

  db.prepare('DELETE FROM bills WHERE id = ?').run(id);
  syncLedgerTotals(nowIso);
  return { deletedId: id };
});

export function deleteBill(id: number): { deletedId: number } {
  return deleteBillTx(id);
}

export function getMonthlySummaries(currentMonthInput?: string): MonthlySummary[] {
  const currentMonth =
    currentMonthInput && /^\d{4}-\d{2}$/.test(currentMonthInput)
      ? currentMonthInput
      : formatLocalDate().slice(0, 7);

  const rows = db
    .prepare(
      `SELECT
         bill_month AS monthKey,
         COUNT(*) AS totalBills,
         COALESCE(SUM(bill_amount), 0) AS totalBillAmount,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paidBills,
         SUM(CASE WHEN status = 'UNPAID' THEN 1 ELSE 0 END) AS unpaidBills,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission ELSE 0 END), 0) AS earnedCommission,
         COALESCE(SUM(CASE WHEN status = 'UNPAID' THEN commission ELSE 0 END), 0) AS pendingCommission
       FROM bills
       GROUP BY bill_month
       ORDER BY bill_month DESC`
    )
    .all() as Omit<MonthlySummary, 'label'>[];

  const map = new Map<string, MonthlySummary>();
  map.set(currentMonth, {
    monthKey: currentMonth,
    label: formatMonthLabel(currentMonth),
    totalBills: 0,
    totalBillAmount: 0,
    paidBills: 0,
    unpaidBills: 0,
    earnedCommission: 0,
    pendingCommission: 0,
  });

  for (const row of rows) {
    map.set(row.monthKey, {
      monthKey: row.monthKey,
      label: formatMonthLabel(row.monthKey),
      totalBills: row.totalBills ?? 0,
      totalBillAmount: row.totalBillAmount ?? 0,
      paidBills: row.paidBills ?? 0,
      unpaidBills: row.unpaidBills ?? 0,
      earnedCommission: row.earnedCommission ?? 0,
      pendingCommission: row.pendingCommission ?? 0,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function listHistory(limit = 100, billId?: number): BillHistoryEntry[] {
  if (billId !== undefined && Number.isInteger(billId)) {
    return db
      .prepare('SELECT * FROM bill_history WHERE bill_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(billId, limit) as BillHistoryEntry[];
  }
  return db
    .prepare('SELECT * FROM bill_history ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as BillHistoryEntry[];
}

export function getSettings(): AppSettings {
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettings;
}

export function updateSettings(input: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const nowIso = new Date().toISOString();
  const shopName = (input.shop_name ?? current.shop_name).trim() || 'FESCO Bill Manager';
  const ownerName = (input.owner_name ?? current.owner_name).trim() || 'Shop Counter';
  const currencyCode = input.currency_code === 'Rs.' ? 'Rs.' : 'PKR';
  const defaultCommission =
    typeof input.default_commission === 'number' &&
    Number.isFinite(input.default_commission) &&
    input.default_commission >= 0
      ? input.default_commission
      : current.default_commission;
  const backupLocationLabel =
    (input.backup_location_label ?? current.backup_location_label).trim() ||
    'Device Downloads Folder';
  const autoBackupReminder =
    input.auto_backup_reminder !== undefined
      ? input.auto_backup_reminder
        ? 1
        : 0
      : current.auto_backup_reminder;

  db.prepare(
    `UPDATE app_settings
     SET shop_name = ?, owner_name = ?, currency_code = ?, default_commission = ?, backup_location_label = ?, auto_backup_reminder = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    shopName,
    ownerName,
    currencyCode,
    defaultCommission,
    backupLocationLabel,
    autoBackupReminder,
    nowIso
  );

  return getSettings();
}

export function exportBackup(
  scope: 'all' | 'daily' | 'monthly' = 'all',
  scopeFilter?: string
): BackupPayload {
  const settings = getSettings();
  let bills: Bill[];
  let history: BillHistoryEntry[];

  if (scope === 'daily' && scopeFilter && /^\d{4}-\d{2}-\d{2}$/.test(scopeFilter)) {
    bills = db
      .prepare('SELECT * FROM bills WHERE added_date = ? ORDER BY id ASC')
      .all(scopeFilter) as Bill[];
    const ids = bills.map((b) => b.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      history = db
        .prepare(`SELECT * FROM bill_history WHERE bill_id IN (${placeholders}) ORDER BY id ASC`)
        .all(...ids) as BillHistoryEntry[];
    } else {
      history = [];
    }
  } else if (scope === 'monthly' && scopeFilter && /^\d{4}-\d{2}$/.test(scopeFilter)) {
    bills = db
      .prepare('SELECT * FROM bills WHERE bill_month = ? ORDER BY id ASC')
      .all(scopeFilter) as Bill[];
    const ids = bills.map((b) => b.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      history = db
        .prepare(`SELECT * FROM bill_history WHERE bill_id IN (${placeholders}) ORDER BY id ASC`)
        .all(...ids) as BillHistoryEntry[];
    } else {
      history = [];
    }
  } else {
    bills = db.prepare('SELECT * FROM bills ORDER BY id ASC').all() as Bill[];
    history = db.prepare('SELECT * FROM bill_history ORDER BY id ASC').all() as BillHistoryEntry[];
  }

  const ledger = db
    .prepare('SELECT total_earned_commission, updated_at FROM ledger_totals WHERE id = 1')
    .get() as { total_earned_commission: number; updated_at: string };

  return {
    app: 'FESCO Bill Manager',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    scopeFilter,
    settings,
    bills,
    bill_history: history,
    ledger_totals: ledger,
  };
}

const restoreBackupTx = db.transaction(
  (payload: BackupPayload, mode: 'replace' | 'merge'): { restoredBills: number; skippedDuplicates: number; totalCommissionEarned: number } => {
    if (!payload || !Array.isArray(payload.bills)) {
      throw new AppError('Invalid JSON backup file: missing bills array.', 400);
    }

    const nowIso = new Date().toISOString();

    if (mode === 'replace') {
      db.prepare('DELETE FROM bills').run();
      db.prepare('DELETE FROM bill_history').run();
    }

    let restoredBills = 0;
    let skippedDuplicates = 0;

    const insertBillStmt = db.prepare(
      `INSERT INTO bills (serial_number, reference_number, bill_amount, commission, status, added_at, added_date, paid_at, paid_date, bill_month, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const findByRefStmt = db.prepare('SELECT id FROM bills WHERE reference_number = ?');

    const idMap = new Map<number, number>();

    for (const rawBill of payload.bills) {
      const ref = normalizeRef(String(rawBill.reference_number ?? ''));
      if (!ref) continue;

      const existing = findByRefStmt.get(ref) as { id: number } | undefined;
      if (existing) {
        skippedDuplicates++;
        if (typeof rawBill.id === 'number') {
          idMap.set(rawBill.id, existing.id);
        }
        continue;
      }

      const addedAt = rawBill.added_at || nowIso;
      const addedDate =
        rawBill.added_date && /^\d{4}-\d{2}-\d{2}$/.test(rawBill.added_date)
          ? rawBill.added_date
          : addedAt.slice(0, 10);
      const billMonth =
        rawBill.bill_month && /^\d{4}-\d{2}$/.test(rawBill.bill_month)
          ? rawBill.bill_month
          : addedDate.slice(0, 7);
      const status: PaymentStatus = rawBill.status === 'PAID' ? 'PAID' : 'UNPAID';
      const paidAt = status === 'PAID' ? rawBill.paid_at || addedAt : null;
      const paidDate =
        status === 'PAID'
          ? rawBill.paid_date && /^\d{4}-\d{2}-\d{2}$/.test(rawBill.paid_date)
            ? rawBill.paid_date
            : (paidAt || addedDate).slice(0, 10)
          : null;

      const serialNumber =
        typeof rawBill.serial_number === 'number' && rawBill.serial_number > 0
          ? Math.floor(rawBill.serial_number)
          : getNextSerialNumber();

      const info = insertBillStmt.run(
        serialNumber,
        ref,
        Math.max(0, Number(rawBill.bill_amount) || 0),
        Math.max(0, Number(rawBill.commission) || 0),
        status,
        addedAt,
        addedDate,
        paidAt,
        paidDate,
        billMonth,
        rawBill.updated_at || nowIso
      );

      if (typeof rawBill.id === 'number') {
        idMap.set(rawBill.id, Number(info.lastInsertRowid));
      }
      restoredBills++;
    }

    if (Array.isArray(payload.bill_history)) {
      const insertHistoryStmt = db.prepare(
        `INSERT INTO bill_history (bill_id, serial_number, reference_number, action, previous_status, new_status, previous_amount, new_amount, previous_commission, new_commission, commission_delta, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of payload.bill_history) {
        const mappedBillId =
          typeof entry.bill_id === 'number' ? (idMap.get(entry.bill_id) ?? null) : null;
        if (mode === 'merge' && mappedBillId === null && entry.bill_id !== null) {
          continue;
        }
        const validActions = ['CREATED', 'MARKED_PAID', 'MARKED_UNPAID', 'EDITED', 'DELETED'];
        const action = validActions.includes(entry.action) ? entry.action : 'EDITED';
        insertHistoryStmt.run(
          mappedBillId,
          Number(entry.serial_number) || 0,
          normalizeRef(String(entry.reference_number || '')),
          action,
          entry.previous_status ?? null,
          entry.new_status ?? null,
          entry.previous_amount ?? null,
          entry.new_amount ?? null,
          entry.previous_commission ?? null,
          entry.new_commission ?? null,
          Number(entry.commission_delta) || 0,
          entry.note ?? null,
          entry.created_at || nowIso
        );
      }
    }

    if (mode === 'replace' && payload.settings) {
      updateSettings(payload.settings);
    }

    const totalCommissionEarned = syncLedgerTotals(nowIso);
    return { restoredBills, skippedDuplicates, totalCommissionEarned };
  }
);

export function restoreBackup(
  payload: BackupPayload,
  mode: 'replace' | 'merge' = 'replace'
): { restoredBills: number; skippedDuplicates: number; totalCommissionEarned: number } {
  return restoreBackupTx(payload, mode);
}

export function getDatabaseInfo(): { dbFile: string; totalBills: number; totalHistoryEntries: number; dbSizeBytes: number } {
  const billsCount = (db.prepare('SELECT COUNT(*) AS c FROM bills').get() as { c: number }).c;
  const historyCount = (db.prepare('SELECT COUNT(*) AS c FROM bill_history').get() as { c: number }).c;
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(DB_PATH).size;
  } catch {
    dbSizeBytes = 0;
  }
  return {
    dbFile: 'data/fesco-bills.db',
    totalBills: billsCount,
    totalHistoryEntries: historyCount,
    dbSizeBytes,
  };
}
