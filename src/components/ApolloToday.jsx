import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Users,
} from 'lucide-react';

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

function WorkspaceTabs({ tabs = [] }) {
  if (!tabs.length) return null;
  return (
    <nav className="apollo-today-tabs" aria-label="Apollo workspaces">
      {tabs.map((tab) => (
        <span
          key={tab.id}
          className={`apollo-today-tab${tab.active ? ' apollo-today-tab--active' : ''}${tab.comingSoon ? ' apollo-today-tab--soon' : ''}`}
          aria-current={tab.active ? 'page' : undefined}
          title={tab.comingSoon ? 'Coming soon' : undefined}
        >
          {tab.label}
        </span>
      ))}
    </nav>
  );
}

function ChangedLine({ line }) {
  return (
    <li className={`apollo-today-changed-line apollo-today-changed-line--${line.severity || 'info'}`}>
      <SeverityDot severity={line.severity} />
      <span>{line.text}</span>
    </li>
  );
}

function HealthPulse({ item }) {
  const icons = { sales: ShoppingCart, customers: Users, inventory: Package, website: Globe };
  const Icon = icons[item.key] || Package;
  return (
    <div className={`apollo-today-health apollo-today-health--${item.severity || 'info'}`}>
      <div className="apollo-today-health-head">
        <Icon size={14} />
        <span>{item.label}</span>
        <SeverityDot severity={item.severity} />
      </div>
      <p className="apollo-today-health-status">{item.status}</p>
      {item.hint && <p className="apollo-today-health-hint">{item.hint}</p>}
    </div>
  );
}

function SectionHeading({ children }) {
  return <h3 className="apollo-today-section-title">{children}</h3>;
}

function FocusCard({ item, onAsk }) {
  const askQuery = focusAskQuery(item);
  return (
    <article className={`apollo-today-focus-card apollo-today-focus-card--${item.severity || 'attention'}`}>
      <div className="apollo-today-focus-head">
        <SeverityDot severity={item.severity} />
        <h4>{item.title || item.label}</h4>
      </div>
      {item.detail && <p className="apollo-today-focus-detail">{item.detail}</p>}
      <p className="apollo-today-focus-why"><strong>Why:</strong> {item.why}</p>
      <p className="apollo-today-focus-action"><strong>Next:</strong> {item.action}</p>
      <div className="apollo-today-focus-foot">
        {item.workspace && (
          <span className="apollo-today-ws apollo-today-ws--soon" title="Workspace coming soon">{item.workspace}</span>
        )}
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
  if (item.type === 'inactive_customer') return `Find customer ${String(item.title || item.label).split(' — ')[0]}`;
  if (item.type === 'pending_customers') return 'Show pending customer approvals';
  if (item.type === 'orders_review') return 'Orders needing review';
  if (item.type === 'zero_stock') return 'Which products have zero stock?';
  if (item.type === 'website_changes') return 'Morning brief';
  return null;
}

function SectionCard({ id, title, icon: Icon, children, empty, workspace }) {
  return (
    <section className="apollo-today-section" id={id}>
      <header className="apollo-today-section-head">
        <Icon size={15} />
        <h3>{title}</h3>
        {workspace && <span className="apollo-today-ws apollo-today-ws--soon" title="Workspace coming soon">{workspace}</span>}
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
      title="Inventory workspace — coming soon"
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
  const generatedAt = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const warnings = (meta?.warnings || []).filter(Boolean);

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
  const changed = context.whatChangedSinceYesterday || [];
  const health = context.businessHealth || [];
  const inv = context.inventoryAlerts || {};
  const customerItems = context.customerAlerts?.items || [];
  const productItems = context.productAlerts?.items || [];
  const quiet = context.quietSignals || [];
  const tabs = context.workspaces?.tabs || [];

  const hasInv = (inv.negative?.length || 0) + (inv.low?.length || 0) + (inv.zero?.length || 0) + (inv.high?.length || 0) > 0;

  return (
    <div className="apollo-today">
      <WorkspaceTabs tabs={tabs} />

      <header className="apollo-today-hero">
        <div className="apollo-today-hero-main">
          <div className="apollo-today-hero-icon"><Bot size={20} /></div>
          <div>
            <h2 className="apollo-today-greeting">{greeting}</h2>
            <p className="apollo-today-datetime">{dateStr}</p>
          </div>
        </div>
        <div className="apollo-today-hero-meta">
          <span className={`apollo-today-fresh apollo-today-fresh--${meta?.partial ? 'partial' : 'ok'}`}>
            <Clock size={12} />
            {freshnessLabel(meta)}
            {generatedAt && ` · Brief ${generatedAt}`}
          </span>
          <button type="button" className="apollo-today-refresh" onClick={onRefresh} disabled={refreshing} title="Refresh briefing">
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {warnings.length > 0 && (
        <p className="apollo-today-warn" role="status">
          <AlertTriangle size={13} />
          {warnings.join(' · ')}
        </p>
      )}

      <section className="apollo-today-focus" aria-label="Focus today">
        <SectionHeading>1. Focus today</SectionHeading>
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

      <section className="apollo-today-changed" aria-label="What changed since yesterday">
        <SectionHeading>2. What changed since yesterday</SectionHeading>
        <ul className="apollo-today-changed-list">
          {changed.length
            ? changed.map((line) => <ChangedLine key={line.type} line={line} />)
            : <li className="apollo-today-changed-line apollo-today-changed-line--healthy">No notable changes</li>}
        </ul>
      </section>

      <section className="apollo-today-health-row" aria-label="Business health">
        <SectionHeading>3. Business health</SectionHeading>
        <div className="apollo-today-health-grid">
          {health.map((item) => (
            <HealthPulse key={item.key} item={item} />
          ))}
        </div>
      </section>

      <div className="apollo-today-ops-wrap">
        <SectionHeading>4. Operational</SectionHeading>
        <div className="apollo-today-grid apollo-today-grid--ops">
        <SectionCard
          id="inventory"
          title="Inventory"
          icon={Package}
          workspace="inventory"
          empty={!hasInv ? 'No actionable stock issues.' : null}
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
          empty={!customerItems.length ? 'No customers need attention.' : null}
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
          empty={!productItems.length ? 'No product flags today.' : null}
        >
          {productItems.slice(0, 5).map((item, i) => (
            <ProductRow key={`${item.type}-${item.sku}-${i}`} item={item} onAsk={onAsk} />
          ))}
        </SectionCard>
        </div>
      </div>

      {quiet.length > 0 && (
        <footer className="apollo-today-quiet">
          <CheckCircle2 size={14} />
          <span>Quiet: {quiet.join(' · ')}</span>
        </footer>
      )}
    </div>
  );
}
