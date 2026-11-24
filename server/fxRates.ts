const ECB_DAILY_XML =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface EurFxQuote {
  rates: Record<string, number>;
  asOf: string;
}

let cache: { quote: EurFxQuote; expiresAt: number } | null = null;

/**
 * ECB euro foreign-exchange reference rates: units of foreign currency per 1 EUR.
 * The feed is the daily reference, fetched live and cached for one hour.
 */
export async function getEurFxRates(): Promise<EurFxQuote> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.quote;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(ECB_DAILY_XML, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml,text/xml',
        'User-Agent': 'Bondlytics/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Cambio BCE non disponibile (HTTP ${response.status}).`
      );
    }

    const xml = await response.text();
    const asOf = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1] ?? '';
    const rates: Record<string, number> = {};

    for (const match of xml.matchAll(
      /currency='([A-Z]{3})'\s+rate='([0-9.]+)'/g
    )) {
      const rate = Number.parseFloat(match[2]);
      if (Number.isFinite(rate) && rate > 0) {
        rates[match[1]] = rate;
      }
    }

    if (typeof rates.USD !== 'number') {
      throw new Error('Il cambio USD/EUR non è presente nella risposta BCE.');
    }

    const quote = { rates, asOf };
    cache = { quote, expiresAt: Date.now() + CACHE_TTL_MS };
    return quote;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout durante il recupero del cambio BCE.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
