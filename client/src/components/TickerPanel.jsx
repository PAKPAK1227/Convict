import { formatNumber } from '../lib/format';
import { rangePosition, snapshotName, thetaReading, formatPercent } from '../lib/ticker';

const asOf = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

function Stat({ label, value, hint, title }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="eyebrow">{label}</div>
      <div className="font-mono text-sm tnum text-ink mt-0.5">{value}</div>
      <div className="text-[11px] text-ink-3 truncate">{hint}</div>
    </div>
  );
}

/**
 * Volatility profile over the past year of daily closes — the project's own
 * MAV / M / Θ framework (data-service/volatility.py). Describes the past;
 * labelled so it can't be mistaken for a forecast.
 */
function Volatility({ row }) {
  if (row.vol_mav == null) {
    return (
      <p className="mt-3 pt-3 border-t border-line text-[11px] text-ink-3">
        Volatility appears once there's about three months of daily price history.
      </p>
    );
  }
  const reading = thetaReading(row.vol_theta);
  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="MAV"
          value={formatPercent(row.vol_mav)}
          hint="How violent"
          title="Annualised volatility of daily moves, with the trend removed."
        />
        <Stat
          label="M"
          value={formatPercent(row.vol_m)}
          hint="How wide"
          title="Average distance from the year's average price."
        />
        <Stat
          label="Θ"
          value={row.vol_theta == null ? '—' : Number(row.vol_theta).toFixed(2)}
          hint={reading ? reading.label : '—'}
          title="How directional: the price's spread against what a random walk with this volatility would produce. About 1 = random-walk-like."
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        {reading ? `${reading.blurb} ` : ''}Past {row.vol_window_days} daily closes — describes
        the last year, not a forecast.
      </p>
    </div>
  );
}

/**
 * Market context under the ticker field: name, last close, where it sits in
 * its 52-week range, and its volatility profile. Data is the nightly snapshot
 * (the same closing price grading uses), so it's labelled "as of" rather than
 * presented as live.
 */
function TickerPanel({ lookup }) {
  const { state, row } = lookup;
  if (state === 'idle') return null;

  if (state === 'loading') {
    return <p className="text-xs text-ink-3 mb-4 -mt-2">Looking up…</p>;
  }
  if (state === 'unknown') {
    return (
      <p className="text-sm text-status-broken mb-4 -mt-2 flex items-start gap-1.5" role="alert">
        <span aria-hidden="true">⚠</span>We can't find that ticker among US-listed stocks.
      </p>
    );
  }
  if (state === 'unavailable') {
    return (
      <p className="text-xs text-ink-3 mb-4 -mt-2">
        Market data isn't available right now — you can still continue.
      </p>
    );
  }

  const pos = rangePosition(row.price, row.week52_low, row.week52_high);
  return (
    <div className="mb-4 -mt-2 rounded-xl border border-line bg-surface-2/40 px-4 py-3 animate-fade-in">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink truncate">{snapshotName(row)}</span>
        {row.price != null ? (
          <span className="font-mono text-sm tnum text-ink shrink-0">
            ${formatNumber(row.price)}
            {row.price_at && <span className="text-ink-3 text-[11px]"> · close {asOf(row.price_at)}</span>}
          </span>
        ) : (
          <span className="text-[11px] text-ink-3 shrink-0">Price appears after tonight's refresh</span>
        )}
      </div>

      {pos != null && (
        <div className="mt-3">
          <div className="relative h-1.5 rounded-full bg-surface-2 ring-1 ring-inset ring-line/70">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
              style={{ left: `${pos}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] tnum text-ink-3">
            <span>52w low ${formatNumber(row.week52_low)}</span>
            <span>52w high ${formatNumber(row.week52_high)}</span>
          </div>
        </div>
      )}

      {row.price != null && <Volatility row={row} />}
    </div>
  );
}

export default TickerPanel;
