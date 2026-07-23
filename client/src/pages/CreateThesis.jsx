import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function CreateThesis() {
  const navigate = useNavigate();

  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [thesisText, setThesisText] = useState('');
  const [convictionLevel, setConvictionLevel] = useState('Medium');

  const handleSubmit = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;

    const { error } = await supabase
      .from('theses')
      .insert({
        user_id: userId,
        ticker: ticker.toUpperCase(),
        company_name: companyName,
        thesis_text: thesisText,
        conviction_level: convictionLevel,
      });

    if (error) {
      alert(error.message);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">New Thesis</h1>

        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="w-full px-4 py-3 mb-4 bg-gray-900 border border-gray-800 text-white rounded-lg outline-none"
        />

        <input
          type="text"
          placeholder="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-full px-4 py-3 mb-4 bg-gray-900 border border-gray-800 text-white rounded-lg outline-none"
        />

        <textarea
          placeholder="Write your thesis..."
          value={thesisText}
          onChange={(e) => setThesisText(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 mb-4 bg-gray-900 border border-gray-800 text-white rounded-lg outline-none"
        />

        <select
          value={convictionLevel}
          onChange={(e) => setConvictionLevel(e.target.value)}
          className="w-full px-4 py-3 mb-6 bg-gray-900 border border-gray-800 text-white rounded-lg outline-none"
        >
          <option value="High">High conviction</option>
          <option value="Medium">Medium conviction</option>
          <option value="Low">Low conviction</option>
        </select>

        <button
          onClick={handleSubmit}
          className="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition"
        >
          Create thesis
        </button>
      </div>
    </div>
  );
}

export default CreateThesis;