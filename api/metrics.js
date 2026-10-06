// GET /api/metrics - read-only numbers for other dashboards. Free to call (no AI), reads the Google Sheet
// server-side, calculates with the same code as the dashboard, and caches for 5 minutes.
// Documented in INTEGRATION.txt. Env vars: GOOGLE_SHEETS_API_KEY (or VITE_GOOGLE_API_KEY), SHEET_ID (optional),
// METRICS_TOKEN (optional but recommended: when set, callers must send it), ALLOWED_ORIGINS (optional).
import { timingSafeEqual } from 'node:crypto';
import { buildTimeData } from '../src/lib/aggregate.js';
import { toRows } from '../src/lib/rows.js';
import { sheetValuesUrl } from '../src/lib/sheetConfig.js';
import { buildPayload } from '../src/lib/metrics.js';

const CACHE_MS = 5 * 60 * 1000;
const MIN_REFRESH_MS = 30 * 1000; // ?refresh=1 cannot hit Google more often than this
let cache = null; // { at, td, rowsRead, issues, noPoDate }

function authorised(req) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return true; // open, like the dashboard itself; set METRICS_TOKEN to lock it
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-api-key'] || '');
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function loadFromSheet() {
  const keyName = Object.keys(process.env).find((n) => /^google_sheets_api_key$/i.test(n) && process.env[n])
    || Object.keys(process.env).find((n) => /^vite_google_api_key$/i.test(n) && process.env[n]);
  const apiKey = keyName ? process.env[keyName] : '';
  if (!apiKey) throw Object.assign(new Error('No Google Sheets API key on the server (GOOGLE_SHEETS_API_KEY).'), { code: 500 });
  const res = await fetch(sheetValuesUrl({ apiKey, spreadsheetId: process.env.SHEET_ID || undefined }), { signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `Sheets API error ${res.status}`), { code: 502 });
  const rows = toRows(json.values || []);
  return {
    at: Date.now(), td: buildTimeData(rows), rowsRead: rows.length, issues: rows.issues || { futurePo: 0 },
    noPoDate: rows.filter((r) => !r.poDate).length - (rows.issues?.futurePo || 0),
  };
}

export default async function handler(req, res) {
  const allowedOrigins = [
    'https://adityasanghavi-sys.github.io',
    'https://snackible-ops-dashboard.vercel.app',
    'https://snackible-ops-dashboard-new.vercel.app',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized. Send the token as "Authorization: Bearer <token>" or "x-api-key".' });

  const query = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const age = cache ? Date.now() - cache.at : Infinity;
  const wantRefresh = query.refresh === '1' || query.refresh === 'true';
  let stale = false;

  if (!cache || age > CACHE_MS || (wantRefresh && age > MIN_REFRESH_MS)) {
    try {
      cache = await loadFromSheet();
    } catch (err) {
      if (!cache) return res.status(err.code || 502).json({ error: err.message });
      stale = true; // serve the last good data rather than failing, and say so
    }
  }

  const { status, body } = buildPayload(cache.td, query);
  res.setHeader('Cache-Control', process.env.METRICS_TOKEN ? 'private, max-age=60' : 'public, s-maxage=300, stale-while-revalidate=60');
  return res.status(status).json({
    meta: {
      generated_at: new Date(cache.at).toISOString(),
      cache_age_seconds: Math.round((Date.now() - cache.at) / 1000),
      stale,
      source: 'google-sheets',
      timezone: 'UTC',
      rows_read: cache.rowsRead,
      rows_excluded_future_po_date: cache.issues.futurePo,
      rows_excluded_no_po_date: cache.noPoDate,
    },
    ...body,
  });
}
