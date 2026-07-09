import { APOLLO_CURRICULUM_ROWS, APOLLO_MATURITY, CURRICULUM_STATUS, SPRINT_QUESTION } from '../lib/apolloCurriculum.js';

export default function ApolloCurriculumReport({ defaultOpen = false }) {
  return (
    <details className="apollo-curriculum" open={defaultOpen}>
      <summary className="apollo-curriculum-summary">
        Apollo Curriculum <span className="apollo-curriculum-hint">— teacher report card</span>
      </summary>
      <div className="apollo-curriculum-body">
        <p className="apollo-curriculum-note">{SPRINT_QUESTION}</p>
        <table className="apollo-curriculum-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Status</th>
              <th>Graduation</th>
            </tr>
          </thead>
          <tbody>
            {APOLLO_CURRICULUM_ROWS.map((row) => {
              const st = CURRICULUM_STATUS[row.status] || CURRICULUM_STATUS.not_started;
              return (
                <tr key={row.id}>
                  <td><strong>{row.id}</strong> {row.name}</td>
                  <td>{st.emoji} {st.label}</td>
                  <td>{row.graduation || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="apollo-curriculum-maturity">
          {APOLLO_MATURITY.map((m) => (
            <div key={m.level} className="apollo-curriculum-maturity-row">
              <span className="apollo-curriculum-maturity-label">{m.level}</span>
              <div className="apollo-curriculum-maturity-track">
                <div className="apollo-curriculum-maturity-fill" style={{ width: `${m.pct}%` }} />
              </div>
              <span className="apollo-curriculum-maturity-pct">{m.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
