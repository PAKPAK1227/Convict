import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import { metricLabel, getStatusColor, freshness } from '../lib/metrics';

function Dashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [theses, setTheses] = useState([]);
    const [metricsByThesis, setMetricsByThesis] = useState({});
    const [deletingId, setDeletingId] = useState(null);

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

            if (mounted) {
                setTheses(rows);
                setMetricsByThesis(grouped);
                setLoading(false);
            }
        };

        load();
        return () => { mounted = false; };
    }, []);

    const handleDelete = async (e, thesis) => {
        e.stopPropagation(); // don't navigate into the card
        const ok = window.confirm(`Delete your thesis on ${thesis.ticker}? This cannot be undone.`);
        if (!ok) return;

        setDeletingId(thesis.id);
        // Remove dependent metrics first (in case no ON DELETE CASCADE exists),
        // then the thesis itself. RLS still scopes both to the current user.
        await supabase.from('metrics').delete().eq('thesis_id', thesis.id);
        const { error } = await supabase.from('theses').delete().eq('id', thesis.id);
        setDeletingId(null);

        if (error) {
            console.error(error);
            window.alert(error.message);
            return;
        }
        setTheses((prev) => prev.filter((t) => t.id !== thesis.id));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950">
                <Navbar />
                <div className="flex items-center justify-center py-24">
                    <p className="text-white">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar />
            <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Your Theses</h1>
                    <button
                        onClick={() => navigate('/create')}
                        className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition"
                    >
                        + New Thesis
                    </button>
                </div>

                {theses.length === 0 ? (
                    // Empty state (§4)
                    <div className="border border-dashed border-gray-800 rounded-2xl p-12 text-center">
                        <h2 className="text-white text-lg font-semibold mb-2">No theses yet</h2>
                        <p className="text-gray-400 mb-6">
                            Track your first investment thesis and let Convict evaluate it against live market data.
                        </p>
                        <button
                            onClick={() => navigate('/create')}
                            className="px-5 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition"
                        >
                            Create your first thesis
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {theses.map((thesis) => {
                            const metrics = metricsByThesis[thesis.id] || [];
                            const updated = freshness(thesis);
                            return (
                                <div
                                    key={thesis.id}
                                    onClick={() => navigate(`/thesis/${thesis.id}`)}
                                    className="bg-gray-900 border border-gray-800 rounded-2xl p-6 cursor-pointer hover:border-gray-700 transition flex flex-col"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h2 className="text-white font-bold text-lg">{thesis.ticker}</h2>
                                            <p className="text-gray-400 text-sm">{thesis.company_name}</p>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(thesis.status)}`}>
                                            {thesis.status || 'Pending'}
                                        </span>
                                    </div>

                                    {metrics.length > 0 && (
                                        <div className="mt-4 space-y-1">
                                            {metrics.map((m) => (
                                                <div key={m.id} className="flex justify-between text-xs text-gray-400">
                                                    <span>{metricLabel(m.metric_name)}</span>
                                                    <span>
                                                        {m.current_value == null
                                                            ? <span className="text-gray-600">not tracked</span>
                                                            : <>{m.current_value} <span className="text-gray-600">/ {m.target_value}</span></>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                                        <span className="text-xs text-gray-500">Conviction: {thesis.conviction_level}</span>
                                        <button
                                            onClick={(e) => handleDelete(e, thesis)}
                                            disabled={deletingId === thesis.id}
                                            className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-50 transition"
                                        >
                                            {deletingId === thesis.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>

                                    {updated && (
                                        <p className="mt-2 text-[11px] text-gray-600">Updated {updated}</p>
                                    )}
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
