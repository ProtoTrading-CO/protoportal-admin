import { Brain } from 'lucide-react';
import { APOLLO_KNOWLEDGE_DOMAINS } from '../lib/apolloCommandCentre.js';
import {
  buildApolloResponsibilities,
  buildKnowledgeDomainCounts,
  buildKnowledgeHealth,
  formatKnowledgeDomainCount,
} from '../lib/apolloCommandCentrePresentation.js';

function ResponsibilityStatusPanel({ responsibilities }) {
  return (
    <section className="apollo-cc-responsibilities" aria-labelledby="apollo-responsibilities-title">
      <h3 id="apollo-responsibilities-title" className="apollo-cc-responsibilities-title">
        Apollo Responsibilities
      </h3>
      <ul className="apollo-cc-responsibilities-list">
        {responsibilities.map((row) => (
          <li
            key={row.id}
            className={`apollo-cc-responsibilities-row apollo-cc-responsibilities-row--${row.status}`}
          >
            <span className="apollo-cc-responsibilities-icon" aria-hidden="true">{row.icon}</span>
            <div className="apollo-cc-responsibilities-copy">
              <span className="apollo-cc-responsibilities-label">{row.label}</span>
              {row.note && (
                <span className="apollo-cc-responsibilities-note">{row.note}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KnowledgeHealthPanel({ health }) {
  return (
    <section className="apollo-cc-knowledge-health" aria-labelledby="apollo-knowledge-health-title">
      <h3 id="apollo-knowledge-health-title" className="apollo-cc-knowledge-health-title">
        Knowledge Health
      </h3>
      <p className="apollo-cc-knowledge-health-purpose">{health.purposeCopy}</p>
      <div className="apollo-cc-knowledge-health-grid">
        <article className="apollo-cc-knowledge-health-stat">
          <span className="apollo-cc-knowledge-health-label">Verified Knowledge</span>
          <strong className="apollo-cc-knowledge-health-value">{health.verifiedKnowledge}</strong>
        </article>
        <article className="apollo-cc-knowledge-health-stat">
          <span className="apollo-cc-knowledge-health-label">Knowledge Reused</span>
          <strong className="apollo-cc-knowledge-health-value">{health.knowledgeReused}</strong>
        </article>
        <article className="apollo-cc-knowledge-health-stat">
          <span className="apollo-cc-knowledge-health-label">Active Operational</span>
          <strong className="apollo-cc-knowledge-health-value">{health.activeOperational}</strong>
        </article>
        <article className="apollo-cc-knowledge-health-stat">
          <span className="apollo-cc-knowledge-health-label">Decision Lessons</span>
          <strong className="apollo-cc-knowledge-health-value">{health.decisionLessons}</strong>
        </article>
      </div>
      <p className="apollo-cc-knowledge-health-foot">{health.memoryStatusCopy}</p>
    </section>
  );
}

export default function ApolloKnowledgeHub() {
  const responsibilities = buildApolloResponsibilities();
  const health = buildKnowledgeHealth();
  const counts = buildKnowledgeDomainCounts();

  return (
    <div className="apollo-cc-knowledge-hub">
      <header className="apollo-cc-knowledge-hub-head">
        <Brain size={22} />
        <div>
          <h2>Knowledge</h2>
          <p>What do we know?</p>
        </div>
      </header>

      <ResponsibilityStatusPanel responsibilities={responsibilities} />
      <KnowledgeHealthPanel health={health} />

      <div className="apollo-cc-knowledge-hub-list">
        {APOLLO_KNOWLEDGE_DOMAINS.map((domain, index) => {
          const count = counts[domain.id] ?? 0;
          return (
            <div key={domain.id} className="apollo-cc-knowledge-hub-item">
              {index > 0 && <hr className="apollo-cc-knowledge-hub-divider" />}
              <section className="apollo-cc-knowledge-hub-row" aria-labelledby={`apollo-knowledge-${domain.id}`}>
                <div className="apollo-cc-knowledge-hub-row-head">
                  <div className="apollo-cc-knowledge-hub-row-top">
                    <h3 id={`apollo-knowledge-${domain.id}`} className="apollo-cc-knowledge-hub-title">
                      {domain.label}
                    </h3>
                    <span className="apollo-cc-knowledge-hub-count">
                      {formatKnowledgeDomainCount(domain, count)}
                    </span>
                  </div>
                  <p className="apollo-cc-knowledge-hub-desc">{domain.description}</p>
                </div>
                <p className="apollo-cc-knowledge-hub-empty">{domain.emptyCopy}</p>
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}
