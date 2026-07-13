import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ApolloChatPanel from './ApolloChatPanel.jsx';
import WorkspaceDocuments from './WorkspaceDocuments.jsx';

const TABS = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'customer', label: 'Customer' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'actions', label: 'Actions' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'apollo', label: 'Apollo' },
];

function PlaceholderPane({ title, detail }) {
  return (
    <div className="apollo-op-workspace-placeholder">
      <p className="apollo-op-workspace-placeholder-title">{title}</p>
      <p className="apollo-op-workspace-placeholder-detail">{detail}</p>
    </div>
  );
}

export default function ApolloOperationalWorkspace({
  item,
  onBack,
  messages,
  input,
  onInputChange,
  onSend,
  busy,
  error,
  onFixLast,
  onClear,
}) {
  const [activeTab, setActiveTab] = useState('conversation');
  const who = item?.who || 'Work';

  return (
    <aside className="apollo-op-workspace" aria-label={`Operational workspace for ${who}`}>
      <header className="apollo-op-workspace-head">
        <button type="button" className="apollo-op-workspace-back" onClick={onBack}>
          <ArrowLeft size={14} />
          Operational Inbox
        </button>
        {item?.workType && (
          <span className="apollo-op-workspace-badge">
            {item.workType.emoji}
            {' '}
            {item.workType.label}
          </span>
        )}
        <h3 className="apollo-op-workspace-title">{who}</h3>
        {item?.why && <p className="apollo-op-workspace-sub">{item.why}</p>}
      </header>

      <nav className="apollo-op-workspace-tabs" aria-label="Operational workspace sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`apollo-op-workspace-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="apollo-op-workspace-body">
        {(activeTab === 'conversation' || activeTab === 'apollo') && (
          <ApolloChatPanel
            messages={messages}
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            busy={busy}
            error={error}
            onFixLast={onFixLast}
            onClear={onClear}
            variant="workspace"
          />
        )}
        {activeTab === 'customer' && (
          <PlaceholderPane
            title={who}
            detail="Customer profile, orders, and knowledge open here as workspaces earn the Knowledge responsibility."
          />
        )}
        {activeTab === 'timeline' && (
          <PlaceholderPane
            title="Timeline"
            detail="Commitments, tasks, and operational events for this work appear here."
          />
        )}
        {activeTab === 'actions' && (
          <PlaceholderPane
            title="Actions"
            detail="Next steps and outstanding operational work for this item."
          />
        )}
        {activeTab === 'attachments' && (
          <WorkspaceDocuments
            workspaceType={item?.workspaceType || item?.workType?.id || 'orders'}
            recordId={item?.workspaceId || item?.id || ''}
            scopeLabel={who}
            compact
          />
        )}
      </div>
    </aside>
  );
}
