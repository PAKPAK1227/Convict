/**
 * Progress meter used for current-vs-target metrics. Subtle inset track +
 * a soft gradient fill so it reads as a crafted element, not a flat rule.
 */
function Progress({ value = 0, className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className={`relative h-1.5 rounded-full bg-surface-2 ring-1 ring-inset ring-line/70 overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/60 to-accent transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default Progress;
