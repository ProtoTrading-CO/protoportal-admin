import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** Optimistic read-modify-write for site-config JSON — safe for multi-user edits. */
export async function mutateSiteConfigJson(file, fallback, mutator, { maxRetries = 10 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const store = await readSiteConfigJson(file, fallback);
    const version = store?.updatedAt || null;
    const result = await mutator(store ? { ...store } : { ...fallback });

    if (result === false || result?.abort) return result;

    const next = result?.store ?? result;
    const current = await readSiteConfigJson(file, fallback);
    if ((current?.updatedAt || null) !== version && attempt < maxRetries - 1) {
      await sleep(40 + attempt * 60 + Math.random() * 80);
      continue;
    }

    try {
      const written = await writeSiteConfigJson(file, next);
      return result?.store ? { ...result, store: written } : written;
    } catch (err) {
      lastErr = err;
      await sleep(40 + attempt * 60);
    }
  }
  throw lastErr || new Error('Concurrent update conflict — try again shortly');
}
