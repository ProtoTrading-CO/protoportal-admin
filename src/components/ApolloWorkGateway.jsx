import { ArrowRight, Package, Star } from 'lucide-react';
import { APOLLO_WORK_OBJECTS } from '../lib/apolloCommandCentre.js';

function WorkStatusBadge({ item }) {
  return (
    <span className={`apollo-cc-workshop-badge apollo-cc-workshop-badge--${item.status}`} title={item.statusLabel}>
      <span className="apollo-cc-workshop-badge-dot" aria-hidden="true">{item.statusBadge}</span>
      {item.statusLabel}
    </span>
  );
}

function WorkShopRow({ item, onSelectWorkObject }) {
  const isReady = item.status === 'ready';

  return (
    <section className={`apollo-cc-workshop-row${isReady ? ' apollo-cc-workshop-row--ready' : ''}`}>
      <button
        type="button"
        className="apollo-cc-workshop-row-hit"
        onClick={() => onSelectWorkObject(item.id)}
      >
        <div className="apollo-cc-workshop-row-head">
          <div className="apollo-cc-workshop-row-titleblock">
            <h3 className="apollo-cc-workshop-row-title">
              {item.featured && (
                <span className="apollo-cc-workshop-stars" aria-label="Primary operational object">
                  <Star size={13} fill="currentColor" />
                  <Star size={13} fill="currentColor" />
                </span>
              )}
              {item.label}
            </h3>
            {item.roleLabel && (
              <span className="apollo-cc-workshop-role">{item.roleLabel}</span>
            )}
          </div>
          <WorkStatusBadge item={item} />
        </div>

        {item.summary && (
          <p className="apollo-cc-workshop-summary">{item.summary}</p>
        )}

        {!item.summary && item.modules.length > 0 && (
          <ul className="apollo-cc-workshop-modules">
            {item.modules.map((mod) => (
              <li key={mod}>{mod}</li>
            ))}
          </ul>
        )}

        {isReady && item.openLabel && (
          <span className="apollo-cc-workshop-open">
            {item.openLabel}
            <ArrowRight size={14} />
          </span>
        )}
      </button>
    </section>
  );
}

export default function ApolloWorkGateway({ onSelectWorkObject }) {
  return (
    <div className="apollo-cc-workshop">
      <header className="apollo-cc-workshop-head">
        <Package size={22} />
        <div>
          <h2>Work</h2>
          <p>Choose where you want to work today.</p>
        </div>
      </header>

      <div className="apollo-cc-workshop-list">
        {APOLLO_WORK_OBJECTS.map((item, index) => (
          <div key={item.id} className="apollo-cc-workshop-item">
            {index > 0 && <hr className="apollo-cc-workshop-divider" />}
            <WorkShopRow item={item} onSelectWorkObject={onSelectWorkObject} />
          </div>
        ))}
      </div>
    </div>
  );
}
