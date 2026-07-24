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

// Usernames: 3–20 chars, letters/numbers/underscore (mirrors the DB CHECK and
// the username_available / set_username RPCs).
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(name) {
  return USERNAME_RE.test((name || '').trim());
}

/** Returns an error string for a username, or '' if the format is valid. */
export function usernameError(name) {
  const v = (name || '').trim();
  if (!v) return 'Choose a username.';
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_RE.test(v)) return 'Use only letters, numbers, or underscores.';
  return '';
}

// The user must type this exactly to arm the permanent-delete button.
export const DELETE_CONFIRM_PHRASE = 'DELETE';

/**
 * True only when the typed confirmation exactly matches the phrase (after
 * trimming surrounding whitespace). Case-sensitive on purpose — deleting an
 * account is irreversible, so we want a deliberate, exact match.
 */
export function isDeleteConfirmed(input) {
  return (input || '').trim() === DELETE_CONFIRM_PHRASE;
}
