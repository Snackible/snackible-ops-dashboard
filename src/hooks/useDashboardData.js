import { useCallback, useEffect, useRef, useState } from 'react';
import { DATA_SOURCE } from '../config.js';
import { loadAll, loadShopify, loadSkuAnalysis, loadMtd, loadCustom } from '../lib/api.js';

// Loads everything once, then lazily fills the Shopify and SKU extras (Apps Script source).
export function useDashboardData() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [extras, setExtras] = useState({ shopify: null, sku_analysis: null });
  const alive = useRef(true);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const d = await loadAll();
      if (!alive.current) return;
      setData(d);
      setExtras({ shopify: d.shopify || null, sku_analysis: d.sku_analysis || null });
      setStatus('ready');
      // Shopify lives only in the Apps Script feed; SKU analysis is computed from the sheet when DATA_SOURCE is 'sheets'.
      loadShopify().then((s) => alive.current && setExtras((e) => ({ ...e, shopify: s }))).catch(() => alive.current && setExtras((e) => ({ ...e, shopify: { monthly: null } })));
      if (DATA_SOURCE !== 'sheets') {
        loadSkuAnalysis().then((s) => alive.current && setExtras((e) => ({ ...e, sku_analysis: s }))).catch(() => {});
      }
    } catch (e) {
      if (!alive.current) return;
      setError(e.message || 'Could not load data.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  const fetchMtd = useCallback(() => loadMtd(data), [data]);
  const fetchCustom = useCallback((s, e) => loadCustom(data, s, e), [data]);

  return { data, extras, status, error, reload: load, fetchMtd, fetchCustom };
}
