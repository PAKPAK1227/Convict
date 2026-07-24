// Convict Score v1 — a per-user accuracy score derived from the current
// statuses of their theses. Starts at a neutral 50, climbs toward 100 as calls
// land On Track, sinks toward 0 as they Break.
//
// Shrinkage toward 50 by call count (K) means the score *builds up* with a
// track record rather than jumping to an extreme off a single thesis — one
// On Track call nudges you to ~60, not 100.
//
// NOTE: this v1 is computed client-side from present standings (no history).
// The persisted, resolution-based version that survives over time and powers a
// leaderboard is Phase 2 (see docs/ROADMAP.md §9).

const POINTS = { 'On Track': 1, Watch: 0.5, Broken: 0 };
const K = 4; // shrinkage strength toward the neutral 50

export function convictScore(theses) {
  let sum = 0;
  let n = 0;
  for (const t of theses || []) {
    const p = POINTS[t?.status];
    if (p === undefined) continue; // Pending / not-yet-evaluated excluded
    sum += p;
    n += 1;
  }
  if (n === 0) return 50;
  const avg = sum / n;
  const raw = 50 + (avg - 0.5) * 100 * (n / (n + K));
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function scoreTier(score) {
  if (score >= 80) return { label: 'Elite', cls: 'text-status-ok' };
  if (score >= 65) return { label: 'Strong', cls: 'text-status-ok' };
  if (score >= 45) return { label: 'Building', cls: 'text-brand' };
  if (score >= 25) return { label: 'Shaky', cls: 'text-status-watch' };
  return { label: 'Unproven', cls: 'text-status-broken' };
}
