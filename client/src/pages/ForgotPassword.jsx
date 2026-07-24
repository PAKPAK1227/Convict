import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/reset-password',
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  const inputClass =
    'w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition';

  return (
    <div className="relative min-h-screen bg-bg flex flex-col">
      <div className="absolute inset-0 bg-grid bg-grid-fade pointer-events-none" aria-hidden="true" />
      <header className="relative z-10 mx-auto w-full max-w-6xl flex items-center justify-between px-4 sm:px-6 h-16">
        <button onClick={() => navigate('/')} aria-label="Convict home" className="rounded-lg">
          <Brand />
        </button>
        <ThemeToggle />
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="ring-gradient bg-surface border border-line rounded-2xl shadow-card-hover p-8">
            <h1 className="font-serif text-3xl font-medium text-ink mb-1 text-center tracking-[-0.01em]">
              Reset password
            </h1>

            {sent ? (
              <>
                <p className="text-sm text-ink-2 text-center mb-6 mt-2">
                  If an account exists for <span className="text-ink">{email.trim()}</span>, a
                  reset link is on its way. Check your inbox.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-3 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl transition"
                >
                  Back to log in
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2 text-center mb-6">
                  Enter your email and we'll send you a link to set a new password.
                </p>
                <form onSubmit={handleSubmit}>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
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
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full mt-3 text-sm font-medium text-ink-2 hover:text-ink transition"
                  >
                    Back to log in
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
