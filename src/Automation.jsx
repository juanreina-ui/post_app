import { useState, useEffect, useRef } from 'react';
import { fetchPosts, generateSummaryWithGemini, publishPost } from './api';

const TIMEZONES = [
  { label: 'Singapore (UTC+8)', value: 'Asia/Singapore' },
  { label: 'Indonesia – Jakarta (UTC+7)', value: 'Asia/Jakarta' },
  { label: 'Indonesia – Makassar (UTC+8)', value: 'Asia/Makassar' },
  { label: 'Indonesia – Jayapura (UTC+9)', value: 'Asia/Jayapura' },
  { label: 'Australia – Sydney (AEST)', value: 'Australia/Sydney' },
  { label: 'Australia – Melbourne (AEST)', value: 'Australia/Melbourne' },
  { label: 'Australia – Brisbane (AEST)', value: 'Australia/Brisbane' },
  { label: 'Australia – Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Australia – Adelaide (ACST)', value: 'Australia/Adelaide' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SORT_OPTIONS = ['Unique Views', 'Reactions', 'Comments'];
const TOP_N_OPTIONS = [5, 10, 15, 20];
const STORAGE_KEY = 'post_summary_automations';

// ── Persistence ──────────────────────────────────────────────────
function loadAutomations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function newAutomation() {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    timezone: 'Asia/Singapore',
    frequency: 'weekly',
    dayOfWeek: 1, // Monday
    hour: 9,
    minute: 0,
    sortBy: 'Unique Views',
    topN: 10,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  };
}

// ── Scheduling helpers ───────────────────────────────────────────
function nowInTz(timezone) {
  // Returns a Date whose local time matches the wall clock in `timezone`
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
}

function shouldRun(automation) {
  if (!automation.enabled) return false;

  const local = nowInTz(automation.timezone);
  if (local.getHours() !== automation.hour || local.getMinutes() !== automation.minute) return false;
  if (automation.frequency === 'weekly' && local.getDay() !== automation.dayOfWeek) return false;

  // Prevent double-firing within the same minute window
  if (automation.lastRunAt) {
    const minutesSince = (Date.now() - new Date(automation.lastRunAt)) / 60_000;
    if (minutesSince < 60) return false;
  }

  return true;
}

function nextRunLabel(automation) {
  const local = nowInTz(automation.timezone);
  const target = new Date(local);
  target.setHours(automation.hour, automation.minute, 0, 0);

  if (automation.frequency === 'weekly') {
    let daysUntil = (automation.dayOfWeek - local.getDay() + 7) % 7;
    if (daysUntil === 0 && local >= target) daysUntil = 7;
    target.setDate(target.getDate() + daysUntil);
  } else {
    if (local >= target) target.setDate(target.getDate() + 1);
  }

  // Shift the calculated local time back to a real UTC instant for formatting
  const utcOffset = new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: automation.timezone })).getTime();
  const realDate = new Date(target.getTime() + utcOffset);

  return realDate.toLocaleString('en-US', {
    timeZone: automation.timezone,
    weekday: automation.frequency === 'weekly' ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Main component ────────────────────────────────────────────────
export default function Automation() {
  const [automations, setAutomations] = useState(loadAutomations);
  const [editing, setEditing] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const automationsRef = useRef(automations);

  useEffect(() => { automationsRef.current = automations; }, [automations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(automations));
  }, [automations]);

  // Scheduler: tick every 30 s
  useEffect(() => {
    const tick = setInterval(() => {
      automationsRef.current.forEach((a) => {
        if (shouldRun(a)) triggerRun(a);
      });
    }, 30_000);
    return () => clearInterval(tick);
  }, []);

  function patchAutomation(id, patch) {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  async function triggerRun(automation) {
    if (runningId) return;
    setRunningId(automation.id);
    try {
      const posts = await fetchPosts();
      const sorted = [...posts]
        .sort((a, b) => b[automation.sortBy] - a[automation.sortBy])
        .slice(0, automation.topN);
      const summary = await generateSummaryWithGemini(sorted, automation.topN, automation.sortBy);
      await publishPost(summary);
      patchAutomation(automation.id, {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'success',
        lastRunError: null,
      });
    } catch (err) {
      patchAutomation(automation.id, {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'error',
        lastRunError: err.message,
      });
    } finally {
      setRunningId(null);
    }
  }

  function handleSave(form) {
    setAutomations((prev) =>
      prev.find((a) => a.id === form.id)
        ? prev.map((a) => (a.id === form.id ? form : a))
        : [...prev, form]
    );
    setEditing(null);
  }

  return (
    <div className="automation-module">
      <div className="automation-header">
        <div>
          <h2 className="automation-title">Automation</h2>
          <p className="automation-subtitle">
            Schedule automatic digest generation and publishing to Humand.
          </p>
        </div>
        <button className="btn-new-automation" onClick={() => setEditing(newAutomation())}>
          + New Schedule
        </button>
      </div>

      {automations.length === 0 && !editing && (
        <div className="automation-empty">
          No schedules yet. Click <strong>+ New Schedule</strong> to automate your digest.
        </div>
      )}

      <div className="automation-list">
        {automations.map((a) => (
          <AutomationCard
            key={a.id}
            automation={a}
            running={runningId === a.id}
            onEdit={() => setEditing({ ...a })}
            onDelete={() => setAutomations((prev) => prev.filter((x) => x.id !== a.id))}
            onToggle={() => patchAutomation(a.id, { enabled: !a.enabled })}
            onRunNow={() => triggerRun(a)}
          />
        ))}
      </div>

      {editing && (
        <AutomationForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────
function AutomationCard({ automation, running, onEdit, onDelete, onToggle, onRunNow }) {
  const tzLabel = TIMEZONES.find((t) => t.value === automation.timezone)?.label || automation.timezone;
  const freqLabel =
    automation.frequency === 'daily'
      ? 'Daily'
      : `Every ${DAYS[automation.dayOfWeek]}`;
  const timeLabel = `${String(automation.hour).padStart(2, '0')}:${String(automation.minute).padStart(2, '0')}`;

  return (
    <div className={`automation-card${automation.enabled ? '' : ' auto-disabled'}`}>
      <div className="automation-card-top">
        <div className="automation-card-name">
          {automation.name || `${freqLabel} at ${timeLabel}`}
          {running && <span className="badge-running">● Running…</span>}
        </div>
        <label className="toggle-switch" title={automation.enabled ? 'Disable' : 'Enable'}>
          <input type="checkbox" checked={automation.enabled} onChange={onToggle} />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="automation-card-meta">
        <span>🕐 {freqLabel} at {timeLabel}</span>
        <span>🌏 {tzLabel}</span>
        <span>📊 Top {automation.topN} by {automation.sortBy}</span>
      </div>

      {automation.enabled && (
        <div className="automation-next-run">
          Next run: <strong>{nextRunLabel(automation)}</strong>
        </div>
      )}

      {automation.lastRunAt && (
        <div className={`automation-last-run ${automation.lastRunStatus}`}>
          Last run: {new Date(automation.lastRunAt).toLocaleString()} —{' '}
          {automation.lastRunStatus === 'success'
            ? '✅ Published successfully'
            : `❌ ${automation.lastRunError}`}
        </div>
      )}

      <div className="automation-card-actions">
        <button className="btn-card-action" onClick={onEdit}>Edit</button>
        <button className="btn-card-action" onClick={onRunNow} disabled={running}>
          {running ? 'Running…' : '▶ Run Now'}
        </button>
        <button className="btn-card-action danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

// ── Form (modal) ──────────────────────────────────────────────────
function AutomationForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="form-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="auto-form">
        <div className="auto-form-header">
          <h3 className="auto-form-title">
            {initial.name || (!initial.lastRunAt && initial.id === form.id)
              ? form.name
                ? 'Edit Schedule'
                : 'New Schedule'
              : 'Edit Schedule'}
          </h3>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>

        {/* Name */}
        <div className="form-field">
          <label className="form-label">Name <span className="form-hint">(optional)</span></label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Weekly Singapore Digest"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        {/* Timezone */}
        <div className="form-field">
          <label className="form-label">Timezone</label>
          <select
            className="form-select"
            value={form.timezone}
            onChange={(e) => set('timezone', e.target.value)}
          >
            <optgroup label="Singapore">
              {TIMEZONES.filter((t) => t.value.startsWith('Asia/Singapore')).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Indonesia">
              {TIMEZONES.filter((t) => t.label.includes('Indonesia')).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Australia">
              {TIMEZONES.filter((t) => t.value.startsWith('Australia')).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Frequency */}
        <div className="form-field">
          <label className="form-label">Frequency</label>
          <div className="btn-group">
            {['daily', 'weekly'].map((f) => (
              <button
                key={f}
                type="button"
                className={`btn-option${form.frequency === f ? ' active' : ''}`}
                onClick={() => set('frequency', f)}
              >
                {f === 'daily' ? 'Every day' : 'Once a week'}
              </button>
            ))}
          </div>
        </div>

        {/* Day of week (weekly only) */}
        {form.frequency === 'weekly' && (
          <div className="form-field">
            <label className="form-label">Day</label>
            <div className="btn-group">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  className={`btn-option${form.dayOfWeek === i ? ' active' : ''}`}
                  onClick={() => set('dayOfWeek', i)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time */}
        <div className="form-field">
          <label className="form-label">Time</label>
          <input
            className="form-input form-input-time"
            type="time"
            value={`${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              setForm((prev) => ({ ...prev, hour: h, minute: m }));
            }}
          />
        </div>

        {/* Sort by */}
        <div className="form-field">
          <label className="form-label">Sort by</label>
          <div className="btn-group">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`btn-option${form.sortBy === opt ? ' active' : ''}`}
                onClick={() => set('sortBy', opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Top N */}
        <div className="form-field">
          <label className="form-label">Number of posts</label>
          <div className="btn-group">
            {TOP_N_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`btn-option${form.topN === n ? ' active' : ''}`}
                onClick={() => set('topN', n)}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>

        <div className="auto-form-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-save" onClick={() => onSave(form)}>
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
