import { useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import StatusBadge from '../components/StatusBadge';
import Ticker from '../components/Ticker';
import CountUp from '../components/CountUp';
import HeroDemo from '../components/HeroDemo';

const STEPS = [
  { n: '01', t: 'Write the thesis', d: 'State what you believe, set a deadline, and pick the metric targets that would prove it.' },
  { n: '02', t: 'Set the targets', d: 'P/E, revenue growth, margin — the numbers your conviction rests on.' },
  { n: '03', t: 'Track it live', d: 'Daily checks against live data grade it — On Track, Watch, or Behind — while the clock runs.' },
  { n: '04', t: 'Get the verdict', d: 'At the deadline it locks as Met, Close, or Broken and moves your Convict Score (0–100). It shifts only on resolution — a high score means a real track record.' },
];

const MICRO_STATS = [
  { k: 'Metrics tracked', v: 3 },
  { k: 'Eval cadence', v: 'Daily' },
  { k: 'Verdicts', v: 3 },
];

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 h-16">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink rounded-lg hover:bg-surface-2 transition"
            >
              Log in
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-semibold bg-brand hover:bg-brand-hover text-brand-fg rounded-lg transition"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      <Ticker />

      {/* Hero — asymmetric two-column */}
      <main className="relative">
        <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center py-16 sm:py-24">
            {/* Left: copy — staggered entrance */}
            <div>
              <div className="flex items-center gap-3 mb-6 animate-fade-up">
                <span className="eyebrow">Daily market evaluation</span>
                <span className="h-px w-10 bg-line" />
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[4.25rem] leading-[1.02] sm:leading-[0.98] tracking-[-0.02em] text-ink font-medium animate-fade-up [animation-delay:80ms]">
                Put your convictions
                <br />
                on the record.
              </h1>

              <p className="mt-6 text-lg text-ink-2 max-w-md animate-fade-up [animation-delay:160ms]">
                Convict turns investment theses into measurable targets, then
                holds them against live market data — so you know whether you
                were <span className="text-ink italic font-serif">right</span>,
                not just whether you felt right.
              </p>

              <div className="mt-9 flex items-center gap-5 animate-fade-up [animation-delay:240ms]">
                <button
                  onClick={() => navigate('/login')}
                  className="px-6 py-3 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl shadow-glow transition"
                >
                  Get started
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm font-semibold text-ink-2 hover:text-ink transition inline-flex items-center gap-1.5"
                >
                  Log in <span aria-hidden="true">→</span>
                </button>
              </div>

              {/* Micro stats */}
              <div className="mt-12 flex items-stretch gap-5 sm:gap-8 animate-fade-up [animation-delay:320ms]">
                {MICRO_STATS.map((s, i) => (
                  <div key={s.k} className={`flex flex-col ${i > 0 ? 'pl-5 sm:pl-8 border-l border-line' : ''}`}>
                    <span className="font-mono text-2xl font-semibold text-ink tnum">
                      {typeof s.v === 'number' ? <CountUp end={s.v} duration={900} /> : s.v}
                    </span>
                    <span className="eyebrow mt-1">{s.k}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: conviction ledger panel */}
            <div className="animate-fade-up [animation-delay:220ms]">
              <HeroDemo />

              {/* status legend */}
              <div className="mt-5 flex flex-wrap items-center gap-2.5 pl-1">
                <span className="eyebrow">Every thesis resolves to</span>
                <StatusBadge status="On Track" resolved />
                <StatusBadge status="Watch" resolved />
                <StatusBadge status="Broken" resolved />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* How it works */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <span className="eyebrow">How it works</span>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-2xl overflow-hidden border border-line">
            {STEPS.map((step) => (
              <div key={step.n} className="bg-surface p-6">
                <span className="font-mono text-sm text-accent">{step.n}</span>
                <h3 className="mt-3 font-serif text-xl text-ink">{step.t}</h3>
                <p className="mt-2 text-sm text-ink-2 leading-relaxed">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex items-center justify-between">
          <Brand size={22} />
          <span className="eyebrow">Conviction, tracked.</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
