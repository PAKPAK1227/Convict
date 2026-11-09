import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatNumber } from '../lib/format';
import { THETA_BANDS, thetaReading, formatPercent, typicalMove, snapshotName } from '../lib/ticker';

/**
 * "What do these mean?" — a plain-English guide to the ticker panel's numbers,
 * filled with the selected stock's own values so each one reads as a concrete
 * statement rather than a definition. Opened from TickerPanel.
 */

function Section({ title, tag, children }) {
  return (
    <section className="py-4 border-t border-line first:border-t-0 first:pt-0">
      <h3 className="flex items-baseline gap-2 text-ink font-medium">
        {title}
        {tag && <span className="eyebrow">{tag}</span>}
      </h3>
      <div className="mt-1.5 space-y-2 text-sm text-ink-2 leading-relaxed">{children}</div>
    </section>
  );
}

function ForThisStock({ children }) {
  return (
    <p className="rounded-lg bg-surface-2/60 border border-line px-3 py-2 text-ink">
      <span className="eyebrow mr-1.5">This stock</span>
      {children}
    </p>
  );
}

function MetricsExplainer({ row, onClose }) {
  const closeRef = useRef(null);
  const name = snapshotName(row) || row.ticker;
  const reading = thetaReading(row.vol_theta);
  const day = typicalMove(row.vol_mav, 1);
  const month = typicalMove(row.vol_mav, 21);
  const hasVol = row.vol_mav != null;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Keep the page behind still while the guide scrolls.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Rendered into <body>, not where it's used: the ticker panel sits inside the
  // create form's animated card, and a transformed ancestor turns
  // `position: fixed` into "fixed to that card" — the backdrop then covered
  // only the card and the form's own fields painted over the guide.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="What these numbers mean"
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-surface shadow-card-hover p-6 animate-fade-up"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <span className="eyebrow">Reading the panel</span>
            <h2 className="font-serif text-xl text-ink leading-tight">What these numbers mean</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-sm text-ink-3 hover:text-ink transition"
          >
            ✕
          </button>
        </div>

        <Section title="Last close">
          <p>
            The price when the market closed on its most recent trading day. Convict grades price
            calls on closing prices, so this is the same kind of number your call will be judged on.
          </p>
        </Section>

        <Section title="52-week range">
          <p>
            The lowest and highest prices of the past year. The dot shows where today's price sits
            between them: near the left, it's close to its yearly low; near the right, close to its
            high.
          </p>
          {row.week52_low != null && (
            <ForThisStock>
              {name} has traded between ${formatNumber(row.week52_low)} and $
              {formatNumber(row.week52_high)} over the past year.
            </ForThisStock>
          )}
        </Section>

        <Section title="MAV" tag="How violent">
          <p>
            How much the price jumps around day to day, scaled up to a year. Higher means bigger
            swings. Any steady trend is taken out first, so a stock that rises smoothly scores low —
            this is about the bumps, not the direction.
          </p>
          {hasVol && (
            <ForThisStock>
              {formatPercent(row.vol_mav)} a year — a typical day moves about {formatPercent(day)} and
              a typical month about {formatPercent(month)}, up or down.
            </ForThisStock>
          )}
          <p className="text-ink-3">
            Why it matters: a price target 10% away is a big ask for a calm stock and a normal month
            for a jumpy one.
          </p>
        </Section>

        <Section title="M" tag="How wide">
          <p>
            On average, how far the price sat from its own yearly average. It measures the size of
            the territory the price covered, not how bumpy the ride was.
          </p>
          {hasVol && (
            <ForThisStock>
              Over the past year {name} was, on average, {formatPercent(row.vol_m)} away from its
              average price.
            </ForThisStock>
          )}
        </Section>

        <Section title="Θ (theta)" tag="How directional">
          <p>
            Did the movement go somewhere, or just bounce around? Θ compares how far the price
            actually wandered (M) with how far it would wander by pure chance given how jumpy it is
            (MAV). Two stocks can be equally jumpy: one climbs all year (high Θ), the other keeps
            snapping back to where it started (low Θ).
          </p>
          <div className="space-y-1.5">
            {THETA_BANDS.map((b, i) => (
              <div key={b.label} className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-ink-3 tnum">
                  {i === 0 ? `< ${b.max}` : b.max === Infinity ? `> ${THETA_BANDS[i - 1].max}` : `${THETA_BANDS[i - 1].max}–${b.max}`}
                </span>
                <span>
                  <span className="text-ink">{b.label}</span> — {b.blurb}
                </span>
              </div>
            ))}
          </div>
          {reading && (
            <ForThisStock>
              Θ {Number(row.vol_theta).toFixed(2)}: {reading.label.toLowerCase()}.
            </ForThisStock>
          )}
          <p className="text-ink-3">
            Not the options-trading "theta" (time decay) — same letter, different idea.
          </p>
        </Section>

        <p className="pt-4 border-t border-line text-xs text-ink-3">
          {hasVol ? `All three use the past ${row.vol_window_days} daily closes. ` : ''}
          They describe the last year, not the next one — a trend can end and a calm stock can wake
          up. Use them for context when you set a target, not as a prediction.
        </p>
      </div>
    </div>,
    document.body
  );
}

export default MetricsExplainer;
