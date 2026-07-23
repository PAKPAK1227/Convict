import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Shared header (§4). Previously every page rebuilt its own header markup.
 * Shows the signed-in user's email and a logout button when authenticated.
 */
function Navbar() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="flex items-center justify-between px-6 sm:px-8 py-4 border-b border-gray-800 bg-gray-950">
      <button
        onClick={() => navigate(session ? '/dashboard' : '/')}
        className="text-xl font-bold text-white tracking-tight"
      >
        Convict
      </button>

      {session && (
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-gray-400 truncate max-w-[180px]">
            {session.user?.email}
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
}

export default Navbar;
