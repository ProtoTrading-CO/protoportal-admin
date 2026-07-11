import { Brain, Database } from 'lucide-react';

const PLACEHOLDER_STATS = [
  { label: 'Customer Knowledge', value: '—', note: 'verified' },
  { label: 'Supplier Knowledge', value: '—', note: 'verified' },
  { label: 'Buying Lessons', value: '—', note: '' },
  { label: 'Decision Lessons', value: '—', note: '' },
  { label: 'Operational State', value: '—', note: 'active' },
  { label: 'Knowledge Reuse', value: '—', note: '' },
];

export default function ApolloKnowledgePlaceholder() {
  return (
    <div className="apollo-cc-knowledge">
      <header className="apollo-cc-section-head">
        <Brain size={20} />
        <div>
          <h2>Knowledge</h2>
          <p>What Proto knows — preferences, reliability, buying lessons, and decision history.</p>
        </div>
      </header>

      <div className="apollo-cc-knowledge-grid">
        {PLACEHOLDER_STATS.map((stat) => (
          <article key={stat.label} className="apollo-cc-knowledge-card apollo-cc-knowledge-card--placeholder">
            <span className="apollo-cc-knowledge-label">{stat.label}</span>
            <strong className="apollo-cc-knowledge-value">{stat.value}</strong>
            {stat.note && <span className="apollo-cc-knowledge-note">{stat.note}</span>}
          </article>
        ))}
      </div>

      <p className="apollo-cc-knowledge-foot">
        <Database size={14} />
        Placeholder shell — Proto Memory logic stays frozen until behavioural proof.
      </p>
    </div>
  );
}
