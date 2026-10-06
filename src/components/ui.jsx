import { useState } from 'react';
import { CHANNEL_COLORS, PLATFORM_COLORS } from '../theme.js';

export function Card({ title, sub, actions, children, className = '', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const Badge = ({ tone = 'neutral', children }) => <span className={`badge ${tone}`}>{children}</span>;

export function Kpi({ label, value, sub, badge, children }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      {children || <span className="kpi-value num">{value}</span>}
      {sub && <span className="kpi-sub">{sub}</span>}
      {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
    </div>
  );
}

const toneColor = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };
export function FillBar({ rate, tone }) {
  const t = tone || (rate >= 0.95 ? 'good' : rate >= 0.85 ? 'warn' : 'bad');
  return (
    <div className="bar">
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(rate * 100, 100)}%`, background: toneColor[t] }} /></div>
      <span className="num" style={{ color: toneColor[t], fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{(rate * 100).toFixed(1)}%</span>
    </div>
  );
}

export const Dot = ({ name }) => <span className="ch-dot" style={{ background: CHANNEL_COLORS[name] || PLATFORM_COLORS[name] || '#8E9C94' }} />;

export function Skeleton({ h = 120, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading data">
      <Skeleton h={64} />
      <div className="grid g-kpi">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={108} />)}</div>
      <div className="grid g-2-1"><Skeleton h={340} /><Skeleton h={340} /></div>
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', hint }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

// dismissible banners hide until `resetKey` changes (e.g. a new period), so a fresh issue still shows.
export function Banner({ tone = 'info', title, text, children, dismissible = false, resetKey = '' }) {
  const [hiddenFor, setHiddenFor] = useState(null);
  if (dismissible && hiddenFor === String(resetKey)) return null;
  return (
    <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <div style={{ flex: 1 }}>
        <div className="banner-title">{title}</div>
        {text && <div className="banner-text">{text}</div>}
        {children}
      </div>
      {dismissible && (
        <button type="button" className="banner-close" aria-label="Dismiss notice" onClick={() => setHiddenFor(String(resetKey))}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
        </button>
      )}
    </div>
  );
}

// Expandable table row used by the state → city drill-downs.
export function useExpand() {
  const [open, setOpen] = useState({});
  return [open, (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))];
}

export function Delta({ now, prior, suffix = '% vs prior' }) {
  if (!prior) return <Badge tone="neutral">First period</Badge>;
  const p = ((now - prior) / prior) * 100;
  return <Badge tone={p >= 0 ? 'good' : 'bad'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}{suffix}</Badge>;
}

export function Spark({ values, color }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }} aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max((v / max) * 100, 4)}%`, background: color, opacity: i === values.length - 1 ? 1 : 0.35 + (i / values.length) * 0.4, borderRadius: '2px 2px 0 0' }} />
      ))}
    </div>
  );
}
