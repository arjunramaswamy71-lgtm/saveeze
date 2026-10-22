import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/lib/check';
import { doc, fixture } from './helpers';

const page = (price: string) =>
  `<html><head><script type="application/ld+json">{"@type":"Product","offers":{"price":"${price}","priceCurrency":"USD"}}</script></head><body><h1>Thing</h1></body></html>`;

type Reply = { ok: boolean; status: number; html: string };
const getter = (mine: Reply, fresh: Reply[]) => {
  let n = 0;
  return async (_url: string, withYou: boolean) => (withYou ? mine : (fresh[Math.min(n++, fresh.length - 1)] as Reply));
};
const ok = (html: string): Reply => ({ ok: true, status: 200, html });

describe('runCheck', () => {
  it('catches a higher price for you', async () => {
    const r = await runCheck(doc(page('10.00')), 'https://shop.test/p/1', getter(ok(page('10.00')), [ok(page('8.99'))]));
    expect(r.verdict).toMatchObject({ kind: 'more', yours: 1000, fresh: 899 });
    expect(r.source).toBe('jsonld');
  });

  it('fair when both match', async () => {
    const r = await runCheck(doc(page('5.00')), 'https://shop.test/p', getter(ok(page('5.00')), [ok(page('5.00'))]));
    expect(r.verdict.kind).toBe('fair');
  });

  it('flags moving prices when two fresh reads disagree', async () => {
    const r = await runCheck(doc(page('5.00')), 'https://shop.test/p', getter(ok(page('5.00')), [ok(page('4.00')), ok(page('5.00'))]));
    expect(r.verdict.kind).toBe('shifting');
  });

  it('says blocked when the store answers with a robot check', async () => {
    const r = await runCheck(doc(page('5.00')), 'https://www.amazon.com/dp/X', getter(ok(page('5.00')), [{ ok: false, status: 503, html: fixture('captcha.html') }]));
    expect(r.verdict).toMatchObject({ kind: 'unknown', reason: 'blocked' });
  });

  it('not a product page', async () => {
    const r = await runCheck(doc('<h1>Home</h1>'), 'https://shop.test/', getter(ok(''), [ok('')]));
    expect(r.verdict).toMatchObject({ kind: 'unknown', reason: 'not-product' });
  });

  it('falls back to your screen when your copy has no price yet', async () => {
    const r = await runCheck(doc(page('12.00')), 'https://shop.test/p', getter(ok('<html></html>'), [ok(page('12.00'))]));
    expect(r.verdict.kind).toBe('fair');
  });

  it('network failure is handled', async () => {
    const r = await runCheck(doc(page('12.00')), 'https://shop.test/p', getter({ ok: false, status: 0, html: '' }, [{ ok: false, status: 0, html: '' }]));
    expect(r.verdict).toMatchObject({ kind: 'unknown', reason: 'no-price' });
  });

  it('spots the New York warning on the page', async () => {
    const html = fixture('notice.html');
    const r = await runCheck(doc(html), 'https://shop.test/p', getter(ok(html), [ok(html)]));
    expect(r.notice?.law).toBe('New York');
  });
});

describe('runCheck with a store price API', () => {
  const pageUrl = 'https://www.target.com/p/x/-/A-93794668';
  const KEY = 'c'.repeat(40);
  const html = `<script>var c={"apiKey":"${KEY}"}</script><h1 data-test="product-title">Tumbler</h1><span data-test="product-price">$25.00</span>`;

  it('compares your API price with a fresh visitor', async () => {
    const seen: boolean[] = [];
    const get = async (u: string, withYou: boolean) => {
      seen.push(withYou);
      expect(new URL(u).searchParams.get('key')).toBe(KEY);
      const price = withYou ? 25 : 22.5;
      return { ok: true, status: 200, html: `{"tcin":"93794668","price":{"current_retail":${price}}}` };
    };
    const r = await runCheck(doc(html), pageUrl, get);
    expect(r.source).toBe('target:api');
    expect(r.verdict).toMatchObject({ kind: 'more', yours: 2500, fresh: 2250 });
    expect(seen).toEqual([true, false, false]);
  });

  it('falls back to the page when the API says no', async () => {
    const get = async () => ({ ok: false, status: 401, html: '{"errors":[]}' });
    const r = await runCheck(doc(html), pageUrl, get);
    expect(r.verdict.kind).toBe('unknown');
  });
});
