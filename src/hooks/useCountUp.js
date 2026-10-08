import { useEffect, useRef, useState } from 'react';

// Animates a number from its previous value to `target` (ease-out). Respects reduced-motion.
export function useCountUp(target, ms = 1100) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !isFinite(target)) {
      setValue(target);
      from.current = target;
      return undefined;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min((t - t0) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      const v = start + (target - start) * eased;
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}
