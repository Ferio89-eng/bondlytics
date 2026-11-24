export interface CanonicalBondTarget {
  bondId: string;
  marketCode: string;
  canonicalUrl: string;
}

const ALLOWED_HOSTNAMES = new Set([
  'www.simpletoolsforinvestors.eu',
  'simpletoolsforinvestors.eu',
]);

/**
 * Validates a SimpleToolsForInvestors URL and returns the canonical details.php link.
 * Only details.php or compute.php on that host, with a numeric bondid, are accepted.
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
