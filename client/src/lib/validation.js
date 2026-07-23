// Pure validation helpers shared across auth and thesis creation.
// Kept free of React/Supabase so they can be unit-tested directly.

export const MIN_PASSWORD_LENGTH = 6; // Supabase default

// §3: US tickers are 1–5 uppercase letters. Format check only — live existence
// verification must run server-side (Finnhub key can't ship to the browser).
const TICKER_RE = /^[A-Z]{1,5}$/;

export function isValidTicker(ticker) {
  return TICKER_RE.test((ticker || '').trim().toUpperCase());
}

/**
 * Validate login/signup credentials. Returns an error string, or '' if valid.
 */
export function credentialError(email, password) {
  if (!email || !email.trim()) return 'Enter your email.';
  if (!password) return 'Enter your password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return '';
}
