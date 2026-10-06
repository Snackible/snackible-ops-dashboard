import { useEffect, useMemo, useState } from 'react';
import { Banner, DashboardSkeleton, Empty } from './components/ui.jsx';
import { DATA_SOURCE } from './config.js';
import { useDashboardData } from './hooks/useDashboardData.js';
import { isMonthKey, monthKeySort, periodLabel } from './lib/format.js';
import Sales from './tabs/Sales.jsx';
import DeepDive from './tabs/DeepDive.jsx';
import Inventory from './tabs/Inventory.jsx';
import Ops from './tabs/Ops.jsx';
import PoTracker from './tabs/PoTracker.jsx';
import Delivered from './tabs/Delivered.jsx';
import Shopify from './tabs/Shopify.jsx';
import SkuAnalysis from './tabs/SkuAnalysis.jsx';

const TABS = [
  ['sales', 'Sales overview', Sales],
  ['deep-dive', 'Sales deep dive', DeepDive],
  ['inventory', 'Inventory and supply', Inventory],
  ['fulfilment', 'Fulfilment and TAT', Ops],
  ['po', 'PO tracker', PoTracker],
  ['delivered', 'Delivered', Delivered],
  ['shopify', 'Shopify B2C', Shopify],
  ['sku', 'SKU analysis', SkuAnalysis],
];
const MODES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['mtd', 'Month to date'], ['custom', 'Custom range']];
const tabFromHash = () => (TABS.find(([id]) => '#' + id === window.location.hash) || TABS[0])[0];
const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const { data, extras, status, error, reload, fetchMtd, fetchCustom } = useDashboardData();
  const [tab, setTab] = useState(tabFromHash);
  const [mode, setMode] = useState('weekly');
  const [picked, setPicked] = useState('');
  const [range, setRange] = useState({ key: '', block: null, loading: false, error: '' });
  const [custom, setCustom] = useState({ start: today().slice(0, 8) + '01', end: today() });

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id) => { window.location.hash = id; setTab(id); };

  // Start on the first period type that actually has data (the Apps Script feed can return an empty weekly bucket).
  const [modeChosen, setModeChosen] = useState(false);
  useEffect(() => {
    if (!data || modeChosen) return;
    setModeChosen(true);
    const first = ['weekly', 'monthly', 'daily'].find((m) => Object.values(data[m] || {}).some((b) => b.orders > 0));
    if (first) setMode(first);
  }, [data, modeChosen]);

  async function runRange(kind) {
    setRange({ key: '', block: null, loading: true, error: '' });
    try {
      if (kind === 'mtd') setRange({ key: 'MTD', block: await fetchMtd(), loading: false, error: '' });
      else {
        if (!custom.start || !custom.end || custom.start > custom.end) throw new Error('Choose a start date that is on or before the end date.');
        setRange({ key: `${custom.start} → ${custom.end}`, block: await fetchCustom(custom.start, custom.end), loading: false, error: '' });
      }
    } catch (e) {
      setRange({ key: '', block: null, loading: false, error: e.message });
    }
  }
  function changeMode(m) {
    setMode(m);
    setPicked('');
    setRange({ key: '', block: null, loading: false, error: '' });
    if (m === 'mtd') runRange('mtd');
  }

  const ctx = useMemo(() => {
    if (!data) return null;
    const isRange = mode === 'mtd' || mode === 'custom';
    const bucket = isRange ? (range.block ? { [range.key]: range.block } : {}) : data[mode] || {};
    let periods = Object.keys(bucket).filter((k) => bucket[k].orders > 0);
    periods = mode === 'monthly' ? periods.filter(isMonthKey).sort((a, b) => monthKeySort(b, a)) : periods.sort().reverse();
    const period = periods.includes(picked) ? picked : periods[0];
    const i = periods.indexOf(period);
    return {
      data, extras: { ...extras }, bucket, mode, periods, period, d: bucket[period],
      prev: isRange ? null : bucket[periods[i + 1]], label: period ? periodLabel(period, mode) : '',
      isLatest: i === 0 && !isRange,
    };
  }, [data, extras, mode, picked, range]);

  const Active = TABS.find(([id]) => id === tab)[2];
  const needsPeriod = !['delivered', 'shopify', 'sku'].includes(tab);
  const isRange = mode === 'mtd' || mode === 'custom';

  let body;
  if (status === 'loading') body = <DashboardSkeleton />;
  else if (status === 'error') {
    body = (
      <div className="card error-box">
        <h2 className="h1" style={{ fontSize: 20, marginBottom: 8 }}>Couldn't load the dashboard data</h2>
        <p className="c-muted" style={{ marginBottom: 16 }}>{error}</p>
        <p className="c-faint" style={{ marginBottom: 16, fontSize: 12 }}>Data source: {DATA_SOURCE === 'sheets' ? 'Google Sheets API' : 'Apps Script'}</p>
        <button className="btn" onClick={reload}>Try again</button>
      </div>
    );
  } else if (needsPeriod && !ctx.d) {
    body = range.loading ? <DashboardSkeleton /> : (
      <div className="stack">
        {range.error && <Banner tone="bad" title="That range didn't load" text={range.error} />}
        <Empty
          title={isRange ? 'Pick a range to load data' : `No ${mode} data from the ${DATA_SOURCE === 'sheets' ? 'sheet' : 'Apps Script feed'}`}
          hint={isRange ? 'Choose dates and press Apply.' : 'Try another period type from the menu above.'}
        />
      </div>
    );
  } else {
    body = (
      <>
        {data?.issues?.futurePo > 0 && (
          <div style={{ marginBottom: 18 }}>
            <Banner tone="info" title={`${data.issues.futurePo} rows left out: PO date is in the future`} text="These orders have a PO date after today, which is usually a typo in the sheet. They are excluded from the period views until the dates are corrected." />
          </div>
        )}
        {range.error && <div style={{ marginBottom: 18 }}><Banner tone="bad" title="That range didn't load" text={range.error} /></div>}
        <Active ctx={ctx} />
      </>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-row">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">S</div>
              <div><div className="brand-name">Snackible</div><div className="brand-sub">Operations</div></div>
            </div>
            {status === 'ready' && needsPeriod && (
              <div className="controls">
                <select className="field primary" aria-label="Period type" value={mode} onChange={(e) => changeMode(e.target.value)}>
                  {MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                {mode === 'custom' && (
                  <>
                    <input className="field" type="date" aria-label="Start date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
                    <input className="field" type="date" aria-label="End date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
                    <button className="btn" disabled={range.loading} onClick={() => runRange('custom')}>{range.loading ? 'Loading…' : 'Apply'}</button>
                  </>
                )}
                {!isRange && ctx?.periods.length > 0 && (
                  <select className="field" aria-label="Period" value={ctx.period} onChange={(e) => setPicked(e.target.value)}>
                    {ctx.periods.map((p, i) => <option key={p} value={p}>{periodLabel(p, mode)}{i === 0 ? ' (latest)' : ''}</option>)}
                  </select>
                )}
                {isRange && range.loading && <span className="c-faint">Loading…</span>}
              </div>
            )}
          </div>
          <nav className="tabs" role="tablist" aria-label="Dashboard sections">
            {TABS.map(([id, text]) => (
              <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => go(id)}>{text}</button>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="page">{body}</main>
      <footer className="page footer" style={{ paddingTop: 18, paddingBottom: 32 }}>
        <span>Source: {DATA_SOURCE === 'sheets' ? 'Google Sheets API, calculated in the browser' : 'Apps Script feed'} · period buckets use PO date</span>
        <button className="link-btn" onClick={reload}>Refresh data</button>
      </footer>
    </>
  );
}
