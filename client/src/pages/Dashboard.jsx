import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function Dashboard() {

    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [theses, setTheses] = useState([]);

    useEffect(() => {
        const checkUser = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            
            if (!sessionData.session) {
                navigate('/login');
                return;
            }

            const { data: thesesData, error } = await supabase
                .from('theses')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error(error);
            } else {
                setTheses(thesesData);
            }

            setLoading(false);
        };
        checkUser();
    }, [navigate]);

    
    const getStatusColor = (status) => {
        if (status === 'On Track') return 'bg-green-500/10 text-green-400';
        if (status === 'Watch') return 'bg-yellow-500/10 text-yellow-400';
        if (status === 'Broken') return 'bg-red-500/10 text-red-400';
        return 'bg-gray-500/10 text-gray-400';
    };

    if (loading) {
        return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <p className="text-white">Loading...</p>
        </div>
        );
    }
    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Your Theses</h1>
                <button
                    onClick={() => navigate('/create')}
                    className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition"
                >
                    + New Thesis
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {theses.map((thesis) => (
                    <div
                        key={thesis.id}
                        onClick={() => navigate(`/thesis/${thesis.id}`)}
                        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 cursor-pointer hover:border-gray-700 transition"
                    >
                        <h2 className="text-white font-bold text-lg">{thesis.ticker}</h2>
                        <p className="text-gray-400 text-sm">{thesis.company_name}</p>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs text-gray-500">Conviction: {thesis.conviction_level}</span>
                            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(thesis.status)}`}>
                                {thesis.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Dashboard;