export function loadConfig() {
  const parseList = (value, fallback) => {
    if (!value) return fallback;
    return value.split(',').map((s) => s.trim());
  };

  const parseDurationMs = (value, fallbackMs) => {
    if (!value) return fallbackMs;
    const match = /^(\d+)(ms|s|m|h)?$/i.exec(value.trim());
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = (match[2] || 'ms').toLowerCase();
    const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
    return amount * (multipliers[unit] ?? 1);
  };

  return {
    port: Number(process.env.PORT || 8080),
    dbPath: process.env.DB_PATH || './data/trends.db',
    fetchIntervalMs: parseDurationMs(process.env.FETCH_INTERVAL, 10 * 60 * 1000),
    fetchPeriods: parseList(process.env.FETCH_PERIODS, ['daily', 'weekly', 'monthly']),
    fetchLanguages: parseList(process.env.FETCH_LANGUAGES, ['']),
    userAgent: process.env.USER_AGENT || 'ai-server-github-trends/1.0',
    fetchDelayMs: Number(process.env.FETCH_DELAY_MS || 2000),
  };
}

export function normalizeSince(value) {
  const since = String(value || 'daily').trim().toLowerCase();
  if (['daily', 'day', ''].includes(since)) return 'daily';
  if (['weekly', 'week'].includes(since)) return 'weekly';
  if (['monthly', 'month'].includes(since)) return 'monthly';
  throw new Error(`invalid since: ${value} (daily|weekly|monthly)`);
}

export function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeDate(value) {
  if (value == null || String(value).trim() === '') return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid date: ${value} (use YYYY-MM-DD)`);
  }
  return date;
}

export function todayDateString() {
  return toLocalDateString(new Date());
}
