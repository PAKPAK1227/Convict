import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Navbar from '../components/Navbar';
import Select from '../components/Select';
import { isValidTicker } from '../lib/validation';
import { METRIC_OPTIONS, metricLabel, targetComparator } from '../lib/metrics';
import { formatNumber } from '../lib/format';
import { DEADLINE_PRESETS, presetDateISO, daysUntil, formatDeadlineDate } from '../lib/deadline';

const CONVICTION_OPTIONS = [
  { value: 'High', label: 'High conviction' },
  { value: 'Medium', label: 'Medium conviction' },
  { value: 'Low', label: 'Low conviction' },
];

// §3 note: ticker validation here is a *format* check only (see lib/validation).
// Verifying the symbol actually exists requires a live Finnhub lookup, which
// must run server-side (the Finnhub key must never ship to the browser — §6).
// See docs/DECISIONS.md: live existence-check is deferred until the data-service
// is deployed.

function CreateThesis() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const toast = useToast();

  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [thesisText, setThesisText] = useState('');
  const [convictionLevel, setConvictionLevel] = useState('Medium');
  const [deadlinePreset, setDeadlinePreset] = useState('3M'); // preset value or 'custom'
  const [customDate, setCustomDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Targets staged locally, written as `metrics` rows right after the thesis
  // insert. A thesis with no metric can never be graded, so at least one is
  // required here rather than left to a second visit to the detail page.
  const [draftMetrics, setDraftMetrics] = useState([]);
  const [metricName, setMetricName] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [metricError, setMetricError] = useState('');

  const targetDate = deadlinePreset === 'custom' ? customDate : presetDateISO(deadlinePreset);
  const todayISO = new Date().toISOString().slice(0, 10);

  // Mirrors the metrics_unique_per_thesis constraint — one row per metric type.
  const availableMetrics = METRIC_OPTIONS.filter(
    (o) => !draftMetrics.some((m) => m.metric_name === o.value)
  );

  const addDraftMetric = () => {
    setMetricError('');
    if (!metricName) {
      setMetricError('Choose a metric.');
      return;
    }
    if (targetValue === '' || Number.isNaN(Number(targetValue))) {
      setMetricError('Enter a numeric target value.');
      return;
    }
    setDraftMetrics([...draftMetrics, { metric_name: metricName, target_value: Number(targetValue) }]);
    setMetricName('');
    setTargetValue('');
  };

  const removeDraftMetric = (name) => {
    setDraftMetrics((prev) => prev.filter((m) => m.metric_name !== name));
  };

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
    if (!targetDate) {
      setError('Choose a resolution deadline.');
      return;
    }
    if (daysUntil(targetDate) < 0) {
      setError('The deadline must be in the future.');
      return;
    }
    if (draftMetrics.length === 0) {
      setError('Add at least one target — without one there is nothing to grade the thesis against.');
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    const { data: created, error: insertError } = await supabase
      .from('theses')
      .insert({
        user_id: userId,
        ticker: normalizedTicker,
        company_name: companyName.trim(),
        thesis_text: thesisText.trim(),
        conviction_level: convictionLevel,
        target_date: targetDate, // resolution deadline (see 20260724_thesis_deadline.sql)
        // New theses start unevaluated. Set explicitly so the insert satisfies
        // the theses_status_valid CHECK regardless of the column's DB default.
        status: 'Pending',
      })
      .select()
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    const { error: metricsError } = await supabase
      .from('metrics')
      .insert(draftMetrics.map((m) => ({ ...m, thesis_id: created.id })));
    setSubmitting(false);

    // The thesis exists either way — send them to it rather than stranding them
    // on the form, and say so if the targets didn't land.
    if (metricsError) {
      toast.error(`Thesis created, but the targets failed to save: ${metricsError.message}`);
    }
    navigate(`/thesis/${created.id}`);
  };

  const inputClass =
    'w-full rounded-xl bg-surface-2 border border-line px-4 py-3 text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition';
  const labelClass = 'block text-xs font-medium text-ink-2 mb-1.5';

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink mb-6 transition"
        >
          ← Back to Dashboard
        </button>

        <span className="eyebrow">New position</span>
        <h1 className="mt-1.5 font-serif text-3xl sm:text-4xl font-medium text-ink tracking-[-0.01em] mb-1">New Thesis</h1>
        <p className="text-sm text-ink-2 mb-6">Define what you believe, and the target that proves it.</p>

        <div className="bg-surface border border-line rounded-2xl shadow-card p-6 animate-fade-up">
          <label className={labelClass}>Ticker</label>
          <input
            type="text"
            placeholder="NVDA"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={5}
            className={`${inputClass} mb-4 font-mono tracking-wider uppercase`}
          />

          <label className={labelClass}>Company name</label>
          <input
            type="text"
            placeholder="NVIDIA Corporation"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={`${inputClass} mb-4`}
          />

          <label className={labelClass}>Your thesis</label>
          <textarea
            placeholder="Why do you have conviction here? What has to be true?"
            value={thesisText}
            onChange={(e) => setThesisText(e.target.value)}
            rows={5}
            className={`${inputClass} mb-4 resize-y`}
          />

          <label className={labelClass}>Conviction level</label>
          <Select
            value={convictionLevel}
            onChange={setConvictionLevel}
            options={CONVICTION_OPTIONS}
            className="mb-4"
          />

          <label className={labelClass}>Resolve by</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {DEADLINE_PRESETS.map((p) => {
              const activeChip = deadlinePreset === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDeadlinePreset(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    activeChip
                      ? 'bg-brand text-brand-fg border-brand'
                      : 'border-line text-ink-2 hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDeadlinePreset('custom')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                deadlinePreset === 'custom'
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'border-line text-ink-2 hover:text-ink hover:bg-surface-2'
              }`}
            >
              Custom
            </button>
          </div>

          {deadlinePreset === 'custom' && (
            <input
              type="date"
              value={customDate}
              min={todayISO}
              onChange={(e) => setCustomDate(e.target.value)}
              className={`${inputClass} mb-2`}
            />
          )}

          <p className="text-xs text-ink-3 mb-5">
            Judged on{' '}
            <span className="text-ink-2">
              {targetDate ? formatDeadlineDate(targetDate) : 'a date you pick'}
            </span>{' '}
            — the verdict locks then.
          </p>

          {/* Targets — collected here so a new thesis is gradable from day one (§3) */}
          <div className="mb-5 pt-5 border-t border-line">
            <label className={labelClass}>Targets</label>
            <p className="text-xs text-ink-3 mb-3">
              What has to be true for you to be right? Convict grades the thesis against these.{' '}
              <span className="font-mono text-ink-2">≥ / ≤</span> shows each target's direction (P/E is lower-is-better).
            </p>

            {draftMetrics.length > 0 && (
              <div className="space-y-2 mb-3">
                {draftMetrics.map((m) => (
                  <div
                    key={m.metric_name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5"
                  >
                    <span className="font-mono text-xs uppercase tracking-wide text-ink-2">
                      {metricLabel(m.metric_name)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs tnum text-ink">
                        {targetComparator(m.metric_name)} {formatNumber(m.target_value)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeDraftMetric(m.metric_name)}
                        className="text-sm text-ink-3 hover:text-status-broken transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {availableMetrics.length > 0 ? (
              <>
                <Select
                  value={metricName}
                  onChange={setMetricName}
                  options={availableMetrics}
                  placeholder="Select a metric…"
                  className="mb-2"
                />
                <input
                  type="number"
                  placeholder="Target value"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className={`${inputClass} mb-2`}
                />
                {metricError && (
                  <p className="text-sm text-status-broken mb-2 flex items-start gap-1.5" role="alert">
                    <span aria-hidden="true">⚠</span>{metricError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={addDraftMetric}
                  className="w-full py-2.5 border border-line text-ink text-sm font-semibold rounded-xl hover:bg-surface-2 transition"
                >
                  Add target
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-3">Every available metric is already targeted.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-status-broken mb-4 flex items-start gap-1.5" role="alert">
              <span aria-hidden="true">⚠</span>{error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-brand hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-brand-fg font-semibold rounded-xl shadow-glow transition"
          >
            {submitting ? 'Creating...' : 'Create thesis'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateThesis;
