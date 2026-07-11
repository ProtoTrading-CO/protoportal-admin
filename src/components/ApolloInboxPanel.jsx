import ApolloTalkComposer from './ApolloTalkComposer.jsx';

export default function ApolloInboxPanel({
  items = [],
  recentConversations = [],
  recentActions = [],
  input,
  onInputChange,
  onSend,
  busy,
  error,
  onSelectItem,
  onOpenInbox,
}) {
  return (
    <aside className="apollo-inbox" aria-label="Operational Inbox">
      <ApolloTalkComposer
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        busy={busy}
        error={error}
      />

      <section className="apollo-inbox-queue" aria-labelledby="apollo-inbox-title">
        <h3 id="apollo-inbox-title" className="apollo-inbox-title">Operational Inbox</h3>

        {items.length === 0 ? (
          <p className="apollo-inbox-empty">Nothing waiting. Operational Inbox stays clear until someone needs you.</p>
        ) : (
          <ul className="apollo-inbox-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="apollo-inbox-item"
                  onClick={() => onSelectItem?.(item)}
                >
                  <span className="apollo-inbox-item-badge">
                    {item.workType?.emoji}
                    {' '}
                    {item.workType?.label}
                  </span>
                  <span className="apollo-inbox-item-why">{item.why}</span>
                  <span className="apollo-inbox-item-meta">
                    {item.who}
                    {' · '}
                    {item.when}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <button type="button" className="apollo-inbox-open" onClick={onOpenInbox}>
            Open Inbox →
          </button>
        )}
      </section>

      {(recentConversations.length > 0 || recentActions.length > 0) && (
        <div className="apollo-inbox-recents">
          {recentConversations.length > 0 && (
            <section aria-label="Recent conversations">
              <h4 className="apollo-inbox-recents-title">Recent conversations</h4>
              <ul className="apollo-inbox-recents-list">
                {recentConversations.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="apollo-inbox-recents-link"
                      onClick={() => onSend?.(row.label)}
                      disabled={busy}
                    >
                      {row.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {recentActions.length > 0 && (
            <section aria-label="Recent actions">
              <h4 className="apollo-inbox-recents-title">Recent actions</h4>
              <ul className="apollo-inbox-recents-list">
                {recentActions.map((row) => (
                  <li key={row.id}>
                    <span className="apollo-inbox-recents-action">
                      {row.who}
                      {' · '}
                      {row.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
