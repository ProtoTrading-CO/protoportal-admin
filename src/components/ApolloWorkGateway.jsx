import { ArrowRight, Package, Star } from 'lucide-react';
import { APOLLO_WORK_OBJECTS } from '../lib/apolloCommandCentre.js';

export default function ApolloWorkGateway({ onSelectWorkObject }) {
  return (
    <div className="apollo-cc-work-gateway">
      <header className="apollo-cc-work-gateway-head">
        <Package size={22} />
        <div>
          <h2>Work</h2>
          <p>Choose what you&apos;re working on — operational objects, not filtered reports.</p>
        </div>
      </header>

      <div className="apollo-cc-work-grid">
        {APOLLO_WORK_OBJECTS.map((item) => {
          const isReady = item.status === 'ready';
          return (
            <button
              key={item.id}
              type="button"
              className={`apollo-cc-work-card${isReady ? ' apollo-cc-work-card--ready' : ' apollo-cc-work-card--planning'}`}
              onClick={() => onSelectWorkObject(item.id)}
            >
              <div className="apollo-cc-work-card-top">
                <span className="apollo-cc-work-card-emoji" aria-hidden="true">{item.emoji}</span>
                <div className="apollo-cc-work-card-headings">
                  <strong className="apollo-cc-work-card-title">
                    {item.featured && (
                      <span className="apollo-cc-work-card-stars" aria-label="Primary operational object">
                        <Star size={12} fill="currentColor" />
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                    {item.label}
                  </strong>
                  <span className="apollo-cc-work-card-object">{item.objectTitle}</span>
                </div>
              </div>

              <ul className="apollo-cc-work-card-module-list">
                {item.modules.map((mod) => (
                  <li key={mod}>{mod}</li>
                ))}
              </ul>

              <div className="apollo-cc-work-card-status">
                {item.roleLabel && (
                  <span className="apollo-cc-work-card-role">{item.roleLabel}</span>
                )}
                <span className={`apollo-cc-work-card-status-label apollo-cc-work-card-status-label--${item.status}`}>
                  {item.statusLabel}
                </span>
              </div>

              {isReady && (
                <span className="apollo-cc-work-card-cta">
                  Open
                  <ArrowRight size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
