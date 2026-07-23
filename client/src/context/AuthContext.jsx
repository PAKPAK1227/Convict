import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({
  session: null,
  loading: true,
  signOut: async () => {},
});

/**
 * Centralized auth state (§1 / §4 of CONVICT_TODO).
 *
 * Rather than each page calling getSession() once on mount — which is exactly
 * how the stale-session bug in §1 slipped through — we hold the session in one
 * place and subscribe to onAuthStateChange so the whole app reacts to sign-in,
 * sign-out, and token-refresh events as they happen.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Seed initial state from any persisted session.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    // React to every subsequent auth change (sign in/out, token refresh).
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will clear `session`; set it here too so callers that
    // navigate immediately don't briefly see a stale value.
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
