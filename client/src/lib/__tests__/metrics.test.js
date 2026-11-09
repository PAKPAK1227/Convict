import {
  METRIC_OPTIONS,
  metricLabel,
  getStatusColor,
  freshness,
  allTargetsAlreadyMet,
  formatValue,
  formatTarget,
  metricProgress,
  splitNote,
  targetError,
  distanceFromPrice,
  PRICE_DIRECTIONS,
} from '../metrics';

describe('METRIC_OPTIONS', () => {
  test('only exposes the canonical metrics the evaluator understands', () => {
    const values = METRIC_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['pe_ratio', 'revenue_growth', 'profit_margin', 'price']);
  });
});

describe('price targets', () => {
  const price = (direction, current, target = 200) => ({
    metric_name: 'price',
    direction,
    current_value: current,
    target_value: target,
  });

  test('directions mirror the database', () => {
    expect(PRICE_DIRECTIONS.map((d) => d.value)).toEqual(['at_least', 'at_most', 'within']);
  });

  test('formats targets with their direction', () => {
    expect(formatTarget(price('at_least'))).toBe('≥ $200.00');
    expect(formatTarget(price('at_most'))).toBe('≤ $200.00');
    expect(formatTarget(price('within'))).toBe('$200.00 ±5%');
    expect(formatTarget({ metric_name: 'pe_ratio', target_value: 25 })).toBe('≤ 25');
    expect(formatTarget({ metric_name: 'revenue_growth', target_value: 10.5 })).toBe('≥ 10.5');
  });

  test('formats values as dollars only for price', () => {
    expect(formatValue('price', 1234.5)).toBe('$1,234.50');
    expect(formatValue('pe_ratio', 21.456)).toBe('21.46');
    expect(formatValue('price', null)).toBe('—');
  });

  test('progress follows the direction', () => {
    expect(metricProgress(price('at_least', 100))).toBe(50);
    expect(metricProgress(price('at_least', 250))).toBe(100);
    expect(metricProgress(price('at_most', 400))).toBe(50); // $400 vs at most $200
    expect(metricProgress(price('at_most', 150))).toBe(100);
    expect(metricProgress(price('within', 200))).toBe(100);
    expect(metricProgress(price('within', 210))).toBeCloseTo(66.67, 1); // band edge
    expect(metricProgress(price('within', 300))).toBe(0);
    expect(metricProgress(price('at_least', null))).toBeNull();
  });

  test('fundamentals progress is unchanged', () => {
    expect(metricProgress({ metric_name: 'revenue_growth', current_value: 5, target_value: 10 })).toBe(50);
    expect(metricProgress({ metric_name: 'pe_ratio', current_value: 40, target_value: 20 })).toBe(50);
  });

  test('validates draft targets', () => {
    expect(targetError('', null, '5')).toMatch(/choose a metric/i);
    expect(targetError('pe_ratio', null, 'abc')).toMatch(/numeric/);
    expect(targetError('pe_ratio', null, '20')).toBe('');
    expect(targetError('price', null, '200')).toMatch(/at least, at most/);
    expect(targetError('price', 'within', '0')).toMatch(/above \$0/);
    expect(targetError('price', 'within', '200')).toBe('');
  });

  test('measures a price target against today\'s close', () => {
    expect(distanceFromPrice(220, 200)).toBeCloseTo(0.1);
    expect(distanceFromPrice(150, 200)).toBeCloseTo(-0.25);
    expect(distanceFromPrice(220, null)).toBeNull();
  });

  test('describes split adjustments', () => {
    expect(splitNote(1)).toBeNull();
    expect(splitNote(null)).toBeNull();
    expect(splitNote(0.25)).toBe('Adjusted for a 4:1 split');
    expect(splitNote(10)).toBe('Adjusted for a 1:10 reverse split');
    expect(splitNote(0.3)).toBe('Adjusted for stock splits');
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

describe('allTargetsAlreadyMet', () => {
  test('true only when every target was already met at its baseline', () => {
    expect(allTargetsAlreadyMet([{ already_met: true }])).toBe(true);
    expect(allTargetsAlreadyMet([{ already_met: true }, { already_met: true }])).toBe(true);
  });

  test('one genuine target is enough for the call to count', () => {
    expect(allTargetsAlreadyMet([{ already_met: true }, { already_met: false }])).toBe(false);
  });

  test('targets not yet baselined get the benefit of the doubt', () => {
    expect(allTargetsAlreadyMet([{ already_met: true }, { already_met: null }])).toBe(false);
    expect(allTargetsAlreadyMet([{}])).toBe(false);
    expect(allTargetsAlreadyMet([])).toBe(false);
  });
});
