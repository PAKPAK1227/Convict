import {
  DEADLINE_PRESETS,
  addMonthsISO,
  presetDateISO,
  daysUntil,
  deadlineStatus,
  formatDeadlineDate,
} from '../deadline';

const NOW = new Date('2026-07-24T12:00:00');

describe('presets', () => {
  test('exposes 1M / 3M / 6M / 1Y', () => {
    expect(DEADLINE_PRESETS.map((p) => p.value)).toEqual(['1M', '3M', '6M', '1Y']);
  });

  test('presetDateISO returns a yyyy-mm-dd date in the future', () => {
    const iso = presetDateISO('3M', NOW);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daysUntil(iso, NOW)).toBeGreaterThan(80);
    expect(daysUntil(iso, NOW)).toBeLessThan(100);
  });

  test('presetDateISO is empty for an unknown preset', () => {
    expect(presetDateISO('nope', NOW)).toBe('');
  });

  test('addMonthsISO advances the month', () => {
    expect(addMonthsISO(6, NOW)).toBe('2027-01-24');
  });
});

describe('daysUntil', () => {
  test('future / today / past', () => {
    expect(daysUntil('2026-07-31', NOW)).toBe(7);
    expect(daysUntil('2026-07-24', NOW)).toBe(0);
    expect(daysUntil('2026-07-14', NOW)).toBe(-10);
  });

  test('null for missing or invalid input', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('not-a-date', NOW)).toBeNull();
  });
});

describe('deadlineStatus', () => {
  test('a passed deadline is resolved', () => {
    const s = deadlineStatus('2026-07-14', NOW);
    expect(s.resolved).toBe(true);
    expect(s.label).toMatch(/^Resolved .* ago$/);
  });

  test('the deadline day itself is due today, not resolved', () => {
    const s = deadlineStatus('2026-07-24', NOW);
    expect(s.resolved).toBe(false);
    expect(s.dueToday).toBe(true);
    expect(s.label).toBe('Resolves today');
  });

  test('a future deadline is not resolved', () => {
    const s = deadlineStatus('2026-10-24', NOW);
    expect(s.resolved).toBe(false);
    expect(s.label).toMatch(/^Resolves in/);
  });

  test('null for no date', () => {
    expect(deadlineStatus(null, NOW)).toBeNull();
  });
});

describe('formatDeadlineDate', () => {
  test('formats an ISO date and tolerates junk', () => {
    expect(formatDeadlineDate('2026-03-24')).toMatch(/2026/);
    expect(formatDeadlineDate('')).toBe('');
    expect(formatDeadlineDate('bad')).toBe('');
  });
});
