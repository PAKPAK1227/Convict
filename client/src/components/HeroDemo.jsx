import { useEffect, useRef, useState } from 'react';
import Progress from './Progress';
import StatusBadge from './StatusBadge';

/**
 * Auto-playing, looping product demo for the hero — real animating DOM (not a
 * video). Shows a thesis being built: ticker types in, a metric is picked, a
 * target is typed, then the bar fills and the verdict flips to On Track. Loops
 * calmly (~9s). Honors prefers-reduced-motion by holding a finished frame.
 */
const LOOP = 9000;

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Typewriter substring based on elapsed time within [start, start+dur].
const typed = (text, start, dur, t) => {
  if (t < start) return '';
  if (t >= start + dur) return text;
  return text.slice(0, Math.round(((t - start) / dur) * text.length));
};

const METRIC_LIST = [
  { value: 'revenue_growth', label: 'Revenue Growth (%)' },
  { value: 'profit_margin', label: 'Profit Margin (%)' },
  { value: 'pe_ratio', label: 'P/E Ratio' },
];

function Field({ label, children }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function HeroDemo() {
  const [t, setT] = useState(() => (prefersReduced() ? 6000 : 0));
  const startRef = useRef(null);

  useEffect(() => {
    if (prefersReduced()) return;
    let raf;
    const loop = (now) => {
      if (startRef.current == null) startRef.current = now;
      setT((now - startRef.current) % LOOP);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ticker = typed('NVDA', 400, 900, t);
  const tickerActive = t >= 400 && t < 1300;

  const dropdownOpen = t >= 1500 && t < 2300;
  const metricSelected = t >= 2300;

  const target = typed('60', 2500, 600, t);
  const targetActive = t >= 2500 && t < 3100;

  const evaluating = t >= 3300;
  const barPct = evaluating ? clamp(((t - 3300) / 1000) * 100, 0, 100) : 0;
  const current = evaluating ? Math.round(clamp((t - 3300) / 1000, 0, 1) * 94) : null;
  const status = evaluating ? 'On Track' : 'Pending';

  const fading = t >= 8000;
  const caretOn = Math.floor(t / 450) % 2 === 0;

  const Caret = ({ show }) => (
    <span
      aria-hidden="true"
      className="inline-block w-[2px] h-[1.05em] bg-ink align-[-0.15em] ml-[1px]"
      style={{ opacity: show && caretOn ? 1 : 0 }}
    />
  );

  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-line bg-surface shadow-card-hover overflow-hidden transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface-2/40">
        <span className="eyebrow">Building a thesis</span>
        <div className="flex items-center gap-1.5 font-mono text-xs text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ok animate-pulse" />
          LIVE
        </div>
      </div>

      {/* ticker headline reflects the typed value */}
      <div className="flex items-end justify-between px-5 pt-5">
        <div>
          <div className="flex items-baseline gap-2.5 min-h-[2rem]">
            <span className="font-mono text-2xl font-semibold text-ink tracking-tight">
              {ticker || <span className="text-ink-3">—</span>}
            </span>
            {ticker === 'NVDA' && <span className="text-sm text-ink-2">NVIDIA Corp.</span>}
          </div>
          <span className="eyebrow">Conviction · High</span>
        </div>
        <span key={status} className="animate-fade-in">
          <StatusBadge status={status} size="lg" />
        </span>
      </div>

      {/* form fields filling in */}
      <div className="px-5 py-5 space-y-4">
        <Field label="Ticker">
          <div className="rounded-xl bg-surface-2 border border-line px-4 py-2.5 font-mono text-sm text-ink">
            {ticker}
            <Caret show={tickerActive} />
          </div>
        </Field>

        <Field label="Metric">
          <div className="relative">
            <div
              className={`flex items-center justify-between gap-2 rounded-xl bg-surface-2 border px-4 py-2.5 text-sm transition-colors ${
                dropdownOpen ? 'border-brand/60' : 'border-line'
              }`}
            >
              <span className={metricSelected ? 'text-ink' : 'text-ink-3'}>
                {metricSelected ? 'Revenue Growth (%)' : 'Select a metric…'}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className={`shrink-0 text-ink-3 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {dropdownOpen && (
              <ul className="absolute z-10 mt-2 w-full rounded-xl border border-line bg-surface shadow-card-hover p-1 animate-fade-in">
                {METRIC_LIST.map((o, i) => (
                  <li
                    key={o.value}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                      i === 0 ? 'bg-surface-2 text-ink' : 'text-ink-2'
                    }`}
                  >
                    {o.label}
                    {i === 0 && <span className="text-brand">✓</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Target">
          <div className="rounded-xl bg-surface-2 border border-line px-4 py-2.5 font-mono text-sm text-ink">
            {target}
            <Caret show={targetActive} />
          </div>
        </Field>

        {/* result */}
        <div
          className={`pt-4 border-t border-line transition-opacity duration-500 ${
            evaluating ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-mono text-xs uppercase tracking-wide text-ink-2">Revenue Growth</span>
            <span className="font-mono text-xs tnum">
              <span className="text-ink font-semibold">{current ?? 0}</span>
              <span className="text-ink-3"> / 60</span>
            </span>
          </div>
          <Progress value={barPct} />
        </div>
      </div>
    </div>
  );
}

export default HeroDemo;
