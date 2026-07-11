import { useState } from 'react';
import { Bot, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { APOLLO_COMMAND_DEFAULT_NAV, APOLLO_COMMAND_NAV } from '../lib/apolloCommandCentre.js';
import { greetingForHour } from '../lib/apolloTodayPresentation.js';
import ApolloChatPanel from './ApolloChatPanel.jsx';
import ApolloKnowledgePlaceholder from './ApolloKnowledgePlaceholder.jsx';
import ApolloOperationalBrief from './ApolloOperationalBrief.jsx';
import OrdersWorkspacePanel from './OrdersWorkspacePanel.jsx';

function WorkspaceShell({ children, chatPanel }) {
  return (
    <div className="apollo-cc-workspace-shell">
      <div className="apollo-cc-workspace-shell-main">{children}</div>
      <div className="apollo-cc-workspace-shell-rail">{chatPanel}</div>
    </div>
  );
}

export default function ApolloCommandCentre({
  briefContext,
  briefMeta,
  briefLoading,
  indexError,
  indexStatus,
  rebuildingIndex,
  onRefreshBrief,
  onReviewNotification,
  userName,
  userEmail,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatBusy,
  chatError,
  onFixLast,
  onClearChat,
  onShowToast,
}) {
  const [activeNav, setActiveNav] = useState(APOLLO_COMMAND_DEFAULT_NAV);
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const displayName = userName || 'there';

  const briefSharedProps = {
    context: briefContext,
    meta: briefMeta,
    loading: briefLoading,
    onAsk: onSend,
    onRefresh: onRefreshBrief,
    onReviewNotification,
    refreshing: rebuildingIndex,
    userName,
    userEmail,
  };

  const chatPanel = (
    <ApolloChatPanel
      messages={messages}
      input={chatInput}
      onInputChange={onChatInputChange}
      onSend={onSend}
      busy={chatBusy}
      error={chatError}
      onFixLast={onFixLast}
      onClear={onClearChat}
      variant="compact"
    />
  );

  return (
    <div className="apollo-cc apollo-cc--phase2">
      <header className="apollo-cc-head">
        <div className="apollo-cc-head-brand">
          <div className="apollo-head-icon"><Bot size={20} /></div>
          <div>
            <h1 className="apollo-cc-title">Apollo Command Centre</h1>
            <p className="apollo-cc-subtitle">Operational brain for Proto Trading</p>
            <p className="apollo-cc-greeting">{greeting} {displayName}</p>
            {indexError && <p className="apollo-index-error">{indexError}</p>}
          </div>
        </div>
        <div className="apollo-cc-head-meta">
          <button
            type="button"
            className="apollo-action-btn apollo-action-btn--ghost"
            onClick={onRefreshBrief}
            disabled={chatBusy || rebuildingIndex}
            title="Refresh Today"
          >
            {rebuildingIndex ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            {rebuildingIndex ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <nav className="apollo-cc-nav" aria-label="Apollo sections">
        {APOLLO_COMMAND_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`apollo-cc-nav-btn${activeNav === item.id ? ' is-active' : ''}`}
            onClick={() => setActiveNav(item.id)}
          >
            <span className="apollo-cc-nav-emoji" aria-hidden="true">{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {activeNav === 'today' && (
        <ApolloOperationalBrief {...briefSharedProps} chatPanel={chatPanel} />
      )}

      {activeNav === 'orders' && (
        <WorkspaceShell chatPanel={chatPanel}>
          <OrdersWorkspacePanel onShowToast={onShowToast} />
        </WorkspaceShell>
      )}

      {activeNav === 'remember' && (
        <WorkspaceShell chatPanel={chatPanel}>
          <ApolloKnowledgePlaceholder />
        </WorkspaceShell>
      )}

      {indexStatus && (
        <p className="apollo-cc-foot">
          <RefreshCw size={12} />
          {indexStatus.counts?.products?.toLocaleString() ?? '—'} products indexed
        </p>
      )}
    </div>
  );
}
