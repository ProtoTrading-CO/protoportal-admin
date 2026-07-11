import { Brain } from 'lucide-react';
import { APOLLO_KNOWLEDGE_DOMAINS } from '../lib/apolloCommandCentre.js';

export default function ApolloKnowledgeHub() {
  return (
    <div className="apollo-cc-knowledge-hub">
      <header className="apollo-cc-knowledge-hub-head">
        <Brain size={22} />
        <div>
          <h2>Knowledge</h2>
          <p>What do we know?</p>
        </div>
      </header>

      <div className="apollo-cc-knowledge-hub-list">
        {APOLLO_KNOWLEDGE_DOMAINS.map((domain, index) => (
          <div key={domain.id} className="apollo-cc-knowledge-hub-item">
            {index > 0 && <hr className="apollo-cc-knowledge-hub-divider" />}
            <section className="apollo-cc-knowledge-hub-row" aria-labelledby={`apollo-knowledge-${domain.id}`}>
              <div className="apollo-cc-knowledge-hub-row-head">
                <h3 id={`apollo-knowledge-${domain.id}`} className="apollo-cc-knowledge-hub-title">
                  {domain.label}
                </h3>
                <p className="apollo-cc-knowledge-hub-desc">{domain.description}</p>
              </div>
              <p className="apollo-cc-knowledge-hub-empty">{domain.emptyCopy}</p>
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}
