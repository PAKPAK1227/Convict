function Dashboard() {

    const theses = [
        { id: 1, ticker: 'NVDA', company: 'NVIDIA Corp', conviction: 'High', status: 'On Track' },
        { id: 2, ticker: 'AAPL', company: 'Apple Inc', conviction: 'Medium', status: 'Watch' },
        { id: 3, ticker: 'TSLA', company: 'Tesla Inc', conviction: 'Low', status: 'Broken' },
    ];
    const getStatusColor = (status) => {
        if (status === 'On Track') return 'bg-green-500/10 text-green-400';
        if (status === 'Watch') return 'bg-yellow-500/10 text-yellow-400';
        if (status === 'Broken') return 'bg-red-500/10 text-red-400';
        return 'bg-gray-500/10 text-gray-400';
    };
    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <h1 className="text-3xl font-bold text-white mb-6">Your Theses</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {theses.map((thesis) => (
                    <div key={thesis.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h2 className="text-white font-bold text-lg">{thesis.ticker}</h2>
                        <p className="text-gray-400 text-sm">{thesis.company}</p>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs text-gray-500">Conviction: {thesis.conviction}</span>
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