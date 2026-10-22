import { joinParts, parsePrice } from './price';
import type { Found } from './extract';

export interface Adapter {
  id: string;
  name: string;
  hosts: RegExp;
  read: (doc: Document) => Found[];
  title: (doc: Document) => string | null;
  /** Stores that load prices from their own API after the page opens. */
  api?: PriceApi;
}

export interface PriceApi {
  /** Price calls to try for this page: the one you'd make, and the one a brand-new visitor would make. */
  calls: (doc: Document, pageUrl: string) => { mine: string; fresh: () => string }[];
  /** Reads this product's price out of the reply. */
  read: (body: string, pageUrl: string) => number | null;
}

/** A random id, like the one a store hands a first-time visitor. */
export function newVisitorId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 160) : null;
};

/** First selector that holds a real price. */
function bySelectors(doc: Document, source: string, selectors: string[]): Found | null {
  for (const sel of selectors) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const c = parsePrice(el.getAttribute('content') ?? el.getAttribute('value') ?? el.textContent);
      if (c !== null && c > 0) return { cents: c, source };
    }
  }
  return null;
}

function json(doc: Document, selector: string): unknown {
  const t = doc.querySelector(selector)?.textContent;
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function dig(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

const keep = (...xs: (Found | null)[]) => xs.filter((x): x is Found => x !== null);

export const amazon: Adapter = {
  id: 'amazon',
  name: 'Amazon',
  hosts: /(^|\.)amazon\.com$/i,
  read: (doc) =>
    keep(
      bySelectors(doc, 'amazon:buybox', [
        '#corePrice_feature_div .a-price .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
        '.apexPriceToPay .a-offscreen',
        '#tp_price_block_total_price_ww .a-offscreen',
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        '#price_inside_buybox',
      ]) ??
        (() => {
          const box = doc.querySelector('#corePriceDisplay_desktop_feature_div .priceToPay, #corePrice_feature_div .a-price');
          const c = joinParts(
            box?.querySelector('.a-price-whole')?.textContent,
            box?.querySelector('.a-price-fraction')?.textContent,
          );
          return c ? { cents: c, source: 'amazon:buybox' } : null;
        })(),
      bySelectors(doc, 'amazon:twister', ['input#twister-plus-price-data-price']),
    ),
  title: (doc) => clean(doc.querySelector('#productTitle')?.textContent),
};

export const walmart: Adapter = {
  id: 'walmart',
  name: 'Walmart',
  hosts: /(^|\.)walmart\.com$/i,
  read: (doc) => {
    const next = json(doc, 'script#__NEXT_DATA__');
    const p = dig(next, ['props', 'pageProps', 'initialData', 'data', 'product', 'priceInfo', 'currentPrice', 'price']);
    const fromNext = parsePrice(p as number | string | null);
    return keep(
      fromNext !== null ? { cents: fromNext, source: 'walmart:data' } : null,
      bySelectors(doc, 'walmart:hero', ['span[data-seo-id="hero-price"]', '[data-testid="price-wrap"] [itemprop="price"]']),
    );
  },
  title: (doc) => clean(doc.querySelector('h1#main-title, h1[itemprop="name"]')?.textContent),
};

export const target: Adapter = {
  id: 'target',
  name: 'Target',
  hosts: /(^|\.)target\.com$/i,
  // the page draws its price after loading, so the on-screen price is only used to know it's a product
  read: (doc) => keep(bySelectors(doc, 'target:hero', ['[data-test="product-price"]'])),
  title: (doc) => clean(doc.querySelector('h1[data-test="product-title"]')?.textContent),
  api: {
    calls: (doc, pageUrl) => {
      const tcin = targetTcin(pageUrl);
      if (!tcin) return [];
      const cookie = doc.cookie ?? '';
      const visitor = cookie.match(/(?:^|;\s*)visitorId=([^;]+)/)?.[1] ?? '';
      const fiats = safeDecode(cookie.match(/(?:^|;\s*)fiatsCookie=([^;]+)/)?.[1] ?? '');
      const store = fiats.match(/DSI_(\d+)/)?.[1] ?? '';
      const build = (key: string, visitorId: string) => {
        const u = new URL('https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1');
        u.searchParams.set('key', key);
        u.searchParams.set('tcin', tcin);
        u.searchParams.set('is_bot', 'false');
        if (store) {
          u.searchParams.set('store_id', store);
          u.searchParams.set('pricing_store_id', store);
        }
        u.searchParams.set('visitor_id', visitorId);
        u.searchParams.set('channel', 'WEB');
        u.searchParams.set('page', `/p/A-${tcin}`);
        return u.toString();
      };
      // visitor_id is how Target recognises you; a stranger gets a brand-new one
      return targetKeys(doc).map((key) => ({
        mine: build(key, visitor || newVisitorId()),
        fresh: () => build(key, newVisitorId()),
      }));
    },
    read: (body, pageUrl) => {
      const tcin = targetTcin(pageUrl);
      if (!tcin) return null;
      const at = body.indexOf(`"tcin":"${tcin}"`);
      if (at < 0) return null;
      const near = body.slice(at, at + 20000);
      const m = near.match(/"current_retail":\s*([\d.]+)/) ?? near.match(/"formatted_current_price":\s*"\$([\d.,]+)"/);
      return m?.[1] ? parsePrice(m[1]) : null;
    },
  },
};

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The public web keys Target's own page uses, most used first. */
function targetKeys(doc: Document): string[] {
  const html = doc.documentElement?.innerHTML ?? '';
  const count = new Map<string, number>();
  for (const m of html.matchAll(/apiKey\\*"\s*:\s*\\*"([0-9a-f]{40})/g)) {
    if (m[1]) count.set(m[1], (count.get(m[1]) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 3);
}

function targetTcin(pageUrl: string): string | null {
  return pageUrl.match(/\/A-(\d{5,})/)?.[1] ?? null;
}

export const bestbuy: Adapter = {
  id: 'bestbuy',
  name: 'Best Buy',
  hosts: /(^|\.)bestbuy\.com$/i,
  // the page also holds price blocks for other products, so we only trust its structured data
  read: () => [],
  title: (doc) => clean(doc.querySelector('h1')?.textContent),
};

export const homedepot: Adapter = {
  id: 'homedepot',
  name: 'Home Depot',
  hosts: /(^|\.)homedepot\.com$/i,
  read: () => [],
  title: (doc) => clean(doc.querySelector('h1')?.textContent),
};

export const ADAPTERS: Adapter[] = [amazon, walmart, target, bestbuy, homedepot];

export function adapterFor(host: string): Adapter | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  return ADAPTERS.find((a) => a.hosts.test(h)) ?? null;
}
