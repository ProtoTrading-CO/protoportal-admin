import { useCallback, useMemo } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  buildApolloRecommends,
  buildBusinessStatus,
} from '../lib/apolloCommandCentrePresentation.js';
import {
  buildApolloInboxItems,
  buildRecentActionSnippets,
} from '../lib/apolloInboxPresentation.js';
import ApolloDecisionDesk from './ApolloDecisionDesk.jsx';

export default function ApolloOperationalBrief({
  context,
  loading,
  onAsk,
  onRefresh,
  onReviewNotification,
  chatInput = '',
  onChatInputChange,
  onSend,
  chatBusy,
  chatError,
}) {
  const inboxItems = useMemo(
    () => buildApolloInboxItems(context || {}, { limit: 8 }),
    [context],
  );
  const recentActions = useMemo(
    () => buildRecentActionSnippets(context || {}),
    [context],
  );

  const handleInboxSelect = useCallback((item) => {
    if (item?.query) onAsk?.(item.query);
    else if (item?.url) window.location.href = item.url;
  }, [onAsk]);

  if (loading && !context) {
    return (
      <div className="apollo-today apollo-today--loading">
        <Loader2 size={20} className="spin" />
        <span>Preparing your decisions…</span>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="apollo-today apollo-today--error">
        <AlertTriangle size={18} />
        <span>Decision brief unavailable — try refresh</span>
        <button type="button" className="apollo-action-btn" onClick={onRefresh}>Refresh</button>
      </div>
    );
  }

  return (
    <ApolloDecisionDesk
      status={buildBusinessStatus(context)}
      decisions={buildApolloRecommends(context.focusToday || [])}
      inboxItems={inboxItems}
      recentActions={recentActions}
      input={chatInput}
      onInputChange={onChatInputChange}
      onSend={onSend}
      busy={chatBusy}
      error={chatError}
      onSelectInbox={handleInboxSelect}
      onReviewNotification={onReviewNotification}
    />
  );
}
