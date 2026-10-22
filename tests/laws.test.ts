import { describe, expect, it } from 'vitest';
import { lawFor, STATES } from '../src/lib/laws';
import { findNotice } from '../src/lib/disclosure';

describe('laws', () => {
  it('covers all 50 states and DC', () => {
    expect(Object.keys(STATES)).toHaveLength(51);
    for (const code of Object.keys(STATES)) {
      const l = lawFor(code);
      expect(l?.headline).toBeTruthy();
      expect(l?.report.url).toMatch(/^https:\/\//);
    }
  });
  it('special states', () => {
    expect(lawFor('MD')?.status).toBe('banned');
    expect(lawFor('NY')?.status).toBe('must-disclose');
    expect(lawFor('CT')?.status).toBe('coming');
    expect(lawFor('VA')?.status).toBe('none');
  });
  it('unknown input', () => {
    expect(lawFor('')).toBeNull();
    expect(lawFor('ZZ')).toBeNull();
    expect(lawFor(undefined)).toBeNull();
    expect(lawFor('toString')).toBeNull();
  });
});

describe('findNotice', () => {
  it('finds the NY and CT wording in any case and spacing', () => {
    expect(findNotice('Total. THIS PRICE WAS SET BY AN   ALGORITHM USING YOUR PERSONAL DATA')?.law).toBe('New York');
    expect(findNotice('This price was increased using your personal data.')?.law).toBe('Connecticut');
  });
  it('ignores normal pages', () => {
    expect(findNotice('Free shipping on orders over $35. Price match guarantee.')).toBeNull();
  });
});
