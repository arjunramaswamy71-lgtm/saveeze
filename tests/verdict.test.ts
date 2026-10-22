import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { badgeFor, decide, isSame } from '../src/lib/verdict';

describe('decide', () => {
  it('paying more', () => {
    const v = decide(1000, [899, 899]);
    expect(v).toMatchObject({ kind: 'more', yours: 1000, fresh: 899, diff: 101, pct: 11.2 });
    expect(badgeFor(v).text).toBe('+11%');
  });
  it('getting less', () => {
    expect(decide(900, [1000])).toMatchObject({ kind: 'less', pct: -10 });
  });
  it('fair, including tiny rounding gaps', () => {
    expect(decide(4999, [4999, 4999]).kind).toBe('fair');
    expect(decide(100000, [100300]).kind).toBe('fair');
    expect(decide(100, [101]).kind).toBe('fair');
  });
  it('two fresh shoppers disagree means prices are moving for everyone', () => {
    expect(decide(1000, [900, 1000]).kind).toBe('shifting');
  });
  it('unknown without data', () => {
    expect(decide(null, [500], 'blocked')).toMatchObject({ kind: 'unknown', reason: 'blocked' });
    expect(decide(500, []).kind).toBe('unknown');
  });
  it('the sign of pct always matches the verdict', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 1, max: 10_000_000 }), (a, b) => {
        const v = decide(a, [b]);
        if (v.kind === 'more') expect(v.pct! >= 0 && a > b).toBe(true);
        if (v.kind === 'less') expect(v.pct! <= 0 && a < b).toBe(true);
        if (v.kind === 'fair') expect(isSame(a, b)).toBe(true);
      }),
    );
  });
  it('badge never longer than 4 characters', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 1, max: 1e9 }), (a, b) => {
        expect(badgeFor(decide(a, [b])).text.length).toBeLessThanOrEqual(4);
      }),
    );
  });
});
