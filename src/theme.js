// Chart colours. Channel hues are data categories (kept recognisable from the previous version);
// they are the only multi-hue element in the UI.
export const CHANNEL_COLORS = {
  'Hot - Blinkit': '#E0773F',
  'KK - Zepto': '#8688C9',
  'Scootsy - Swiggy': '#4FB59E',
  Amazon: '#E2B14A',
  BB: '#5E9FD0',
  B2B: '#3E8F86',
  GT: '#98AD4A',
  MT: '#7C86B8',
  FC: '#D9604C',
  FKM: '#C28FB0',
  Others: '#8E9C94',
};
export const CHANNEL_ORDER = ['Hot - Blinkit', 'KK - Zepto', 'Scootsy - Swiggy', 'Amazon', 'BB', 'B2B', 'GT', 'MT', 'FC', 'FKM'];
export const PLATFORM_COLORS = {
  Blinkit: '#E0773F', Zepto: '#8688C9', Swiggy: '#4FB59E', B2B: '#3E8F86', GT: '#98AD4A',
  MT: '#7C86B8', 'Big Basket': '#E2B14A', Ecom: '#C28FB0', Other: '#8E9C94',
};
export const SKU_CHANNEL_COLORS = { Blinkit: '#E0773F', Zepto: '#8688C9', Swiggy: '#4FB59E', BB: '#5E9FD0', Amazon: '#E2B14A' };
export const SKU_CHANNEL_ORDER = ['Blinkit', 'Zepto', 'Swiggy', 'BB', 'Amazon'];

export const STATUS_TONE = {
  Delivered: 'good', Kunafa: 'good', 'In-Transit': 'info', Pending: 'warn', Hold: 'warn',
  Cancelled: 'bad', RTO: 'bad', Duplicate: 'neutral', Other: 'neutral',
};
export const STATUS_ORDER = ['Delivered', 'In-Transit', 'Pending', 'Hold', 'Cancelled', 'RTO', 'Kunafa', 'Duplicate', 'Other'];

// Chart chrome reads CSS variables so it follows the light/dark theme without re-rendering.
export const chartTheme = {
  grid: 'var(--chart-grid)',
  tick: 'var(--chart-tick)',
  accent: 'var(--accent)',
  accent2: 'var(--warn)',
  good: 'var(--good)',
  bad: 'var(--bad)',
  cursor: { fill: 'var(--hover)' },
  tooltip: { background: 'var(--tooltip-bg)', border: '1px solid var(--line-strong)', borderRadius: 14, fontSize: 12, color: 'var(--text)', padding: '10px 14px', boxShadow: 'var(--shadow-pop)' },
};
