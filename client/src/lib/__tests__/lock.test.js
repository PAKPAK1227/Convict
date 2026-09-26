import { editWindow, EDIT_WINDOW_HOURS } from '../lock';

const NOW = new Date('2026-09-26T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();

describe('editWindow', () => {
  test('a brand-new thesis has the full window', () => {
    const w = editWindow({ created_at: hoursAgo(0) }, NOW);
    expect(w.open).toBe(true);
    expect(w.label).toBe(`Editable for ${EDIT_WINDOW_HOURS}h`);
  });

  test('counts down in hours, then minutes', () => {
    expect(editWindow({ created_at: hoursAgo(6) }, NOW).label).toBe('Editable for 18h');
    expect(editWindow({ created_at: hoursAgo(23.5) }, NOW).label).toBe('Editable for 30m');
  });

  test('locks at exactly 24 hours and stays locked', () => {
    expect(editWindow({ created_at: hoursAgo(24) }, NOW).open).toBe(false);
    expect(editWindow({ created_at: hoursAgo(24 * 40) }, NOW)).toEqual({
      open: false,
      msLeft: 0,
      label: 'Locked',
    });
  });

  test('a missing or invalid timestamp is treated as locked', () => {
    expect(editWindow({}, NOW).open).toBe(false);
    expect(editWindow(null, NOW).open).toBe(false);
    expect(editWindow({ created_at: 'garbage' }, NOW).open).toBe(false);
  });
});
