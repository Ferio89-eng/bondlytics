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

let fxPromise: Promise<FxQuote> | null = null;
let bondsPromise: Promise<BondData[]> | null = null;

async function readJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) {
    throw new Error(`Dati statici non disponibili (${file}).`);
  }
  return (await res.json()) as T;
}

/** ECB rates published with the site: units of foreign currency per 1 EUR. */
export function fetchFxQuote(): Promise<FxQuote> {
  if (!fxPromise) {
    fxPromise = readJson<FxQuote>('fx.json').then((quote) => {
      if (!quote.rates || typeof quote.rates.USD !== 'number') {
        throw new Error('Cambio BCE non disponibile.');
      }
      return quote;
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

/**
 * Resolves SimpleTools links against the published bond snapshot.
 * Same result shape as POST /api/bonds/batch, without calling the Node server.
 */
export async function fetchBondsBatch(urls: string[]): Promise<BondBatchResult> {
  const requested = urls.filter((url) => url.trim().length > 0).slice(0, 15);
  if (requested.length === 0) {
    throw new Error('Nessun URL valido fornito.');
  }

  const catalog = await loadBondCatalog();
  const byUrl = new Map(catalog.map((bond) => [bond.sourceUrl, bond]));
  const bonds: BondData[] = [];
  const errors: { url: string; error: string }[] = [];

  for (const url of requested) {
    try {
      const target = validateAndCanonicalizeBondUrl(url);
      const bond = byUrl.get(target.canonicalUrl);
      if (!bond) {
        errors.push({
          url,
          error:
            'Questo titolo non è nel dataset pubblicato su GitHub Pages.',
        });
        continue;
      }
      bonds.push(bond);
    } catch (error) {
      errors.push({
        url,
        error:
          error instanceof Error ? error.message : 'Errore nel caricamento',
      });
    }
  }

  return { bonds, errors };
}
