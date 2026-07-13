import { useState } from 'react';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquare,
  PackageCheck,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import ApolloChatPanel from './ApolloChatPanel.jsx';

function severityLabel(severity) {
  if (severity === 'urgent' || severity === 'red') return 'High priority';
  if (severity === 'attention' || severity === 'amber') return 'Needs attention';
  return 'Review';
}

function compactText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function DecisionEvidence({ decision }) {
  const metrics = decision?.metrics || [];
  const reasoning = decision?.reasoning || [];
  const read = decision?.summaryHeadline || decision?.whyToday || reasoning[0];

  return (
    <section className="apollo-desk-evidence" aria-labelledby="apollo-desk-evidence-title">
      <h3 id="apollo-desk-evidence-title">Evidence</h3>
      {read && (
        <div className="apollo-desk-evidence-read">
          <Sparkles size={16} />
          <div>
            <strong>Apollo&apos;s read</strong>
            <p>{compactText(read)}</p>
          </div>
        </div>
      )}
      {metrics.length ? (
        <dl className="apollo-desk-evidence-list">
          {metrics.slice(0, 7).map((metric) => (
            <div key={metric.label} className="apollo-desk-evidence-row">
              <dt><Box size={15} />{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="apollo-desk-evidence-empty">
          <ShieldCheck size={18} />
          <p>{decision?.whyToday || 'Apollo will show the supporting evidence when it is available.'}</p>
        </div>
      )}
      {(decision?.confidenceChip || decision?.impactBadge || decision?.priorityBadge) && (
        <div className="apollo-desk-signals" aria-label="Decision signals">
          {decision.confidenceChip && (
            <span className={`apollo-desk-signal apollo-desk-signal--${decision.confidenceChip.tone}`}>
              {decision.confidenceChip.label} · {decision.confidenceChip.value}
            </span>
          )}
          {decision.impactBadge && (
            <span className={`apollo-desk-signal apollo-desk-signal--${decision.impactBadge.tone}`}>
              {decision.impactBadge.label}
            </span>
          )}
          {decision.priorityBadge && (
            <span className={`apollo-desk-signal apollo-desk-signal--${decision.priorityBadge.tone}`}>
              {decision.priorityBadge.label} {decision.priorityBadge.value}
            </span>
          )}
        </div>
      )}
      {reasoning.length > 0 && (
        <ul className="apollo-desk-evidence-points" aria-label="Key reasoning">
          {reasoning.slice(0, 3).map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {reasoning.length > 3 && (
        <details className="apollo-desk-reasoning-detail">
          <summary>View Apollo&apos;s reasoning</summary>
          <ul>{reasoning.slice(3).map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function DecisionCanvas({ decision, position, total, onAdjust, onApprove, onAsk }) {
  if (!decision) {
    return (
      <section className="apollo-desk-calm" aria-label="No decisions waiting">
        <CheckCircle2 size={28} />
        <div>
          <h2>No decisions are waiting</h2>
          <p>Proto looks calm. Apollo will surface work here when something genuinely needs you.</p>
        </div>
      </section>
    );
  }

  const object = decision.view || {};
  const title = object.description || object.identifier || decision.title;
  const subtitle = [object.sku, object.meta].filter(Boolean).join(' · ');
  const recommendation = decision.actionShort || decision.recommendationText || decision.summaryHeadline;
  const why = decision.whyToday || decision.reasoning?.[0] || 'Apollo found this decision in today’s operational scan.';

  return (
    <article className="apollo-desk-decision">
      <div className="apollo-desk-decision-main">
        <p className="apollo-desk-eyebrow">
          Decision {position} of {total}
          <span aria-hidden="true">•</span>
          {severityLabel(decision.severity)}
        </p>
        <h2>{title}</h2>
        {subtitle && <p className="apollo-desk-object-meta">{subtitle}</p>}

        <div className="apollo-desk-recommendation">
          <p className="apollo-desk-kicker"><Sparkles size={15} />Apollo recommendation</p>
          <p className="apollo-desk-recommendation-text">{recommendation}</p>
          <p className="apollo-desk-recommendation-why">{why}</p>
        </div>

        <div className="apollo-desk-why">
          <ShieldCheck size={18} />
          <div>
            <strong>Why this recommendation</strong>
            <p>{compactText(decision.summaryHeadline, why)}</p>
          </div>
        </div>
      </div>

      <DecisionEvidence decision={decision} />

      <div className="apollo-desk-decision-actions" role="group" aria-label="Decision actions">
        <button type="button" className="apollo-desk-action apollo-desk-action--secondary" onClick={onAdjust}>
          <SlidersHorizontal size={17} />Adjust order
        </button>
        <button type="button" className="apollo-desk-action apollo-desk-action--primary" onClick={onApprove}>
          <CheckCircle2 size={17} />Approve recommendation
        </button>
        <button type="button" className="apollo-desk-action apollo-desk-action--secondary" onClick={onAsk}>
          <MessageSquare size={17} />Ask Apollo
        </button>
      </div>
    </article>
  );
}

function DecisionQueue({ decisions, selectedIndex, onSelect }) {
  const remaining = decisions.filter((_, index) => index !== selectedIndex);
  if (!remaining.length) return null;

  return (
    <section className="apollo-desk-next" aria-labelledby="apollo-desk-next-title">
      <h3 id="apollo-desk-next-title">Next decisions</h3>
      <div className="apollo-desk-next-list">
        {remaining.map((decision) => {
          const originalIndex = decisions.indexOf(decision);
          return (
            <button key={decision.id} type="button" className="apollo-desk-next-row" onClick={() => onSelect(originalIndex)}>
              <span className="apollo-desk-next-number">{originalIndex + 1}</span>
              <span className="apollo-desk-next-copy">
                <strong>{decision.view?.description || decision.title}</strong>
                <small>{decision.actionShort || decision.whyToday || 'Review this decision'}</small>
              </span>
              <span className={`apollo-desk-next-impact apollo-desk-next-impact--${decision.severity}`}>
                {severityLabel(decision.severity)}
              </span>
              <ChevronRight size={17} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ApolloCommandLayer({
  input,
  onInputChange,
  onSend,
  busy,
  error,
  messages,
  onFixLast,
  onClearChat,
  status,
  selectedDecision,
  issueCount,
  inboxCount,
}) {
  const selectedName = selectedDecision?.view?.description || selectedDecision?.title || 'today’s priority';
  const selectedCode = selectedDecision?.code || selectedDecision?.view?.sku;
  const suggestions = selectedDecision ? [
    `Explain why ${selectedCode || selectedName} needs attention`,
    'What happens if I wait until tomorrow?',
    'Show me the evidence behind this recommendation',
  ] : [
    'What is my biggest operational risk today?',
    'Show me items at risk of overstock.',
    'Which suppliers need my attention?',
  ];
  const statusHeadline = compactText(status?.headline, 'Proto looks calm');
  const briefingTitle = issueCount
    ? `${issueCount} decision${issueCount === 1 ? '' : 's'} need you. Start here.`
    : 'You are clear. Apollo is watching the operation.';
  const briefingCopy = selectedDecision
    ? `${selectedName}. ${compactText(selectedDecision.whyToday || selectedDecision.summaryHeadline)}`
    : 'Nothing needs an immediate decision. Ask Apollo to investigate a product, supplier or operational risk.';

  return (
    <section className={`apollo-desk-command${messages.length ? ' apollo-desk-command--active' : ''}`} aria-label="Apollo assistant">
      <header className="apollo-desk-command-head">
        <div className="apollo-desk-command-intro">
          <span className="apollo-desk-command-mark"><Sparkles size={19} /></span>
          <div>
            <p>Apollo</p>
            <h2>Your operational intelligence</h2>
          </div>
        </div>
        <span className="apollo-desk-command-live"><i aria-hidden="true" />Live operational brief</span>
      </header>

      <div className="apollo-desk-command-brief">
        <p>{statusHeadline}</p>
        <h3>{briefingTitle}</h3>
        <span>{briefingCopy}</span>
        <div className="apollo-desk-command-facts" aria-label="Apollo briefing facts">
          <span><strong>{issueCount}</strong> decisions</span>
          <span><strong>{inboxCount}</strong> inbox items</span>
          <span><strong>{selectedDecision?.confidenceChip?.value || 'Live'}</strong> confidence</span>
        </div>
      </div>

      {messages.length > 0 ? (
        <div className="apollo-desk-conversation">
          <ApolloChatPanel
            messages={messages}
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            busy={busy}
            error={error}
            onFixLast={onFixLast}
            onClear={onClearChat}
            variant="workspace"
          />
        </div>
      ) : (
        <div className="apollo-desk-command-body">
          <p className="apollo-desk-command-question">What do you want to know or change?</p>
          {error && <p className="apollo-error">{error}</p>}
          <form
            className="apollo-desk-command-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSend(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Ask Apollo about risk, stock, suppliers, customers or today’s priorities…"
              disabled={busy}
              rows={1}
              aria-label="Ask Apollo anything"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void onSend(input);
                }
              }}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send to Apollo">
              {busy ? <Loader2 size={19} className="spin" /> : <Send size={19} />}
            </button>
          </form>
          <div className="apollo-desk-command-prompts" aria-label="Suggested questions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void onSend(suggestion)} disabled={busy}>
                <span>{suggestion}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OperationalSupport({ inboxItems, recentActions, onSelectInbox }) {
  return (
    <section className="apollo-desk-support" aria-label="Operational activity">
      <div className="apollo-desk-inbox" aria-labelledby="apollo-desk-inbox-title">
        <div className="apollo-desk-section-head">
          <h3 id="apollo-desk-inbox-title">Operational Inbox</h3>
          <span>{inboxItems.length}</span>
        </div>
        {inboxItems.length ? (
          <ul>
            {inboxItems.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelectInbox(item)}>
                  <span className="apollo-desk-inbox-dot" aria-hidden="true" />
                  <span>
                    <strong>{item.why}</strong>
                    <small>{item.who} · {item.when}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="apollo-desk-empty"><CheckCircle2 size={16} />Nothing is waiting for you.</p>
        )}
      </div>

      <div className="apollo-desk-history" aria-labelledby="apollo-desk-history-title">
        <h3 id="apollo-desk-history-title">Recent decisions</h3>
        {recentActions.length > 0 ? (
          <ul>
            {recentActions.slice(0, 4).map((action) => (
              <li key={action.id}>
                <PackageCheck size={16} />
                <span><strong>{action.label}</strong><small>{action.who}</small></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="apollo-desk-history-empty">Approved decisions will appear here.</p>
        )}
      </div>
    </section>
  );
}

export default function ApolloDecisionDesk({
  status,
  decisions,
  inboxItems,
  recentActions,
  input,
  onInputChange,
  onSend,
  busy,
  error,
  onSelectInbox,
  onReviewNotification,
  messages = [],
  onFixLast,
  onClearChat,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [approvedIds, setApprovedIds] = useState(() => new Set());
  const visibleDecisions = decisions.filter((decision) => !approvedIds.has(decision.id));
  const safeIndex = Math.min(selectedIndex, Math.max(visibleDecisions.length - 1, 0));
  const selected = visibleDecisions[safeIndex] || null;

  const askAboutSelected = () => {
    if (!selected) return;
    const sku = selected.code || selected.view?.sku;
    void onSend(sku ? `Explain your recommendation for ${sku}` : `Explain ${selected.title}`);
  };

  const adjustSelected = () => {
    if (!selected) return;
    const sku = selected.code || selected.view?.sku;
    void onSend(sku ? `Order ${sku}` : selected.recommendationText || selected.title);
  };

  const approveSelected = () => {
    if (!selected) return;
    if (selected.item?.notificationDbId) {
      void onReviewNotification?.(selected.item, {
        feedback: 'useful',
        businessValue: 'medium',
        decisionOutcome: 'accepted',
        note: 'Approved from Apollo Decision Desk',
      });
    } else {
      const sku = selected.code || selected.view?.sku;
      void onSend(sku
        ? `Approve Apollo's recommendation for ${sku}`
        : `Approve Apollo's recommendation: ${selected.title}`);
    }
    setApprovedIds((current) => new Set([...current, selected.id]));
    setSelectedIndex(0);
  };

  const issueCount = visibleDecisions.length;

  return (
    <div className="apollo-desk">
      <main className="apollo-desk-main">
        <ApolloCommandLayer
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          busy={busy}
          error={error}
          messages={messages}
          onFixLast={onFixLast}
          onClearChat={onClearChat}
          status={status}
          selectedDecision={selected}
          issueCount={issueCount}
          inboxCount={inboxItems.length}
        />

        <DecisionCanvas
          decision={selected}
          position={safeIndex + 1}
          total={issueCount}
          onAdjust={adjustSelected}
          onApprove={approveSelected}
          onAsk={askAboutSelected}
        />
        <DecisionQueue decisions={visibleDecisions} selectedIndex={safeIndex} onSelect={setSelectedIndex} />
        <OperationalSupport
          inboxItems={inboxItems}
          recentActions={recentActions}
          onSelectInbox={onSelectInbox}
        />
      </main>
    </div>
  );
}
