import { useCallback, useEffect, useRef, useState } from 'react';
import { DATA_SOURCE } from '../config.js';
import { loadAll, loadShopify, loadSkuAnalysis, loadMtd, loadCustom } from '../lib/api.js';

const FIVE_MIN = 5 * 60 * 1000;

// Loads everything once, then refreshes on demand or every `autoMinutes` (0 = manual only).
// Background refreshes are silent: current data stays on screen until the new data arrives.
export function useDashboardData(autoMinutes = 5) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [extras, setExtras] = useState({ shopify: null, sku_analysis: null });
  const alive = useRef(true);
  const busy = useRef(false);
  const last = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (busy.current) return;
    busy.current = true;
    if (silent) setRefreshing(true);
    else { setStatus('loading'); setError(''); }
    try {
      const d = await loadAll();
      if (!alive.current) return;
      setData(d);
      // Keep what we already have for extras the sheet doesn't provide.
      setExtras((e) => ({ shopify: d.shopify || e.shopify, sku_analysis: d.sku_analysis || e.sku_analysis }));
      setStatus('ready');
      setRefreshError('');
      last.current = Date.now();
      setUpdatedAt(new Date());
      // Shopify lives only in the Apps Script feed; SKU analysis is computed from the sheet when DATA_SOURCE is 'sheets'.
      loadShopify().then((s) => alive.current && setExtras((e) => ({ ...e, shopify: s }))).catch(() => alive.current && setExtras((e) => (e.shopify ? e : { ...e, shopify: { monthly: null } })));
      if (DATA_SOURCE !== 'sheets') {
        loadSkuAnalysis().then((s) => alive.current && setExtras((e) => ({ ...e, sku_analysis: s }))).catch(() => {});
      }
    } catch (e) {
      if (!alive.current) return;
      if (silent) setRefreshError(e.message || 'Refresh failed.'); // keep showing the last good data
      else { setError(e.message || 'Could not load data.'); setStatus('error'); }
    } finally {
      busy.current = false;
      if (alive.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // Auto-refresh: only while the tab is visible, and catch up when it becomes visible again after being stale.
  useEffect(() => {
    if (!autoMinutes) return undefined;
    const every = autoMinutes * 60 * 1000 || FIVE_MIN;
    const tick = () => { if (!document.hidden && status === 'ready') load({ silent: true }); };
    const onVisible = () => { if (!document.hidden && status === 'ready' && Date.now() - last.current >= every) load({ silent: true }); };
    const id = setInterval(tick, every);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [autoMinutes, status, load]);

  const fetchMtd = useCallback(() => loadMtd(data), [data]);
  const fetchCustom = useCallback((s, e) => loadCustom(data, s, e), [data]);
  const refresh = useCallback(() => load({ silent: true }), [load]);

  return { data, extras, status, error, reload: load, refresh, refreshing, refreshError, updatedAt, fetchMtd, fetchCustom };
}
