import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSimpleToolsHtml,
  validateAndCanonicalizeBondUrl,
} from '../server/bondParser.ts';
import { getEurFxRates } from '../server/fxRates.ts';
import type { BondData } from '../src/types/portfolio.ts';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(scriptsDir, '..', 'public', 'data');
const bondsFile = path.join(outDir, 'bonds.json');

const DEFAULT_URLS = [
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=1843984&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=8851&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=7926&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=1844055&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=8361&marketcode=EUROTLX',
];

function readExistingBonds(): BondData[] {
  if (!existsSync(bondsFile)) return [];
  const parsed = JSON.parse(readFileSync(bondsFile, 'utf8')) as {
    bonds?: BondData[];
  };
  return Array.isArray(parsed.bonds) ? parsed.bonds : [];
}

function extraUrls(): string[] {
  return (process.env.BOND_URLS ?? '')
    .split(/[\s,]+/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

async function fetchBond(rawUrl: string): Promise<BondData> {
  const target = validateAndCanonicalizeBondUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(target.canonicalUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bondlytics/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      throw new Error(
        `Risposta HTTP ${response.status} per ${target.canonicalUrl}`
      );
    }
    const html = await response.text();
    return parseSimpleToolsHtml(html, target);
  } finally {
    clearTimeout(timeout);
  }
}

const previous = readExistingBonds();
const previousByUrl = new Map(previous.map((bond) => [bond.sourceUrl, bond]));
const requestedExtras = extraUrls();

const canonicalUrls: string[] = [];
const seen = new Set<string>();
for (const rawUrl of [
  ...DEFAULT_URLS,
  ...previous.map((bond) => bond.sourceUrl),
  ...requestedExtras,
]) {
  const target = validateAndCanonicalizeBondUrl(rawUrl);
  if (seen.has(target.canonicalUrl)) continue;
  seen.add(target.canonicalUrl);
  canonicalUrls.push(target.canonicalUrl);
}

const extraCanonical = new Set(
  requestedExtras.map(
    (url) => validateAndCanonicalizeBondUrl(url).canonicalUrl
  )
);

const bonds: BondData[] = [];
const failedExtras: string[] = [];

for (const url of canonicalUrls) {
  try {
    const bond = await fetchBond(url);
    bonds.push(bond);
    console.log(`bond ${bond.isin} ${bond.description}`);
  } catch (error) {
    const kept = previousByUrl.get(url);
    const message = error instanceof Error ? error.message : 'errore';
    if (kept) {
      bonds.push(kept);
      console.warn(`kept previous ${kept.isin}: ${message}`);
    } else if (extraCanonical.has(url)) {
      failedExtras.push(`${url} (${message})`);
      console.error(`failed new bond ${url}: ${message}`);
    } else {
      console.error(`skipped ${url}: ${message}`);
    }
  }
}

if (failedExtras.length > 0) {
  throw new Error(
    `Impossibile aggiungere: ${failedExtras.join('; ')}`
  );
}

const fx = await getEurFxRates();
console.log(`fx asOf=${fx.asOf} USD=${fx.rates.USD}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'fx.json'), `${JSON.stringify(fx, null, 2)}\n`);
writeFileSync(bondsFile, `${JSON.stringify({ bonds }, null, 2)}\n`);
console.log(`wrote ${bonds.length} bonds and FX rates to ${outDir}`);
