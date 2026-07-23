import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from '../supabaseClient';

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

	const handleSignUp = async () => {
		const { data, error } = await supabase.auth.signUp({
		email: email,
		password: password,
		});

		if (error) {
		alert(error.message);
		} else {
		navigate('/dashboard');
		}
	};

	const handleLogIn = async () => {
		const { data, error } = await supabase.auth.signInWithPassword({
		email: email,
		password: password,
		});

		if (error) {
		alert(error.message);
		} else {
		navigate('/dashboard');
		}
	};

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm">
                <h1 className="text-2xl font-bold text-white mb-6 text-center">Log in to Convict</h1>
                <input 
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full px-4 py-3 mb-4 bg-gray-800 text-white rounded-lg outline-none"
                />
				<input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="w-full px-4 py-3 mb-4 bg-gray-800 text-white rounded-lg outline-none"	
				/>

				<button
					onClick={handleSignUp}
					className="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition mt-2"
				>
         			Sign up
        		</button>

				<button
					onClick={handleLogIn}
					className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition mt-2"
				>
         			Log in
        		</button>
            </div>
        </div>
    );
}

export default Login;