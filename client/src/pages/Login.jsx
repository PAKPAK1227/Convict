import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from '../supabaseClient';
import { MIN_PASSWORD_LENGTH, credentialError, isValidUsername, usernameError } from '../lib/validation';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';

function Login() {
    const navigate = useNavigate();

    // "login" | "signup" — split views (§2) instead of one ambiguous card.
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [uAvail, setUAvail] = useState(null); // null | true | false
    const [error, setError] = useState("");       // inline error (§2), replaces alert()
    const [message, setMessage] = useState("");    // e.g. "check your email" (§2)
    const [submitting, setSubmitting] = useState(false); // loading state (§2)

    const isSignup = mode === "signup";

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError("");
        setMessage("");
    };

    // Debounced username availability check (signup only).
    useEffect(() => {
        if (!isSignup) return;
        const name = username.trim();
        if (!isValidUsername(name)) {
            setUAvail(null);
            return;
        }
        let active = true;
        const t = setTimeout(async () => {
            const { data } = await supabase.rpc('username_available', { name });
            if (active) setUAvail(data === true);
        }, 400);
        return () => { active = false; clearTimeout(t); };
    }, [username, isSignup]);

    const handleSignUp = async () => {
        setError("");
        setMessage("");

        const uErr = usernameError(username);
        if (uErr) {
            setError(uErr);
            return;
        }
        const validationError = credentialError(email, password);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        try {
            // Block early if the username is already taken (the DB also enforces it).
            const { data: available } = await supabase.rpc('username_available', {
                name: username.trim(),
            });
            if (available !== true) {
                setError('That username is taken.');
                return;
            }

            // §1: clear any existing session first so a new signup can never
            // inherit the previous user's session.
            await supabase.auth.signOut();

            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: { username: username.trim() }, // -> profiles via handle_new_user trigger
                    emailRedirectTo: window.location.origin + '/login',
                },
            });

            if (error) {
                setError(error.message);
                return;
            }

            // §1: don't navigate blindly. With email confirmation enabled,
            // signUp returns success but NO active session.
            if (!data.session) {
                setMessage("Check your email to confirm your account, then log in.");
                return;
            }

            navigate('/dashboard');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLogIn = async () => {
        setError("");
        setMessage("");

        const validationError = credentialError(email, password);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        try {
            // Allow logging in with a username as well as an email: if there's no
            // "@", resolve the username to its email first.
            let loginEmail = email.trim();
            if (!loginEmail.includes('@')) {
                const { data: resolved } = await supabase.rpc('email_for_username', {
                    name: loginEmail,
                });
                if (!resolved) {
                    setError('No account found with that username.');
                    return;
                }
                loginEmail = resolved;
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error) {
                setError(error.message);
                return;
            }

            if (data.session) {
                navigate('/dashboard');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isSignup) {
            handleSignUp();
        } else {
            handleLogIn();
        }
    };

    const inputClass =
        "w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition";

    const usernameHint = () => {
        const v = username.trim();
        if (!v) return null;
        if (!isValidUsername(v)) return <span className="text-ink-3">3–20 letters, numbers, or _</span>;
        if (uAvail === false) return <span className="text-status-broken">Taken</span>;
        if (uAvail === true) return <span className="text-status-ok">Available ✓</span>;
        return <span className="text-ink-3">Checking…</span>;
    };

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
                            {isSignup ? "Create account" : "Welcome back"}
                        </h1>
                        <p className="text-sm text-ink-2 text-center mb-6">
                            {isSignup
                                ? "Start tracking your convictions."
                                : "Log in to your Convict dashboard."}
                        </p>

                        {/* View toggle (§2) */}
                        <div className="flex mb-6 bg-surface-2 rounded-xl p-1">
                            <button
                                type="button"
                                onClick={() => switchMode("login")}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                                    !isSignup ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                                }`}
                            >
                                Log in
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode("signup")}
                                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                                    isSignup ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                                }`}
                            >
                                Sign up
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {isSignup && (
                                <>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-medium text-ink-2">Username</label>
                                        <span className="text-xs">{usernameHint()}</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="marketwizard"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        autoComplete="username"
                                        maxLength={20}
                                        className={`${inputClass} mb-4`}
                                    />
                                </>
                            )}

                            <label className="block text-xs font-medium text-ink-2 mb-1.5">
                                {isSignup ? 'Email' : 'Email or username'}
                            </label>
                            <input
                                type={isSignup ? 'email' : 'text'}
                                placeholder={isSignup ? 'you@example.com' : 'you@example.com or username'}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete={isSignup ? 'email' : 'username'}
                                className={`${inputClass} mb-4`}
                            />

                            <label className="block text-xs font-medium text-ink-2 mb-1.5">Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={isSignup ? "new-password" : "current-password"}
                                className={`${inputClass} mb-1.5`}
                            />
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-ink-3">At least {MIN_PASSWORD_LENGTH} characters.</p>
                                {!isSignup && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/forgot-password')}
                                        className="text-xs font-medium text-ink-2 hover:text-ink transition"
                                    >
                                        Forgot password?
                                    </button>
                                )}
                            </div>

                            {error && (
                                <p className="text-sm text-status-broken mb-3 flex items-start gap-1.5" role="alert">
                                    <span aria-hidden="true">⚠</span>{error}
                                </p>
                            )}
                            {message && (
                                <p className="text-sm text-status-ok mb-3 flex items-start gap-1.5" role="status">
                                    <span aria-hidden="true">✓</span>{message}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 bg-brand hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-brand-fg font-semibold rounded-xl shadow-glow transition mt-2"
                            >
                                {submitting
                                    ? (isSignup ? "Signing up..." : "Logging in...")
                                    : (isSignup ? "Sign up" : "Log in")}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
