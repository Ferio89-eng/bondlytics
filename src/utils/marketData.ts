import type { BondData } from '../types/portfolio.ts';
import { validateAndCanonicalizeBondUrl } from './bondUrl.ts';

export interface FxQuote {
  rates: Record<string, number>;
  asOf: string;
}

export interface BondBatchResult {
  bonds: BondData[];
  errors: { url: string; error: string }[];
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

const apiBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

let fxPromise: Promise<FxQuote> | null = null;
let bondsPromise: Promise<BondData[]> | null = null;
let nodeApiPromise: Promise<boolean> | null = null;

function prefersNodeApi(): boolean {
  if (apiBase) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Live Node API on localhost (or VITE_API_BASE). GitHub Pages stays on the JSON snapshot. */
function nodeApiReachable(): Promise<boolean> {
  if (!prefersNodeApi()) return Promise.resolve(false);
  if (!nodeApiPromise) {
    nodeApiPromise = fetch(`${apiBase}/api/health`, { signal: withTimeout(1500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return nodeApiPromise;
}

async function readJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) {
    throw new Error(`Dati statici non disponibili (${file}).`);
  }
  return (await res.json()) as T;
}

function assertFxQuote(quote: FxQuote): FxQuote {
  if (!quote.rates || typeof quote.rates.USD !== 'number') {
    throw new Error('Cambio BCE non disponibile.');
  }
  return quote;
}

/** ECB rates: the Node server when it is running, otherwise the published snapshot. */
export function fetchFxQuote(): Promise<FxQuote> {
  if (!fxPromise) {
    fxPromise = nodeApiReachable().then(async (live) => {
      if (live) {
        const res = await fetch(`${apiBase}/api/fx`);
        const data = (await res.json()) as FxQuote & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Cambio BCE non disponibile.');
        }
        return assertFxQuote(data);
      }
      return assertFxQuote(await readJson<FxQuote>('fx.json'));
    });
    fxPromise.catch(() => {
      fxPromise = null;
    });
  }
  return fxPromise;
}

function loadBondCatalog(): Promise<BondData[]> {
  if (!bondsPromise) {
    bondsPromise = readJson<{ bonds?: BondData[] }>('bonds.json').then((payload) => {
      if (!Array.isArray(payload.bonds)) {
        throw new Error('Archivio titoli non disponibile.');
      }
      return payload.bonds;
    });
    bondsPromise.catch(() => {
      bondsPromise = null;
    });
  }
  return bondsPromise;
}

const MISSING_ON_PAGES =
  'Questo titolo non è nel dataset pubblicato. Aggiungilo con l’azione «Aggiorna dati pubblicati» del repository, incollando il link, oppure avvia l’app in locale con npm run dev.';

async function fetchBondsFromApi(urls: string[]): Promise<BondBatchResult> {
  const res = await fetch(`${apiBase}/api/bonds/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  const data = (await res.json()) as BondBatchResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Errore nella richiesta.');
  }
  return { bonds: data.bonds ?? [], errors: data.errors ?? [] };
}

async function fetchBondsFromCatalog(urls: string[]): Promise<BondBatchResult> {
  const catalog = await loadBondCatalog();
  const byUrl = new Map(catalog.map((bond) => [bond.sourceUrl, bond]));
  const bonds: BondData[] = [];
  const errors: { url: string; error: string }[] = [];

  for (const url of urls) {
    try {
      const target = validateAndCanonicalizeBondUrl(url);
      const bond = byUrl.get(target.canonicalUrl);
      if (!bond) {
        errors.push({ url, error: MISSING_ON_PAGES });
        continue;
      }
      bonds.push(bond);
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : 'Errore nel caricamento',
      });
    }
  }

  return { bonds, errors };
}

/**
 * Bond lookup. On localhost this calls the Node server, so any SimpleTools link works.
 * On GitHub Pages it uses public/data/bonds.json.
 */
export async function fetchBondsBatch(urls: string[]): Promise<BondBatchResult> {
  const requested = urls.filter((url) => url.trim().length > 0).slice(0, 15);
  if (requested.length === 0) {
    throw new Error('Nessun URL valido fornito.');
  }
  if (await nodeApiReachable()) {
    return fetchBondsFromApi(requested);
  }
  return fetchBondsFromCatalog(requested);
}
