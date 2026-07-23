import {useNavigate} from 'react-router-dom';


function Landing() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-white mb-6">Convict</h1>
                <button
                    onClick={() => navigate('/login')}
                    className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition"
                >
                    Get started
                </button>
            </div>
        </div>
    );
}
export default Landing;