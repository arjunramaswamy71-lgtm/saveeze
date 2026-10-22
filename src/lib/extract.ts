import { parsePrice } from './price';
import { ADAPTERS, adapterFor } from './adapters';

/** One price we found on a page, and where we found it. */
export interface Found {
  cents: number;
  /** e.g. "amazon:buybox", "jsonld", "meta" */
  source: string;
}

export interface PageRead {
  store: string | null;
  title: string | null;
  prices: Found[];
}

/** Reads every price we can find, best source first. */
export function readPage(doc: Document, host: string): PageRead {
  const adapter = adapterFor(host);
  const prices: Found[] = [];
  const seen = new Set<string>();
  const add = (f: Found | null) => {
    if (f && f.cents > 0 && !seen.has(f.source)) {
      seen.add(f.source);
      prices.push(f);
    }
  };

  if (adapter) for (const f of adapter.read(doc)) add(f);
  add(fromJsonLd(doc));
  add(fromMeta(doc));

  const title =
    adapter?.title(doc) ??
    textOf(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) ??
    textOf(doc.querySelector('h1')?.textContent) ??
    null;

  return { store: adapter?.name ?? null, title, prices };
}

/** Picks the first source both reads agree on, so we always compare like with like. */
export function commonSource(a: PageRead, b: PageRead): { source: string; a: number; b: number } | null {
  for (const fa of a.prices) {
    const fb = b.prices.find((p) => p.source === fa.source);
    if (fb) return { source: fa.source, a: fa.cents, b: fb.cents };
  }
  return null;
}

// ---------- structured data ----------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function fromJsonLd(doc: Document): Found | null {
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: Json;
    try {
      data = JSON.parse(s.textContent ?? '') as Json;
    } catch {
      continue;
    }
    const cents = findProductPrice(data, 0);
    if (cents !== null) return { cents, source: 'jsonld' };
  }
  return null;
}

function isObj(v: Json): v is { [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasType(o: { [k: string]: Json }, t: string): boolean {
  const ty = o['@type'];
  if (typeof ty === 'string') return ty.toLowerCase() === t.toLowerCase();
  if (Array.isArray(ty)) return ty.some((x) => typeof x === 'string' && x.toLowerCase() === t.toLowerCase());
  return false;
}

function findProductPrice(node: Json, depth: number): number | null {
  if (depth > 8 || node === null) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const c = findProductPrice(n, depth + 1);
      if (c !== null) return c;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (hasType(node, 'Product') || hasType(node, 'ProductGroup')) {
    const c = offerPrice(node['offers'] ?? null);
    if (c !== null) return c;
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasVariant']) {
    const c = findProductPrice(node[key] ?? null, depth + 1);
    if (c !== null) return c;
  }
  return null;
}

function offerPrice(offers: Json): number | null {
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!isObj(o)) continue;
    const cur = o['priceCurrency'];
    if (typeof cur === 'string' && cur && cur.toUpperCase() !== 'USD') continue;
    const direct = parsePrice(o['price'] ?? o['lowPrice'] ?? null);
    if (direct !== null) return direct;
    const spec = o['priceSpecification'];
    const specs = Array.isArray(spec) ? spec : [spec ?? null];
    for (const sp of specs) {
      if (isObj(sp)) {
        const c = parsePrice(sp['price'] ?? null);
        if (c !== null) return c;
      }
    }
  }
  return null;
}

export function fromMeta(doc: Document): Found | null {
  const sel = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
    '[itemprop="price"][content]',
  ];
  for (const s of sel) {
    const el = doc.querySelector(s);
    const c = parsePrice(el?.getAttribute('content') ?? null);
    if (c !== null) return { cents: c, source: 'meta' };
  }
  return null;
}

export function textOf(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 160) : null;
}

export { ADAPTERS };
