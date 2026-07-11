import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Users,
} from 'lucide-react';
import {
  buildExecutiveSummary,
  businessHealthWithCrm,
  filterCustomerOps,
  filterInventoryOps,
  filterProductOps,
  focusTypesPresent,
  focusViewAllQuery,
  focusShowsViewAll,
  buildBuyingOps,
  buildOrderOps,
  buildSupplierOps,
  buildWebsiteOps,
  buildFocusScanItems,
  displaySeverity,
  isApolloOwner,
} from '../lib/apolloTodayPresentation.js';

function freshnessLabel(meta) {
  if (!meta?.generatedAt) return 'Loading…';
  if (meta.partial) return 'Partial data';
  if ((meta.warnings || []).length) return 'Live · some gaps';
  return 'Live';
}

function SeverityDot({ severity }) {
  return <span className={`apollo-today-dot apollo-today-dot--${displaySeverity(severity)}`} aria-hidden="true" />;
}

function SectionLabel({ n, children }) {
  return (
    <header className="apollo-today-section-label">
      <span className="apollo-today-section-num">{n}</span>
      <h3 className="apollo-today-section-title">{children}</h3>
    </header>
  );
}

function ExecutiveSummary({ lines }) {
  if (!lines?.length) return null;
  return (
    <section className="apollo-today-exec" aria-label="Executive summary">
      <SectionLabel n="1">Executive summary</SectionLabel>
      <div className="apollo-today-exec-body">
        {lines.map((line, i) => (
          <p key={i} className={i === 0 ? 'apollo-today-exec-lead' : 'apollo-today-exec-line'}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function formatScore(value) {
  return value == null ? '—' : `${value}`;
}

function DailyBriefScore({ score, collapsed = true }) {
  if (!score) return null;
  const body = (
    <div className="apollo-today-validation-grid">
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">Notifications today</span>
          <strong>{score.notificationsGeneratedToday}</strong>
        </div>
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">Exceptions today</span>
          <strong>{score.exceptionsGeneratedToday}</strong>
        </div>
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">Useful yesterday</span>
          <strong>{score.usefulExceptionsYesterday}</strong>
        </div>
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">False positives yesterday</span>
          <strong>{score.falsePositivesYesterday}</strong>
        </div>
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">Threshold adjustments</span>
          <strong>{score.thresholdAdjustmentsYesterday}</strong>
        </div>
        <div className="apollo-today-validation-stat">
          <span className="apollo-today-validation-label">Ignored permanently</span>
          <strong>{score.ignoredPermanentlyYesterday}</strong>
        </div>
        <div className="apollo-today-validation-stat apollo-today-validation-stat--highlight">
          <span className="apollo-today-validation-label">Useful rate</span>
          <strong>{score.usefulRate == null ? '—' : `${score.usefulRate}%`}</strong>
        </div>
        <div className="apollo-today-validation-stat apollo-today-validation-stat--highlight">
          <span className="apollo-today-validation-label">Trust score</span>
          <strong>{formatScore(score.trustScore)}</strong>
        </div>
        <div className="apollo-today-validation-stat apollo-today-validation-stat--highlight">
          <span className="apollo-today-validation-label">Business value score</span>
          <strong>{formatScore(score.businessValueScore)}</strong>
        </div>
      </div>
  );

  if (collapsed) {
    return (
      <details className="apollo-today-validation apollo-today-validation--collapsed">
        <summary className="apollo-today-validation-summary">Validation week (engineering)</summary>
        {body}
      </details>
    );
  }

  return (
    <section className="apollo-today-validation" aria-label="Release 1.2 validation score">
      <SectionLabel n="·">Validation week</SectionLabel>
      {body}
    </section>
  );
}

function ExceptionReview({ item, onReview }) {
  const [feedback, setFeedback] = useState(item.feedbackStatus || '');
  const [businessValue, setBusinessValue] = useState(item.businessValue || '');
  const [decisionOutcome, setDecisionOutcome] = useState(item.decisionOutcome || 'no_action_taken');
  const [note, setNote] = useState(item.feedbackNote || '');
  const [saving, setSaving] = useState(false);
  const reviewed = Boolean(item.feedbackStatus);

  const submit = async () => {
    if (!feedback || !note.trim()) return;
    setSaving(true);
    try {
      await onReview?.(item, {
        feedback,
        businessValue: businessValue || null,
        decisionOutcome: decisionOutcome || null,
        note: note.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (reviewed) {
    return (
      <div className="apollo-today-review-done" aria-label="Exception review recorded">
        <span>Reviewed: {item.feedbackStatus?.replace(/_/g, ' ')}</span>
        {item.businessValue && <span>Value: {item.businessValue}</span>}
        {item.decisionOutcome && <span>Outcome: {item.decisionOutcome.replace(/_/g, ' ')}</span>}
      </div>
    );
  }

  return (
    <div className="apollo-today-review" aria-label="Exception review">
      <div className="apollo-today-feedback">
        <button type="button" onClick={() => setFeedback('useful')} className={feedback === 'useful' ? 'is-active' : ''}>Useful</button>
        <button type="button" onClick={() => setFeedback('false_positive')} className={feedback === 'false_positive' ? 'is-active' : ''}>False positive</button>
        <button type="button" onClick={() => setFeedback('needs_threshold_adjustment')} className={feedback === 'needs_threshold_adjustment' ? 'is-active' : ''}>Adjust threshold</button>
        <button type="button" onClick={() => setFeedback('ignore_permanently')} className={feedback === 'ignore_permanently' ? 'is-active' : ''}>Ignore</button>
      </div>
      <div className="apollo-today-review-fields">
        <label>
          Business value
          <select value={businessValue} onChange={(e) => setBusinessValue(e.target.value)}>
            <option value="">Select…</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          Decision outcome
          <select value={decisionOutcome} onChange={(e) => setDecisionOutcome(e.target.value)}>
            <option value="no_action_taken">No action taken</option>
            <option value="investigated">Investigated</option>
            <option value="action_taken">Action taken</option>
            <option value="escalated">Escalated</option>
          </select>
        </label>
      </div>
      <label className="apollo-today-review-note">
        Explanation
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you do with this exception?"
          rows={2}
        />
      </label>
      <button
        type="button"
        className="apollo-today-review-save"
        onClick={() => void submit()}
        disabled={saving || !feedback || !note.trim()}
      >
        {saving ? 'Saving…' : 'Record review'}
      </button>
    </div>
  );
}

function FocusScanList({ items }) {
  if (!items.length) {
    return (
      <div className="apollo-cc-focus-clear">
        <CheckCircle2 size={18} />
        <p>Nothing urgent flagged. The business looks calm.</p>
      </div>
    );
  }
  return (
    <ul className="apollo-cc-focus-scan">
      {items.map((item) => (
        <li key={item.id} className={`apollo-cc-focus-scan-item apollo-cc-severity--${item.severity}`}>
          <SeverityDot severity={item.severity} />
          <span>{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

function FocusCard({ item, onAsk, onReview }) {
  const viewAll = focusShowsViewAll(item);
  const viewAllQuery = focusViewAllQuery(item);
  const askQuery = viewAll ? viewAllQuery : focusViewAllQuery(item);
  const openUrl = item.url || '';
  const canReview = Boolean(item.notificationDbId && item.businessImpact);
  const handleAction = () => {
    if (openUrl) {
      window.location.href = openUrl;
      return;
    }
    if (askQuery) onAsk?.(askQuery);
  };

  return (
    <article className={`apollo-today-focus-card apollo-today-focus-card--${displaySeverity(item.severity || 'attention')}`}>
      <div className="apollo-today-focus-head">
        <SeverityDot severity={item.severity} />
        <h4>{item.title || item.label}</h4>
      </div>
      {item.detail && (
        <p className="apollo-today-focus-what">
          <span className="apollo-today-kicker">What</span>
          {item.detail}
        </p>
      )}
      <p className="apollo-today-focus-why">
        <span className="apollo-today-kicker">Why</span>
        {item.why}
      </p>
      {item.evidence && (
        <p className="apollo-today-focus-what">
          <span className="apollo-today-kicker">Evidence</span>
          {item.evidence}
        </p>
      )}
      <p className="apollo-today-focus-action">
        <span className="apollo-today-kicker">Do</span>
        {item.action}
      </p>
      <div className="apollo-today-focus-foot">
        {openUrl ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            Open <ArrowRight size={12} />
          </button>
        ) : viewAll && viewAllQuery ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            View all <ArrowRight size={12} />
          </button>
        ) : askQuery ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            Ask Apollo <ArrowRight size={12} />
          </button>
        ) : <span />}
      </div>
      {canReview && <ExceptionReview item={item} onReview={onReview} />}
    </article>
  );
}

function HealthPulse({ item }) {
  const icons = {
    sales: ShoppingCart,
    customers: Users,
    inventory: Package,
    website: Globe,
    crm: Users,
    memory: Clock,
  };
  const Icon = icons[item.key] || Package;
  return (
    <div className={`apollo-today-health apollo-today-health--${displaySeverity(item.severity || 'info')}`}>
      <div className="apollo-today-health-head">
        <Icon size={13} />
        <span>{item.label}</span>
      </div>
      <p className="apollo-today-health-status">{item.status}</p>
      {item.hint && <p className="apollo-today-health-hint">{item.hint}</p>}
    </div>
  );
}

function ChangedLine({ line }) {
  return (
    <li className={`apollo-today-changed-line apollo-today-changed-line--${displaySeverity(line.severity || 'info')}`}>
      <SeverityDot severity={line.severity} />
      <span>{line.text}</span>
    </li>
  );
}

function OpsCard({ title, icon: Icon, empty, children }) {
  return (
    <section className="apollo-today-ops-card">
      <header className="apollo-today-ops-head">
        <Icon size={14} />
        <h4>{title}</h4>
      </header>
      <div className="apollo-today-ops-body">
        {empty ? <p className="apollo-today-empty">{empty}</p> : children}
      </div>
    </section>
  );
}

function OpsRow({ title, meta, severity, onClick, url }) {
  const handleClick = () => {
    if (url) {
      window.location.href = url;
      return;
    }
    onClick?.();
  };
  return (
    <button type="button" className={`apollo-today-row apollo-today-row--${displaySeverity(severity || 'info')}`} onClick={handleClick}>
      <SeverityDot severity={severity} />
      <span className="apollo-today-row-title">{title}</span>
      <span className="apollo-today-row-meta">{meta}</span>
    </button>
  );
}

export default function ApolloToday({
  context,
  meta,
  loading,
  onAsk,
  onRefresh,
  onReviewNotification,
  refreshing,
  userName,
  userEmail,
  column,
}) {
  const generatedAt = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const dateStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const warnings = (meta?.warnings || []).filter(Boolean);

  if (loading && !context) {
    return (
      <div className="apollo-today apollo-today--loading">
        <Loader2 size={20} className="spin" />
        <span>Preparing your morning brief…</span>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="apollo-today apollo-today--error">
        <AlertTriangle size={18} />
        <span>Brief unavailable — try refresh</span>
        <button type="button" className="apollo-action-btn" onClick={onRefresh}>Refresh</button>
      </div>
    );
  }

  const showValidation = isApolloOwner(userEmail);

  if (column === 'validation-only') {
    if (!showValidation || !context.validationScore) return null;
    return (
      <div className="apollo-today apollo-today--validation-only">
        <DailyBriefScore score={context.validationScore} collapsed />
      </div>
    );
  }

  return null;
}
