import * as cheerio from 'cheerio';
import type {
  BondCashflow,
  BondData,
  CashflowCategory,
  CouponScheduleItem,
} from '../src/types/portfolio.ts';

const ALLOWED_HOSTNAMES = new Set([
  'www.simpletoolsforinvestors.eu',
  'simpletoolsforinvestors.eu',
]);

export interface CanonicalBondTarget {
  bondId: string;
  marketCode: string;
  canonicalUrl: string;
}

/**
 * Strictly validates a user-provided SimpleToolsForInvestors URL to prevent SSRF.
 * Only permits details.php or compute.php on simpletoolsforinvestors.eu with numeric bondid.
 */
export function validateAndCanonicalizeBondUrl(rawInput: string): CanonicalBondTarget {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Inserisci un URL valido di simpletoolsforinvestors.eu.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Formato URL non valido.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Sono consentiti solo URL HTTP o HTTPS.');
  }

  if (!ALLOWED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      'Dominio non consentito. Inserisci un link da www.simpletoolsforinvestors.eu.'
    );
  }

  const normalizedPath = parsed.pathname.toLowerCase();
  if (normalizedPath !== '/details.php' && normalizedPath !== '/compute.php') {
    throw new Error(
      'Il link deve puntare a details.php o compute.php su simpletoolsforinvestors.eu.'
    );
  }

  let bondId = '';
  let marketCode = 'MOT';

  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'bondid') {
      bondId = value.trim();
    } else if (lowerKey === 'marketcode') {
      marketCode = value.trim();
    }
  }

  if (!/^\d{1,12}$/.test(bondId)) {
    throw new Error('Parametro bondid mancante o non valido nel link.');
  }

  if (!/^[A-Za-z0-9_-]{1,20}$/.test(marketCode)) {
    throw new Error('Parametro marketcode non valido nel link.');
  }

  const canonicalUrl = `https://www.simpletoolsforinvestors.eu/details.php?bondid=${encodeURIComponent(
    bondId
  )}&marketcode=${encodeURIComponent(marketCode)}`;

  return { bondId, marketCode, canonicalUrl };
}

function parseItalianNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseOptionalItalianNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'n/a') return null;
  const cleaned = trimmed
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function italianDateToIso(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function classifyCashflow(description: string): CashflowCategory {
  const d = description.toLowerCase();
  if (d.includes('pagamento nominale')) return 'principal_out';
  if (d.includes('commissioni')) return 'commission_out';
  if (d.includes('rateo lordo')) return 'accrued_gross';
  if (d.includes('storno tassazione rateo')) return 'accrued_tax_credit';
  if (d.includes('credito disaggio')) return 'disaggio_credit';
  if (d.includes('incasso cedola')) return 'coupon_gross';
  if (d.includes('tassazione cedola')) return 'coupon_tax';
  if (d.includes('rimborso nominale')) return 'principal_in';
  if (d.includes('addebito disaggio')) return 'disaggio_debit';
  if (d.includes('tassazione capital gain')) return 'capital_gain_tax';
  return 'other';
}

function inferCouponRateFromDescription(desc: string): number | null {
  const match = desc.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  return parseOptionalItalianNumber(match[1]);
}

function inferFrequencyFromCashflows(cashflows: BondCashflow[]): string {
  const couponDates = cashflows
    .filter((cf) => cf.category === 'coupon_gross' && cf.isoDate)
    .map((cf) => new Date(`${cf.isoDate}T00:00:00Z`).getTime())
    .sort((a, b) => a - b);

  if (couponDates.length < 2) {
    return couponDates.length === 0 ? 'Zero Coupon / Unica' : 'Annuale';
  }

  const gapsDays: number[] = [];
  for (let i = 1; i < Math.min(couponDates.length, 6); i++) {
    gapsDays.push((couponDates[i] - couponDates[i - 1]) / (1000 * 60 * 60 * 24));
  }
  const avgGap = gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length;
  if (avgGap < 110) return 'Trimestrale';
  if (avgGap < 220) return 'Semestrale';
  return 'Annuale';
}

export function parseSimpleToolsHtml(
  html: string,
  target: CanonicalBondTarget
): BondData {
  const $ = cheerio.load(html);

  const keyValueMap = new Map<string, string>();
  let grossYield = 0;
  let netYield = 0;
  let netYieldNoCg = 0;
  let grossDuration = 0;
  let netDuration = 0;

  const couponSchedule: CouponScheduleItem[] = [];
  const cashflows: BondCashflow[] = [];

  $('table').each((_, tableEl) => {
    const table = $(tableEl);
    const headerTitle = table.find('thead th').first().text().trim().toLowerCase();

    if (
      headerTitle === 'dati operazione' ||
      headerTitle === 'dati obbligazione' ||
      headerTitle === 'dati calcolati'
    ) {
      table.find('tbody tr').each((__, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length >= 2) {
          const label = $(cells[0]).text().trim().toLowerCase();
          const value = $(cells[1]).text().trim();
          if (label) {
            keyValueMap.set(label, value);
          }
        }
      });
    } else if (headerTitle === 'rendimenti e durate') {
      table.find('tbody tr').each((__, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length >= 4) {
          const metric = $(cells[0]).text().trim().toLowerCase();
          if (metric.includes('rendimento')) {
            grossYield = parseItalianNumber($(cells[1]).text());
            netYield = parseItalianNumber($(cells[2]).text());
            netYieldNoCg = parseItalianNumber($(cells[3]).text());
          } else if (metric.includes('duration')) {
            grossDuration = parseItalianNumber($(cells[1]).text());
            netDuration = parseItalianNumber($(cells[2]).text());
          }
        }
      });
    } else if (headerTitle === 'piano cedolare') {
      table.find('tbody tr').each((__, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length >= 3) {
          const date = $(cells[0]).text().trim();
          const isoDate = italianDateToIso(date);
          const formula = $(cells[1]).text().trim();
          const ratePercent = parseItalianNumber($(cells[2]).text());
          if (date && isoDate) {
            couponSchedule.push({ date, isoDate, formula, ratePercent });
          }
        }
      });
    } else if (headerTitle === 'flussi di cassa') {
      table.find('tbody tr').each((__, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length >= 3) {
          const date = $(cells[0]).text().trim();
          const isoDate = italianDateToIso(date);
          const description = $(cells[1]).text().trim();
          const amount = parseItalianNumber($(cells[2]).text());
          if (date && isoDate && description) {
            cashflows.push({
              date,
              isoDate,
              description,
              amount,
              category: classifyCashflow(description),
            });
          }
        }
      });
    }
  });

  const isin = keyValueMap.get('codice isin') ?? '';
  const description = keyValueMap.get('descrizione') ?? '';

  if (!isin || !description) {
    throw new Error(
      'Impossibile estrarre i dati del titolo da questa pagina. Verifica che il link sia una scheda titolo valida di simpletoolsforinvestors.eu.'
    );
  }

  const settlementDate = keyValueMap.get('data di regolamento') ?? '';
  const maturityDate = keyValueMap.get('data rimborso') ?? '';
  const baseQuantity = parseItalianNumber(keyValueMap.get("quantita' regolata")) || 10000;
  const settlementPrice = parseItalianNumber(keyValueMap.get('prezzo di regolamento'));
  const explicitCoupon = parseOptionalItalianNumber(keyValueMap.get('tasso cedolare'));
  const inferredCoupon =
    explicitCoupon ??
    (couponSchedule.length > 0
      ? couponSchedule[couponSchedule.length - 1].ratePercent
      : inferCouponRateFromDescription(description));

  const explicitFreq = keyValueMap.get('periodicità cedola');
  const couponFrequency = explicitFreq || inferFrequencyFromCashflows(cashflows);

  const parsedTaxRate = parseOptionalItalianNumber(
    keyValueMap.get('tassazione applicata')
  );
  let resolvedTaxRate = parsedTaxRate;
  if (resolvedTaxRate === null) {
    const grossSum = cashflows
      .filter((cf) => cf.category === 'coupon_gross')
      .reduce((s, cf) => s + cf.amount, 0);
    const taxSum = cashflows
      .filter((cf) => cf.category === 'coupon_tax')
      .reduce((s, cf) => s + Math.abs(cf.amount), 0);
    resolvedTaxRate =
      grossSum > 0 ? Math.round((taxSum / grossSum) * 10000) / 100 : 12.5;
  }

  return {
    bondId: target.bondId,
    marketCode: target.marketCode,
    sourceUrl: target.canonicalUrl,
    fetchedAt: new Date().toISOString(),

    settlementDate,
    settlementIsoDate: italianDateToIso(settlementDate),
    settlementPrice,
    baseQuantity,
    baseCommissions: parseItalianNumber(keyValueMap.get('commissioni di negoziazione')),

    bondType: keyValueMap.get('tipo titolo') ?? 'Obbligazione',
    isin,
    description,
    currency: (keyValueMap.get('divisa di emissione') ?? 'EUR').toUpperCase(),
    minLot: parseItalianNumber(keyValueMap.get('taglio minimo')) || 1000,
    issueDate: keyValueMap.get('data emissione') ?? '',
    issuePrice: parseItalianNumber(keyValueMap.get('prezzo emissione')),
    maturityDate,
    maturityIsoDate: italianDateToIso(maturityDate),
    redemptionPrice: parseItalianNumber(keyValueMap.get('prezzo rimborso')) || 100,
    couponRate: inferredCoupon,
    couponFrequency,
    accrualConvention: keyValueMap.get('convenzione calcolo rateo') ?? 'ACT/ACT',
    disaggioConvention: keyValueMap.get('convenzione calcolo disaggio') ?? 'ACT/ACT',
    taxRate: resolvedTaxRate,

    grossYield,
    netYield,
    netYieldNoCg,
    grossDuration,
    netDuration,

    iSpread: parseOptionalItalianNumber(keyValueMap.get('i-spread')),
    zSpread: parseOptionalItalianNumber(keyValueMap.get('z-spread')),
    capitalGainTaxBase: parseItalianNumber(keyValueMap.get('tassazione capital gain')),
    settlementCountervalueBase:
      parseItalianNumber(keyValueMap.get('controvalore di regolamento')) ||
      (settlementPrice / 100) * baseQuantity,
    totalCashflowBalanceBase: parseItalianNumber(
      keyValueMap.get('saldo totale flussi di cassa')
    ),

    couponSchedule,
    cashflows,
  };
}
