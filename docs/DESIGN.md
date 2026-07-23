# Convict — Design & Visual Direction

A reference for the future UI/design revolution. Nothing here is wired into the
code yet — it's a menu of cohesive, accessible options to pull from.

Convict is a **conviction-tracking / investment product**, so the design should
read as: trustworthy, data-dense but calm, and a little opinionated. The single
most important visual system is the **status language** (On Track / Watch /
Broken) — get that right first; everything else is chrome.

Current identity for reference: near-black background (`gray-950`), `gray-900`
cards, `gray-800` borders, `green-500` accent with black text.

---

## 1. The status system (shared across every palette)

These three states appear on every card and drive the whole product's feel.
Keep them consistent regardless of which base palette you pick. Values chosen
for **AA contrast on dark surfaces** (text ~`#14xxxx` bg at 8–12% opacity).

| Status    | Text / icon | Chip background            | Meaning                          |
|-----------|-------------|----------------------------|----------------------------------|
| On Track  | `#34D399`   | `rgba(52,211,153,0.12)`    | Meets target                     |
| Watch     | `#FBBF24`   | `rgba(251,191,36,0.12)`    | Missing target by ≤ 25%          |
| Broken    | `#F87171`   | `rgba(248,113,113,0.12)`   | Missing target by > 25%          |
| Pending   | `#94A3B8`   | `rgba(148,163,184,0.12)`   | Not yet evaluated / no data      |

> Accessibility: never encode status by **color alone** — pair each with a shape
> or label (● On Track / ◐ Watch / ○ Broken, or a small icon). ~8% of men have
> red/green color-vision deficiency, and this app lives or dies on red vs green.

---

## 2. Palette options

Each is a full role mapping (background layers → text → borders → accent). Pick
one base; the status colors above sit on top of any of them.

### Option A — "Terminal" (evolve the current dark + green)
Bloomberg-terminal-meets-modern. Safest evolution of what you have; keeps the
green equity.

| Role              | Hex        | Notes                                  |
|-------------------|------------|----------------------------------------|
| Background        | `#0A0B0D`  | Near-black, slightly warm              |
| Surface (card)    | `#121317`  | One step up                            |
| Surface-2 (input) | `#1A1C21`  | Inputs, hover rows                     |
| Border            | `#26282E`  | Hairline dividers                      |
| Text primary      | `#F4F5F7`  | Headings, values                       |
| Text secondary    | `#9BA1AD`  | Labels, company names                  |
| Text muted        | `#6B7280`  | Timestamps, meta                       |
| **Accent**        | `#10B981`  | Emerald — primary buttons/links        |
| Accent hover      | `#34D399`  |                                        |
| On-accent text    | `#04170C`  | Near-black on green                    |

### Option B — "Conviction" (premium fintech, indigo/violet)
Linear/Stripe energy. Reads more "product company," less "trading terminal."
Green is freed up to mean *only* success, reducing ambiguity.

| Role              | Hex        | Notes                                  |
|-------------------|------------|----------------------------------------|
| Background        | `#0B0B12`  | Cool near-black                        |
| Surface (card)    | `#14141F`  |                                        |
| Surface-2 (input) | `#1C1C2B`  |                                        |
| Border            | `#2A2A3D`  |                                        |
| Text primary      | `#ECECF3`  |                                        |
| Text secondary    | `#A0A0B8`  |                                        |
| Text muted        | `#6E6E85`  |                                        |
| **Accent**        | `#6366F1`  | Indigo-500 — primary                   |
| Accent hover      | `#818CF8`  |                                        |
| Accent secondary  | `#A855F7`  | Violet — highlights, gradients         |
| On-accent text    | `#FFFFFF`  |                                        |

### Option C — "Editorial" (light mode, trustworthy)
A calm, paper-like light theme — good if you want it to feel like a research
publication. Also a strong basis for a light/dark toggle. Status colors shift
darker for contrast on light surfaces.

| Role              | Hex        | Notes                                  |
|-------------------|------------|----------------------------------------|
| Background        | `#FAFAF7`  | Warm paper                             |
| Surface (card)    | `#FFFFFF`  |                                        |
| Surface-2         | `#F2F1EC`  | Subtle fills, hover                    |
| Border            | `#E5E3DC`  |                                        |
| Text primary      | `#17181A`  | Ink                                    |
| Text secondary    | `#565851`  |                                        |
| Text muted        | `#8A8B84`  |                                        |
| **Accent**        | `#127A54`  | Deep emerald — AA on white             |
| Accent hover      | `#0E6344`  |                                        |
| On-accent text    | `#FFFFFF`  |                                        |
| On Track / Watch / Broken (light) | `#0F7A4D` / `#B45309` / `#C0362C` | darker for AA on white |

> **Recommendation:** ship **Option A** first (lowest risk, keeps your equity),
> and build the theme as tokens so a later flip to **B** or a **C** light-mode
> toggle is a config change, not a rewrite.

---

## 3. Wiring palettes into Tailwind (token approach)

Define semantic tokens once in `tailwind.config.js` so components reference
*roles*, not raw colors — then swapping palette A→B is one edit.

```js
// tailwind.config.js — theme.extend.colors
colors: {
  bg:        '#0A0B0D',
  surface:   '#121317',
  'surface-2':'#1A1C21',
  border:    '#26282E',
  ink:       '#F4F5F7',
  'ink-2':   '#9BA1AD',
  'ink-3':   '#6B7280',
  accent:    { DEFAULT: '#10B981', hover: '#34D399', fg: '#04170C' },
  status: {
    ok:      '#34D399',
    watch:   '#FBBF24',
    broken:  '#F87171',
    pending: '#94A3B8',
  },
}
```

Usage becomes `bg-surface border-border text-ink` / `text-status-ok`, etc.
`getStatusColor()` in `client/src/lib/metrics.js` is already the single source of
truth for status classes — update it there and every card follows.

For a **light/dark toggle**, put the tokens behind CSS variables and switch a
`data-theme` attribute on `<html>` rather than duplicating class sets.

---

## 4. Typography

- **UI / body:** Inter or Geist — clean, excellent at small sizes for dense data.
- **Numbers / tickers / metric values:** a tabular-figures font so columns align
  — `font-variant-numeric: tabular-nums`, or a mono like **JetBrains Mono** /
  **Geist Mono** for values. Aligned decimals read as "financial."
- **Scale:** page title `text-2xl/3xl` bold, card ticker `text-lg` bold, labels
  `text-xs` uppercase tracking-wide in `ink-2`, meta `text-[11px]` in `ink-3`.

---

## 5. Design feature ideas (tie visuals to the data)

Ranked by impact for *this* product:

1. **Metric progress bars** — each metric card shows a bar of `current` vs
   `target`, filled with the status color. Instantly legible; no reading numbers.
2. **Status timeline / sparkline** — once `status_history` exists (Phase 2, see
   `ROADMAP.md`), show a small On-Track/Watch/Broken strip over time per thesis.
3. **Conviction as weight** — render High/Medium/Low conviction as visual weight
   (border thickness, a filled/half/empty pip) rather than just a text label.
4. **Convict Score dial** — a single headline accuracy gauge on the profile
   (Phase 2). Radial meter, status-colored.
5. **Freshness affordance** — "Updated 6h ago" with a subtle dot that fades as
   data ages; reinforces the daily-evaluation story.
6. **Empty & loading states** — you now have a real empty state; give it an
   illustration or a sample "ghost" thesis card. Replace the plain "Loading…"
   with skeleton cards.
7. **Micro-interactions** — a quiet transition when a status changes
   (green→amber), and a confirm toast instead of `window.confirm`/`alert` for
   delete. Consider a headless toast lib or a tiny in-app one.
8. **Motion, sparingly** — 150–200ms ease on hover/press; nothing that competes
   with the data.

---

## 6. Accessibility checklist (before shipping any redesign)

- [ ] Status never conveyed by color alone (add icon/label).
- [ ] Body text ≥ AA contrast (4.5:1); large text ≥ 3:1. Verify each palette.
- [ ] Focus rings visible on all interactive elements (currently `outline-none`
      is used on inputs — add a visible `focus:ring` instead).
- [ ] Buttons have discernible names; icon-only buttons get `aria-label`.
- [ ] Respect `prefers-reduced-motion` for the micro-interactions above.
- [ ] Test the whole grid at 320px width (mobile) — §4 flagged this as untested;
      the grid is now `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

---

*Want this as an interactive swatch page you can click through? I can generate a
visual artifact of these palettes on request.*
