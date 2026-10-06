# Snackible Operations Dashboard

React (Vite) + Recharts. The previous vanilla version is kept in `legacy/` for reference.

```bash
npm install
npm run dev      # http://localhost:5173  (/api is proxied to the deployed Vercel function)
npm run build    # outputs dist/, which Vercel serves; /api/claude.js stays a serverless function
```

## Data sources (`src/config.js`)

`DATA_SOURCE = 'sheets'` (default) reads the Google Sheet directly and calculates everything in the browser
(`src/lib/sheetsApi.js` → `src/lib/aggregate.js`). The app shows a setup message until an API key is added.
`DATA_SOURCE = 'appsscript'` goes back to the legacy feed. Only the Shopify tab still calls the Apps Script.

### Setting up the Google Sheets API
1. Google Cloud Console → create or pick a project → **APIs & Services → Enable APIs** → *Google Sheets API*.
2. **Credentials → Create credentials → API key.**
3. Restrict the key: API restriction = *Google Sheets API*; application restriction = HTTP referrers
   (your Vercel domain and `http://localhost:5173/*`).
4. Replace `YOUR_GOOGLE_API_KEY_HERE` in `SHEETS.apiKey` in `src/config.js`.
5. Keep the spreadsheet shared as *Anyone with the link: Viewer*. A key in browser code is public, so if the
   sheet becomes private, move the fetch into `/api` and use a service account.

Sheet: `1ct1kv2f9TUknFw0eyFiI7RYpGDkZpMlroYMYlIadHM8`, main tab `2026`. Columns are matched by header name.
The sheet has no Shopify data, so the Shopify tab needs the Apps Script feed.

## Notes
- Channel and status spellings are normalised (`Hot`/`HOT`, `kk`/`KK`, `pending`/`Pending`, `RTO - Delivered`…).
- When State is blank it is derived from Location (`src/lib/normalize.js`); unknown locations show as "Unmapped".
- PO dates more than 60 days in the future, or before 2024, are treated as missing.
- `api/claude.js` needs `ANTHROPIC_API_KEY` in the Vercel project settings for the AI panel.

- Set `VITE_GOOGLE_API_KEY` in `.env.local` locally and in Vercel project settings for production (the key is never committed).
