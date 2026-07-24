/**
 * Convict brand lockup: an emblem (rounded square holding an upward conviction
 * line that lands on a target dot) plus the wordmark. Purely visual.
 */
function Brand({ size = 30, withWordmark = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="url(#convict-emblem)" />
        <path
          d="M7.5 21 L13 15 L17.5 18.5 L24.5 10.5"
          stroke="rgb(var(--accent-fg))"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24.5" cy="10.5" r="2.2" fill="rgb(var(--accent-fg))" />
        <defs>
          <linearGradient
            id="convict-emblem"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="rgb(var(--accent-hover))" />
            <stop offset="1" stopColor="rgb(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
      {withWordmark && (
        <span className="text-lg font-bold tracking-tight text-ink">Convict</span>
      )}
    </span>
  );
}

export default Brand;
