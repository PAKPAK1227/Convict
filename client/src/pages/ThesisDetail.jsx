import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import StatusBadge from '../components/StatusBadge';
import Progress from '../components/Progress';
import Select from '../components/Select';
import { METRIC_OPTIONS, metricLabel, targetComparator } from '../lib/metrics';
import { formatNumber } from '../lib/format';
import { deadlineStatus } from '../lib/deadline';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

// §3: the evaluator only understands the canonical metric names in METRIC_OPTIONS.
// A free-text field previously let users type anything, which the evaluator then
// silently skipped — the dropdown below restricts input to exactly those keys.

const CONVICTION_OPTIONS = ['High', 'Medium', 'Low'];

const inputClass =
  'rounded-lg bg-surface-2 border border-line px-3 py-2 text-ink text-sm placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition';

function ThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

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
      toast.error('Enter a numeric target value.');
      return;
    }
    const { data, error } = await supabase
      .from('metrics')
      .update({ target_value: Number(editingTarget) })
      .eq('id', metric.id)
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }
    setMetrics((prev) => prev.map((m) => (m.id === metric.id ? data : m)));
    setEditingMetricId(null);
    setEditingTarget('');
    toast.success('Target updated.');
  };

  const deleteMetric = async (metric) => {
    const ok = await confirm({
      title: `Remove ${metricLabel(metric.metric_name)}?`,
      body: 'This metric will be removed from this thesis.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('metrics').delete().eq('id', metric.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMetrics((prev) => prev.filter((m) => m.id !== metric.id));
    toast.success(`Removed ${metricLabel(metric.metric_name)}.`);
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
      toast.error(error.message);
      return;
    }
    setThesis(data);
    setEditingThesis(false);
    toast.success('Thesis updated.');
  };

  const deleteThesis = async () => {
    const ok = await confirm({
      title: `Delete ${thesis.ticker}?`,
      body: 'This permanently removes the thesis and all of its metrics. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await supabase.from('metrics').delete().eq('thesis_id', id);
    const { error } = await supabase.from('theses').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted your thesis on ${thesis.ticker}.`);
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
          <div className="h-8 w-40 rounded bg-surface-2 mb-6" />
          <div className="bg-surface border border-line rounded-2xl p-6 h-40 shadow-card" />
        </div>
      </div>
    );
  }

  if (!thesis) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-ink-2">Thesis not found.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-accent hover:text-accent-hover">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 animate-fade-up">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink mb-6 transition"
        >
          ← Back to Dashboard
        </button>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-mono text-3xl font-semibold text-ink tracking-tight">{thesis.ticker}</h1>
              <StatusBadge status={thesis.status} size="lg" />
            </div>
            <p className="text-ink-2 mt-1">{thesis.company_name}</p>
            {(() => {
              const dl = deadlineStatus(thesis.target_date);
              if (!dl) return null;
              return (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 text-xs font-mono ${
                    dl.resolved ? 'text-ink-2' : dl.dueToday ? 'text-status-watch' : 'text-ink-3'
                  }`}
                  title={dl.resolved ? 'Past its deadline — the verdict is final.' : 'The verdict locks on the deadline.'}
                >
                  <span aria-hidden="true">{dl.resolved ? '🔒' : '◷'}</span>
                  {dl.label}{dl.resolved ? ' · verdict locked' : ''}
                </p>
              );
            })()}
          </div>
          <div className="flex gap-2 text-sm shrink-0">
            {!editingThesis && (
              <button onClick={startEditThesis} className="px-3 py-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-surface-2 transition">Edit</button>
            )}
            <button onClick={deleteThesis} className="px-3 py-1.5 rounded-lg text-ink-2 hover:text-status-broken hover:bg-surface-2 transition">Delete</button>
          </div>
        </div>

        {/* Thesis body — view or edit (§4) */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 mb-6">
          {editingThesis ? (
            <div className="space-y-3">
              <input
                type="text"
                value={draftCompany}
                onChange={(e) => setDraftCompany(e.target.value)}
                placeholder="Company name"
                className={`${inputClass} w-full`}
              />
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={5}
                placeholder="Write your thesis..."
                className={`${inputClass} w-full resize-y`}
              />
              <Select
                value={draftConviction}
                onChange={setDraftConviction}
                options={CONVICTION_OPTIONS.map((c) => ({ value: c, label: `${c} conviction` }))}
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveThesis}
                  disabled={savingThesis}
                  className="px-4 py-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-brand-fg text-sm font-semibold rounded-lg transition"
                >
                  {savingThesis ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditingThesis(false)}
                  className="px-4 py-2 border border-line text-ink text-sm rounded-lg hover:bg-surface-2 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="eyebrow">Your Thesis</h2>
                <span className="eyebrow">Conviction · <span className="text-ink-2">{thesis.conviction_level}</span></span>
              </div>
              <p className="font-serif text-lg text-ink whitespace-pre-wrap leading-relaxed">{thesis.thesis_text}</p>
            </>
          )}
        </div>

        {/* Metrics */}
        <div className="bg-surface border border-line rounded-2xl shadow-card p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="eyebrow">Metrics</h2>
            <span className="text-[11px] text-ink-3">Refreshed daily from live market data</span>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            <span className="text-status-ok">On Track</span> = target met · <span className="text-status-watch">Watch</span> = within 25% · <span className="text-status-broken">Broken</span> = beyond · thesis takes its worst metric. <span className="font-mono text-ink-2">≥ / ≤</span> shows each target's direction (P/E is lower-is-better).
          </p>

          {metrics.length === 0 ? (
            <p className="text-ink-3 text-sm">No metrics added yet.</p>
          ) : (
            <div className="space-y-3">
              {metrics.map((metric) => {
                const tracked =
                  metric.current_value != null &&
                  metric.target_value != null &&
                  Number(metric.target_value) !== 0 &&
                  !Number.isNaN(Number(metric.current_value));
                const pct = tracked
                  ? Math.max(0, Math.min(100, (Number(metric.current_value) / Number(metric.target_value)) * 100))
                  : 0;
                return (
                  <div key={metric.id} className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs uppercase tracking-wide text-ink-2">{metricLabel(metric.metric_name)}</span>

                      {editingMetricId === metric.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editingTarget}
                            onChange={(e) => setEditingTarget(e.target.value)}
                            className={`${inputClass} w-24`}
                          />
                          <button onClick={() => saveEditMetric(metric)} className="text-sm font-semibold text-accent hover:text-accent-hover">Save</button>
                          <button onClick={() => setEditingMetricId(null)} className="text-sm text-ink-3 hover:text-ink">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-xs tnum">
                            {/* §3: surface missing Finnhub data instead of hiding it */}
                            {tracked
                              ? <><span className="text-ink font-semibold">{formatNumber(metric.current_value)}</span><span className="text-ink-3"> / {targetComparator(metric.metric_name)} {formatNumber(metric.target_value)}</span></>
                              : <span className="text-ink-3" title="Convict pulls this from live market data once a day — it populates on the next evaluation.">◷ awaiting data · target {targetComparator(metric.metric_name)} {formatNumber(metric.target_value)}</span>}
                          </span>
                          <button onClick={() => startEditMetric(metric)} className="text-ink-3 hover:text-ink">Edit</button>
                          <button onClick={() => deleteMetric(metric)} className="text-ink-3 hover:text-status-broken">Delete</button>
                        </div>
                      )}
                    </div>

                    {editingMetricId !== metric.id && (
                      <Progress value={tracked ? pct : 0} className="mt-2.5" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add metric — dropdown instead of free text (§3) */}
          <div className="mt-5 pt-5 border-t border-line">
            <label className="block text-xs font-medium text-ink-2 mb-2">Add a metric</label>
            <Select
              value={metricName}
              onChange={setMetricName}
              options={METRIC_OPTIONS}
              placeholder="Select a metric…"
              className="mb-2"
            />
            <input
              type="number"
              placeholder="Target value"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className={`${inputClass} w-full mb-2`}
            />
            {metricError && (
              <p className="text-sm text-status-broken mb-2 flex items-start gap-1.5" role="alert">
                <span aria-hidden="true">⚠</span>{metricError}
              </p>
            )}
            <button
              onClick={handleAddMetric}
              disabled={addingMetric}
              className="w-full py-2.5 bg-brand hover:bg-brand-hover disabled:opacity-60 text-brand-fg text-sm font-semibold rounded-lg transition"
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
