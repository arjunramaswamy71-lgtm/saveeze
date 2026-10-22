import { describe, expect, it } from 'vitest';
import { commonSource, readPage } from '../src/lib/extract';
import { adapterFor, target } from '../src/lib/adapters';
import { doc, fixture } from './helpers';

describe('store pages', () => {
  it('Amazon buy box price, not the crossed-out one', () => {
    const r = readPage(doc(fixture('amazon.html')), 'www.amazon.com');
    expect(r.store).toBe('Amazon');
    expect(r.title).toBe('Amazon Echo Dot (5th Gen) Smart speaker with Alexa');
    expect(r.prices[0]).toEqual({ cents: 4999, source: 'amazon:buybox' });
    expect(r.prices.find((p) => p.source === 'amazon:twister')?.cents).toBe(4999);
  });

  it('Amazon split whole/fraction price', () => {
    const r = readPage(doc(fixture('amazon-split.html')), 'amazon.com');
    expect(r.prices[0]).toEqual({ cents: 129950, source: 'amazon:buybox' });
  });

  it('Walmart page data and hero price', () => {
    const r = readPage(doc(fixture('walmart.html')), 'www.walmart.com');
    expect(r.store).toBe('Walmart');
    expect(r.prices.map((p) => p.source)).toEqual(['walmart:data', 'walmart:hero']);
    expect(r.prices.every((p) => p.cents === 2397)).toBe(true);
  });

  it('Target on-screen price', () => {
    const r = readPage(doc(fixture('target.html')), 'www.target.com');
    expect(r.prices[0]).toEqual({ cents: 4500, source: 'target:hero' });
    expect(r.title).toBe('Stanley 40oz Quencher H2.0 Tumbler');
  });

  it('Best Buy uses the main product data, not other products on the page', () => {
    const r = readPage(doc(fixture('bestbuy.html')), 'www.bestbuy.com');
    expect(r.store).toBe('Best Buy');
    expect(r.prices).toEqual([{ cents: 32999, source: 'jsonld' }]);
  });

  it('Home Depot structured data', () => {
    const r = readPage(doc(fixture('homedepot.html')), 'www.homedepot.com');
    expect(r.prices.find((p) => p.source === 'jsonld')?.cents).toBe(9900);
  });

  it('any shop with schema.org data picks the USD offer', () => {
    const r = readPage(doc(fixture('generic.html')), 'shop.example');
    expect(r.store).toBeNull();
    expect(r.title).toBe('Linen Shirt');
    expect(r.prices).toEqual([
      { cents: 4250, source: 'jsonld' },
      { cents: 4250, source: 'meta' },
    ]);
  });

  it('a page with no price finds nothing', () => {
    expect(readPage(doc(fixture('captcha.html')), 'www.amazon.com').prices).toEqual([]);
  });

  it('broken JSON-LD does not crash', () => {
    const d = doc('<script type="application/ld+json">{not json</script><meta property="og:price:amount" content="5">');
    expect(readPage(d, 'x.com').prices).toEqual([{ cents: 500, source: 'meta' }]);
  });
});

describe('adapterFor', () => {
  it('matches stores and subdomains only', () => {
    expect(adapterFor('www.amazon.com')?.id).toBe('amazon');
    expect(adapterFor('smile.amazon.com')?.id).toBe('amazon');
    expect(adapterFor('amazon.com.evil.net')).toBeNull();
    expect(adapterFor('notwalmart.com')).toBeNull();
    expect(adapterFor('WWW.BESTBUY.COM')?.id).toBe('bestbuy');
  });
});

describe('commonSource', () => {
  it('compares like with like', () => {
    const a = { store: null, title: null, prices: [{ cents: 100, source: 'x' }, { cents: 200, source: 'jsonld' }] };
    const b = { store: null, title: null, prices: [{ cents: 190, source: 'jsonld' }] };
    expect(commonSource(a, b)).toEqual({ source: 'jsonld', a: 200, b: 190 });
    expect(commonSource(a, { store: null, title: null, prices: [] })).toBeNull();
  });
});

describe('Target price API', () => {
  const page = 'https://www.target.com/p/simple-modern-tumbler/-/A-93794668';
  const api = target.api!;
  const KEY = 'a'.repeat(40);
  const OTHER = 'b'.repeat(40);
  const html = `<script>window.__CONFIG__=JSON.parse("{\\"apiKey\\":\\"${OTHER}\\",\\"x\\":{\\"apiKey\\":\\"${KEY}\\"},\\"y\\":{\\"apiKey\\":\\"${KEY}\\"}}")</script><span data-test="product-price">$23.49</span>`;

  it('builds your call and a stranger call, most used key first', () => {
    const calls = api.calls(doc(html), page);
    expect(calls).toHaveLength(2);
    const mine = new URL(calls[0]!.mine);
    expect(mine.searchParams.get('key')).toBe(KEY);
    expect(mine.searchParams.get('tcin')).toBe('93794668');
    const a = new URL(calls[0]!.fresh()).searchParams.get('visitor_id');
    const b = new URL(calls[0]!.fresh()).searchParams.get('visitor_id');
    expect(a).toMatch(/^[0-9A-F]{32}$/);
    expect(a).not.toBe(b);
  });

  it('no calls off a product page', () => {
    expect(api.calls(doc(html), 'https://www.target.com/c/home')).toEqual([]);
  });

  it('reads this product price, not a neighbour', () => {
    const body =
      '{"products":[{"tcin":"11111111","price":{"current_retail":9.99}},{"__typename":"ProductSummary","tcin":"93794668","price":{"current_retail":23.49,"display_was_now":false}}]}';
    expect(api.read(body, page)).toBe(2349);
    expect(api.read('{"tcin":"93794668","price":{"formatted_current_price":"$19.00"}}', page)).toBe(1900);
    expect(api.read('{}', page)).toBeNull();
  });
});
