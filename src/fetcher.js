import * as cheerio from 'cheerio';

const BASE_URL = 'https://github.com/trending';

export function createFetcher({ userAgent }) {
  return {
    async fetch(since = 'daily', language = '') {
      const normalizedSince = since || 'daily';
      const url = language
        ? `${BASE_URL}/${encodeURIComponent(language)}?since=${normalizedSince}`
        : `${BASE_URL}?since=${normalizedSince}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(`GitHub returned HTTP ${response.status}: ${body}`);
      }

      const html = await response.text();
      return parseTrendingHTML(html);
    },
  };
}

export function parseTrendingHTML(html) {
  const $ = cheerio.load(html);
  const repos = [];

  $('article.Box-row').each((index, element) => {
    const row = $(element);
    const link = row.find('h2 a').first();
    const href = (link.attr('href') || '').trim();
    if (!href) return;

    const parts = href.replace(/^\/|\/$/g, '').split('/');
    if (parts.length < 2) return;

    const owner = parts[0];
    const name = parts[1];
    const textBlob = row.text();

    repos.push({
      rank: index + 1,
      owner,
      name,
      full_name: `${owner}/${name}`,
      url: `https://github.com${href}`,
      description: cleanText(row.find('p.col-9').first().text() || row.find('p').first().text()),
      language: cleanText(row.find('[itemprop=programmingLanguage]').first().text()),
      stars_total: extractMetric(textBlob, 'star'),
      stars_today: extractStarsToday(textBlob),
      forks: extractMetric(textBlob, 'fork'),
    });
  });

  if (repos.length === 0) {
    throw new Error('no trending repositories found in page');
  }

  return repos;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractStarsToday(text) {
  const lower = text.toLowerCase();
  const marker = lower.includes('stars today') ? 'stars today' : 'star today';
  const idx = lower.indexOf(marker);
  if (idx === -1) return 0;
  const segment = text.slice(Math.max(0, idx - 40), idx);
  return lastNumber(segment);
}

function extractMetric(text, keyword) {
  const parts = text.toLowerCase().split(/\s+/);
  for (let i = 1; i < parts.length; i += 1) {
    if (parts[i].includes(keyword)) {
      return parseNumber(parts[i - 1]);
    }
  }
  return 0;
}

function lastNumber(text) {
  const matches = text.match(/[\d,]+/g);
  if (!matches) return 0;
  return parseNumber(matches[matches.length - 1]);
}

function parseNumber(value) {
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
