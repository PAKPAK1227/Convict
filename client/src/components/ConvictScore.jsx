import CountUp from './CountUp';
import { scoreTier } from '../lib/score';

/**
 * Convict Score dial (§5.4) — a radial gauge with the score in the centre and a
 * tier label. Colour follows the tier. Pure SVG, no dependencies.
 */
function ConvictScore({ score, resolvedCount = 0 }) {
  const tier = scoreTier(score);
  const r = 54;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * C;

  return (
    <div className="flex items-center gap-5 sm:gap-6">
      <div className={`relative shrink-0 ${tier.cls}`}>
        <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="10" />
          <circle
            cx="66"
            cy="66"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
            className="transition-[stroke-dasharray] duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold text-ink tnum leading-none">
            <CountUp end={score} duration={1100} />
          </span>
          <span className="eyebrow mt-1">/ 100</span>
        </div>
      </div>

      <div className="min-w-0">
        <span className="eyebrow">Convict Score</span>
        <div className={`font-serif text-2xl leading-tight ${tier.cls}`}>{tier.label}</div>
        <p className="text-sm text-ink-2 mt-1 max-w-xs">
          {resolvedCount > 0
            ? `Locked in from ${resolvedCount} resolved call${resolvedCount === 1 ? '' : 's'} — it moves only when a prediction hits its deadline.`
            : 'Starts at 50. It shifts only when a prediction reaches its deadline — no resolved calls yet.'}
        </p>
      </div>
    </div>
  );
}

export default ConvictScore;
