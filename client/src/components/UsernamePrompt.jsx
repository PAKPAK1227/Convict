import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { usernameError } from '../lib/validation';

/**
 * One-time modal shown when a logged-in account has no username yet (old accounts
 * / edge cases). Not dismissable — a username is required to continue. Writes via
 * the set_username RPC so the score column stays untouchable.
 */
function UsernamePrompt({ onDone }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const uErr = usernameError(username);
    if (uErr) { setError(uErr); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('set_username', { name: username.trim() });
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone(username.trim());
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a username"
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface shadow-card-hover p-6 animate-fade-up"
      >
        <h2 className="font-serif text-xl text-ink mb-1">Choose a username</h2>
        <p className="text-sm text-ink-2 mb-5">
          This is how you'll be identified on Convict. 3–20 letters, numbers, or underscores.
        </p>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            placeholder="marketwizard"
            className="w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/30 transition mb-3"
          />
          {error && (
            <p className="text-sm text-status-broken mb-3 flex items-start gap-1.5" role="alert">
              <span aria-hidden="true">⚠</span>{error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl disabled:opacity-60 transition"
          >
            {saving ? 'Saving…' : 'Set username'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UsernamePrompt;
