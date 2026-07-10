import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Users,
} from 'lucide-react';
import {
  buildExecutiveSummary,
  businessHealthWithCrm,
  filterCustomerOps,
  filterInventoryOps,
  filterProductOps,
  focusTypesPresent,
  focusViewAllQuery,
  focusShowsViewAll,
  buildBuyingOps,
  buildOrderOps,
  buildSupplierOps,
  buildWebsiteOps,
  displaySeverity,
} from '../lib/apolloTodayPresentation.js';

function freshnessLabel(meta) {
  if (!meta?.generatedAt) return 'Loading…';
  if (meta.partial) return 'Partial data';
  if ((meta.warnings || []).length) return 'Live · some gaps';
  return 'Live';
}

function SeverityDot({ severity }) {
  return <span className={`apollo-today-dot apollo-today-dot--${displaySeverity(severity)}`} aria-hidden="true" />;
}

function SectionLabel({ n, children }) {
  return (
    <header className="apollo-today-section-label">
      <span className="apollo-today-section-num">{n}</span>
      <h3 className="apollo-today-section-title">{children}</h3>
    </header>
  );
}

function ExecutiveSummary({ lines }) {
  if (!lines?.length) return null;
  return (
    <section className="apollo-today-exec" aria-label="Executive summary">
      <SectionLabel n="1">Executive summary</SectionLabel>
      <div className="apollo-today-exec-body">
        {lines.map((line, i) => (
          <p key={i} className={i === 0 ? 'apollo-today-exec-lead' : 'apollo-today-exec-line'}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function FocusCard({ item, onAsk, onReview }) {
  const viewAll = focusShowsViewAll(item);
  const viewAllQuery = focusViewAllQuery(item);
  const askQuery = viewAll ? viewAllQuery : focusViewAllQuery(item);
  const openUrl = item.url || '';
  const canReview = Boolean(item.notificationDbId && item.businessImpact);
  const handleAction = () => {
    if (openUrl) {
      window.location.href = openUrl;
      return;
    }
    if (askQuery) onAsk?.(askQuery);
  };

  return (
    <article className={`apollo-today-focus-card apollo-today-focus-card--${displaySeverity(item.severity || 'attention')}`}>
      <div className="apollo-today-focus-head">
        <SeverityDot severity={item.severity} />
        <h4>{item.title || item.label}</h4>
      </div>
      {item.detail && (
        <p className="apollo-today-focus-what">
          <span className="apollo-today-kicker">What</span>
          {item.detail}
        </p>
      )}
      <p className="apollo-today-focus-why">
        <span className="apollo-today-kicker">Why</span>
        {item.why}
      </p>
      {item.evidence && (
        <p className="apollo-today-focus-what">
          <span className="apollo-today-kicker">Evidence</span>
          {item.evidence}
        </p>
      )}
      <p className="apollo-today-focus-action">
        <span className="apollo-today-kicker">Do</span>
        {item.action}
      </p>
      <div className="apollo-today-focus-foot">
        {openUrl ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            Open <ArrowRight size={12} />
          </button>
        ) : viewAll && viewAllQuery ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            View all <ArrowRight size={12} />
          </button>
        ) : askQuery ? (
          <button type="button" className="apollo-today-link-btn" onClick={handleAction}>
            Ask Apollo <ArrowRight size={12} />
          </button>
        ) : <span />}
      </div>
      {canReview && (
        <div className="apollo-today-feedback" aria-label="Exception feedback">
          <button type="button" onClick={() => onReview?.(item, 'useful')} disabled={item.feedbackStatus === 'useful'}>Useful</button>
          <button type="button" onClick={() => onReview?.(item, 'false_positive')} disabled={item.feedbackStatus === 'false_positive'}>Not useful</button>
          <button type="button" onClick={() => onReview?.(item, 'needs_threshold_adjustment')} disabled={item.feedbackStatus === 'needs_threshold_adjustment'}>Adjust threshold</button>
          <button type="button" onClick={() => onReview?.(item, 'ignore_permanently')} disabled={item.feedbackStatus === 'ignore_permanently'}>Ignore</button>
        </div>
      )}
    </article>
  );
}

function HealthPulse({ item }) {
  const icons = {
    sales: ShoppingCart,
    customers: Users,
    inventory: Package,
    website: Globe,
    crm: Users,
    memory: Clock,
  };
  const Icon = icons[item.key] || Package;
  return (
    <div className={`apollo-today-health apollo-today-health--${displaySeverity(item.severity || 'info')}`}>
      <div className="apollo-today-health-head">
        <Icon size={13} />
        <span>{item.label}</span>
      </div>
      <p className="apollo-today-health-status">{item.status}</p>
      {item.hint && <p className="apollo-today-health-hint">{item.hint}</p>}
    </div>
  );
}

function ChangedLine({ line }) {
  return (
    <li className={`apollo-today-changed-line apollo-today-changed-line--${displaySeverity(line.severity || 'info')}`}>
      <SeverityDot severity={line.severity} />
      <span>{line.text}</span>
    </li>
  );
}

function OpsCard({ title, icon: Icon, empty, children }) {
  return (
    <section className="apollo-today-ops-card">
      <header className="apollo-today-ops-head">
        <Icon size={14} />
        <h4>{title}</h4>
      </header>
      <div className="apollo-today-ops-body">
        {empty ? <p className="apollo-today-empty">{empty}</p> : children}
      </div>
    </section>
  );
}

function OpsRow({ title, meta, severity, onClick, url }) {
  const handleClick = () => {
    if (url) {
      window.location.href = url;
      return;
    }
    onClick?.();
  };
  return (
    <button type="button" className={`apollo-today-row apollo-today-row--${displaySeverity(severity || 'info')}`} onClick={handleClick}>
      <SeverityDot severity={severity} />
      <span className="apollo-today-row-title">{title}</span>
      <span className="apollo-today-row-meta">{meta}</span>
    </button>
  );
}

export default function ApolloToday({ context, meta, loading, onAsk, onRefresh, onReviewNotification, refreshing, userName }) {
  const generatedAt = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const dateStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const warnings = (meta?.warnings || []).filter(Boolean);

  if (loading && !context) {
    return (
      <div className="apollo-today apollo-today--loading">
        <Loader2 size={20} className="spin" />
        <span>Preparing your morning brief…</span>
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

  const executiveLines = buildExecutiveSummary(context, { userName });
  const focus = context.focusToday || [];
  const changed = context.whatChangedSinceYesterday || [];
  const health = businessHealthWithCrm(context);
  const focusTypes = focusTypesPresent(focus);
  const inv = context.inventoryAlerts || {};
  const customerItems = filterCustomerOps(context.customerAlerts?.items || [], focusTypes);
  const productItems = filterProductOps(context.productAlerts?.items || [], focusTypes);
  const inventoryRows = filterInventoryOps(inv, focusTypes);
  const orderRows = buildOrderOps(context, focusTypes);
  const buyingRows = buildBuyingOps(context);
  const supplierRows = buildSupplierOps(context);
  const websiteRows = buildWebsiteOps(context, focusTypes);

  return (
    <div className="apollo-today apollo-today--executive">
      <header className="apollo-today-meta-bar">
        <div>
          <p className="apollo-today-date">{dateStr}</p>
          <p className="apollo-today-tagline">Executive morning brief</p>
        </div>
        <div className="apollo-today-meta-actions">
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

      {warnings.length > 0 && (
        <p className="apollo-today-warn" role="status">
          <AlertTriangle size={13} />
          {warnings.join(' · ')}
        </p>
      )}

      <ExecutiveSummary lines={executiveLines} />

      <section className="apollo-today-focus" aria-label="Focus today">
        <SectionLabel n="2">Focus today</SectionLabel>
        {focus.length ? (
          <div className="apollo-today-focus-grid">
            {focus.map((item) => (
              <FocusCard key={`${item.type}-${item.priority}`} item={item} onAsk={onAsk} onReview={onReviewNotification} />
            ))}
          </div>
        ) : (
          <div className="apollo-today-focus-clear">
            <CheckCircle2 size={16} />
            <p>Nothing urgent flagged. The business looks calm.</p>
          </div>
        )}
      </section>

      <section className="apollo-today-health-row" aria-label="Business health">
        <SectionLabel n="3">Business health</SectionLabel>
        <div className="apollo-today-health-grid apollo-today-health-grid--5">
          {health.map((item) => (
            <HealthPulse key={item.key} item={item} />
          ))}
        </div>
      </section>

      <section className="apollo-today-changed" aria-label="Since yesterday">
        <SectionLabel n="4">Since yesterday</SectionLabel>
        <ul className="apollo-today-changed-list apollo-today-changed-list--compact">
          {changed.length
            ? changed.map((line) => <ChangedLine key={line.type} line={line} />)
            : <li className="apollo-today-changed-line apollo-today-changed-line--healthy">No notable changes</li>}
        </ul>
      </section>

      <section className="apollo-today-ops-wrap" aria-label="Operational areas">
        <SectionLabel n="5">Operational</SectionLabel>
        <div className="apollo-today-ops-grid">
          <OpsCard title="Inventory" icon={Package} empty={!inventoryRows.length ? 'No stock issues beyond focus.' : null}>
            {inventoryRows.map((p) => (
              <OpsRow
                key={`${p.kind}-${p.sku}`}
                title={p.title || p.sku}
                meta={p.stockQty != null ? `${p.stockQty} units` : '—'}
                severity={p.severity}
                onClick={() => onAsk?.(`Show product ${p.sku}`)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Customers" icon={Users} empty={!customerItems.length ? 'No customers need attention.' : null}>
            {customerItems.map((item, i) => (
              <OpsRow
                key={`${item.type}-${item.id || item.orderId || i}`}
                title={item.name || item.email || 'Customer'}
                meta={item.reason}
                severity={item.severity}
                onClick={() => onAsk?.(item.email ? `Find customer ${item.email}` : `Find customer ${item.name}`)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Products" icon={Package} empty={!productItems.length ? 'No product flags.' : null}>
            {productItems.map((item, i) => (
              <OpsRow
                key={`${item.type}-${item.sku}-${i}`}
                title={item.title || item.sku}
                meta={item.reason}
                severity={item.severity}
                onClick={() => onAsk?.(`Show product ${item.sku}`)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Orders" icon={ShoppingCart} empty={!orderRows.length ? 'No orders need review.' : null}>
            {orderRows.map((o) => (
              <OpsRow
                key={o.id}
                title={o.title}
                meta={o.meta}
                severity={o.severity}
                url={o.url}
                onClick={() => onAsk?.(o.query)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Buying" icon={Package} empty={!buyingRows.length ? 'No buying reviews due.' : null}>
            {buyingRows.map((b) => (
              <OpsRow
                key={b.id}
                title={b.title}
                meta={b.meta}
                severity={b.severity}
                url={b.url}
                onClick={() => onAsk?.(b.query)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Suppliers" icon={Users} empty={!supplierRows.length ? 'No supplier follow-ups due.' : null}>
            {supplierRows.map((s) => (
              <OpsRow
                key={s.id}
                title={s.title}
                meta={s.meta}
                severity={s.severity}
                url={s.url}
                onClick={() => onAsk?.(s.query)}
              />
            ))}
          </OpsCard>

          <OpsCard title="Website" icon={Globe} empty={!websiteRows.length ? 'No website changes.' : null}>
            {websiteRows.map((w) => (
              <OpsRow
                key={w.sku}
                title={w.title}
                meta={w.meta}
                severity={w.severity}
                onClick={() => onAsk?.(w.query)}
              />
            ))}
          </OpsCard>
        </div>
      </section>
    </div>
  );
}
