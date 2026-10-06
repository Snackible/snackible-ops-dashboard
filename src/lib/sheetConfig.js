// Where the ops data lives. Pure constants, safe to import from both the browser app and the /api functions
// (src/config.js is browser-only because it reads import.meta.env).
export const SHEET_ID = '1ct1kv2f9TUknFw0eyFiI7RYpGDkZpMlroYMYlIadHM8';
export const MAIN_TAB = '2026'; // gid 829034943, one row per PO / order line, SKU quantities in the trailing columns
export const RANGE = 'A1:CZ';

export function sheetValuesUrl({ apiKey, spreadsheetId = SHEET_ID, tab = MAIN_TAB, range = RANGE }) {
  return (
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tab}'!${range}`)}` +
    `?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`
  );
}
