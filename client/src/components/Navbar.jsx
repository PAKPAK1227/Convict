import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Brand from './Brand';
import ThemeToggle from './ThemeToggle';

/**
 * Shared header (§4). Sticky, translucent, with the brand lockup, a theme
 * toggle, and — when authenticated — the signed-in user and account controls.
 */
function Navbar() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const email = session?.user?.email || '';
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 h-16">
        <button
          onClick={() => navigate(session ? '/dashboard' : '/')}
          className="rounded-lg -ml-1 px-1"
          aria-label="Convict home"
        >
          <Brand />
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {session && (
            <>
              <span className="hidden md:flex items-center gap-2 text-sm text-ink-2 pl-1">
                <span className="grid place-items-center h-7 w-7 rounded-full bg-accent/15 text-accent text-xs font-bold">
                  {initial}
                </span>
                <span className="truncate max-w-[160px]">{email}</span>
              </span>

              <button
                onClick={() => navigate('/profile')}
                className="px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink rounded-lg hover:bg-surface-2 transition"
              >
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink border border-line rounded-lg hover:bg-surface-2 transition"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
