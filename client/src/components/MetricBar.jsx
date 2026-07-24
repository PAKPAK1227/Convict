import { metricLabel, targetComparator } from '../lib/metrics';
import { formatNumber } from '../lib/format';
import Progress from './Progress';

/**
 * Visualises a single metric as current-vs-target: a labelled row with a
 * progress bar showing how far `current_value` has moved toward `target_value`.
 * Purely presentational — reads the metric row, computes nothing that touches
 * the backend. When Finnhub hasn't populated `current_value` yet, it says so.
 */
function MetricBar({ metric }) {
  const { metric_name, current_value, target_value } = metric;
  const tracked =
    current_value != null &&
    target_value != null &&
    Number(target_value) !== 0 &&
    !Number.isNaN(Number(current_value));

  const pct = tracked
    ? Math.max(0, Math.min(100, (Number(current_value) / Number(target_value)) * 100))
    : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-2 truncate">
          {metricLabel(metric_name)}
        </span>
        <span className="font-mono text-xs tnum whitespace-nowrap">
          {tracked ? (
            <>
              <span className="text-ink font-semibold">{formatNumber(current_value)}</span>
              <span className="text-ink-3"> / {targetComparator(metric_name)} {formatNumber(target_value)}</span>
            </>
          ) : (
            <span
              className="text-ink-3 inline-flex items-center gap-1"
              title="Convict pulls this from live market data once a day — it populates on the next evaluation."
            >
              <span aria-hidden="true">◷</span> awaiting data
            </span>
          )}
        </span>
      </div>
      <Progress value={tracked ? pct : 0} />
    </div>
  );
}

export default MetricBar;
