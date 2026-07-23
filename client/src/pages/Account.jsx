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

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <div className="max-w-2xl mx-auto p-6 sm:p-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-white mb-6"
        >
          ← Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold text-white mb-6">Account</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-1">Signed in as</h2>
          <p className="text-gray-400 text-sm">{session?.user?.email}</p>
        </div>

        {/* Danger Zone */}
        <div className="bg-gray-900 border border-red-500/40 rounded-2xl p-6">
          <h2 className="text-red-400 font-semibold mb-2">Danger Zone</h2>
          <p className="text-gray-300 text-sm mb-1">
            Permanently delete your account and all of your data.
          </p>
          <p className="text-gray-500 text-sm mb-4">
            This removes every thesis and metric you've created and deletes your
            login. <span className="text-gray-300">This cannot be undone.</span>
          </p>

          <label className="block text-sm text-gray-400 mb-2">
            Type <span className="font-mono text-gray-200">{DELETE_CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={DELETE_CONFIRM_PHRASE}
            autoComplete="off"
            className="w-full px-3 py-2 mb-3 bg-gray-800 text-white text-sm rounded-lg outline-none border border-gray-700 focus:border-red-500/60"
          />

          {error && <p className="text-sm text-red-400 mb-3" role="alert">{error}</p>}

          <button
            onClick={handleDeleteAccount}
            disabled={!armed || deleting}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
          >
            {deleting ? 'Deleting account...' : 'Permanently delete my account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Account;
