import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  AppError,
  createBill,
  deleteBill,
  exportBackup,
  getBillWithHistory,
  getDashboardStats,
  getDatabaseInfo,
  getMonthlySummaries,
  getNextSerialNumber,
  getSettings,
  listBills,
  listHistory,
  restoreBackup,
  setBillStatus,
  updateBill,
  updateSettings,
} from './server/db.ts';
import type { BackupPayload, PaymentStatus } from './src/types/bill.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function handleRouteError(res: Response, error: unknown): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error('[API Error]', error);
  res.status(500).json({ error: message });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'FESCO Bill Manager' });
  });

  app.get('/api/dashboard', (req: Request, res: Response) => {
    try {
      const today = typeof req.query.today === 'string' ? req.query.today : undefined;
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      res.json(getDashboardStats(today, month));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/bills/next-serial', (_req: Request, res: Response) => {
    try {
      res.json({ nextSerialNumber: getNextSerialNumber() });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/bills', (req: Request, res: Response) => {
    try {
      const bills = listBills({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        month: typeof req.query.month === 'string' ? req.query.month : undefined,
        date: typeof req.query.date === 'string' ? req.query.date : undefined,
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
      });
      res.json({ bills });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/bills/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Invalid bill ID.', 400);
      }
      res.json(getBillWithHistory(id));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/bills', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const bill = createBill({
        serial_number:
          body.serial_number !== undefined && body.serial_number !== ''
            ? Number(body.serial_number)
            : undefined,
        reference_number: String(body.reference_number ?? ''),
        bill_amount: Number(body.bill_amount),
        commission: Number(body.commission),
        status: body.status as PaymentStatus,
        localDate: typeof body.localDate === 'string' ? body.localDate : undefined,
      });
      res.status(201).json({ bill });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put('/api/bills/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Invalid bill ID.', 400);
      }
      const body = req.body ?? {};
      const bill = updateBill(id, {
        serial_number: Number(body.serial_number),
        reference_number: String(body.reference_number ?? ''),
        bill_amount: Number(body.bill_amount),
        commission: Number(body.commission),
        status: body.status as PaymentStatus,
        localDate: typeof body.localDate === 'string' ? body.localDate : undefined,
      });
      res.json({ bill });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.patch('/api/bills/:id/status', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Invalid bill ID.', 400);
      }
      const status = req.body?.status as PaymentStatus;
      if (status !== 'PAID' && status !== 'UNPAID') {
        throw new AppError('Status must be PAID or UNPAID.', 400);
      }
      const localDate =
        typeof req.body?.localDate === 'string' ? req.body.localDate : undefined;
      const result = setBillStatus(id, status, localDate);
      res.json(result);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.delete('/api/bills/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError('Invalid bill ID.', 400);
      }
      res.json(deleteBill(id));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/months', (req: Request, res: Response) => {
    try {
      const currentMonth =
        typeof req.query.currentMonth === 'string' ? req.query.currentMonth : undefined;
      res.json({ months: getMonthlySummaries(currentMonth) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/history', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 150;
      const billId = req.query.billId ? Number(req.query.billId) : undefined;
      res.json({ history: listHistory(limit, billId) });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/settings', (_req: Request, res: Response) => {
    try {
      res.json({ settings: getSettings(), dbInfo: getDatabaseInfo() });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.put('/api/settings', (req: Request, res: Response) => {
    try {
      const settings = updateSettings(req.body ?? {});
      res.json({ settings, dbInfo: getDatabaseInfo() });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.get('/api/backup/export', (req: Request, res: Response) => {
    try {
      const scopeParam = req.query.scope;
      const scope =
        scopeParam === 'daily' || scopeParam === 'monthly' ? scopeParam : 'all';
      const scopeFilter =
        typeof req.query.filter === 'string' ? req.query.filter : undefined;
      const payload = exportBackup(scope, scopeFilter);
      res.json(payload);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  app.post('/api/backup/restore', (req: Request, res: Response) => {
    try {
      const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';
      const payload = req.body?.payload as BackupPayload;
      const result = restoreBackup(payload, mode);
      res.json(result);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FESCO Bill Manager listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
