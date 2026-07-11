import { useState } from 'react';
import { ArrowLeft, Bot, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  APOLLO_COMMAND_DEFAULT_MODE,
  APOLLO_COMMAND_MODES,
  workObjectById,
} from '../lib/apolloCommandCentre.js';
import { greetingForHour } from '../lib/apolloTodayPresentation.js';
import ApolloChatPanel from './ApolloChatPanel.jsx';
import ApolloKnowledgePlaceholder from './ApolloKnowledgePlaceholder.jsx';
import ApolloOperationalBrief from './ApolloOperationalBrief.jsx';
import ApolloWorkGateway from './ApolloWorkGateway.jsx';
import ApolloWorkObjectPreview from './ApolloWorkObjectPreview.jsx';
import OrdersWorkspacePanel from './OrdersWorkspacePanel.jsx';

function WorkShell({ children, chatPanel }) {
  return (
    <div className="apollo-cc-work-shell">
      <div className="apollo-cc-work-shell-main">{children}</div>
      <div className="apollo-cc-work-shell-rail">{chatPanel}</div>
    </div>
  );
}

function ActiveWorkChrome({ objectId, onBack, children }) {
  const item = workObjectById(objectId);
  if (!item) return children;

  return (
    <div className="apollo-cc-work-active">
      <button type="button" className="apollo-cc-work-back" onClick={onBack}>
        <ArrowLeft size={14} />
        Work
      </button>
      <p className="apollo-cc-work-active-crumb">
        <span>{item.emoji}</span>
        {item.label}
      </p>
      {children}
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
  const [activeMode, setActiveMode] = useState(APOLLO_COMMAND_DEFAULT_MODE);
  const [activeWorkObject, setActiveWorkObject] = useState(null);
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

  const selectMode = (modeId) => {
    setActiveMode(modeId);
    if (modeId !== 'work') setActiveWorkObject(null);
  };

  const selectWorkObject = (objectId) => {
    setActiveMode('work');
    setActiveWorkObject(objectId);
  };

  const backToWorkGateway = () => setActiveWorkObject(null);

  const renderWork = () => {
    if (!activeWorkObject) {
      return (
        <WorkShell chatPanel={chatPanel}>
          <ApolloWorkGateway onSelectWorkObject={selectWorkObject} />
        </WorkShell>
      );
    }

    if (activeWorkObject === 'orders') {
      return (
        <WorkShell chatPanel={chatPanel}>
          <ActiveWorkChrome objectId="orders" onBack={backToWorkGateway}>
            <OrdersWorkspacePanel onShowToast={onShowToast} />
          </ActiveWorkChrome>
        </WorkShell>
      );
    }

    return (
      <WorkShell chatPanel={chatPanel}>
        <ApolloWorkObjectPreview objectId={activeWorkObject} onBack={backToWorkGateway} />
      </WorkShell>
    );
  };

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

      <nav className="apollo-cc-modes" aria-label="Apollo modes">
        {APOLLO_COMMAND_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`apollo-cc-mode-btn${activeMode === mode.id ? ' is-active' : ''}`}
            onClick={() => selectMode(mode.id)}
            aria-current={activeMode === mode.id ? 'page' : undefined}
          >
            <span className="apollo-cc-mode-emoji" aria-hidden="true">{mode.emoji}</span>
            <span className="apollo-cc-mode-label">{mode.label}</span>
            <span className="apollo-cc-mode-tagline">{mode.tagline}</span>
          </button>
        ))}
      </nav>

      {activeMode === 'today' && (
        <ApolloOperationalBrief {...briefSharedProps} chatPanel={chatPanel} />
      )}

      {activeMode === 'work' && renderWork()}

      {activeMode === 'knowledge' && (
        <WorkShell chatPanel={chatPanel}>
          <ApolloKnowledgePlaceholder />
        </WorkShell>
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
