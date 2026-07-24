/**
 * Status pill for a thesis. Accessibility-first: status is conveyed by a glyph
 * AND a label, never colour alone (~8% of men have red/green CVD and this app
 * lives on red vs green). Full literal class strings so Tailwind's JIT keeps
 * them. Purely presentational.
 */
const META = {
  'On Track': {
    label: 'On Track',
    glyph: '●',
    chip: 'bg-status-ok/10 text-status-ok ring-status-ok/25',
    dot: 'bg-status-ok',
  },
  Watch: {
    label: 'Watch',
    glyph: '◐',
    chip: 'bg-status-watch/10 text-status-watch ring-status-watch/25',
    dot: 'bg-status-watch',
  },
  Broken: {
    label: 'Broken',
    glyph: '○',
    chip: 'bg-status-broken/10 text-status-broken ring-status-broken/25',
    dot: 'bg-status-broken',
  },
};

const PENDING = {
  label: 'Pending',
  glyph: '◇',
  chip: 'bg-status-pending/10 text-status-pending ring-status-pending/25',
  dot: 'bg-status-pending',
};

export function statusMeta(status) {
  return META[status] || PENDING;
}

function StatusBadge({ status, size = 'sm', className = '' }) {
  const m = statusMeta(status);
  const label = META[status] ? m.label : status || 'Pending';
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
