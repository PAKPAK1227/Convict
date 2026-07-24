import { useEffect, useRef, useState } from 'react';
import useInView from '../hooks/useInView';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animated number that counts up to `end` (easeOutCubic) the first time it
 * scrolls into view. Respects prefers-reduced-motion (jumps straight to the
 * final value). Purely presentational.
 */
function CountUp({ end, duration = 1200, decimals = 0, suffix = '', prefix = '', className = '' }) {
  const [ref, inView] = useInView({ threshold: 0.4, once: true });
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;

    if (prefersReduced()) {
      setValue(end);
      return;
    }

    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(end * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(end);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration]);

  const shown = decimals ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

export default CountUp;
