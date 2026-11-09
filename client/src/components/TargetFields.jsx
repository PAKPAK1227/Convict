import Select from './Select';
import {
  EARNINGS_METRICS,
  PRICE,
  PRICE_BAND,
  PRICE_DIRECTIONS,
  distanceFromPrice,
  formatValue,
} from '../lib/metrics';

/**
 * The fields for drafting one target: metric, (for price) its direction, and
 * the value. Shared by the create form and the thesis page so both offer
 * exactly the same choices. Controlled — the parent owns the state.
 *
 * `referencePrice` (today's close, when known) lets a price target show how
 * far it sits from where the stock is now.
 */
function TargetFields({
  options,
  metricName,
  onMetricChange,
  direction,
  onDirectionChange,
  targetValue,
  onTargetChange,
  referencePrice,
  inputClass,
}) {
  const isPrice = metricName === PRICE;
  const distance = isPrice ? distanceFromPrice(targetValue, referencePrice) : null;
  const chosen = PRICE_DIRECTIONS.find((d) => d.value === direction);

  return (
    <>
      <Select
        value={metricName}
        onChange={onMetricChange}
        options={options}
        placeholder="Select a metric…"
        className="mb-2"
      />

      {isPrice && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Price target direction">
            {PRICE_DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={direction === d.value}
                onClick={() => onDirectionChange(d.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  direction === d.value
                    ? 'bg-brand text-brand-fg border-brand'
                    : 'border-line text-ink-2 hover:text-ink hover:bg-surface-2'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {chosen && (
            <p className="mt-1.5 text-xs text-ink-3">Met if the stock {chosen.blurb} on your deadline.</p>
          )}
        </div>
      )}

      <div className="relative mb-2">
        {isPrice && (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">$</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          placeholder={isPrice ? 'Target price' : 'Target value'}
          value={targetValue}
          onChange={(e) => onTargetChange(e.target.value)}
          className={`${inputClass} w-full ${isPrice ? 'pl-8' : ''}`}
        />
      </div>

      {isPrice && distance != null && (
        <p className="mb-2 text-xs text-ink-3 tnum">
          Last close {formatValue(PRICE, referencePrice)} — your target is{' '}
          <span className="text-ink-2">
            {Math.abs(distance) < 0.0005
              ? 'right at it'
              : `${(Math.abs(distance) * 100).toFixed(1)}% ${distance > 0 ? 'above' : 'below'} it`}
          </span>
          .{direction === 'within' && Math.abs(Number(referencePrice) / Number(targetValue) - 1) <= PRICE_BAND && (
            <>
              {' '}Today's price is already inside that band — if it still is at the first nightly
              check, this call won't count toward your score.
            </>
          )}
        </p>
      )}

      {EARNINGS_METRICS.has(metricName) && (
        <p className="text-xs text-ink-3 mb-2">
          This figure only changes when the company reports earnings (about every 3 months), so
          the deadline must be at least 90 days out — pick one after the next report.
        </p>
      )}
    </>
  );
}

export default TargetFields;
