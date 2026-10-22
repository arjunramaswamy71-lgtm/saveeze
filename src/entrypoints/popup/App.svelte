<script lang="ts">
  import { onMount } from 'svelte';
  import type { CheckResult } from '@/lib/check';
  import { badgeFor } from '@/lib/verdict';
  import { formatPrice } from '@/lib/price';
  import { lawFor, STATES } from '@/lib/laws';

  type Phase = 'checking' | 'done' | 'error';

  let phase = $state<Phase>('checking');
  let result = $state<CheckResult | null>(null);
  let stateCode = $state<string>('');

  const law = $derived(lawFor(stateCode));
  const v = $derived(result?.verdict ?? null);

  async function targetTab(): Promise<number | null> {
    const fromUrl = new URLSearchParams(location.search).get('tabId');
    if (fromUrl) return Number(fromUrl);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  }

  async function check() {
    phase = 'checking';
    result = null;
    const tabId = await targetTab();
    if (tabId === null) {
      phase = 'error';
      return;
    }
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['/checker.js'] });
      const [out] = await browser.scripting.executeScript({
        target: { tabId },
        func: () => (globalThis as unknown as { __saveezeCheck: () => Promise<unknown> }).__saveezeCheck(),
      });
      result = (out?.result ?? null) as CheckResult | null;
      phase = result ? 'done' : 'error';
      if (result) {
        const b = badgeFor(result.verdict);
        await browser.action.setBadgeBackgroundColor({ tabId, color: b.color });
        await browser.action.setBadgeText({ tabId, text: b.text });
      }
    } catch {
      // pages like the browser's own settings or the web store can't be checked
      phase = 'error';
    }
  }

  async function pickState(e: Event) {
    stateCode = (e.currentTarget as HTMLSelectElement).value;
    await browser.storage.local.set({ state: stateCode });
  }

  onMount(async () => {
    const saved = await browser.storage.local.get('state');
    if (typeof saved.state === 'string') stateCode = saved.state;
    await check();
  });

  const money = (c: number | null) => (c === null ? '—' : formatPrice(c));
  const pct = (p: number | null) => (p === null ? '' : `${p > 0 ? '+' : ''}${p.toFixed(1)}%`);
</script>

<main>
  <header>
    <div class="brand" aria-label="savEEZE">
      <span class="sav">SAV</span><span class="eeze">EEZE</span>
    </div>
    {#if result?.store}<span class="store">{result.store}</span>{/if}
  </header>

  {#if phase === 'checking'}
    <section class="card center" data-state="checking">
      <div class="pulse" aria-hidden="true"></div>
      <p class="big">Checking this price…</p>
      <p class="muted">Loading it as you and as a fresh shopper at the same moment.</p>
    </section>
  {:else if phase === 'error' || !v}
    <section class="card center" data-state="error">
      <p class="big">Can't check this page</p>
      <p class="muted">Open a product page on a store and click savEEZE again.</p>
    </section>
  {:else}
    <section class="card verdict {v.kind}" data-state={v.kind}>
      {#if v.kind === 'more'}
        <p class="tag">You're paying more</p>
        <p class="hero">{pct(v.pct)}</p>
        <p>You see <b>{money(v.yours)}</b>. A fresh shopper sees <b>{money(v.fresh)}</b>, which is <b>{money(v.diff)}</b> less.</p>
      {:else if v.kind === 'less'}
        <p class="tag">You're getting a better deal</p>
        <p class="hero">{pct(v.pct)}</p>
        <p>You see <b>{money(v.yours)}</b>. A fresh shopper sees <b>{money(v.fresh)}</b>. Probably a member or sign-in discount.</p>
      {:else if v.kind === 'fair'}
        <p class="tag">Fair price</p>
        <p class="hero">✓</p>
        <p>You see <b>{money(v.yours)}</b>, the same as a fresh shopper.</p>
      {:else if v.kind === 'shifting'}
        <p class="tag">Price is moving</p>
        <p class="hero">~</p>
        <p>This store gave two fresh shoppers different prices just now, so it's testing or changing prices for everyone. Check again in a minute.</p>
      {:else}
        <p class="tag">Couldn't compare</p>
        <p>
          {#if v.reason === 'not-product'}This doesn't look like a product page. Open one and click again.
          {:else if v.reason === 'blocked'}The store blocked the fresh-shopper check. Try again in a bit.
          {:else}We couldn't read the same price both ways on this page yet.{/if}
        </p>
      {/if}
    </section>

    {#if v.kind === 'more'}
      <section class="card tips">
        <p class="label">Get the fresh price</p>
        <ol>
          <li>Open this page in a private or incognito window.</li>
          <li>Or sign out and clear this site's cookies.</li>
          <li>Check again before you buy.</li>
        </ol>
      </section>
    {/if}

    {#if result?.notice}
      <section class="card notice">
        <p class="label">⚠ This page admits it</p>
        <p class="muted">"{result.notice.text}"</p>
      </section>
    {/if}
  {/if}

  <section class="card law">
    <div class="row">
      <p class="label">The law where you live</p>
      <select aria-label="Your state" value={stateCode} onchange={pickState}>
        <option value="">Pick your state</option>
        {#each Object.entries(STATES) as [code, name]}<option value={code}>{name}</option>{/each}
      </select>
    </div>
    {#if law}
      <p class="lawhead {law.status}">{law.headline}</p>
      <p class="muted">{law.detail}</p>
      <a href={law.report.url} target="_blank" rel="noreferrer">{law.report.label} →</a>
    {/if}
  </section>

  <footer>
    <button onclick={check} disabled={phase === 'checking'}>Check again</button>
    <span>Checked on your device. Nothing leaves it.</span>
  </footer>
</main>

<style>
  main { padding: 14px; display: grid; gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .brand { font: italic 900 26px/1 'Exo Black', system-ui, sans-serif; letter-spacing: -0.5px; }
  .sav { background: linear-gradient(180deg, #7debff, var(--cyan) 45%, var(--cyan-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .eeze { color: #fff; margin-left: -1px; }
  .store { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  .card p { margin: 0; }
  .center { text-align: center; display: grid; gap: 6px; justify-items: center; padding: 22px 14px; }
  .big { font-size: 16px; font-weight: 700; }
  .muted { color: var(--muted); font-size: 13px; }
  .label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }

  .pulse { width: 46px; height: 24px; border-radius: 6px; background: linear-gradient(90deg, var(--cyan-deep), var(--cyan)); clip-path: polygon(0 50%, 22% 0, 100% 0, 100% 100%, 22% 100%); animation: pulse 1s ease-in-out infinite alternate; }
  @keyframes pulse { from { opacity: 0.35; transform: translateX(-4px); } to { opacity: 1; transform: translateX(4px); } }

  .verdict { display: grid; gap: 6px; }
  .verdict .tag { font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .verdict .hero { font: italic 900 46px/1 'Exo Black', system-ui, sans-serif; }
  .more { border-color: #5a1f24; background: linear-gradient(180deg, #1d0c0f, var(--panel)); }
  .more .tag, .more .hero { color: var(--red); }
  .less .tag, .less .hero { color: var(--cyan); }
  .fair { border-color: #174a31; background: linear-gradient(180deg, #0b1d14, var(--panel)); }
  .fair .tag, .fair .hero { color: var(--green); }
  .shifting .tag, .shifting .hero { color: var(--amber); }
  .unknown .tag { color: var(--muted); }

  .tips ol { margin: 6px 0 0; padding-left: 18px; color: var(--muted); font-size: 13px; }
  .notice { border-color: #5c4513; }
  .notice .label { color: var(--amber); }

  .law { display: grid; gap: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  select { background: #0a1117; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; max-width: 150px; }
  .lawhead { font-weight: 800; }
  .lawhead.banned { color: var(--green); }
  .lawhead.must-disclose, .lawhead.coming { color: var(--amber); }
  .lawhead.none { color: var(--text); }
  .law a { font-size: 13px; font-weight: 600; }

  footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
  button { background: linear-gradient(180deg, var(--cyan), var(--cyan-deep)); color: #001018; border: 0; border-radius: 9px; padding: 7px 12px; font-weight: 800; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
