// "Has this account seen the walkthrough?" — stored on profiles.onboarded_at
// (see 20260726_onboarding.sql) so it follows the user across devices.
//
// Schema-defensive: if that migration hasn't been deployed the column/RPC are
// missing, and we fall back to localStorage. Worst case the tour shows once per
// browser instead of once per account — never twice in a row, and never a crash.

import { supabase } from '../supabaseClient';

const LS_PREFIX = 'convict.onboarded.';

const lsKey = (userId) => `${LS_PREFIX}${userId || 'anon'}`;

function readLocal(userId) {
  try {
    return localStorage.getItem(lsKey(userId)) != null;
  } catch {
    return false; // private mode / storage disabled
  }
}

function writeLocal(userId) {
  try {
    localStorage.setItem(lsKey(userId), new Date().toISOString());
  } catch {
    /* non-fatal */
  }
}

/** True if the walkthrough has already been completed by this account. */
export async function hasOnboarded(userId) {
  // Local flag first: it's synchronous-fast and already authoritative for a
  // "yes", so a returning user never sees the modal flash in.
  if (readLocal(userId)) return true;

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarded_at')
    .maybeSingle();

  // 42703 = undefined_column -> migration not deployed; localStorage decides.
  if (error) return false;
  return Boolean(data?.onboarded_at);
}

/** Mark the walkthrough finished. Writes locally first so it sticks either way. */
export async function markOnboarded(userId) {
  writeLocal(userId);
  // Missing function (migration not deployed) is expected and non-fatal.
  await supabase.rpc('complete_onboarding');
}

/** Clear the flag so the tour can be replayed from the profile page. */
export function forgetOnboardedLocal(userId) {
  try {
    localStorage.removeItem(lsKey(userId));
  } catch {
    /* non-fatal */
  }
}
