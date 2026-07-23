import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import { METRIC_OPTIONS, metricLabel } from '../lib/metrics';

// §3: the evaluator only understands the canonical metric names in METRIC_OPTIONS.
// A free-text field previously let users type anything, which the evaluator then
// silently skipped — the dropdown below restricts input to exactly those keys.

const CONVICTION_OPTIONS = ['High', 'Medium', 'Low'];

function ThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [thesis, setThesis] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);

  // add-metric form
  const [metricName, setMetricName] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [metricError, setMetricError] = useState('');
  const [addingMetric, setAddingMetric] = useState(false);

  // edit-metric state (id currently being edited -> draft target)
  const [editingMetricId, setEditingMetricId] = useState(null);
  const [editingTarget, setEditingTarget] = useState('');

  // edit-thesis state
  const [editingThesis, setEditingThesis] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftCompany, setDraftCompany] = useState('');
  const [draftConviction, setDraftConviction] = useState('Medium');
  const [savingThesis, setSavingThesis] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchThesis = async () => {
      const { data: thesisData, error: thesisError } = await supabase
        .from('theses')
        .select('*')
        .eq('id', id)
        .single();

      const { data: metricsData, error: metricsError } = await supabase
        .from('metrics')
        .select('*')
        .eq('thesis_id', id);

      if (!mounted) return;

      if (thesisError || metricsError) {
        console.error(thesisError || metricsError);
      } else {
        setThesis(thesisData);
        setMetrics(metricsData || []);
      }
      setLoading(false);
    };

    fetchThesis();
    return () => { mounted = false; };
  }, [id]);

  const handleAddMetric = async () => {
    setMetricError('');

    if (!metricName) {
      setMetricError('Choose a metric.');
      return;
    }
    if (targetValue === '' || Number.isNaN(Number(targetValue))) {
      setMetricError('Enter a numeric target value.');
      return;
    }
    if (metrics.some((m) => m.metric_name === metricName)) {
      setMetricError('That metric is already tracked on this thesis.');
      return;
    }

    setAddingMetric(true);
    const { data, error } = await supabase
      .from('metrics')
      .insert({
        thesis_id: id,
        metric_name: metricName, // already canonical
        target_value: Number(targetValue),
      })
      .select()
      .single();
    setAddingMetric(false);

    if (error) {
      setMetricError(error.message);
      return;
    }
    setMetrics([...metrics, data]);
    setMetricName('');
    setTargetValue('');
  };

  const startEditMetric = (metric) => {
    setEditingMetricId(metric.id);
    setEditingTarget(String(metric.target_value ?? ''));
  };

  const saveEditMetric = async (metric) => {
    if (editingTarget === '' || Number.isNaN(Number(editingTarget))) {
      window.alert('Enter a numeric target value.');
      return;
    }
    const { data, error } = await supabase
      .from('metrics')
      .update({ target_value: Number(editingTarget) })
      .eq('id', metric.id)
      .select()
      .single();

    if (error) {
      window.alert(error.message);
      return;
    }
    setMetrics((prev) => prev.map((m) => (m.id === metric.id ? data : m)));
    setEditingMetricId(null);
    setEditingTarget('');
  };

  const deleteMetric = async (metric) => {
    const ok = window.confirm(`Remove ${metricLabel(metric.metric_name)} from this thesis?`);
    if (!ok) return;
    const { error } = await supabase.from('metrics').delete().eq('id', metric.id);
    if (error) {
      window.alert(error.message);
      return;
    }
    setMetrics((prev) => prev.filter((m) => m.id !== metric.id));
  };

  const startEditThesis = () => {
    setDraftText(thesis.thesis_text || '');
    setDraftCompany(thesis.company_name || '');
    setDraftConviction(thesis.conviction_level || 'Medium');
    setEditingThesis(true);
  };

  const saveThesis = async () => {
    setSavingThesis(true);
    const { data, error } = await supabase
      .from('theses')
      .update({
        thesis_text: draftText,
        company_name: draftCompany,
        conviction_level: draftConviction,
      })
      .eq('id', id)
      .select()
      .single();
    setSavingThesis(false);

    if (error) {
      window.alert(error.message);
      return;
    }
    setThesis(data);
    setEditingThesis(false);
  };

  const deleteThesis = async () => {
    const ok = window.confirm(`Delete your thesis on ${thesis.ticker}? This cannot be undone.`);
    if (!ok) return;
    await supabase.from('metrics').delete().eq('thesis_id', id);
    const { error } = await supabase.from('theses').delete().eq('id', id);
    if (error) {
      window.alert(error.message);
      return;
    }
    navigate('/dashboard');
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

  if (!thesis) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="max-w-2xl mx-auto p-8">
          <p className="text-gray-400">Thesis not found.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-green-400 hover:text-green-300">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <div className="max-w-2xl mx-auto p-6 sm:p-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-white mb-6"
        >
          ← Back to Dashboard
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">{thesis.ticker}</h1>
            <p className="text-gray-400">{thesis.company_name}</p>
          </div>
          <div className="flex gap-3 text-sm">
            {!editingThesis && (
              <button onClick={startEditThesis} className="text-gray-400 hover:text-white">Edit</button>
            )}
            <button onClick={deleteThesis} className="text-gray-400 hover:text-red-400">Delete</button>
          </div>
        </div>

        {/* Thesis body — view or edit (§4) */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          {editingThesis ? (
            <div className="space-y-3">
              <input
                type="text"
                value={draftCompany}
                onChange={(e) => setDraftCompany(e.target.value)}
                placeholder="Company name"
                className="w-full px-3 py-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
              />
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={5}
                placeholder="Write your thesis..."
                className="w-full px-3 py-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
              />
              <select
                value={draftConviction}
                onChange={(e) => setDraftConviction(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
              >
                {CONVICTION_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c} conviction</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  onClick={saveThesis}
                  disabled={savingThesis}
                  className="px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-60 text-black text-sm font-bold rounded-lg transition"
                >
                  {savingThesis ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingThesis(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-white font-semibold">Your Thesis</h2>
                <span className="text-xs text-gray-500">Conviction: {thesis.conviction_level}</span>
              </div>
              <p className="text-gray-300 whitespace-pre-wrap">{thesis.thesis_text}</p>
            </>
          )}
        </div>

        {/* Metrics */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Metrics</h2>

          {metrics.length === 0 ? (
            <p className="text-gray-500 text-sm">No metrics added yet.</p>
          ) : (
            metrics.map((metric) => (
              <div key={metric.id} className="flex items-center justify-between text-sm text-gray-300 mb-3">
                <span className="font-medium">{metricLabel(metric.metric_name)}</span>

                {editingMetricId === metric.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editingTarget}
                      onChange={(e) => setEditingTarget(e.target.value)}
                      className="w-24 px-2 py-1 bg-gray-800 text-white text-sm rounded outline-none"
                    />
                    <button onClick={() => saveEditMetric(metric)} className="text-green-400 hover:text-green-300">Save</button>
                    <button onClick={() => setEditingMetricId(null)} className="text-gray-500 hover:text-white">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400">
                      {/* §3: surface missing Finnhub data instead of hiding it */}
                      {metric.current_value == null
                        ? <span className="text-gray-600">not tracked yet</span>
                        : <>{metric.current_value} <span className="text-gray-600">/ target {metric.target_value}</span></>}
                    </span>
                    <button onClick={() => startEditMetric(metric)} className="text-gray-500 hover:text-white">Edit</button>
                    <button onClick={() => deleteMetric(metric)} className="text-gray-500 hover:text-red-400">Delete</button>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Add metric — dropdown instead of free text (§3) */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <select
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
            >
              <option value="">Select a metric…</option>
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Target value"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
            />
            {metricError && <p className="text-sm text-red-400 mb-2" role="alert">{metricError}</p>}
            <button
              onClick={handleAddMetric}
              disabled={addingMetric}
              className="w-full py-2 bg-green-500 hover:bg-green-400 disabled:opacity-60 text-black text-sm font-bold rounded-lg transition"
            >
              {addingMetric ? 'Adding...' : 'Add Metric'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThesisDetail;
