// Money is kept in whole cents so 0.1 + 0.2 never bites us.

/**
 * Turns price text like "$1,299.99", "1299.99", "USD 12.50" or "$5" into cents.
 * Returns null for anything that isn't a single clear price.
 */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : null;
  }
  if (typeof raw !== 'string') return null;

  const text = raw.replace(/ /g, ' ').trim();
  if (!text) return null;

  // a range like "$10 - $20" or "from $9" is not one price
  if (/\d\s*(-|–|—|to)\s*\$?\s*\d/i.test(text)) return null;

  const match = text.match(/\d[\d,]*(?:\.\d+)?|\.\d+/);
  if (!match) return null;

  const cleaned = match[0].replace(/,/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000) return null;
  return Math.round(value * 100);
}

/** Builds a price from Amazon-style split parts: whole "1,299" and fraction "99". */
export function joinParts(whole: string | null | undefined, fraction: string | null | undefined): number | null {
  if (!whole) return null;
  const w = whole.replace(/[^\d]/g, '');
  if (!w) return null;
  const f = (fraction ?? '').replace(/[^\d]/g, '').padEnd(2, '0').slice(0, 2);
  return parsePrice(`${w}.${f || '00'}`);
}

/** Cents to "$1,299.99". */
export function formatPrice(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}
