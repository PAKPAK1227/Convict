import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from '../supabaseClient';
import { MIN_PASSWORD_LENGTH, credentialError } from '../lib/validation';

function Login() {
    const navigate = useNavigate();

    // "login" | "signup" — split views (§2) instead of one ambiguous card.
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");       // inline error (§2), replaces alert()
    const [message, setMessage] = useState("");    // e.g. "check your email" (§2)
    const [submitting, setSubmitting] = useState(false); // loading state (§2)

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError("");
        setMessage("");
    };

    const handleSignUp = async () => {
        setError("");
        setMessage("");

        const validationError = credentialError(email, password);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        try {
            // §1: clear any existing session first so a new signup can never
            // inherit the previous user's session.
            await supabase.auth.signOut();

            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
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
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
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
        if (mode === "signup") {
            handleSignUp();
        } else {
            handleLogIn();
        }
    };

    const isSignup = mode === "signup";

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm">
                <h1 className="text-2xl font-bold text-white mb-6 text-center">
                    {isSignup ? "Create your account" : "Log in to Convict"}
                </h1>

                {/* View toggle (§2) */}
                <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
                    <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                            !isSignup ? "bg-gray-700 text-white" : "text-gray-400"
                        }`}
                    >
                        Log in
                    </button>
                    <button
                        type="button"
                        onClick={() => switchMode("signup")}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                            isSignup ? "bg-gray-700 text-white" : "text-gray-400"
                        }`}
                    >
                        Sign up
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="w-full px-4 py-3 mb-4 bg-gray-800 text-white rounded-lg outline-none"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        className="w-full px-4 py-3 mb-1 bg-gray-800 text-white rounded-lg outline-none"
                    />
                    <p className="text-xs text-gray-500 mb-3">
                        At least {MIN_PASSWORD_LENGTH} characters.
                    </p>

                    {error && (
                        <p className="text-sm text-red-400 mb-3" role="alert">{error}</p>
                    )}
                    {message && (
                        <p className="text-sm text-green-400 mb-3" role="status">{message}</p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold rounded-lg transition mt-2"
                    >
                        {submitting
                            ? (isSignup ? "Signing up..." : "Logging in...")
                            : (isSignup ? "Sign up" : "Log in")}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
