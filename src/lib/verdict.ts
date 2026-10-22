export type VerdictKind = 'more' | 'less' | 'fair' | 'shifting' | 'unknown';

export interface Verdict {
  kind: VerdictKind;
  /** your price in cents */
  yours: number | null;
  /** what a fresh shopper got, in cents */
  fresh: number | null;
  /** how much more (or less, negative) you pay, in percent */
  pct: number | null;
  /** difference in cents, yours minus fresh */
  diff: number | null;
  /** why we couldn't decide, when kind is "unknown" */
  reason?: UnknownReason;
}

export type UnknownReason = 'no-price' | 'blocked' | 'no-match' | 'not-product';

/** Gaps this small are rounding, not a different price. */
export function isSame(a: number, b: number): boolean {
  const gap = Math.abs(a - b);
  return gap <= 1 || gap / Math.max(a, b) < 0.005;
}

/**
 * Decides what the two reads mean.
 * `fresh` holds two clean reads taken back to back. If even those two disagree,
 * the store is shuffling prices for everyone right now and we say so instead of guessing.
 */
export function decide(yours: number | null, fresh: number[], reason: UnknownReason = 'no-match'): Verdict {
  const base = { yours, fresh: fresh[0] ?? null, pct: null, diff: null };
  if (yours === null || fresh.length === 0) return { ...base, kind: 'unknown', reason };

  const [f1, f2] = fresh as [number, number | undefined];
  if (f2 !== undefined && !isSame(f1, f2)) return { ...base, fresh: f1, kind: 'shifting' };

  if (isSame(yours, f1)) return { yours, fresh: f1, pct: 0, diff: 0, kind: 'fair' };

  const diff = yours - f1;
  const pct = Math.round((diff / f1) * 1000) / 10;
  return { yours, fresh: f1, diff, pct, kind: diff > 0 ? 'more' : 'less' };
}

/** Short text for the toolbar badge. */
export function badgeFor(v: Verdict): { text: string; color: string } {
  switch (v.kind) {
    case 'more':
      return { text: `+${Math.min(99, Math.round(v.pct ?? 0))}%`, color: '#E5484D' };
    case 'less':
      return { text: `${Math.max(-99, Math.round(v.pct ?? 0))}%`, color: '#16AED5' };
    case 'fair':
      return { text: '✓', color: '#1F9D55' };
    case 'shifting':
      return { text: '~', color: '#B7791F' };
    default:
      return { text: '', color: '#000000' };
  }
}
