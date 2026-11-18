return {
      settings: readSettings(),
      dbInfo: {
        dbFile: 'Device Local Storage',
        totalBills: bills.length,
        totalHistoryEntries: history.length,
        dbSizeBytes: sizeBytes,
      },
    };
  },

  async updateSettings(patch: Partial<AppSettings>): Promise<{ settings: AppSettings }> {
    const updated: AppSettings = {
      ...readSettings(),
      ...patch,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return { settings: updated };
  },

  async exportBackup(
    scope: 'all' | 'daily' | 'monthly' = 'all',
    filter?: string
  ): Promise<BackupPayload> {
    let bills = readBills();
    if (scope === 'daily' && filter) {
      bills = bills.filter((b) => (b.bill_date || b.created_at || '').startsWith(filter));
    } else if (scope === 'monthly' && filter) {
      bills = bills.filter((b) => getMonthStr(b.bill_date || b.created_at) === filter);
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: readSettings(),
      bills,
      bill_history: readHistory(),
    } as BackupPayload;
  },

  async restoreBackup(
    payload: BackupPayload,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<{ restoredBills: number; totalCommissionEarned: number }> {
    const incoming = Array.isArray(payload.bills) ? payload.bills : [];
    let finalBills: Bill[];

    if (mode === 'replace') {
      finalBills = incoming;
    } else {
      const existing = readBills();
      const existingRefs = new Set(existing.map((b) => String(b.reference_number)));
      const missing = incoming.filter((b) => !existingRefs.has(String(b.reference_number)));
      finalBills = [...existing, ...missing];
    }

    writeBills(finalBills);

    if (Array.isArray(payload.bill_history) && mode === 'replace') {
      writeHistory(payload.bill_history);
    }
    if (payload.settings && mode === 'replace') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...payload.settings }));
    }

    const totalCommissionEarned = finalBills
      .filter((b) => b.status === 'PAID')
      .reduce((sum, b) => sum + Number(b.commission || 0), 0);

    return {
      restoredBills: incoming.length,
      totalCommissionEarned,
    };
  },
};
