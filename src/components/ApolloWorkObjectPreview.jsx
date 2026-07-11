import { ArrowLeft } from 'lucide-react';
import { workObjectById } from '../lib/apolloCommandCentre.js';

export default function ApolloWorkObjectPreview({ objectId, onBack }) {
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

      <div className="apollo-cc-work-card-status apollo-cc-work-preview-status">
        <span className="apollo-cc-work-card-status-label apollo-cc-work-card-status-label--planning">
          {item.statusLabel}
        </span>
      </div>

      <p className="apollo-cc-knowledge-foot">
        Apollo is growing into this — ships when {item.label.toLowerCase()} is ready to own execution.
      </p>
    </div>
  );
}
