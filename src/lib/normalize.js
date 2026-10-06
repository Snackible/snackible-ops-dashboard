// Cleans the label drift found in the ops sheet (case, spacing, spelling variants).

const CHANNEL = {
  hot: 'Hot - Blinkit', blinkit: 'Hot - Blinkit',
  kk: 'KK - Zepto', zepto: 'KK - Zepto',
  scootsy: 'Scootsy - Swiggy', swiggy: 'Scootsy - Swiggy',
  amazon: 'Amazon', b2b: 'B2B', bb: 'BB', gt: 'GT', mt: 'MT', fc: 'FC', fkm: 'FKM',
};
export const normChannel = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return CHANNEL[s.toLowerCase()] || s;
};

export const normStatus = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('rto')) return 'RTO';
  if (s.startsWith('cancel')) return 'Cancelled';
  if (s.startsWith('deliver')) return 'Delivered';
  if (s.replace(/[\s-]/g, '') === 'intransit') return 'In-Transit';
  if (s.startsWith('pending')) return 'Pending';
  if (s.startsWith('hold')) return 'Hold';
  if (s.startsWith('dup')) return 'Duplicate';
  if (s.startsWith('kunafa')) return 'Kunafa';
  return 'Other';
};

// Channel → the platform bucket used in the "Revenue by order type" donut and SKU analysis.
export const PLATFORM = {
  'Hot - Blinkit': 'Blinkit', 'KK - Zepto': 'Zepto', 'Scootsy - Swiggy': 'Swiggy',
  BB: 'Big Basket', Amazon: 'Ecom', FKM: 'Ecom', B2B: 'B2B', GT: 'GT', MT: 'MT', FC: 'Other',
};
export const platformOf = (ch) => PLATFORM[ch] || 'Other';

// Location keyword → state, used when the sheet's State column is empty (66% of rows).
const STATE_KEYWORDS = [
  ['bangalore', 'Karnataka'], ['bengaluru', 'Karnataka'], ['mysore', 'Karnataka'], ['hubli', 'Karnataka'], ['karnataka', 'Karnataka'],
  ['mumbai', 'Maharashtra'], ['bhiwandi', 'Maharashtra'], ['pune', 'Maharashtra'], ['nagpur', 'Maharashtra'], ['nashik', 'Maharashtra'], ['maharashtra', 'Maharashtra'],
  ['farukhnagar', 'Haryana'], ['kundli', 'Haryana'], ['jhajjar', 'Haryana'], ['faridabad', 'Haryana'], ['gurgaon', 'Haryana'], ['gurugram', 'Haryana'], ['sonipat', 'Haryana'], ['haryana', 'Haryana'],
  ['dasna', 'Uttar Pradesh'], ['noida', 'Uttar Pradesh'], ['ghaziabad', 'Uttar Pradesh'], ['lucknow', 'Uttar Pradesh'], ['kanpur', 'Uttar Pradesh'], ['agra', 'Uttar Pradesh'], ['uttar pradesh', 'Uttar Pradesh'],
  ['delhi', 'Delhi'],
  ['hyderabad', 'Telangana'], ['telangana', 'Telangana'],
  ['chennai', 'Tamil Nadu'], ['coimbatore', 'Tamil Nadu'], ['madurai', 'Tamil Nadu'], ['tamil nadu', 'Tamil Nadu'],
  ['kolkata', 'West Bengal'], ['west bengal', 'West Bengal'],
  ['goa', 'Goa'], ['dehradun', 'Uttarakhand'], ['rajpura', 'Punjab'], ['ludhiana', 'Punjab'], ['chandigarh', 'Chandigarh'], ['mohali', 'Punjab'],
  ['visakhapatnam', 'Andhra Pradesh'], ['vijayawada', 'Andhra Pradesh'], ['andhra', 'Andhra Pradesh'],
  ['ahmedabad', 'Gujarat'], ['surat', 'Gujarat'], ['vadodara', 'Gujarat'], ['gujarat', 'Gujarat'],
  ['jaipur', 'Rajasthan'], ['rajasthan', 'Rajasthan'], ['kochi', 'Kerala'], ['kerala', 'Kerala'],
  ['guwahati', 'Assam'], ['bhubaneswar', 'Odisha'], ['indore', 'Madhya Pradesh'], ['bhopal', 'Madhya Pradesh'], ['patna', 'Bihar'], ['ranchi', 'Jharkhand'], ['raipur', 'Chhattisgarh'],
];
export function deriveState(state, location) {
  const s = String(state ?? '').trim();
  if (s) return s;
  const l = String(location ?? '').toLowerCase();
  if (!l) return '';
  for (const [k, v] of STATE_KEYWORDS) if (l.includes(k)) return v;
  return 'Unmapped';
}
// "Mumbai M10 - Feeder Warehouse" → "Mumbai"
export function deriveCity(location) {
  const l = String(location ?? '')
    .replace(/\s*-\s*.*$/, '')
    .replace(/\s+[A-Z]\d+$/i, '')
    .replace(/\s+\d+$/, '')
    .trim();
  if (!l) return '';
  return l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
}
