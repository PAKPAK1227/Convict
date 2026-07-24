/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // Semantic colour roles → CSS variables (see src/index.css).
      // Components reference roles (bg-surface, text-ink-2, text-status-ok),
      // never raw hexes, so a palette swap is a one-file edit.
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--ink-3) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          hover: "rgb(var(--brand-hover) / <alpha-value>)",
          fg: "rgb(var(--brand-fg) / <alpha-value>)",
        },
        status: {
          ok: "rgb(var(--ok) / <alpha-value>)",
          watch: "rgb(var(--watch) / <alpha-value>)",
          broken: "rgb(var(--broken) / <alpha-value>)",
          pending: "rgb(var(--pending) / <alpha-value>)",
        },
        up: "rgb(var(--up) / <alpha-value>)",
        down: "rgb(var(--down) / <alpha-value>)",
      },
      // Make the default border colour follow the theme token, so a bare
      // `border` utility is already palette-correct.
      borderColor: {
        DEFAULT: "rgb(var(--border) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.06), 0 10px 30px -14px rgb(0 0 0 / 0.35)",
        "card-hover":
          "0 1px 2px rgb(0 0 0 / 0.08), 0 20px 45px -18px rgb(0 0 0 / 0.5)",
        glow: "0 8px 26px -10px rgb(var(--brand) / 0.6)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.4s ease both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
}
