import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatPrice, joinParts, parsePrice } from '../src/lib/price';

describe('parsePrice', () => {
  it.each([
    ['$49.99', 4999],
    ['$1,299.99', 129999],
    ['Now $23.97', 2397],
    ['USD 12.5', 1250],
    ['$5', 500],
    ['  $0.99 ', 99],
    ['.99', 99],
    ['1,000,000.00', 100000000],
    [23.97, 2397],
    [45, 4500],
  ])('%s -> %s cents', (input, cents) => {
    expect(parsePrice(input)).toBe(cents);
  });

  it.each(['', 'free', 'Price not available', '$10 - $20', '$9 to $12', null, undefined, NaN, -5, {}])(
    'rejects %s',
    (input) => {
      expect(parsePrice(input as unknown)).toBeNull();
    },
  );

  it('never throws on any text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parsePrice(s);
        expect(r === null || (Number.isInteger(r) && r >= 0)).toBe(true);
      }),
    );
  });

  it('reads back every price it formats', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999 }), (cents) => {
        expect(parsePrice(formatPrice(cents))).toBe(cents);
      }),
    );
  });
});

describe('joinParts', () => {
  it('joins whole and fraction', () => {
    expect(joinParts('1,299.', '5')).toBe(129950);
    expect(joinParts('49', '99')).toBe(4999);
    expect(joinParts('49', null)).toBe(4900);
    expect(joinParts('', '99')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats cents', () => {
    expect(formatPrice(129999)).toBe('$1,299.99');
    expect(formatPrice(5)).toBe('$0.05');
    expect(formatPrice(-250)).toBe('-$2.50');
  });
});
