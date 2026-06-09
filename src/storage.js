import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { toLocalDateString } from './config.js';

function mapSnapshot(row, repos) {
  return {
    id: row.id,
    date: row.captured_date,
    captured_at: row.captured_at,
    since: row.since,
    language: row.language,
    repo_count: row.repo_count,
    repos,
  };
}

function migrate(db) {
  const columns = db.prepare(`PRAGMA table_info(trend_snapshots)`).all();
  const hasDateColumn = columns.some((col) => col.name === 'captured_date');
  if (!hasDateColumn) {
    db.exec(`ALTER TABLE trend_snapshots ADD COLUMN captured_date TEXT`);
  }

  db.exec(`
    UPDATE trend_snapshots
    SET captured_date = substr(captured_at, 1, 10)
    WHERE captured_date IS NULL OR captured_date = ''
  `);

  const duplicateGroups = db.prepare(`
    SELECT captured_date, since, language, MAX(id) AS keep_id
    FROM trend_snapshots
    WHERE captured_date IS NOT NULL
    GROUP BY captured_date, since, language
    HAVING COUNT(*) > 1
  `).all();

  for (const group of duplicateGroups) {
    const stale = db.prepare(`
      SELECT id FROM trend_snapshots
      WHERE captured_date = ? AND since = ? AND language = ? AND id != ?
    `).all(group.captured_date, group.since, group.language, group.keep_id);

    for (const row of stale) {
      db.prepare(`DELETE FROM trend_repos WHERE snapshot_id = ?`).run(row.id);
      db.prepare(`DELETE FROM trend_snapshots WHERE id = ?`).run(row.id);
    }
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_daily
      ON trend_snapshots(captured_date, since, language)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_date
      ON trend_snapshots(captured_date DESC, since, language)
  `);
}

export function openStore(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      captured_date TEXT NOT NULL,
      since TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      repo_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trend_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      rank_num INTEGER NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      language TEXT,
      stars_total INTEGER NOT NULL DEFAULT 0,
      stars_today INTEGER NOT NULL DEFAULT 0,
      forks INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (snapshot_id) REFERENCES trend_snapshots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
      ON trend_snapshots(since, language, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_repos_snapshot
      ON trend_repos(snapshot_id, rank_num);
  `);

  migrate(db);

  const insertSnapshot = db.prepare(`
    INSERT INTO trend_snapshots (captured_at, captured_date, since, language, repo_count)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateSnapshot = db.prepare(`
    UPDATE trend_snapshots
    SET captured_at = ?, repo_count = ?
    WHERE id = ?
  `);

  const deleteRepos = db.prepare(`DELETE FROM trend_repos WHERE snapshot_id = ?`);

  const insertRepo = db.prepare(`
    INSERT INTO trend_repos (
      snapshot_id, rank_num, owner, name, full_name, url, description, language,
      stars_total, stars_today, forks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectRepos = db.prepare(`
    SELECT
      rank_num AS rank,
      owner,
      name,
      full_name,
      url,
      description,
      language,
      stars_total,
      stars_today,
      forks
    FROM trend_repos
    WHERE snapshot_id = ?
    ORDER BY rank_num ASC
  `);

  const selectSnapshotRow = db.prepare(`
    SELECT id, captured_date, captured_at, since, language, repo_count
    FROM trend_snapshots
    WHERE id = ?
  `);

  function loadSnapshot(id) {
    const row = selectSnapshotRow.get(id);
    if (!row) return null;
    return mapSnapshot(row, selectRepos.all(id));
  }

  const store = {
    saveSnapshot(since, language, repos) {
      const now = new Date();
      const capturedAt = now.toISOString();
      const capturedDate = toLocalDateString(now);
      const lang = language || '';

      const saveTx = db.transaction(() => {
        const existing = db.prepare(`
          SELECT id FROM trend_snapshots
          WHERE captured_date = ? AND since = ? AND language = ?
        `).get(capturedDate, since, lang);

        let snapshotId;
        if (existing) {
          snapshotId = existing.id;
          updateSnapshot.run(capturedAt, repos.length, snapshotId);
          deleteRepos.run(snapshotId);
        } else {
          const result = insertSnapshot.run(capturedAt, capturedDate, since, lang, repos.length);
          snapshotId = Number(result.lastInsertRowid);
        }

        for (const repo of repos) {
          insertRepo.run(
            snapshotId,
            repo.rank,
            repo.owner,
            repo.name,
            repo.full_name,
            repo.url,
            repo.description || '',
            repo.language || '',
            repo.stars_total || 0,
            repo.stars_today || 0,
            repo.forks || 0,
          );
        }
        return snapshotId;
      });

      return saveTx();
    },

    hasSnapshotForDate(since, language = '', date = toLocalDateString()) {
      const row = db.prepare(`
        SELECT 1 FROM trend_snapshots
        WHERE captured_date = ? AND since = ? AND language = ?
        LIMIT 1
      `).get(date, since, language || '');
      return Boolean(row);
    },

    snapshotByDate(since, language = '', date) {
      const row = db.prepare(`
        SELECT id, captured_date, captured_at, since, language, repo_count
        FROM trend_snapshots
        WHERE captured_date = ? AND since = ? AND language = ?
      `).get(date, since, language);
      if (!row) return null;
      return mapSnapshot(row, selectRepos.all(row.id));
    },

    latestSnapshot(since, language = '') {
      const row = db.prepare(`
        SELECT id, captured_date, captured_at, since, language, repo_count
        FROM trend_snapshots
        WHERE since = ? AND language = ?
        ORDER BY captured_date DESC, captured_at DESC
        LIMIT 1
      `).get(since, language);
      if (!row) return null;
      return mapSnapshot(row, selectRepos.all(row.id));
    },

    getSnapshot(id) {
      return loadSnapshot(id);
    },

    listDates({ since = '', language = '', limit = 30 } = {}) {
      const clauses = ['1=1'];
      const params = [];
      if (since) {
        clauses.push('since = ?');
        params.push(since);
      }
      if (language) {
        clauses.push('language = ?');
        params.push(language);
      }
      params.push(limit);
      return db.prepare(`
        SELECT captured_date AS date, COUNT(*) AS snapshot_count, MAX(captured_at) AS last_captured_at
        FROM trend_snapshots
        WHERE ${clauses.join(' AND ')}
        GROUP BY captured_date
        ORDER BY captured_date DESC
        LIMIT ?
      `).all(...params);
    },

    listSnapshots({ since = '', language = '', date = '', from = '', to = '', limit = 30 } = {}) {
      const clauses = ['1=1'];
      const params = [];
      if (since) {
        clauses.push('since = ?');
        params.push(since);
      }
      if (language) {
        clauses.push('language = ?');
        params.push(language);
      }
      if (date) {
        clauses.push('captured_date = ?');
        params.push(date);
      }
      if (from) {
        clauses.push('captured_date >= ?');
        params.push(from);
      }
      if (to) {
        clauses.push('captured_date <= ?');
        params.push(to);
      }
      params.push(limit);
      return db.prepare(`
        SELECT id, captured_date AS date, captured_at, since, language, repo_count
        FROM trend_snapshots
        WHERE ${clauses.join(' AND ')}
        ORDER BY captured_date DESC, captured_at DESC
        LIMIT ?
      `).all(...params);
    },

    stats() {
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM trend_snapshots').get().count;
      const repoCount = db.prepare('SELECT COUNT(*) AS count FROM trend_repos').get().count;
      const lastCaptured = db.prepare('SELECT MAX(captured_at) AS value FROM trend_snapshots').get().value;
      const dateCount = db.prepare('SELECT COUNT(DISTINCT captured_date) AS count FROM trend_snapshots').get().count;
      const firstDate = db.prepare('SELECT MIN(captured_date) AS value FROM trend_snapshots').get().value;
      const lastDate = db.prepare('SELECT MAX(captured_date) AS value FROM trend_snapshots').get().value;
      return {
        snapshot_count: snapshotCount,
        repo_count: repoCount,
        date_count: dateCount,
        first_date: firstDate || null,
        last_date: lastDate || null,
        last_captured_at: lastCaptured || null,
      };
    },

    close() {
      db.close();
    },
  };

  return store;
}
