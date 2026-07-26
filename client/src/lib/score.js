// Convict Score presentation helpers.
//
// The score itself is NOT computed here. It's persisted in profiles.convict_score
// and written only by the nightly evaluator when a thesis resolves — see
// data-service/evaluate_theses.py (score_delta) and docs/SCORING.md.
//
// An earlier client-side convictScore() estimated it from current standings.
// That was removed once the score became authoritative server-side: two
// formulas for one number is a bug waiting to happen, and this one would have
// disagreed with the real score the moment the weights changed.

export function scoreTier(score) {
  if (score >= 80) return { label: 'Elite', cls: 'text-status-ok' };
  if (score >= 65) return { label: 'Strong', cls: 'text-status-ok' };
  if (score >= 45) return { label: 'Building', cls: 'text-brand' };
  if (score >= 25) return { label: 'Shaky', cls: 'text-status-watch' };
  return { label: 'Unproven', cls: 'text-status-broken' };
}
