import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Users,
} from 'lucide-react';

function money(n) {
  return `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function greetingForHour(h) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function freshnessLabel(meta) {
  if (!meta?.generatedAt) return 'Loading…';
  if (meta.partial) return 'Partial data';
  if ((meta.warnings || []).length) return 'Live · some gaps';
  return 'Live';
}

function SeverityDot({ severity }) {
  return <span className={`apollo-today-dot apollo-today-dot--${severity || 'info'}`} aria-hidden="true" />;
}

function WorkspaceTag({ workspace, comingSoon }) {
  if (!workspace) return null;
  return (
    <span className={`apollo-today-ws${comingSoon ? ' apollo-today-ws--soon' : ''}`} title={comingSoon ? 'Workspace coming soon' : ''}>
      {workspace}
      {comingSoon && ' · soon'}
    </span>
  );
}

function FocusCard({ item, onAsk }) {
  const askQuery = focusAskQuery(item);
  return (
    <article className={`apollo-today-focus-card apollo-today-focus-card--${item.severity || 'attention'}`}>
      <div className="apollo-today-focus-head">
        <SeverityDot severity={item.severity} />
        <h4>{item.label}</h4>
      </div>
      {item.detail && <p className="apollo-today-focus-detail">{item.detail}</p>}
      <p className="apollo-today-focus-why"><strong>Why:</strong> {item.why}</p>
      <p className="apollo-today-focus-action"><strong>Do:</strong> {item.action}</p>
      <div className="apollo-today-focus-foot">
        <WorkspaceTag workspace={item.workspace} comingSoon />
        {askQuery && (
          <button type="button" className="apollo-today-link-btn" onClick={() => onAsk?.(askQuery)}>
            Ask Apollo <ArrowRight size={12} />
          </button>
        )}
      </div>
    </article>
  );
}

function focusAskQuery(item) {
  if (item.type === 'negative_stock') return 'Which products have negative stock?';
  if (item.type === 'inactive_customer') return `Find customer ${String(item.label).split(' — ')[0]}`;
  if (item.type === 'pending_customers') return 'Show pending customer approvals';
  if (item.type === 'orders_review') return 'Orders needing review';
  if (item.type === 'zero_stock') return 'Which products have zero stock?';
  return null;
}

function SectionCard({ id, title, icon: Icon, children, empty, workspace }) {
  return (
    <section className="apollo-today-section" id={id}>
      <header className="apollo-today-section-head">
        <Icon size={15} />
        <h3>{title}</h3>
        {workspace && <WorkspaceTag workspace={workspace} comingSoon />}
      </header>
      <div className="apollo-today-section-body">
        {empty ? <p className="apollo-today-empty">{empty}</p> : children}
      </div>
    </section>
  );
}

function InventoryRow({ item, onAsk }) {
  return (
    <button
      type="button"
      className={`apollo-today-row apollo-today-row--${item.severity || 'info'}`}
      onClick={() => onAsk?.(`Show product ${item.sku}`)}
    >
      <SeverityDot severity={item.severity || (item.stockQty < 0 ? 'urgent' : 'attention')} />
      <span className="apollo-today-row-title">{item.title}</span>
      <span className="apollo-today-row-meta">{item.stockQty != null ? `${item.stockQty} units` : '—'}</span>
    </button>
  );
}

function CustomerRow({ item, onAsk }) {
  const label = item.name || item.email || 'Customer';
  const query = item.email ? `Find customer ${item.email}` : `Find customer ${label}`;
  return (
    <button type="button" className={`apollo-today-row apollo-today-row--${item.severity || 'info'}`} onClick={() => onAsk?.(query)}>
      <SeverityDot severity={item.severity} />
      <span className="apollo-today-row-title">{label}</span>
      <span className="apollo-today-row-meta">{item.reason}</span>
    </button>
  );
}

function ProductRow({ item, onAsk }) {
  return (
    <button
      type="button"
      className={`apollo-today-row apollo-today-row--${item.severity || 'info'}`}
      onClick={() => onAsk?.(`Show product ${item.sku}`)}
    >
      <SeverityDot severity={item.severity} />
      <span className="apollo-today-row-title">{item.title}</span>
      <span className="apollo-today-row-meta">{item.reason}</span>
    </button>
  );
}

export default function ApolloToday({ context, meta, loading, onAsk, onRefresh, refreshing }) {
  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const dateStr = now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const generatedAt = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading && !context) {
    return (
      <div className="apollo-today apollo-today--loading">
        <Loader2 size={20} className="spin" />
        <span>Building your briefing…</span>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="apollo-today apollo-today--error">
        <AlertTriangle size={18} />
        <span>Brief unavailable — try refresh</span>
        <button type="button" className="apollo-action-btn" onClick={onRefresh}>Refresh</button>
      </div>
    );
  }

  const focus = context.focusToday || [];
  const inv = context.inventoryAlerts || {};
  const customerItems = context.customerAlerts?.items || [];
  const productItems = context.productAlerts?.items || [];
  const yesterday = context.yesterday || {};
  const quiet = context.quietSignals || [];

  const hasInv = (inv.negative?.length || 0) + (inv.low?.length || 0) + (inv.zero?.length || 0) + (inv.high?.length || 0) > 0;

  return (
    <div className="apollo-today">
      <header className="apollo-today-hero">
        <div className="apollo-today-hero-main">
          <div className="apollo-today-hero-icon"><Bot size={22} /></div>
          <div>
            <p className="apollo-today-eyebrow">Today</p>
            <h2 className="apollo-today-greeting">{greeting}</h2>
            <p className="apollo-today-datetime">{dateStr} · {timeStr}</p>
          </div>
        </div>
        <div className="apollo-today-hero-meta">
          <span className={`apollo-today-fresh apollo-today-fresh--${meta?.partial ? 'partial' : 'ok'}`}>
            <Clock size={12} />
            {freshnessLabel(meta)}
            {generatedAt && ` · ${generatedAt}`}
          </span>
          <button type="button" className="apollo-today-refresh" onClick={onRefresh} disabled={refreshing} title="Refresh briefing">
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </header>

      <section className="apollo-today-focus" aria-label="Focus today">
        <h3 className="apollo-today-focus-title">Focus today</h3>
        {focus.length ? (
          <div className="apollo-today-focus-grid">
            {focus.map((item) => (
              <FocusCard key={`${item.type}-${item.priority}`} item={item} onAsk={onAsk} />
            ))}
          </div>
        ) : (
          <div className="apollo-today-focus-clear">
            <CheckCircle2 size={18} />
            <p>Nothing urgent flagged. Review stock and orders when you have time.</p>
          </div>
        )}
      </section>

      <div className="apollo-today-grid">
        <SectionCard
          id="yesterday"
          title="Yesterday"
          icon={ShoppingCart}
          empty={!yesterday.summary?.length ? 'Quiet day — no notable portal activity.' : null}
        >
          <ul className="apollo-today-summary">
            {(yesterday.summary || []).map((line) => (
              <li key={line.type} className={`apollo-today-summary-item apollo-today-summary-item--${line.severity}`}>
                {line.label}
              </li>
            ))}
            {yesterday.orderCount > 0 && (
              <li className="apollo-today-summary-item apollo-today-summary-item--info">
                {money(yesterday.orderTotalExVat)} ex VAT total
              </li>
            )}
          </ul>
        </SectionCard>

        <SectionCard
          id="inventory"
          title="Inventory"
          icon={Package}
          workspace="inventory"
          empty={!hasInv ? 'No actionable stock issues in linked listings.' : null}
        >
          {inv.negative?.slice(0, 3).map((p) => (
            <InventoryRow key={`n-${p.sku}`} item={{ ...p, severity: 'urgent' }} onAsk={onAsk} />
          ))}
          {inv.low?.slice(0, 2).map((p) => (
            <InventoryRow key={`l-${p.sku}`} item={{ ...p, severity: 'attention' }} onAsk={onAsk} />
          ))}
          {inv.zero?.slice(0, 2).map((p) => (
            <InventoryRow key={`z-${p.sku}`} item={{ ...p, severity: 'attention', stockQty: 0 }} onAsk={onAsk} />
          ))}
          {inv.high?.slice(0, 1).map((p) => (
            <InventoryRow key={`h-${p.sku}`} item={{ ...p, severity: 'info' }} onAsk={onAsk} />
          ))}
        </SectionCard>

        <SectionCard
          id="customers"
          title="Customers"
          icon={Users}
          workspace="customer"
          empty={!customerItems.length ? 'No customers need attention right now.' : null}
        >
          {customerItems.slice(0, 5).map((item, i) => (
            <CustomerRow key={`${item.type}-${item.id || item.orderId || i}`} item={item} onAsk={onAsk} />
          ))}
        </SectionCard>

        <SectionCard
          id="products"
          title="Products"
          icon={Package}
          workspace="product"
          empty={!productItems.length ? 'No product issues flagged today.' : null}
        >
          {productItems.slice(0, 5).map((item, i) => (
            <ProductRow key={`${item.type}-${item.sku}-${i}`} item={item} onAsk={onAsk} />
          ))}
        </SectionCard>
      </div>

      {quiet.length > 0 && (
        <footer className="apollo-today-quiet">
          <CheckCircle2 size={14} />
          <span>You can ignore: {quiet.join(' · ')}</span>
        </footer>
      )}

      <nav className="apollo-today-ws-nav" aria-label="Future workspaces">
        {(context.workspaces?.comingSoon || []).map((ws) => (
          <span key={ws} className="apollo-today-ws-pill apollo-today-ws-pill--soon">{ws}</span>
        ))}
      </nav>
    </div>
  );
}
