/**
 * Decorative terminal ticker strip. Purely visual — static sample symbols,
 * no live data. Duplicated once so the marquee loops seamlessly.
 */
const SAMPLE = [
  { s: 'NVDA', c: '+2.4%', up: true },
  { s: 'AAPL', c: '+0.8%', up: true },
  { s: 'TSLA', c: '-1.2%', up: false },
  { s: 'MSFT', c: '+1.1%', up: true },
  { s: 'AMZN', c: '+0.5%', up: true },
  { s: 'META', c: '-0.7%', up: false },
  { s: 'GOOGL', c: '+1.6%', up: true },
  { s: 'AMD', c: '-2.1%', up: false },
  { s: 'NFLX', c: '+0.9%', up: true },
  { s: 'CRM', c: '+0.3%', up: true },
];

function Ticker() {
  const row = [...SAMPLE, ...SAMPLE];
  return (
    <div className="border-y border-line bg-surface/40 overflow-hidden ticker-mask">
      <div className="flex w-max animate-ticker">
        {row.map((t, i) => (
          <span
            key={i}
            className="flex items-center gap-2 px-5 py-2 font-mono text-xs whitespace-nowrap"
          >
            <span className="font-semibold text-ink-2">{t.s}</span>
            <span
              aria-hidden="true"
              className={t.up ? 'text-status-ok' : 'text-status-broken'}
            >
              {t.up ? '▲' : '▼'}
            </span>
            <span className={`tnum ${t.up ? 'text-status-ok' : 'text-status-broken'}`}>
              {t.c}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default Ticker;
