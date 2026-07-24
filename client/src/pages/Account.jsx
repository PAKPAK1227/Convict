import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { isDeleteConfirmed, DELETE_CONFIRM_PHRASE } from '../lib/validation';

function Account() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const armed = isDeleteConfirmed(confirmText);

  const handleDeleteAccount = async () => {
    if (!armed) return;
    setError('');
    setDeleting(true);

    // Permanently deletes the caller's metrics, theses, and auth account via
    // the SECURITY DEFINER delete_user() function (see
    // supabase/migrations/20260723_delete_user.sql). auth.uid() inside the
    // function guarantees a user can only ever delete themselves.
    const { error: rpcError } = await supabase.rpc('delete_user');

    if (rpcError) {
      setDeleting(false);
      setError(
        `${rpcError.message}. If this says the function is missing, deploy ` +
        `supabase/migrations/20260723_delete_user.sql in the Supabase SQL editor.`
      );
      return;
    }

    // Account is gone — clear the local session and leave.
    await signOut();
    navigate('/', { replace: true });
  };

  const email = session?.user?.email || '';
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 animate-fade-up">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink mb-6 transition"
        >
          ← Back to Dashboard
        </button>

        <span className="eyebrow">Settings</span>
        <h1 className="mt-1.5 font-serif text-3xl sm:text-4xl font-medium text-ink tracking-[-0.01em] mb-6">Account</h1>

        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6 flex items-center gap-4">
          <span className="grid place-items-center h-12 w-12 rounded-full bg-accent/15 text-accent text-lg font-bold">
            {initial}
          </span>
          <div>
            <h2 className="eyebrow mb-0.5">Signed in as</h2>
            <p className="text-ink font-medium">{email}</p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-surface border border-status-broken/40 rounded-2xl shadow-card p-6">
          <h2 className="text-status-broken font-semibold mb-2 flex items-center gap-2">
            <span aria-hidden="true">⚠</span> Danger Zone
          </h2>
          <p className="text-ink text-sm mb-1">
            Permanently delete your account and all of your data.
          </p>
          <p className="text-ink-2 text-sm mb-4">
            This removes every thesis and metric you've created and deletes your
            login. <span className="text-ink font-medium">This cannot be undone.</span>
          </p>

          <label className="block text-sm text-ink-2 mb-2">
            Type <span className="font-mono text-ink">{DELETE_CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={DELETE_CONFIRM_PHRASE}
            autoComplete="off"
            className="w-full rounded-xl bg-surface-2 border border-line px-3 py-2.5 mb-3 text-ink text-sm placeholder:text-ink-3 focus:outline-none focus:border-status-broken/60 focus:ring-2 focus:ring-status-broken/25 transition"
          />

          {error && <p className="text-sm text-status-broken mb-3" role="alert">{error}</p>}

          <button
            onClick={handleDeleteAccount}
            disabled={!armed || deleting}
            className="w-full py-3 bg-status-broken hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition"
          >
            {deleting ? 'Deleting account...' : 'Permanently delete my account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Account;
