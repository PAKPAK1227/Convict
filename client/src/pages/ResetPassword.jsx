import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MIN_PASSWORD_LENGTH } from '../lib/validation';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';

/**
 * Lands here from the password-reset email. Supabase parses the recovery token
 * from the URL and establishes a short-lived session; we then let the user set a
 * new password via updateUser({ password }).
 */
function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // The recovery session may arrive via the PASSWORD_RECOVERY event or already
    // be present (Supabase parses the URL hash on load).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
  };

  const inputClass =
    'w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition';

  return (
    <div className="relative min-h-screen bg-bg flex flex-col">
      <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden="true" />
      <header className="relative z-10 mx-auto w-full max-w-6xl flex items-center justify-between px-4 sm:px-6 h-16">
        <Brand />
        <ThemeToggle />
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="ring-gradient bg-surface border border-line rounded-2xl shadow-card-hover p-8">
            <h1 className="font-serif text-3xl font-medium text-ink mb-1 text-center tracking-[-0.01em]">
              {done ? 'Password updated' : 'Set a new password'}
            </h1>

            {done ? (
              <>
                <p className="text-sm text-ink-2 text-center mb-6 mt-2">
                  Your password has been changed. Log in with your new password.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-3 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl transition"
                >
                  Go to log in
                </button>
              </>
            ) : !ready ? (
              <p className="text-sm text-ink-2 text-center mt-4">
                Open this page from the reset link in your email. If you got here another way,
                request a new link from the{' '}
                <button onClick={() => navigate('/forgot-password')} className="text-brand hover:underline">
                  forgot-password page
                </button>
                .
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4">
                <label className="block text-xs font-medium text-ink-2 mb-1.5">New password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} mb-4`}
                />
                <label className="block text-xs font-medium text-ink-2 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} mb-4`}
                />
                {error && (
                  <p className="text-sm text-status-broken mb-3 flex items-start gap-1.5" role="alert">
                    <span aria-hidden="true">⚠</span>{error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-brand hover:bg-brand-hover disabled:opacity-60 text-brand-fg font-semibold rounded-xl shadow-glow transition"
                >
                  {submitting ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
