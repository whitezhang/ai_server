import { normalizeSince } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function taskLabel(since, language) {
  return language ? `${since}/${language}` : since;
}

export function createScheduler({ config, fetcher, store }) {
  let timer = null;
  let running = false;

  async function fetchOne(since, language) {
    const label = taskLabel(since, language);

    if (store.hasSnapshotForDate(since, language)) {
      console.log(`[fetch] ${label} skip, already fetched today`);
      return 'skipped';
    }

    try {
      const repos = await fetcher.fetch(since, language);
      store.saveSnapshot(since, language, repos);
      console.log(`[fetch] ${label} ok (${repos.length} repos)`);
      return 'ok';
    } catch (error) {
      console.log(`[fetch] ${label} failed: ${error.message}`);
      return 'failed';
    }
  }

  async function fetchAll() {
    if (running) {
      console.log('[fetch] previous run still in progress, skip');
      return;
    }

    running = true;
    const started = Date.now();
    let ok = 0;
    let skipped = 0;
    let fail = 0;

    try {
      for (const sinceRaw of config.fetchPeriods) {
        let since;
        try {
          since = normalizeSince(sinceRaw);
        } catch (error) {
          console.log(`[fetch] skip invalid period ${sinceRaw}: ${error.message}`);
          fail += 1;
          continue;
        }

        for (const language of config.fetchLanguages) {
          const result = await fetchOne(since, language);
          if (result === 'ok') ok += 1;
          else if (result === 'skipped') skipped += 1;
          else fail += 1;

          if (result !== 'skipped') {
            await sleep(config.fetchDelayMs);
          }
        }
      }
    } finally {
      running = false;
      console.log(
        `[fetch] done in ${Date.now() - started}ms, success=${ok} skipped=${skipped} failed=${fail}`,
      );
    }
  }

  return {
    start() {
      fetchAll();
      timer = setInterval(fetchAll, config.fetchIntervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce: fetchAll,
  };
}
