import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Package,
  ShoppingCart,
} from 'lucide-react';
import {
  buildApolloRecommends,
  buildBusinessStatus,
  buildDailyBriefBullets,
  buildHeroFocusItems,
  buildRememberItems,
  focusHeroTitle,
  groupNotificationsByUrgency,
  REMEMBER_TEACHING_TOPICS,
  rememberEmptyCopy,
  START_MY_DAY_STEPS,
} from '../lib/apolloCommandCentrePresentation.js';
import {
  buildBuyingOps,
  buildOrderOps,
  focusTypesPresent,
  isApolloOwner,
} from '../lib/apolloTodayPresentation.js';
import ApolloToday from './ApolloToday.jsx';

function FocusHero({ items, onSelect }) {
  if (!items.length) {
    return (
      <section className="apollo-cc-hero apollo-cc-hero--calm" aria-labelledby="apollo-cc-hero-title">
        <p className="apollo-cc-hero-eyebrow">Today&apos;s Focus</p>
        <h2 id="apollo-cc-hero-title" className="apollo-cc-hero-title">Nothing urgent competing for your hour</h2>
        <p className="apollo-cc-hero-sub">Proto looks calm — scan the brief below when you have a moment.</p>
      </section>
    );
  }

  return (
    <section className="apollo-cc-hero" aria-labelledby="apollo-cc-hero-title">
      <p className="apollo-cc-hero-eyebrow">Today&apos;s Focus</p>
      <h2 id="apollo-cc-hero-title" className="apollo-cc-hero-title">
        {focusHeroTitle(items.length)}
      </h2>
      <ol className="apollo-cc-hero-list">
        {items.map((row) => (
          <li key={`${row.category}-${row.rank}`} className={`apollo-cc-hero-item apollo-cc-severity--${row.severity}`}>
            <span className="apollo-cc-hero-rank" aria-hidden="true">{row.rank}.</span>
            <div className="apollo-cc-hero-item-body">
              <span className="apollo-cc-hero-category">{row.categoryLabel}</span>
              <button type="button" className="apollo-cc-hero-action" onClick={() => onSelect?.(row.item)}>
                {row.label}
                <ArrowRight size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BusinessStatusBar({ status }) {
  return (
    <section className="apollo-cc-status" aria-labelledby="apollo-cc-status-title">
      <h2 id="apollo-cc-status-title" className="apollo-cc-status-title">Business Status</h2>
      <div className={`apollo-cc-status-body apollo-cc-severity--${status.severity}`}>
        <div className="apollo-cc-status-primary">
          <span className="apollo-cc-status-emoji" aria-hidden="true">{status.emoji}</span>
          <span className="apollo-cc-status-label">{status.label}</span>
          {status.percent != null && (
            <span className="apollo-cc-status-percent">{status.percent}%</span>
          )}
        </div>
        <ul className="apollo-cc-status-metrics">
          <li><strong>{status.issues}</strong> issues</li>
          <li><strong>{status.opportunities}</strong> opportunities</li>
          <li><strong>{status.urgent}</strong> urgent</li>
        </ul>
      </div>
      {(status.biggestRisk || status.biggestOpportunity) && (
        <div className="apollo-cc-status-insights">
          {status.biggestRisk && (
            <p className="apollo-cc-status-insight">
              <span className="apollo-cc-status-insight-kicker">Today&apos;s biggest risk:</span>
              {status.biggestRisk}
            </p>
          )}
          {status.biggestOpportunity && (
            <p className="apollo-cc-status-insight">
              <span className="apollo-cc-status-insight-kicker">Today&apos;s biggest opportunity:</span>
              {status.biggestOpportunity}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DailyBriefCompact({ bullets, detailSections }) {
  const toneIcon = { ok: '✓', warn: '⚠', neutral: '·' };

  return (
    <section className="apollo-cc-daily-compact" aria-labelledby="apollo-cc-daily-compact-title">
      <h3 id="apollo-cc-daily-compact-title" className="apollo-cc-block-title">Today&apos;s Snapshot</h3>
      <ul className="apollo-cc-daily-bullets">
        {bullets.map((bullet, i) => (
          <li key={i} className={`apollo-cc-daily-bullet apollo-cc-daily-bullet--${bullet.tone}`}>
            <span className="apollo-cc-daily-bullet-icon" aria-hidden="true">{toneIcon[bullet.tone] || '·'}</span>
            {bullet.text}
          </li>
        ))}
      </ul>
      {detailSections.length > 0 && (
        <details className="apollo-cc-daily-details">
          <summary>View details</summary>
          <div className="apollo-cc-daily-details-body">
            {detailSections.map((section) => (
              <div key={section.label} className="apollo-cc-daily-detail-block">
                <h4>{section.label}</h4>
                <ul>
                  {section.items.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function RememberSection({ items }) {
  return (
    <section className="apollo-cc-remember" aria-labelledby="apollo-cc-remember-title">
      <h3 id="apollo-cc-remember-title" className="apollo-cc-block-title">
        <Brain size={15} />
        Remember
      </h3>
      {items.length ? (
        <ul className="apollo-cc-remember-list">
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      ) : (
        <div className="apollo-cc-remember-teach">
          <p className="apollo-cc-remember-empty-lead">{rememberEmptyCopy()}</p>
          <p className="apollo-cc-remember-teach-intro">Apollo will remember:</p>
          <ul className="apollo-cc-remember-teach-list">
            {REMEMBER_TEACHING_TOPICS.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
          <p className="apollo-cc-remember-teach-hint">Use &quot;Remember…&quot; when something is worth keeping.</p>
        </div>
      )}
    </section>
  );
}

function RecommendsSection({ items, onSelect }) {
  if (!items.length) return null;
  return (
    <section
      id="apollo-cc-section-recommends"
      className="apollo-cc-recommends"
      aria-labelledby="apollo-cc-recommends-title"
    >
      <h3 id="apollo-cc-recommends-title" className="apollo-cc-block-title">Apollo Recommends</h3>
      <div className="apollo-cc-recommends-stack">
        {items.map((rec) => (
          <article key={rec.id} className={`apollo-cc-recommend apollo-cc-severity--${rec.severity}`}>
            <button type="button" className="apollo-cc-recommend-title" onClick={() => onSelect?.(rec.item)}>
              {rec.title}
            </button>
            {rec.why.length > 0 && (
              <div className="apollo-cc-recommend-why">
                <span className="apollo-cc-recommend-kicker">Why?</span>
                <ul>
                  {rec.why.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}
            {rec.evidence?.length > 0 && (
              <div className="apollo-cc-recommend-evidence">
                <span className="apollo-cc-recommend-kicker">Evidence</span>
                <ul>
                  {rec.evidence.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}
            {rec.confidence != null && (
              <p className="apollo-cc-recommend-confidence">
                <span className="apollo-cc-recommend-kicker">Confidence</span>
                <strong>{rec.confidence}%</strong>
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function NotificationsGrouped({ groups, onOpen }) {
  const sections = [
    { key: 'immediate', label: 'Immediate', token: 'red', icon: '🔴' },
    { key: 'today', label: 'Today', token: 'amber', icon: '🟡' },
    { key: 'info', label: 'Information', token: 'grey', icon: '⚪' },
  ];

  const total = sections.reduce((sum, s) => sum + (groups[s.key]?.length || 0), 0);
  if (!total) {
    return (
      <section
        id="apollo-cc-section-notifications"
        className="apollo-cc-notifications apollo-cc-notifications--empty"
        aria-label="Notifications"
      >
        <h3 className="apollo-cc-block-title">Notifications</h3>
        <p className="apollo-cc-notifications-clear">
          <CheckCircle2 size={14} />
          No operational alerts grouped for today.
        </p>
      </section>
    );
  }

  return (
    <section
      id="apollo-cc-section-notifications"
      className="apollo-cc-notifications"
      aria-labelledby="apollo-cc-notifications-title"
    >
      <h3 id="apollo-cc-notifications-title" className="apollo-cc-block-title">Notifications</h3>
      {sections.map((section) => {
        const rows = groups[section.key] || [];
        if (!rows.length) return null;
        return (
          <div key={section.key} className={`apollo-cc-notif-group apollo-cc-severity--${section.token}`}>
            <h4>
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </h4>
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onOpen?.(row)}>
                    {row.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function OpsList({ title, icon: Icon, rows, onSelect }) {
  return (
    <section className="apollo-cc-ops-block" aria-label={title}>
      <h3 className="apollo-cc-block-title"><Icon size={15} /> {title}</h3>
      {rows.length ? (
        <ul className="apollo-cc-ops-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => onSelect?.(row)}>
                {row.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="apollo-cc-scan-empty">Nothing flagged.</p>
      )}
    </section>
  );
}

function ActivitySection({ lines }) {
  return (
    <section className="apollo-cc-activity" aria-labelledby="apollo-cc-activity-title">
      <h3 id="apollo-cc-activity-title" className="apollo-cc-block-title">Activity</h3>
      {lines.length ? (
        <ul className="apollo-cc-activity-list">
          {lines.map((text, i) => <li key={i}>{text}</li>)}
        </ul>
      ) : (
        <p className="apollo-cc-scan-empty">No recent activity lines.</p>
      )}
    </section>
  );
}

function StartMyDay({ active, stepIndex, onStart, onAdvance, onExit }) {
  const step = START_MY_DAY_STEPS[stepIndex];
  const running = active && step;

  return (
    <div className="apollo-cc-start-day">
      {!running ? (
        <button type="button" className="apollo-cc-start-day-btn" onClick={onStart}>
          ▶ Start My Day
        </button>
      ) : (
        <div className="apollo-cc-start-day-flow" role="status" aria-live="polite">
          <p className="apollo-cc-start-day-label">
            Step {stepIndex + 1} of {START_MY_DAY_STEPS.length}: {step.label}
          </p>
          <div className="apollo-cc-start-day-track">
            {START_MY_DAY_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`apollo-cc-start-day-dot${i <= stepIndex ? ' is-done' : ''}${i === stepIndex ? ' is-current' : ''}`}
              />
            ))}
          </div>
          <div className="apollo-cc-start-day-actions">
            <button type="button" className="apollo-cc-start-day-next" onClick={onAdvance}>
              {step.id === 'done' ? 'Finish' : <>Next <ChevronRight size={14} /></>}
            </button>
            <button type="button" className="apollo-cc-start-day-skip" onClick={onExit}>Exit</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HeaderHealthCard({ card }) {
  return (
    <div className={`apollo-cc-health-header apollo-cc-severity--${card.severity}`} aria-label="Business health">
      <span className="apollo-cc-health-header-label">Business Health</span>
      <p className="apollo-cc-health-header-bar" aria-hidden="true">{card.bar}</p>
      <p className="apollo-cc-health-header-score">
        <strong>{card.display}</strong>
        <span> / {card.max}</span>
      </p>
      <span className="apollo-cc-health-header-status">{card.label}</span>
      {card.delta != null && (
        <span className={`apollo-cc-health-header-delta apollo-cc-health-header-delta--${card.delta >= 0 ? 'up' : 'down'}`}>
          {card.delta >= 0 ? '▲' : '▼'} {Math.abs(card.delta).toFixed(1)} since yesterday
        </span>
      )}
    </div>
  );
}

export default function ApolloOperationalBrief({
  context,
  meta,
  loading,
  onAsk,
  onRefresh,
  onReviewNotification,
  refreshing,
  userName,
  userEmail,
  chatPanel,
}) {
  const [startDayActive, setStartDayActive] = useState(false);
  const [startDayStep, setStartDayStep] = useState(0);

  const scrollToStep = useCallback((targetId) => {
    if (!targetId) return;
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleStartDay = useCallback(() => {
    setStartDayActive(true);
    setStartDayStep(0);
    scrollToStep(START_MY_DAY_STEPS[0].target);
  }, [scrollToStep]);

  const handleAdvanceDay = useCallback(() => {
    const next = startDayStep + 1;
    if (next >= START_MY_DAY_STEPS.length) {
      setStartDayActive(false);
      setStartDayStep(0);
      return;
    }
    setStartDayStep(next);
    const target = START_MY_DAY_STEPS[next].target;
    if (target) scrollToStep(target);
  }, [scrollToStep, startDayStep]);

  const handleFocusSelect = useCallback((item) => {
    if (item?.url) {
      window.location.href = item.url;
      return;
    }
    const query = item?.query || item?.action;
    if (query) onAsk?.(query);
  }, [onAsk]);

  const handleRowSelect = useCallback((row) => {
    if (row?.url) {
      window.location.href = row.url;
      return;
    }
    if (row?.query) onAsk?.(row.query);
    else if (row?.title) onAsk?.(row.title);
  }, [onAsk]);

  if (loading && !context) {
    return (
      <div className="apollo-today apollo-today--loading">
        <Loader2 size={20} className="spin" />
        <span>Preparing Today…</span>
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

  const focusTypes = focusTypesPresent(context.focusToday || []);
  const heroItems = buildHeroFocusItems(context.focusToday || []);
  const businessStatus = buildBusinessStatus(context);
  const dailyBrief = buildDailyBriefBullets(context);
  const recommends = buildApolloRecommends(context.focusToday || []);
  const notifications = groupNotificationsByUrgency(context.notifications?.items || []);
  const rememberItems = buildRememberItems();
  const orderRows = buildOrderOps(context, focusTypes);
  const buyingRows = buildBuyingOps(context);
  const activity = (context.whatChangedSinceYesterday || []).slice(0, 5).map((l) => l.text);
  const showValidation = isApolloOwner(userEmail);

  return (
    <div className="apollo-cc-brief">
      <div className="apollo-cc-brief-toolbar">
        <StartMyDay
          active={startDayActive}
          stepIndex={startDayStep}
          onStart={handleStartDay}
          onAdvance={handleAdvanceDay}
          onExit={() => { setStartDayActive(false); setStartDayStep(0); }}
        />
      </div>

      <BusinessStatusBar status={businessStatus} />

      <FocusHero items={heroItems} onSelect={handleFocusSelect} />

      <div className="apollo-cc-body-grid">
        <div className="apollo-cc-body-col apollo-cc-body-col--left">
          <RememberSection items={rememberItems} />
          <NotificationsGrouped groups={notifications} onOpen={handleRowSelect} />
          <OpsList title="Operations" icon={ShoppingCart} rows={orderRows} onSelect={handleRowSelect} />
        </div>

        <div className="apollo-cc-body-col apollo-cc-body-col--centre">
          <DailyBriefCompact bullets={dailyBrief.bullets} detailSections={dailyBrief.detailSections} />
          <RecommendsSection items={recommends} onSelect={handleFocusSelect} />
          <OpsList title="Buying" icon={Package} rows={buyingRows} onSelect={handleRowSelect} />
          {showValidation && (
            <div id="apollo-cc-section-brief" className="apollo-cc-validation-slot">
              <ApolloToday
                context={context}
                meta={meta}
                loading={false}
                onAsk={onAsk}
                onRefresh={onRefresh}
                onReviewNotification={onReviewNotification}
                refreshing={refreshing}
                userName={userName}
                userEmail={userEmail}
                column="validation-only"
              />
            </div>
          )}
        </div>

        <div className="apollo-cc-body-col apollo-cc-body-col--right">
          {chatPanel}
          <ActivitySection lines={activity} />
        </div>
      </div>
    </div>
  );
}
