/**
 * Status pill for a thesis. Accessibility-first: status is conveyed by a glyph
 * AND a label, never colour alone (~8% of men have red/green CVD and this app
 * lives on red vs green). Full literal class strings so Tailwind's JIT keeps
 * them. Purely presentational.
 *
 * The LABEL depends on whether the thesis has resolved:
 *   Active (in progress)  → On Track / Watch / Behind  (how it's going)
 *   Resolved (final)      → Met / Close / Broken        (how it ended)
 * Colours are identical in both cases.
 */
const META = {
  'On Track': {
    glyph: '●',
    chip: 'bg-status-ok/10 text-status-ok ring-status-ok/25',
    dot: 'bg-status-ok',
  },
  Watch: {
    glyph: '◐',
    chip: 'bg-status-watch/10 text-status-watch ring-status-watch/25',
    dot: 'bg-status-watch',
  },
  Broken: {
    glyph: '○',
    chip: 'bg-status-broken/10 text-status-broken ring-status-broken/25',
    dot: 'bg-status-broken',
  },
};

const PENDING = {
  glyph: '◇',
  chip: 'bg-status-pending/10 text-status-pending ring-status-pending/25',
  dot: 'bg-status-pending',
};

// Present-tense while in progress; past/final once resolved at the deadline.
const ACTIVE_LABEL = { 'On Track': 'On Track', Watch: 'Watch', Broken: 'Behind' };
const FINAL_LABEL = { 'On Track': 'Met', Watch: 'Close', Broken: 'Broken' };

export function statusMeta(status) {
  return META[status] || PENDING;
}

function StatusBadge({ status, resolved = false, size = 'sm', className = '' }) {
  const m = statusMeta(status);
  const label = META[status]
    ? (resolved ? FINAL_LABEL[status] : ACTIVE_LABEL[status])
    : status || 'Pending';
  const pad =
    size === 'lg' ? 'px-3 py-1.5 text-sm gap-2' : 'px-2.5 py-1 text-xs gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ring-1 ${pad} ${m.chip} ${className}`}
    >
      <span aria-hidden="true" className="text-[0.85em] leading-none">
        {m.glyph}
      </span>
      {label}
    </span>
  );
}

export default StatusBadge;
