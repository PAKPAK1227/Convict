import { METRIC_OPTIONS, metricLabel, getStatusColor, freshness } from '../metrics';

describe('METRIC_OPTIONS', () => {
  test('only exposes the canonical metrics the evaluator understands', () => {
    const values = METRIC_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['pe_ratio', 'revenue_growth', 'profit_margin']);
  });
});

describe('metricLabel', () => {
  test('maps canonical keys to human labels', () => {
    expect(metricLabel('pe_ratio')).toBe('P/E Ratio');
    expect(metricLabel('revenue_growth')).toBe('Revenue Growth (%)');
  });

  test('falls back to the raw name for unknown keys', () => {
    expect(metricLabel('mystery')).toBe('mystery');
  });
});

describe('getStatusColor', () => {
  test('returns distinct classes per status', () => {
    expect(getStatusColor('On Track')).toMatch(/green/);
    expect(getStatusColor('Watch')).toMatch(/yellow/);
    expect(getStatusColor('Broken')).toMatch(/red/);
    expect(getStatusColor(undefined)).toMatch(/gray/);
  });
});

describe('freshness', () => {
  test('returns null when no timestamp column is present', () => {
    expect(freshness({})).toBeNull();
    expect(freshness(null)).toBeNull();
  });

  test('formats a present timestamp', () => {
    const out = freshness({ last_updated: '2026-01-01T00:00:00Z' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('ignores invalid timestamps', () => {
    expect(freshness({ updated_at: 'not-a-date' })).toBeNull();
  });
});
