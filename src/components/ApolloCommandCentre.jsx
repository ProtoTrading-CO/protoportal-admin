import { useState } from 'react';

import { Bot, Loader2, Package, RefreshCw, Sparkles, Users } from 'lucide-react';

import {

  APOLLO_COMMAND_DEFAULT_NAV,

  APOLLO_COMMAND_NAV,

} from '../lib/apolloCommandCentre.js';

import {

  buildBuyingOps,

  buildSupplierOps,

  displaySeverity,

  filterCustomerOps,

  focusTypesPresent,

  greetingForHour,

} from '../lib/apolloTodayPresentation.js';

import ApolloChatPanel from './ApolloChatPanel.jsx';

import ApolloKnowledgePlaceholder from './ApolloKnowledgePlaceholder.jsx';

import ApolloOperationalBrief from './ApolloOperationalBrief.jsx';

import OrdersWorkspacePanel from './OrdersWorkspacePanel.jsx';



function ApolloSectionWorkspace({ section, context, onAsk }) {

  const focusTypes = focusTypesPresent(context?.focusToday || []);

  const icons = {

    customers: Users,

    suppliers: Package,

    buying: Package,

  };

  const Icon = icons[section] || Package;



  let rows = [];

  let empty = 'Nothing flagged in this area.';

  if (section === 'customers') {

    rows = filterCustomerOps(context?.customerAlerts?.items || [], focusTypes).map((item, i) => ({

      id: item.id || item.orderId || `customer-${i}`,

      title: item.name || item.email || 'Customer',

      meta: item.reason,

      severity: displaySeverity(item.severity),

      query: item.email ? `Find customer ${item.email}` : `Find customer ${item.name}`,

    }));

    empty = 'No customers need attention.';

  } else if (section === 'suppliers') {

    rows = buildSupplierOps(context);

    empty = 'No supplier follow-ups due.';

  } else if (section === 'buying') {

    rows = buildBuyingOps(context);

    empty = 'No buying reviews due.';

  }



  const navItem = APOLLO_COMMAND_NAV.find((n) => n.id === section);



  return (

    <div className="apollo-cc-section">

      <header className="apollo-cc-section-head">

        <Icon size={20} />

        <div>

          <h2>{navItem?.label || section}</h2>

          <p>Operational view — same intelligence as Today, scoped to this area.</p>

        </div>

      </header>

      {rows.length ? (

        <ul className="apollo-cc-section-list">

          {rows.map((row, i) => (

            <li key={row.id || row.sku || i}>

              <button

                type="button"

                className={`apollo-today-row apollo-today-row--${row.severity || 'info'}`}

                onClick={() => {

                  if (row.url) {

                    window.location.href = row.url;

                    return;

                  }

                  const query = row.query || null;

                  if (query) onAsk?.(query);

                }}

              >

                <span className={`apollo-today-dot apollo-today-dot--${row.severity || 'info'}`} aria-hidden="true" />

                <span className="apollo-today-row-title">{row.title || 'Item'}</span>

                <span className="apollo-today-row-meta">{row.meta || row.reason || ''}</span>

              </button>

            </li>

          ))}

        </ul>

      ) : (

        <p className="apollo-cc-section-empty">{empty}</p>

      )}

    </div>

  );

}



export default function ApolloCommandCentre({

  briefContext,

  briefMeta,

  briefLoading,

  indexError,

  indexStatus,

  rebuildingIndex,

  onRefreshBrief,

  onReviewNotification,

  userName,

  userEmail,

  messages,

  chatInput,

  onChatInputChange,

  onSend,

  chatBusy,

  chatError,

  onFixLast,

  onClearChat,

  onShowToast,

}) {

  const [activeNav, setActiveNav] = useState(APOLLO_COMMAND_DEFAULT_NAV);

  const hour = new Date().getHours();

  const greeting = greetingForHour(hour);

  const displayName = userName || 'there';

  const briefSharedProps = {

    context: briefContext,

    meta: briefMeta,

    loading: briefLoading,

    onAsk: onSend,

    onRefresh: onRefreshBrief,

    onReviewNotification,

    refreshing: rebuildingIndex,

    userName,

    userEmail,

  };



  const chatPanel = (

    <ApolloChatPanel

      messages={messages}

      input={chatInput}

      onInputChange={onChatInputChange}

      onSend={onSend}

      busy={chatBusy}

      error={chatError}

      onFixLast={onFixLast}

      onClear={onClearChat}
      variant="compact"
    />

  );



  return (

    <div className="apollo-cc apollo-cc--phase2">

      <header className="apollo-cc-head">

        <div className="apollo-cc-head-brand">

          <div className="apollo-head-icon"><Bot size={20} /></div>

          <div>

            <h1 className="apollo-cc-title">Apollo Command Centre</h1>

            <p className="apollo-cc-subtitle">Operational brain for Proto Trading</p>

            <p className="apollo-cc-greeting">{greeting} {displayName}</p>

            {indexError && <p className="apollo-index-error">{indexError}</p>}

          </div>

        </div>

        <div className="apollo-cc-head-meta">
          <button

            type="button"

            className="apollo-action-btn apollo-action-btn--ghost"

            onClick={onRefreshBrief}

            disabled={chatBusy || rebuildingIndex}

            title="Refresh Today"

          >

            {rebuildingIndex ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}

            {rebuildingIndex ? 'Refreshing…' : 'Refresh'}

          </button>

        </div>

      </header>



      <nav className="apollo-cc-nav" aria-label="Apollo sections">

        {APOLLO_COMMAND_NAV.map((item) => (

          <button

            key={item.id}

            type="button"

            className={`apollo-cc-nav-btn${activeNav === item.id ? ' is-active' : ''}`}

            onClick={() => setActiveNav(item.id)}

          >

            <span className="apollo-cc-nav-emoji" aria-hidden="true">{item.emoji}</span>

            {item.label}

          </button>

        ))}

      </nav>



      {activeNav === 'today' && (

        <ApolloOperationalBrief {...briefSharedProps} chatPanel={chatPanel} />

      )}



      {activeNav === 'orders' && (

        <div className="apollo-cc-workspace">

          <OrdersWorkspacePanel onShowToast={onShowToast} />

        </div>

      )}



      {['customers', 'suppliers', 'buying'].includes(activeNav) && (

        <div className="apollo-cc-workspace">

          <ApolloSectionWorkspace section={activeNav} context={briefContext} onAsk={onSend} />

        </div>

      )}



      {activeNav === 'remember' && (

        <div className="apollo-cc-workspace">

          <ApolloKnowledgePlaceholder />

        </div>

      )}



      {indexStatus && (

        <p className="apollo-cc-foot">

          <RefreshCw size={12} />

          {indexStatus.counts?.products?.toLocaleString() ?? '—'} products indexed

        </p>

      )}

    </div>

  );

}


