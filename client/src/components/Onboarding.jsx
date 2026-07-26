import { useEffect, useRef, useState } from 'react';
import StatusBadge from './StatusBadge';

/**
 * First-run walkthrough. A new account lands on the dashboard with no idea what
 * "Medium conviction" buys them or where to start, so this explains the loop
 * once — thesis → conviction → targets → verdict → score — and hands off to the
 * create page.
 *
 * Numbers quoted here mirror the evaluator (data-service/evaluate_theses.py):
 * BASE_MOVE ±4 at mid-range, GAIN_WEIGHT / LOSS_WEIGHT per conviction, and the
 * 25% Watch band. Keep them in sync if that file changes — docs/SCORING.md
 * explains why the gain and loss columns differ.
 */

const CONVICTION_ROWS = [
  { level: 'High', pips: 3, gain: '+4.6', loss: '−5.6', blurb: "You'd act on this." },
  { level: 'Medium', pips: 2, gain: '+4.0', loss: '−4.0', blurb: 'Your default.' },
  { level: 'Low', pips: 1, gain: '+3.4', loss: '−2.8', blurb: 'A hunch worth tracking.' },
];

const TARGET_ROWS = [
  { label: 'P/E Ratio', dir: '≤', blurb: 'Lower is better — "it stays cheaper than 25×".' },
  { label: 'Revenue Growth (%)', dir: '≥', blurb: 'Higher is better — "it keeps growing 20%+".' },
  { label: 'Profit Margin (%)', dir: '≥', blurb: 'Higher is better — "margins hold above 30%".' },
];

function Pips({ filled }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i < filled ? 'bg-accent' : 'bg-surface-2 border border-line'}`}
        />
      ))}
    </span>
  );
}

const Row = ({ children }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
    {children}
  </div>
);

const STEPS = [
  {
    eyebrow: 'Welcome',
    glyph: '◇',
    title: 'Convict keeps you honest',
    body: (
      <>
        <p>
          Write down what you believe about a stock, set the numbers that would prove you right,
          and pick a date. On that date the call locks — right or wrong, permanently on your record.
        </p>
        <p className="mt-3">
          Everything starts from <span className="text-ink font-medium">+ New Thesis</span> at the
          top of your dashboard. Four short steps and you'll know what each field is for.
        </p>
      </>
    ),
  },
  {
    eyebrow: 'Step 1 · Conviction',
    glyph: '◉',
    title: 'How sure are you?',
    body: (
      <>
        <p>
          Conviction doesn't change whether you're right — it changes what the call is{' '}
          <span className="text-ink font-medium">worth</span>. And it isn't a free bet: high
          conviction pays a bit more, and costs a lot more.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-end gap-4 pr-3.5 eyebrow">
            <span className="w-12 text-right">Right</span>
            <span className="w-12 text-right">Wrong</span>
          </div>
          {CONVICTION_ROWS.map((c) => (
            <Row key={c.level}>
              <span className="flex items-center gap-2.5 min-w-0">
                <Pips filled={c.pips} />
                <span className="text-sm text-ink font-medium">{c.level}</span>
                <span className="text-xs text-ink-3 truncate hidden sm:inline">{c.blurb}</span>
              </span>
              <span className="shrink-0 flex items-center gap-4 font-mono text-xs tnum">
                <span className="w-12 text-right text-status-ok">{c.gain}</span>
                <span className="w-12 text-right text-status-broken">{c.loss}</span>
              </span>
            </Row>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">
          That gap is deliberate. Calling everything "High" only pays off if you're right roughly
          three times in four — below that you score better by being honest and picking Low. Save
          High for the calls you'd defend out loud.
        </p>
      </>
    ),
  },
  {
    eyebrow: 'Step 2 · Targets',
    glyph: '◎',
    title: 'Name the numbers that prove it',
    body: (
      <>
        <p>
          A thesis is only a claim until it has a target. Pick at least one, and Convict pulls the
          live figure from market data every day and grades you against it.
        </p>
        <div className="mt-4 space-y-2">
          {TARGET_ROWS.map((t) => (
            <Row key={t.label}>
              <span className="min-w-0">
                <span className="font-mono text-xs uppercase tracking-wide text-ink-2">{t.label}</span>
                <span className="block text-xs text-ink-3 mt-0.5">{t.blurb}</span>
              </span>
              <span className="shrink-0 font-mono text-sm text-ink">{t.dir}</span>
            </Row>
          ))}
        </div>
      </>
    ),
  },
  {
    eyebrow: 'Step 3 · The verdict',
    glyph: '◷',
    title: 'Provisional, then locked',
    body: (
      <>
        <p>
          Each target is graded daily, and your <span className="text-ink font-medium">worst one
          sets the thesis status</span> — no hiding a broken leg behind a good one.
        </p>
        <div className="mt-4 space-y-2">
          <Row>
            <span className="flex items-center gap-2.5"><StatusBadge status="On Track" /></span>
            <span className="text-xs text-ink-3">Target met</span>
          </Row>
          <Row>
            <span className="flex items-center gap-2.5"><StatusBadge status="Watch" /></span>
            <span className="text-xs text-ink-3">Within 25% of it</span>
          </Row>
          <Row>
            <span className="flex items-center gap-2.5"><StatusBadge status="Broken" /></span>
            <span className="text-xs text-ink-3">Beyond that</span>
          </Row>
        </div>
        <p className="mt-3">
          Those read as live standings. On your deadline they harden into a final{' '}
          <span className="text-status-ok font-medium">Met</span> /{' '}
          <span className="text-status-watch font-medium">Close</span> /{' '}
          <span className="text-status-broken font-medium">Broken</span> — 🔒 and no longer editable.
        </p>
      </>
    ),
  },
  {
    eyebrow: 'Step 4 · Your score',
    glyph: '◆',
    title: 'The Convict Score',
    body: (
      <>
        <p>
          One number for your judgement, starting at{' '}
          <span className="font-mono text-ink">50</span>. It moves{' '}
          <span className="text-ink font-medium">only when a thesis reaches its deadline</span> —
          day-to-day swings don't touch it, so you can't farm it by opening positions.
        </p>
        <p className="mt-3">
          Each resolved call nudges it by a few points, weighted by the conviction you set. A near
          miss — <span className="text-status-watch font-medium">Close</span> — costs only half a
          point: it registers, but it's nothing like being outright wrong.
        </p>
        <p className="mt-3">
          Gains get harder as you approach 100 and losses get harder near 0, so a real track record
          beats one lucky quarter.
        </p>
      </>
    ),
  },
  {
    eyebrow: 'Ready',
    glyph: '✦',
    title: "That's the whole loop",
    body: (
      <>
        <p>
          Thesis → conviction → targets → verdict → score. Your dashboard holds the active calls;
          resolved ones move to your profile as a permanent track record.
        </p>
        <p className="mt-3 text-ink-3 text-sm">
          You can replay this walkthrough any time from your profile page.
        </p>
      </>
    ),
    cta: 'Create my first thesis',
  },
];

function Onboarding({ onClose, onCreate }) {
  const [step, setStep] = useState(0);
  const nextRef = useRef(null);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => (last ? onClose() : setStep((s) => s + 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Keep focus on the primary action as the panel advances.
  useEffect(() => { nextRef.current?.focus(); }, [step]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Getting started with Convict"
        className="relative w-full max-w-lg rounded-2xl border border-line bg-surface shadow-card-hover p-6 sm:p-7 animate-fade-up"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-accent/12 text-accent text-lg">
              {current.glyph}
            </span>
            <div className="min-w-0">
              <span className="eyebrow">{current.eyebrow}</span>
              <h2 className="font-serif text-xl sm:text-2xl text-ink leading-tight">{current.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-sm text-ink-3 hover:text-ink transition"
          >
            Skip
          </button>
        </div>

        <div className="text-sm text-ink-2 leading-relaxed max-h-[52vh] overflow-y-auto">
          {current.body}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s.eyebrow}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-5 bg-accent' : 'w-1.5 bg-surface-2 border border-line'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={back}
                className="px-4 py-2.5 border border-line text-ink text-sm font-semibold rounded-xl hover:bg-surface-2 transition"
              >
                Back
              </button>
            )}
            <button
              ref={nextRef}
              onClick={last && onCreate ? onCreate : next}
              className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-brand-fg text-sm font-semibold rounded-xl shadow-glow transition"
            >
              {last ? (current.cta || 'Done') : 'Next'}
            </button>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}

export default Onboarding;
