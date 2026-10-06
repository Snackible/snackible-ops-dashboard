import { useCallback, useEffect, useState } from 'react';

const KEY = 'theme'; // 'light' | 'dark'; absent = follow the system
const query = () => window.matchMedia('(prefers-color-scheme: light)');
const read = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } };

export function useTheme() {
  const [pref, setPref] = useState(read);

  useEffect(() => {
    const apply = () => {
      const eff = pref === 'system' ? (query().matches ? 'light' : 'dark') : pref;
      document.documentElement.setAttribute('data-theme', eff);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', eff === 'light' ? '#e6e8dd' : '#0d1210');
    };
    apply();
    if (pref !== 'system') return undefined;
    const q = query();
    q.addEventListener('change', apply); // follow OS changes while on "System"
    return () => q.removeEventListener('change', apply);
  }, [pref]);

  const choose = useCallback((v) => {
    setPref(v);
    try { v === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v); } catch { /* storage unavailable */ }
  }, []);

  return [pref, choose];
}
