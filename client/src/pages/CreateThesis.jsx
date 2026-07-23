import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { isValidTicker } from '../lib/validation';

// §3 note: ticker validation here is a *format* check only (see lib/validation).
// Verifying the symbol actually exists requires a live Finnhub lookup, which
// must run server-side (the Finnhub key must never ship to the browser — §6).
// See docs/DECISIONS.md: live existence-check is deferred until the data-service
// is deployed.

function CreateThesis() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [thesisText, setThesisText] = useState('');
  const [convictionLevel, setConvictionLevel] = useState('Medium');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');

    const normalizedTicker = ticker.trim().toUpperCase();
    if (!isValidTicker(normalizedTicker)) {
      setError('Enter a valid ticker — 1 to 5 letters (e.g. NVDA).');
      return;
    }
    if (!companyName.trim()) {
      setError('Enter a company name.');
      return;
    }
    if (!thesisText.trim()) {
      setError('Write your thesis before saving.');
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase
      .from('theses')
      .insert({
        user_id: userId,
        ticker: normalizedTicker,
        company_name: companyName.trim(),
        thesis_text: thesisText.trim(),
        conviction_level: convictionLevel,
      });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <div className="max-w-xl mx-auto p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-white mb-6">New Thesis</h1>

        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          maxLength={5}
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
          className="w-full px-4 py-3 mb-4 bg-gray-900 border border-gray-800 text-white rounded-lg outline-none"
        >
          <option value="High">High conviction</option>
          <option value="Medium">Medium conviction</option>
          <option value="Low">Low conviction</option>
        </select>

        {error && <p className="text-sm text-red-400 mb-4" role="alert">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold rounded-lg transition"
        >
          {submitting ? 'Creating...' : 'Create thesis'}
        </button>
      </div>
    </div>
  );
}

export default CreateThesis;
