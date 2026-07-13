import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  PackageCheck,
  Send,
  Ship,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { APOLLO_WORK_OBJECTS, workObjectById } from '../lib/apolloCommandCentre.js';
import ApolloChatPanel from './ApolloChatPanel.jsx';

const WORKSPACE_META = {
  orders: {
    icon: PackageCheck,
    outcome: 'Move customer orders from request to delivery without losing a promise.',
    prompt: 'Show me the orders and commitments that need attention today',
    keywords: /order|quote|commitment|delivery/i,
  },
  customers: {
    icon: Users,
    outcome: 'Unify customer history, orders, quotes, payments and conversations.',
    prompt: 'Which customers need attention and why?',
    keywords: /customer|account|inactive|payment/i,
  },
  suppliers: {
    icon: Truck,
    outcome: 'Track supplier reliability, lead times, purchase orders and knowledge.',
    prompt: 'Which suppliers are creating operational risk?',
    keywords: /supplier|lead time|purchase order|vendor/i,
  },
  containers: {
    icon: Ship,
    outcome: 'Coordinate tracking, arrivals, allocations and shipping documents.',
    prompt: 'What container or arrival risks should I know about?',
    keywords: /container|arrival|shipment|freight/i,
  },
  buying: {
    icon: TrendingUp,
    outcome: 'Turn stock cover, quotes and replenishment signals into buying decisions.',
    prompt: 'What should we buy or adjust next?',
    keywords: /stock|buying|reorder|inventory|overstock|negative/i,
  },
};

function contextItems(context) {
  return [
    ...(context?.focusToday || []),
    ...(context?.notifications?.items || []),
    ...(context?.whatChangedSinceYesterday || []),
  ];
}

function countWorkspaceSignals(context, itemId) {
  const matcher = WORKSPACE_META[itemId]?.keywords;
  if (!matcher) return 0;
  return contextItems(context).filter((item) => matcher.test([
    item?.type,
    item?.category,
    item?.title,
    item?.text,
    item?.why,
  ].filter(Boolean).join(' '))).length;
}

function WorkStatusBadge({ item }) {
  const statusCopy = item.status === 'ready'
    ? 'Live now'
    : item.status === 'planning'
      ? 'Next capability'
      : 'Roadmap';

  return (
    <span className={`apollo-work-hub-badge apollo-work-hub-badge--${item.status}`} title={item.statusLabel}>
      {item.status === 'ready' ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
      {statusCopy}
    </span>
  );
}

function WorkspaceCard({ item, context, onSelectWorkObject, onAsk }) {
  const meta = WORKSPACE_META[item.id];
  const Icon = meta.icon;
  const signalCount = countWorkspaceSignals(context, item.id);
  const isReady = item.status === 'ready';

  return (
    <article className={`apollo-work-hub-card apollo-work-hub-card--${item.status}${item.featured ? ' apollo-work-hub-card--featured' : ''}`}>
      <header>
        <span className="apollo-work-hub-card-icon"><Icon size={20} /></span>
        <WorkStatusBadge item={item} />
      </header>
      <div className="apollo-work-hub-card-copy">
        <p>{item.roleLabel || (isReady ? 'Operational workspace' : 'Capability workspace')}</p>
        <h3>{item.label}</h3>
        <span>{meta.outcome}</span>
      </div>
      <div className="apollo-work-hub-card-metrics">
        <span><strong>{signalCount}</strong>{signalCount === 1 ? ' active signal' : ' active signals'}</span>
        <span><strong>{item.modules.length}</strong> connected capabilities</span>
      </div>
      <ul className="apollo-work-hub-card-modules" aria-label={`${item.label} capabilities`}>
        {item.modules.slice(0, 4).map((module) => <li key={module}>{module}</li>)}
      </ul>
      <footer>
        <button type="button" className="apollo-work-hub-open" onClick={() => onSelectWorkObject(item.id)}>
          {isReady ? item.openLabel : 'Explore workspace'}
          <ArrowUpRight size={15} />
        </button>
        <button type="button" className="apollo-work-hub-ask" onClick={() => void onAsk(meta.prompt)}>
          <Sparkles size={14} />Ask Apollo
        </button>
      </footer>
    </article>
  );
}

function WorkCommand({
  context,
  userName,
  input,
  onInputChange,
  onSend,
  busy,
  error,
  messages,
  onFixLast,
  onClearChat,
}) {
  const decisionCount = context?.focusToday?.length || 0;
  const inboxCount = contextItems(context).length;
  const suggestions = [
    'What work should I prioritise today?',
    'Show me overdue orders and commitments',
    'Which supplier or stock risk needs action?',
  ];

  return (
    <section className="apollo-work-command" aria-label="Apollo work command">
      <header>
        <div className="apollo-work-command-brand">
          <span><Sparkles size={18} /></span>
          <div><p>Apollo Work</p><strong>Operational command</strong></div>
        </div>
        <span className="apollo-work-command-live"><Activity size={13} />Live workspace signals</span>
      </header>

      <div className="apollo-work-command-brief">
        <p>{userName ? `${userName}, here is where the work stands.` : 'Here is where the work stands.'}</p>
        <h2>One workspace is live. {decisionCount || inboxCount} operational signal{(decisionCount || inboxCount) === 1 ? '' : 's'} can guide your next move.</h2>
        <span>Open a workspace to execute, or ask Apollo to find the work that matters most.</span>
      </div>

      {messages.length > 0 ? (
        <div className="apollo-work-command-conversation">
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
        <div className="apollo-work-command-actions">
          {error && <p className="apollo-error">{error}</p>}
          <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) void onSend(input); }}>
            <textarea
              rows={1}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Ask Apollo to find, explain or prepare operational work…"
              disabled={busy}
              aria-label="Ask Apollo about operational work"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) void onSend(input);
                }
              }}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send to Apollo">
              {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </form>
          <div className="apollo-work-command-prompts" aria-label="Suggested work questions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void onSend(suggestion)} disabled={busy}>
                {suggestion}<ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ApolloWorkGateway({
  onSelectWorkObject,
  context,
  recentWorkObjectId = 'orders',
  userName,
  input,
  onInputChange,
  onSend,
  busy,
  error,
  messages = [],
  onFixLast,
  onClearChat,
}) {
  const recentItem = workObjectById(recentWorkObjectId) || workObjectById('orders');
  const RecentIcon = WORKSPACE_META[recentItem.id].icon;

  return (
    <div className="apollo-work-hub">
      <WorkCommand
        context={context}
        userName={userName}
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        busy={busy}
        error={error}
        messages={messages}
        onFixLast={onFixLast}
        onClearChat={onClearChat}
      />

      <section className="apollo-work-continue" aria-labelledby="apollo-work-continue-title">
        <div className="apollo-work-section-head">
          <div><p>Continue working</p><h2 id="apollo-work-continue-title">Pick up where you left off</h2></div>
          <span>Saved in this browser</span>
        </div>
        <button type="button" onClick={() => onSelectWorkObject(recentItem.id)}>
          <span className="apollo-work-continue-icon"><RecentIcon size={20} /></span>
          <span className="apollo-work-continue-copy">
            <strong>{recentItem.objectTitle}</strong>
            <small>{recentItem.summary || WORKSPACE_META[recentItem.id].outcome}</small>
          </span>
          <span className="apollo-work-continue-state">{recentItem.status === 'ready' ? 'Ready to open' : recentItem.statusLabel}</span>
          <ArrowRight size={18} />
        </button>
      </section>

      <section className="apollo-work-spaces" aria-labelledby="apollo-work-spaces-title">
        <div className="apollo-work-section-head">
          <div><p>Workspaces</p><h2 id="apollo-work-spaces-title">Run the operation by business object</h2></div>
          <span>1 live · 3 next · 1 roadmap</span>
        </div>
        <div className="apollo-work-hub-grid">
          {APOLLO_WORK_OBJECTS.map((item) => (
            <WorkspaceCard
              key={item.id}
              item={item}
              context={context}
              onSelectWorkObject={onSelectWorkObject}
              onAsk={onSend}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
