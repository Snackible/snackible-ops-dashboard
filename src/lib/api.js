import { APPS_SCRIPT_URL, CLAUDE_PROXY_URL, GEMINI_PROXY_URL, GEMINI_MODEL, DATA_SOURCE } from '../config.js';
import { fetchSheetRows } from './sheetsApi.js';
import { buildTimeData, buildRange } from './aggregate.js';

import { normChannel } from './normalize.js';

// Apps Script uses short channel names and keeps the sheet's case variants (Hot / HOT, KK / kk).
// Rename to the UI names and merge variants that collapse onto the same channel.
function mergeInto(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = { ...a };
    Object.keys(b).forEach((k) => { out[k] = k in a ? mergeInto(a[k], b[k]) : b[k]; });
    return out;
  }
  return a;
}
function normKeys(obj, fill) {
  if (!obj) return obj;
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    const n = normChannel(k) || k;
    out[n] = n in out ? mergeInto(out[n], v) : v;
  });
  if (fill) Object.values(out).forEach((v) => { if (v && 'po' in v) { v.rate = v.po > 0 ? v.inv / v.po : 0; v.short = Math.max(0, v.po - v.inv); } });
  return out;
}
export function applyNameMap(block) {
  block.channels = normKeys(block.channels);
  block.channel_fill = normKeys(block.channel_fill, true);
  block.channel_val = normKeys(block.channel_val);
  block.channel_sku = normKeys(block.channel_sku);
  if (block.channel_tat) block.channel_tat = normKeys(block.channel_tat);
  if (block.daily_inv) Object.keys(block.daily_inv).forEach((day) => { block.daily_inv[day] = normKeys(block.daily_inv[day]); });
  return block;
}

async function getJson(query = '') {
  const res = await fetch(APPS_SCRIPT_URL + query);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error('Apps Script returned a web page instead of data. Redeploy it as a new version and retry.');
  }
  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

// Apps Script may wrap a range response under a few different keys.
const unwrap = (data, keys) => {
  if (data.weekly && data.monthly) throw new Error('Apps Script returned the full dashboard instead of a single range.');
  for (const k of keys) {
    const hit = k.split('.').reduce((o, p) => o?.[p], data);
    if (hit) return hit;
  }
  return data;
};

export async function loadAll() {
  if (DATA_SOURCE === 'sheets') {
    const rows = await fetchSheetRows();
    return buildTimeData(rows);
  }
  const raw = await getJson();
  ['daily', 'weekly', 'monthly'].forEach((m) => raw[m] && Object.values(raw[m]).forEach(applyNameMap));
  raw.shopify = null;
  raw.sku_analysis = null;
  return raw;
}

// Slower, non-blocking extras (Apps Script only; the Sheets source computes these locally).
export const loadShopify = () => getJson('?action=shopify');
export const loadSkuAnalysis = () => getJson('?action=sku_analysis');

export async function loadMtd(data) {
  if (DATA_SOURCE === 'sheets') {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return buildRange(data.rows, start, now.toISOString().slice(0, 10));
  }
  const res = await getJson('?action=mtd');
  return applyNameMap(unwrap(res, ['mtd.MTD', 'MTD']));
}

export async function loadCustom(data, start, end) {
  if (DATA_SOURCE === 'sheets') return buildRange(data.rows, start, end);
  const res = await getJson(`?action=custom&start=${start}&end=${end}`);
  return applyNameMap(unwrap(res, ['custom.Custom Range', `custom.${start} → ${end}`, 'Custom Range']));
}

// ── Retry with backoff ──────────────────────────────────────────────────────
// Temporary failures (busy model, rate limits, network blips) are retried with exponential backoff and jitter.
// Rejected requests aren't billed, so waiting costs nothing. Permanent errors (bad key, bad model) fail at once.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'DEADLINE_EXCEEDED']);

function apiError(res, data, fallback) {
  const raw = data?.error;
  const err = new Error(typeof raw === 'string' ? raw : raw?.message || fallback);
  err.status = res.status;
  err.transient = TRANSIENT_STATUS.has(res.status) || TRANSIENT_CODES.has(raw?.status) || /high demand|overloaded|temporarily|try again later/i.test(err.message);
  err.retryAfter = parseFloat(res.headers.get('retry-after')) || 0;
  return err;
}
const isTransient = (e) => e?.transient === true || e instanceof TypeError; // TypeError = network failure

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
});

export async function withRetry(fn, { retries = 5, onWait, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(signal);
    } catch (e) {
      if (e.name === 'AbortError' || attempt >= retries || !isTransient(e)) throw e;
      const base = Math.min(2000 * 2 ** attempt, 30000); // 2s, 4s, 8s, 16s, 30s
      const wait = e.retryAfter ? e.retryAfter * 1000 : base * (0.75 + Math.random() * 0.5);
      onWait?.({ attempt: attempt + 1, retries, ms: wait, until: Date.now() + wait });
      await sleep(wait, signal);
    }
  }
}

// A Gemini key pasted into the AI panel lives in sessionStorage only (gone when the tab closes).
const SESSION_KEY = 'gemini-session-key';
export const getSessionGeminiKey = () => { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } };
export const setSessionGeminiKey = (k) => { try { k ? sessionStorage.setItem(SESSION_KEY, k.trim()) : sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ } };

// Calls Gemini straight from the browser with the user's own session key.
async function askGeminiDirect({ key, system, messages, max_tokens, json, signal }) {
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] })),
    generationConfig: { maxOutputTokens: Math.max(max_tokens, 4096), temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw apiError(res, data, 'Gemini rejected the request. Check the key.');
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error(data.promptFeedback?.blockReason ? `Blocked by Gemini: ${data.promptFeedback.blockReason}` : 'Gemini returned an empty reply.');
  return text;
}

// provider: 'claude' | 'gemini'. Both proxies take the same body and return { content: [{ text }] }.
// Pass onWait / signal to retry temporary failures with a countdown and allow cancelling.
export async function askAi({ provider = 'claude', system, messages, max_tokens = 1000, json = false, onWait, signal }) {
  const name = provider === 'gemini' ? 'Gemini' : 'Claude';
  const sessionKey = provider === 'gemini' ? getSessionGeminiKey() : '';
  return withRetry(async (sig) => {
    if (sessionKey) return askGeminiDirect({ key: sessionKey, system, messages, max_tokens, json, signal: sig });
    const res = await fetch(provider === 'gemini' ? GEMINI_PROXY_URL : CLAUDE_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens, system, messages, json }),
      signal: sig,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw apiError(res, data, res.status === 404 ? `The ${name} endpoint isn't deployed here yet.` : `The ${name} request failed.`);
    return data.content?.[0]?.text || '';
  }, { onWait, signal });
}
