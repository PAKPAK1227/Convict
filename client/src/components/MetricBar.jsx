import { metricLabel, formatTarget, formatValue, metricProgress } from '../lib/metrics';
import Progress from './Progress';

/**
 * Visualises a single metric as current-vs-target: a labelled row with a
 * progress bar showing how far `current_value` has moved toward the target,
 * in the target's direction (see metricProgress). Purely presentational. When
 * market data hasn't populated `current_value` yet, it says so.
 */
function MetricBar({ metric }) {
  const pct = metricProgress(metric);
  const tracked = pct != null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-2 truncate">
          {metricLabel(metric.metric_name)}
        </span>
        <span className="font-mono text-xs tnum whitespace-nowrap">
          {tracked ? (
            <>
              <span className="text-ink font-semibold">{formatValue(metric.metric_name, metric.current_value)}</span>
              <span className="text-ink-3"> / {formatTarget(metric)}</span>
            </>
          ) : (
            <span
              className="text-ink-3 inline-flex items-center gap-1"
              title="Convict pulls this from market data once a day — it populates on the next evaluation."
            >
              <span aria-hidden="true">◷</span> awaiting data · {formatTarget(metric)}
            </span>
          )}
        </span>
      </div>
      <Progress value={tracked ? pct : 0} />
    </div>
  );
}

export default MetricBar;
