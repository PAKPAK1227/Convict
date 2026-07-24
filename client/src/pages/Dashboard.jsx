import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import StatusBadge from '../components/StatusBadge';
import MetricBar from '../components/MetricBar';
import ConvictScore from '../components/ConvictScore';
import { freshnessRelative } from '../lib/format';
import { deadlineStatus, daysUntil } from '../lib/deadline';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

// Resolved theses drop off the dashboard after this many days to prevent
// overload; they remain in the DB for the future profile/history view.
const ARCHIVE_AFTER_DAYS = 7;

// Conviction rendered as visual weight (§5.3): filled pips, High=3 … Low=1.
function ConvictionPips({ level }) {
    const filled = level === 'High' ? 3 : level === 'Low' ? 1 : 2;
    return (
        <span className="inline-flex items-center gap-1.5" title={`${level || 'Medium'} conviction`}>
            <span className="flex items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full ${i < filled ? 'bg-accent' : 'bg-surface-2 border border-line'}`}
                    />
                ))}
            </span>
            <span className="text-xs text-ink-3">{level || 'Medium'}</span>
        </span>
    );
}

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [theses, setTheses] = useState([]);
    const [metricsByThesis, setMetricsByThesis] = useState({});
    const [deletingId, setDeletingId] = useState(null);
    const [score, setScore] = useState(50);
    const [resolvedCount, setResolvedCount] = useState(0);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            const { data: thesesData, error } = await supabase
                .from('theses')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error(error);
                if (mounted) setLoading(false);
                return;
            }

            const rows = thesesData || [];

            // Fetch metrics for these theses so the cards can show current vs
            // target (§4), not just the detail page.
            let grouped = {};
            if (rows.length > 0) {
                const ids = rows.map((t) => t.id);
                const { data: metricsData, error: metricsError } = await supabase
                    .from('metrics')
                    .select('*')
                    .in('thesis_id', ids);

                if (metricsError) {
                    console.error(metricsError);
                } else {
                    grouped = (metricsData || []).reduce((acc, m) => {
                        (acc[m.thesis_id] = acc[m.thesis_id] || []).push(m);
                        return acc;
                    }, {});
                }
            }

            // Persisted Convict Score from the user's profile (RLS scopes the
            // select to their own row). Absent row / un-migrated DB -> default 50.
            const { data: profile } = await supabase
                .from('profiles')
                .select('convict_score, resolved_count')
                .maybeSingle();

            if (mounted) {
                setTheses(rows);
                setMetricsByThesis(grouped);
                if (profile) {
                    setScore(Math.round(profile.convict_score));
                    setResolvedCount(profile.resolved_count ?? 0);
                }
                setLoading(false);
            }
        };

        load();
        return () => { mounted = false; };
    }, []);

    const handleDelete = async (e, thesis) => {
        e.stopPropagation(); // don't navigate into the card
        const ok = await confirm({
            title: `Delete ${thesis.ticker}?`,
            body: 'This permanently removes the thesis and all of its metrics. This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;

        setDeletingId(thesis.id);
        // Remove dependent metrics first (in case no ON DELETE CASCADE exists),
        // then the thesis itself. RLS still scopes both to the current user.
        await supabase.from('metrics').delete().eq('thesis_id', thesis.id);
        const { error } = await supabase.from('theses').delete().eq('id', thesis.id);
        setDeletingId(null);

        if (error) {
            console.error(error);
            toast.error(error.message);
            return;
        }
        setTheses((prev) => prev.filter((t) => t.id !== thesis.id));
        toast.success(`Deleted your thesis on ${thesis.ticker}.`);
    };

    // Active theses only: resolved ones fall off after a week (kept in the DB
    // for the future profile/history view).
    const visibleTheses = theses.filter((t) => {
        const d = daysUntil(t.target_date);
        return d === null || d >= -ARCHIVE_AFTER_DAYS;
    });

    // Presentational aggregation over the visible theses (no backend).
    const summary = visibleTheses.reduce(
        (acc, t) => {
            acc.total += 1;
            const s = t.status || 'Pending';
            if (s === 'On Track') acc.ok += 1;
            else if (s === 'Watch') acc.watch += 1;
            else if (s === 'Broken') acc.broken += 1;
            else acc.pending += 1;
            return acc;
        },
        { total: 0, ok: 0, watch: 0, broken: 0, pending: 0 }
    );

    const summaryTiles = [
        { label: 'Theses', value: summary.total, accent: 'text-ink', glyph: null },
        { label: 'On Track', value: summary.ok, accent: 'text-status-ok', glyph: '●' },
        { label: 'Watch', value: summary.watch, accent: 'text-status-watch', glyph: '◐' },
        { label: 'Broken', value: summary.broken, accent: 'text-status-broken', glyph: '○' },
    ];

    return (
        <div className="min-h-screen bg-bg">
            <Navbar />
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
                <div className="flex items-end justify-between gap-4 mb-6">
                    <div>
                        <span className="eyebrow">Portfolio</span>
                        <h1 className="mt-1.5 font-serif text-3xl sm:text-4xl font-medium text-ink tracking-[-0.01em]">Your Theses</h1>
                    </div>
                    <button
                        onClick={() => navigate('/create')}
                        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl shadow-glow transition"
                    >
                        <span className="text-lg leading-none">+</span> New Thesis
                    </button>
                </div>

                {/* Convict Score */}
                {!loading && (
                    <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6 animate-fade-up">
                        <ConvictScore score={score} resolvedCount={resolvedCount} />
                    </div>
                )}

                {/* Portfolio summary */}
                {!loading && visibleTheses.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8 animate-fade-up">
                        {summaryTiles.map((tile) => (
                            <div key={tile.label} className="bg-surface border border-line rounded-2xl p-4 shadow-card">
                                <div className="flex items-center gap-1.5 eyebrow">
                                    {tile.glyph && <span aria-hidden="true" className={tile.accent}>{tile.glyph}</span>}
                                    {tile.label}
                                </div>
                                <div className={`mt-1.5 font-mono text-3xl font-semibold tnum ${tile.accent}`}>{tile.value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {loading ? (
                    // Skeleton grid (§5.6) instead of a bare "Loading…".
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="bg-surface border border-line rounded-2xl p-6 shadow-card">
                                <div className="relative overflow-hidden">
                                    <div className="h-5 w-20 rounded bg-surface-2" />
                                    <div className="mt-2 h-3 w-32 rounded bg-surface-2" />
                                    <div className="mt-6 space-y-3">
                                        <div className="h-2 w-full rounded bg-surface-2" />
                                        <div className="h-2 w-4/5 rounded bg-surface-2" />
                                    </div>
                                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-ink/5 to-transparent" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : visibleTheses.length === 0 ? (
                    // Empty state (§4)
                    <div className="ring-gradient border border-line bg-surface rounded-2xl p-12 text-center shadow-card animate-fade-up">
                        <div className="mx-auto mb-5 grid place-items-center h-14 w-14 rounded-2xl bg-accent/12 text-accent text-2xl">◇</div>
                        <h2 className="text-ink text-lg font-semibold mb-2">No theses yet</h2>
                        <p className="text-ink-2 mb-6 max-w-sm mx-auto">
                            Track your first investment thesis and let Convict evaluate it against live market data.
                        </p>
                        <button
                            onClick={() => navigate('/create')}
                            className="px-5 py-3 bg-brand hover:bg-brand-hover text-brand-fg font-semibold rounded-xl shadow-glow transition"
                        >
                            Create your first thesis
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {visibleTheses.map((thesis) => {
                            const metrics = metricsByThesis[thesis.id] || [];
                            const updated = freshnessRelative(thesis);
                            const dl = deadlineStatus(thesis.target_date);
                            return (
                                <div
                                    key={thesis.id}
                                    onClick={() => navigate(`/thesis/${thesis.id}`)}
                                    className="group relative bg-surface border border-line rounded-2xl p-6 cursor-pointer shadow-card hover:shadow-card-hover hover:border-ink-3/40 transition-all duration-200 flex flex-col hover:-translate-y-0.5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="font-mono text-lg font-semibold text-ink tracking-tight">{thesis.ticker}</h2>
                                            <p className="text-ink-2 text-sm truncate">{thesis.company_name}</p>
                                        </div>
                                        <StatusBadge status={thesis.status} />
                                    </div>

                                    {metrics.length > 0 && (
                                        <div className="mt-5 space-y-3.5">
                                            {metrics.map((m) => (
                                                <MetricBar key={m.id} metric={m} />
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
                                        <ConvictionPips level={thesis.conviction_level} />
                                        <button
                                            onClick={(e) => handleDelete(e, thesis)}
                                            disabled={deletingId === thesis.id}
                                            className="text-xs text-ink-3 hover:text-status-broken disabled:opacity-50 transition"
                                        >
                                            {deletingId === thesis.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                                        {updated ? (
                                            <span className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                                                Updated {updated}
                                            </span>
                                        ) : <span />}
                                        {dl && (
                                            <span className={dl.resolved ? 'text-ink-2' : dl.dueToday ? 'text-status-watch' : 'text-ink-3'}>
                                                {dl.resolved ? '🔒 ' : '◷ '}{dl.label}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
