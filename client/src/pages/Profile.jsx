import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import ConvictScore from '../components/ConvictScore';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../context/ToastContext';
import {
  isDeleteConfirmed,
  DELETE_CONFIRM_PHRASE,
  usernameError,
} from '../lib/validation';
import { formatDeadlineDate } from '../lib/deadline';

const inputClass =
  'w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/30 transition';
const labelClass = 'block text-xs font-medium text-ink-2 mb-1.5';

function Profile() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [resolved, setResolved] = useState([]);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const email = session?.user?.email || '';

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('username, display_name, bio, convict_score, resolved_count')
        .maybeSingle();
      const { data: theses } = await supabase
        .from('theses')
        .select('*')
        .eq('resolved', true)
        .order('target_date', { ascending: false });

      if (!mounted) return;
      if (p) {
        setProfile(p);
        setUsername(p.username || '');
        setDisplayName(p.display_name || '');
        setBio(p.bio || '');
      }
      setResolved(theses || []);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const saveProfile = async () => {
    const uErr = usernameError(username);
    if (uErr) { toast.error(uErr); return; }
    setSavingProfile(true);
    const { error: rpcError } = await supabase.rpc('update_profile', {
      p_username: username.trim(),
      p_display_name: displayName,
      p_bio: bio,
    });
    setSavingProfile(false);
    if (rpcError) { toast.error(rpcError.message); return; }
    setProfile((prev) => ({ ...prev, username: username.trim(), display_name: displayName, bio }));
    toast.success('Profile updated.');
  };

  const changeEmail = async () => {
    const next = newEmail.trim();
    if (!next.includes('@')) { toast.error('Enter a valid email address.'); return; }
    setSavingEmail(true);
    const { error: e } = await supabase.auth.updateUser({ email: next });
    setSavingEmail(false);
    if (e) { toast.error(e.message); return; }
    toast.success('Confirmation link sent to your new email — the change applies once you confirm it.');
    setNewEmail('');
  };

  const armed = isDeleteConfirmed(confirmText);

  const handleDeleteAccount = async () => {
    if (!armed) return;
    setError('');
    setDeleting(true);
    // Permanently deletes the caller's metrics, theses, and auth account via the
    // SECURITY DEFINER delete_user() function (see 20260723_delete_user.sql).
    const { error: rpcError } = await supabase.rpc('delete_user');
    if (rpcError) {
      setDeleting(false);
      setError(
        `${rpcError.message}. If this says the function is missing, deploy ` +
        `supabase/migrations/20260723_delete_user.sql in the Supabase SQL editor.`
      );
      return;
    }
    await signOut();
    navigate('/', { replace: true });
  };

  const score = profile ? Math.round(profile.convict_score) : 50;
  const resolvedCount = profile?.resolved_count ?? 0;

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

        <span className="eyebrow">Profile</span>
        <h1 className="mt-1.5 font-serif text-3xl sm:text-4xl font-medium text-ink tracking-[-0.01em] mb-6">
          {profile?.username ? `@${profile.username}` : 'Your Profile'}
        </h1>

        {/* Convict Score */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6">
          <ConvictScore score={score} resolvedCount={resolvedCount} />
        </div>

        {/* Editable details */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6">
          <h2 className="eyebrow mb-4">Details</h2>

          <label className={labelClass}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            placeholder="marketwizard"
            className={`${inputClass} mb-4`}
          />

          <label className={labelClass}>Display name <span className="text-ink-3">(optional)</span></label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="Your name"
            className={`${inputClass} mb-4`}
          />

          <label className={labelClass}>Bio <span className="text-ink-3">(optional)</span></label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="A line about your investing style."
            className={`${inputClass} mb-1 resize-y`}
          />
          <p className="text-xs text-ink-3 mb-4 text-right">{bio.length}/280</p>

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="px-5 py-2.5 bg-brand hover:bg-brand-hover disabled:opacity-60 text-brand-fg text-sm font-semibold rounded-xl transition"
          >
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {/* Email */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6">
          <h2 className="eyebrow mb-1">Email</h2>
          <p className="text-sm text-ink-2 mb-4">
            Signed in as <span className="text-ink">{email}</span>
          </p>
          <label className={labelClass}>Change email</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@example.com"
              autoComplete="email"
              className={inputClass}
            />
            <button
              onClick={changeEmail}
              disabled={savingEmail}
              className="shrink-0 px-5 py-3 border border-line text-ink text-sm font-semibold rounded-xl hover:bg-surface-2 disabled:opacity-60 transition"
            >
              {savingEmail ? 'Sending…' : 'Update'}
            </button>
          </div>
          <p className="text-xs text-ink-3 mt-2">
            We'll email a confirmation link to the new address; the change takes effect once you click it.
          </p>
        </div>

        {/* Track record */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="eyebrow">Track record</h2>
            <span className="text-[11px] text-ink-3">{resolved.length} resolved</span>
          </div>
          {loading ? (
            <p className="text-ink-3 text-sm">Loading…</p>
          ) : resolved.length === 0 ? (
            <p className="text-ink-3 text-sm">
              No resolved calls yet. Once a thesis passes its deadline, its locked verdict shows here.
            </p>
          ) : (
            <div className="space-y-3">
              {resolved.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/thesis/${t.id}`)}
                  className="w-full text-left rounded-xl border border-line bg-surface-2/40 p-3.5 hover:bg-surface-2 transition flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{t.ticker}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="text-sm text-ink-2 truncate mt-1">{t.thesis_text}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-ink-3">
                    {formatDeadlineDate(t.target_date)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-surface border border-status-broken/40 rounded-2xl shadow-card p-6">
          <h2 className="text-status-broken font-semibold mb-2 flex items-center gap-2">
            <span aria-hidden="true">⚠</span> Danger Zone
          </h2>
          <p className="text-ink text-sm mb-1">Permanently delete your account and all of your data.</p>
          <p className="text-ink-2 text-sm mb-4">
            This removes every thesis and metric you've created and deletes your login.{' '}
            <span className="text-ink font-medium">This cannot be undone.</span>
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

export default Profile;
