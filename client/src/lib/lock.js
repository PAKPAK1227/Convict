// The 24-hour edit window. A thesis (and its targets, conviction and deadline)
// can be edited or deleted only within this many hours of creation; after that
// the call is locked for good. The database enforces it — see
// public.thesis_edit_window() in 20260926_thesis_integrity_locks.sql — this
// only decides what the UI offers. Pure, so it's unit-testable.

export const EDIT_WINDOW_HOURS = 24;

const HOUR_MS = 3600000;

/**
 * { open, msLeft, label } for a thesis row. A missing or unreadable created_at
 * counts as locked: offering an edit the database will refuse is worse than
 * hiding one it would allow.
 */
export function editWindow(thesis, now = new Date()) {
  const created = new Date(thesis?.created_at ?? NaN);
  if (Number.isNaN(created.getTime())) {
    return { open: false, msLeft: 0, label: 'Locked' };
  }
  const msLeft = created.getTime() + EDIT_WINDOW_HOURS * HOUR_MS - now.getTime();
  if (msLeft <= 0) {
    return { open: false, msLeft: 0, label: 'Locked' };
  }
  const hours = Math.floor(msLeft / HOUR_MS);
  const minutes = Math.max(1, Math.floor((msLeft % HOUR_MS) / 60000));
  return {
    open: true,
    msLeft,
    label: hours >= 1 ? `Editable for ${hours}h` : `Editable for ${minutes}m`,
  };
}
