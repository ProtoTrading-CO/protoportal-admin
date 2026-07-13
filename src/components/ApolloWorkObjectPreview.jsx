import { ArrowLeft } from 'lucide-react';
import { workObjectById } from '../lib/apolloCommandCentre.js';
import WorkspaceDocuments from './WorkspaceDocuments.jsx';

export default function ApolloWorkObjectPreview({ objectId, onBack, onShowToast }) {
  const item = workObjectById(objectId);
  if (!item) return null;

  return (
    <div className="apollo-cc-work-preview">
      <button type="button" className="apollo-cc-work-back" onClick={onBack}>
        <ArrowLeft size={14} />
        Work
      </button>

      <header className="apollo-cc-section-head">
        <span className="apollo-cc-work-card-emoji" aria-hidden="true">{item.emoji}</span>
        <div>
          <h2>{item.objectTitle}</h2>
          <p>Full operational environment for {item.label.toLowerCase()} — not a Today filter.</p>
        </div>
      </header>

      <ul className="apollo-cc-work-preview-modules">
        {item.modules.map((mod) => (
          <li key={mod}>{mod}</li>
        ))}
      </ul>

      <div className="apollo-cc-work-preview-status">
        <span className={`apollo-cc-workshop-badge apollo-cc-workshop-badge--${item.status}`}>
          <span className="apollo-cc-workshop-badge-dot" aria-hidden="true">{item.statusBadge}</span>
          {item.statusLabel}
        </span>
      </div>

      <p className="apollo-cc-knowledge-foot">
        The full operational workflow is still growing, but its document knowledge is live now.
      </p>

      <WorkspaceDocuments
        workspaceType={objectId}
        scopeLabel={`${item.label} workspace`}
        onShowToast={onShowToast}
      />
    </div>
  );
}
