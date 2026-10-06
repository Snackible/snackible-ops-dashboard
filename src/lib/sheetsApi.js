import { SHEETS, hasSheetsKey } from '../config.js';
import { sheetValuesUrl } from './sheetConfig.js';
import { toRows } from './rows.js';

// Parsing lives in rows.js so the server can share it; re-exported here for existing imports.
export { parseDate, toRows } from './rows.js';

export async function fetchSheetRows() {
  if (!hasSheetsKey()) {
    throw new Error('Google API key not set. Set VITE_GOOGLE_API_KEY (see the setup steps in src/config.js).');
  }
  const res = await fetch(sheetValuesUrl({ apiKey: SHEETS.apiKey, spreadsheetId: SHEETS.spreadsheetId, tab: SHEETS.mainTab, range: SHEETS.range }));
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Sheets API error ${res.status}`);
  return toRows(json.values || []);
}
