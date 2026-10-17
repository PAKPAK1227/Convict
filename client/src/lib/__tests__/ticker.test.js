import { rangePosition, titleCase, snapshotName, lookupState, thetaReading, formatPercent } from '../ticker';

describe('rangePosition', () => {
  test('places the price within its 52-week range', () => {
    expect(rangePosition(150, 100, 200)).toBe(50);
    expect(rangePosition(100, 100, 200)).toBe(0);
    expect(rangePosition(200, 100, 200)).toBe(100);
  });

  test('clamps a price outside the range', () => {
    expect(rangePosition(250, 100, 200)).toBe(100);
    expect(rangePosition(50, 100, 200)).toBe(0);
  });

  test('null for missing or degenerate ranges', () => {
    expect(rangePosition(150, null, 200)).toBeNull();
    expect(rangePosition(null, 100, 200)).toBeNull();
    expect(rangePosition(150, 200, 200)).toBeNull();
    expect(rangePosition(150, 'x', 200)).toBeNull();
  });
});

describe('names', () => {
  test('title-cases the all-caps listing name, keeping acronyms', () => {
    expect(titleCase('APPLE INC')).toBe('Apple Inc');
    expect(titleCase('TAIWAN SEMICONDUCTOR-SP ADR')).toBe('Taiwan Semiconductor-sp ADR');
    expect(titleCase('')).toBe('');
  });

  test('prefers the profile name', () => {
    expect(snapshotName({ company_name: 'Apple Inc', listed_name: 'APPLE INC' })).toBe('Apple Inc');
    expect(snapshotName({ company_name: null, listed_name: 'NEWCO CORP' })).toBe('Newco Corp');
    expect(snapshotName(null)).toBe('');
  });
});

describe('lookupState', () => {
  test('found when the row exists', () => {
    expect(lookupState({ row: { ticker: 'AAPL' }, tableHasRows: true })).toBe('found');
  });

  test('unknown only when the table is populated and the row is missing', () => {
    expect(lookupState({ row: null, tableHasRows: true })).toBe('unknown');
  });

  test('never blocks when the data simply is not there', () => {
    expect(lookupState({ row: null, tableHasRows: false })).toBe('unavailable');
    expect(lookupState({ error: new Error('x'), row: null, tableHasRows: true })).toBe('unavailable');
  });
});

describe('thetaReading', () => {
  test('maps Θ onto the bands', () => {
    expect(thetaReading(0.4).label).toBe('Range-bound');
    expect(thetaReading(1.0).label).toBe('Random-walk-like');
    expect(thetaReading(1.8).label).toBe('Directional');
  });

  test('band edges belong to the band above', () => {
    expect(thetaReading(0.6).label).toBe('Random-walk-like');
    expect(thetaReading(1.5).label).toBe('Directional');
  });

  test('null when there is no Θ', () => {
    expect(thetaReading(null)).toBeNull();
    expect(thetaReading(undefined)).toBeNull();
  });
});

describe('formatPercent', () => {
  test('formats a fraction', () => {
    expect(formatPercent(0.2834)).toBe('28.3%');
    expect(formatPercent(0.08, 0)).toBe('8%');
    expect(formatPercent(null)).toBe('—');
  });
});
