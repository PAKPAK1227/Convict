import {
  isValidTicker,
  credentialError,
  MIN_PASSWORD_LENGTH,
  isDeleteConfirmed,
  DELETE_CONFIRM_PHRASE,
} from '../validation';

describe('isValidTicker', () => {
  test('accepts 1–5 letter tickers, case-insensitively', () => {
    expect(isValidTicker('NVDA')).toBe(true);
    expect(isValidTicker('nvda')).toBe(true);
    expect(isValidTicker('  aapl ')).toBe(true);
    expect(isValidTicker('F')).toBe(true);
  });

  test('rejects empty, too-long, numeric, or symbol-laden input', () => {
    expect(isValidTicker('')).toBe(false);
    expect(isValidTicker('TOOLONG')).toBe(false);
    expect(isValidTicker('BRK.B')).toBe(false);
    expect(isValidTicker('123')).toBe(false);
    expect(isValidTicker(undefined)).toBe(false);
  });
});

describe('credentialError', () => {
  test('flags missing email and password', () => {
    expect(credentialError('', 'password')).toMatch(/email/i);
    expect(credentialError('a@b.com', '')).toMatch(/password/i);
  });

  test('enforces minimum password length', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(credentialError('a@b.com', short)).toMatch(/at least/i);
  });

  test('returns empty string for valid credentials', () => {
    const ok = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(credentialError('a@b.com', ok)).toBe('');
  });
});

describe('isDeleteConfirmed', () => {
  test('accepts the exact phrase, tolerating surrounding whitespace', () => {
    expect(isDeleteConfirmed(DELETE_CONFIRM_PHRASE)).toBe(true);
    expect(isDeleteConfirmed('  DELETE  ')).toBe(true);
  });

  test('rejects wrong case, partial, or empty input', () => {
    expect(isDeleteConfirmed('delete')).toBe(false);
    expect(isDeleteConfirmed('DELET')).toBe(false);
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed(undefined)).toBe(false);
  });
});
