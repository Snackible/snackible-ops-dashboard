// ─── Data source ──────────────────────────────────────────────────────────
// 'sheets'     : read the Google Sheet directly through the Sheets API v4 (default; needs SHEETS.apiKey).
// 'appsscript' : the legacy Apps Script feed, kept as a fallback for comparing numbers.
export const DATA_SOURCE = 'sheets';

// Still used for the Shopify B2C tab, because that data is not in the spreadsheet.
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyVeaKeSXazGacJubRBqciQk5bfv6F0V1-uND3VTlx-hZlpUHU-oJ_zuGE-UuKhVeI/exec';

// Vercel serverless function in /api/claude.js (proxied to production in `npm run dev`).
export const CLAUDE_PROXY_URL = '/api/claude';
// Vercel serverless function in /api/gemini.js (needs the Gemini_Api_Key env var).
export const GEMINI_PROXY_URL = '/api/gemini';
// Model used when you paste your own key in the AI panel (the server function has its own constant in api/gemini.js).
export const GEMINI_MODEL = 'gemini-3.8-flash';

// ─── Google Sheets API ────────────────────────────────────────────────────
// SETUP (one-off):
//  1. console.cloud.google.com → create/select a project → APIs & Services → enable "Google Sheets API".
//  2. Credentials → Create credentials → API key.
//  3. Restrict the key: API restriction = Google Sheets API only; Application restriction = HTTP referrers
//     (your Vercel domain and http://localhost:5173/*).
//  4. Put the key in .env.local as VITE_GOOGLE_API_KEY=... (gitignored) and in Vercel → Settings → Environment Variables.
//  5. The spreadsheet must be viewable by "Anyone with the link" (it currently is). If you later make it
//     private, move these calls into /api with a service account instead; keys in browser code are public.
export const SHEETS = {
  spreadsheetId: '1ct1kv2f9TUknFw0eyFiI7RYpGDkZpMlroYMYlIadHM8',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY || 'YOUR_GOOGLE_API_KEY_HERE',
  mainTab: '2026', // gid 829034943, one row per PO / order line, SKU quantities in the trailing columns
  range: 'A1:CZ',
};

export const hasSheetsKey = () => SHEETS.apiKey && !SHEETS.apiKey.startsWith('YOUR_');
