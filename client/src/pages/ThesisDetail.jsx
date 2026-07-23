import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function ThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [thesis, setThesis] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricName, setMetricName] = useState('');
  const [targetValue, setTargetValue] = useState('');

  useEffect(() => {

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

      if (thesisError || metricsError) {
        console.error(thesisError || metricsError);
      } else {
        setThesis(thesisData);
        setMetrics(metricsData);
      }
      setLoading(false);
    };
    
    fetchThesis();
  }, [id]);

  const handleAddMetric = async () => {
        const { data, error } = await supabase
        .from('metrics')
        .insert({
            thesis_id: id,
            metric_name: metricName,
            target_value: targetValue,
        })
        .select()
        .single();

        if (error) {
        alert(error.message);
        } else {
        setMetrics([...metrics, data]);
        setMetricName('');
        setTargetValue('');
        }
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
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-white mb-6"
        >
          ← Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold text-white mb-1">{thesis.ticker}</h1>
        <p className="text-gray-400 mb-6">{thesis.company_name}</p>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-2">Your Thesis</h2>
          <p className="text-gray-300">{thesis.thesis_text}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Metrics</h2>
          {metrics.length === 0 ? (
            <p className="text-gray-500 text-sm">No metrics added yet.</p>
          ) : (
            metrics.map((metric) => (
              <div key={metric.id} className="flex justify-between text-sm text-gray-300 mb-2">
                <span>{metric.metric_name}</span>
                <span>Target: {metric.target_value}</span>
              </div>
            ))
          )}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <input
              type="text"
              placeholder="Metric name (e.g. Revenue Growth)"
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
            />
            <input
              type="number"
              placeholder="Target value"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-3 py-2 mb-2 bg-gray-800 text-white text-sm rounded-lg outline-none"
            />
            <button
              onClick={handleAddMetric}
              className="w-full py-2 bg-green-500 hover:bg-green-400 text-black text-sm font-bold rounded-lg transition"
            >
              Add Metric
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThesisDetail;