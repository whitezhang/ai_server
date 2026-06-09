import express from 'express';
import { normalizeDate, normalizeSince, todayDateString } from './config.js';

export function createApp({ store, scheduler }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/v1/stats', (_req, res) => {
    res.json(store.stats());
  });

  app.get('/api/v1/trends/dates', (req, res) => {
    try {
      const since = req.query.since ? normalizeSince(req.query.since) : '';
      const language = String(req.query.language || '').trim();
      const limit = Math.max(1, Number(req.query.limit || 30));
      const dates = store.listDates({ since, language, limit });
      return res.json({ count: dates.length, dates });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/v1/trends', (req, res) => {
    try {
      const since = normalizeSince(req.query.since);
      const language = String(req.query.language || '').trim();
      const dateParam = normalizeDate(req.query.date);
      const date = dateParam || todayDateString();

      let snapshot = store.snapshotByDate(since, language, date);
      if (!snapshot && !dateParam) {
        snapshot = store.latestSnapshot(since, language);
      }
      if (!snapshot) {
        return res.status(404).json({
          message: 'no snapshot found for requested date',
          date,
          hint: 'try GET /api/v1/trends/dates or POST /api/v1/fetch',
        });
      }
      return res.json(snapshot);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/v1/trends/snapshots', (req, res) => {
    try {
      const since = req.query.since ? normalizeSince(req.query.since) : '';
      const language = String(req.query.language || '').trim();
      const date = req.query.date ? normalizeDate(req.query.date) : '';
      const from = req.query.from ? normalizeDate(req.query.from) : '';
      const to = req.query.to ? normalizeDate(req.query.to) : '';
      const limit = Math.max(1, Number(req.query.limit || 30));
      const snapshots = store.listSnapshots({ since, language, date, from, to, limit });
      return res.json({ count: snapshots.length, snapshots });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/v1/trends/snapshots/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid snapshot id' });
    }
    const snapshot = store.getSnapshot(id);
    if (!snapshot) {
      return res.status(404).json({ message: 'snapshot not found' });
    }
    return res.json(snapshot);
  });

  app.post('/api/v1/fetch', (_req, res) => {
    scheduler.runOnce();
    res.status(202).json({ message: 'fetch started in background' });
  });

  return app;
}
