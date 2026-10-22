import { commonSource, readPage, type PageRead } from './extract';
import { adapterFor } from './adapters';
import { decide, type UnknownReason, type Verdict } from './verdict';
import { findNotice, type Notice } from './disclosure';

export interface CheckResult {
  url: string;
  store: string | null;
  title: string | null;
  verdict: Verdict;
  /** which part of the page both prices came from */
  source: string | null;
  notice: Notice | null;
  checkedAt: number;
}

const BLOCK_SIGNS = /robot check|captcha|access denied|are you a human|press & hold|verify you are human|unusual traffic/i;

export interface Fetched {
  ok: boolean;
  blocked: boolean;
  read: PageRead | null;
}

export type Getter = (url: string, withYou: boolean, accept?: string) => Promise<{ ok: boolean; status: number; html: string }>;

/** The real network call. withYou=false sends no cookies and keeps nothing, like a stranger. */
export const browserGet: Getter = async (url, withYou, accept = 'text/html') => {
  try {
    const res = await fetch(url, {
      credentials: withYou ? 'include' : 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: accept },
    });
    return { ok: res.ok, status: res.status, html: await res.text() };
  } catch {
    return { ok: false, status: 0, html: '' };
  }
};

export function parseHtml(html: string, host: string): PageRead {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return readPage(doc, host);
}

async function grab(get: Getter, url: string, host: string, withYou: boolean): Promise<Fetched> {
  const r = await get(url, withYou);
  if (!r.html) return { ok: false, blocked: r.status === 403 || r.status === 429, read: null };
  const read = parseHtml(r.html, host);
  const blocked = (!r.ok || read.prices.length === 0) && (BLOCK_SIGNS.test(r.html.slice(0, 20000)) || r.status === 403 || r.status === 429 || r.status === 503);
  return { ok: r.ok, blocked, read };
}

/**
 * Checks the page you are on.
 * Your copy and two stranger copies are fetched at the same moment, then read the same way,
 * so the only thing that differs between them is whether the store knows it's you.
 */
export async function runCheck(doc: Document, url: string, get: Getter = browserGet): Promise<CheckResult> {
  const host = new URL(url).hostname;
  const live = readPage(doc, host);
  const notice = findNotice(doc.body?.innerText ?? doc.body?.textContent ?? '');
  const base = { url, store: live.store, title: live.title, notice, checkedAt: Date.now() };

  const fail = (reason: UnknownReason): CheckResult => ({
    ...base,
    source: null,
    verdict: decide(null, [], reason),
  });

  if (live.prices.length === 0) return fail('not-product');

  // Some stores (Target) only load the price from their API after the page opens.
  const adapter = adapterFor(host);
  if (adapter?.api) {
    for (const call of adapter.api.calls(doc, url)) {
      const m = await get(call.mine, true, 'application/json');
      const mine = adapter.api.read(m.html, url);
      if (mine === null) continue;
      const [f1, f2] = await Promise.all([
        get(call.fresh(), false, 'application/json'),
        get(call.fresh(), false, 'application/json'),
      ]);
      const fresh = [adapter.api.read(f1.html, url), adapter.api.read(f2.html, url)].filter(
        (x): x is number => x !== null,
      );
      if (fresh.length > 0) return { ...base, source: `${adapter.id}:api`, verdict: decide(mine, fresh) };
    }
  }

  const [mine, fresh1, fresh2] = await Promise.all([
    grab(get, url, host, true),
    grab(get, url, host, false),
    grab(get, url, host, false),
  ]);

  if (!fresh1.read || fresh1.read.prices.length === 0) return fail(fresh1.blocked ? 'blocked' : 'no-price');

  // Compare your copy with the stranger copy. If your copy came back without a price
  // (some stores draw it later with scripts), fall back to what is on your screen.
  const yoursRead = mine.read && mine.read.prices.length > 0 ? mine.read : live;
  const pair = commonSource(yoursRead, fresh1.read) ?? commonSource(live, fresh1.read);
  if (!pair) return fail('no-match');

  const second = fresh2.read?.prices.find((p) => p.source === pair.source)?.cents;
  const fresh = second === undefined ? [pair.b] : [pair.b, second];

  return { ...base, store: live.store ?? fresh1.read.store, title: live.title ?? fresh1.read.title, source: pair.source, verdict: decide(pair.a, fresh) };
}
