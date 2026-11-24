export function formatEur(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatCurrency(
  value: number,
  currency: string,
  decimals = 2
): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safe);
  } catch {
    return `${formatNumber(safe, decimals)} ${currency}`;
  }
}

export function formatNumber(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
}

export function formatPercent(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe)}%`;
}

export const ITALIAN_MONTHS_SHORT = [
  'Gen',
  'Feb',
  'Mar',
  'Apr',
  'Mag',
  'Giu',
  'Lug',
  'Ago',
  'Set',
  'Ott',
  'Nov',
  'Dic',
];

export const ITALIAN_MONTHS_LONG = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

export const PORTFOLIO_PALETTE = [
  '#0F766E', // Deep Teal
  '#0284C7', // Cobalt Blue
  '#B45309', // Warm Ochre
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#0369A1', // Ocean
  '#BE123C', // Rose Crimson
];

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const SOVEREIGN_RULES: [RegExp, string][] = [
  [/^(ROMANIA|ROMANIAN)\b/, 'Romania'],
  [/^(UNGHERIA|HUNGARY|HUNGARIAN)\b/, 'Ungheria'],
  [/^(FRANCIA|FRANCE|OAT|BTAN)\b/, 'Francia'],
  [/^(GERMANIA|GERMANY|BUND|BOBL|SCHATZ)\b/, 'Germania'],
  [/^(SPAGNA|SPAIN|BONOS|OBLIGACIONES)\b/, 'Spagna'],
  [/^(PORTOGALLO|PORTUGAL)\b/, 'Portogallo'],
  [/^(AUSTRIA|REPUBLIC OF AUSTRIA)\b/, 'Austria'],
  [/^(BELGIO|BELGIUM|OLO)\b/, 'Belgio'],
  [/^(OLANDA|PAESI BASSI|NETHERLANDS)\b/, 'Paesi Bassi'],
  [/^(POLONIA|POLAND)\b/, 'Polonia'],
  [/^(GRECIA|GREECE)\b/, 'Grecia'],
  [/^(BULGARIA)\b/, 'Bulgaria'],
  [/^(CROAZIA|CROATIA)\b/, 'Croazia'],
  [/^(IRLANDA|IRELAND)\b/, 'Irlanda'],
  [/^(FINLANDIA|FINLAND)\b/, 'Finlandia'],
  [/^(SLOVACCHIA|SLOVAKIA)\b/, 'Slovacchia'],
  [/^(SLOVENIA)\b/, 'Slovenia'],
  [/^(LETTONIA|LATVIA)\b/, 'Lettonia'],
  [/^(LITUANIA|LITHUANIA)\b/, 'Lituania'],
  [/^(ESTONIA)\b/, 'Estonia'],
  [/^(TURCHIA|TURKEY|TURKIYE)\b/, 'Turchia'],
  [/^(MESSICO|MEXICO)\b/, 'Messico'],
  [/^(BRASILE|BRAZIL)\b/, 'Brasile'],
  [/^(US TREASURY|T-NOTE|T-BOND|USA|UNITED STATES)\b/, 'Stati Uniti'],
  [/^(UK|GILT|UNITED KINGDOM)\b/, 'Regno Unito'],
  [/^(SVIZZERA|SWITZERLAND)\b/, 'Svizzera'],
  [/^(NORVEGIA|NORWAY)\b/, 'Norvegia'],
  [/^(SVEZIA|SWEDEN)\b/, 'Svezia'],
];

/** Government bond (titolo di Stato), Italian or foreign. Corporates and supranationals return null. */
export function sovereignIssuerName(description: string): string | null {
  const upper = description.trim().toUpperCase();
  if (
    /^(BTP|BOT|CCT|CTZ)\b/.test(upper) ||
    upper.startsWith('ITALIA') ||
    upper.startsWith('REPUBLIC OF ITALY') ||
    upper.startsWith('ITALY')
  ) {
    return 'Italia';
  }
  for (const [pattern, label] of SOVEREIGN_RULES) {
    if (pattern.test(upper)) return label;
  }
  return null;
}

export function isTitoloDiStato(description: string, _isin = ''): boolean {
  return sovereignIssuerName(description) !== null;
}

/**
 * Extracts normalized issuer / sovereign name from a SimpleToolsForInvestors bond description & ISIN.
 */
export function extractIssuerName(description: string, isin = ''): string {
  const upper = description.trim().toUpperCase();
  const upperIsin = isin.trim().toUpperCase();

  const sovereign = sovereignIssuerName(description);
  if (sovereign) return sovereign;

  // European Union / Supranationals are not titoli di Stato.
  if (
    /^EU\b/.test(upper) ||
    upper.startsWith('EUROPEAN UNION') ||
    upper.startsWith('UNIONE EUROPEA') ||
    upper.startsWith('NEXTGENERATION') ||
    upperIsin.startsWith('EU000')
  ) {
    return 'EU';
  }
  if (/^(BEI|EIB)\b/.test(upper) || upper.startsWith('EUROPEAN INVESTMENT BANK')) {
    return 'BEI';
  }

  // Fallback for corporate or other bonds: strip date (DD/MM/YYYY or DD/MM/YY) and coupon onwards
  const beforeDate = description
    .split(/\s+\d{2}\/\d{2}\/\d{2,4}/)[0]
    .split(/\s+\d+(?:[.,]\d+)?%/)[0]
    .trim();

  if (beforeDate) {
    return toTitleCase(beforeDate);
  }

  return upperIsin.slice(0, 2) || 'Altro';
}

