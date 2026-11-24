import { mkdirSync, writeFileSync } from 'node:fs';
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

const BOND_URLS = [
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=1843984&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=8851&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=7926&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=1844055&marketcode=MOT',
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=8361&marketcode=EUROTLX',
];

async function fetchBond(rawUrl: string): Promise<BondData> {
  const target = validateAndCanonicalizeBondUrl(rawUrl);
  const response = await fetch(target.canonicalUrl, {
    method: 'GET',
    redirect: 'error',
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
}

const bonds: BondData[] = [];
for (const url of BOND_URLS) {
  const bond = await fetchBond(url);
  bonds.push(bond);
  console.log(`bond ${bond.isin} ${bond.description}`);
}

const fx = await getEurFxRates();
console.log(`fx asOf=${fx.asOf} USD=${fx.rates.USD}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'fx.json'), `${JSON.stringify(fx, null, 2)}\n`);
writeFileSync(
  path.join(outDir, 'bonds.json'),
  `${JSON.stringify({ bonds }, null, 2)}\n`
);
console.log(`wrote ${bonds.length} bonds and FX rates to ${outDir}`);
