import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Loader2, Megaphone, Search, Send } from 'lucide-react';
import { fetchBroadcastSchedule } from '../lib/broadcastSchedule';

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`wa-chip${active ? ' wa-chip--on' : ''}`} onClick={onClick}>
      {active && <Check size={12} strokeWidth={3} />}
      {children}
    </button>
  );
}

function formatJoinStatus(status) {
  if (status === 'joined') return 'Joined';
  if (status === 'not_joined') return 'No thanks';
  if (status === 'pending') return 'Pending';
  return status.replace(/_/g, ' ');
}

export default function WhatsappPanel({
  summary,
  totalFiltered,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  businessTypeOptions,
  joinStatusOptions,
  templates,
  templatesLoading,
  selectedTemplate,
  onSelectTemplate,
  onSend,
  sending,
  sentCount,
  lastSentTemplate,
  onViewContacts,
  onRefresh,
}) {
  const [scheduled, setScheduled] = useState([]);
  const [schedLoading, setSchedLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSchedLoading(true);
    fetchBroadcastSchedule()
      .then((data) => { if (!cancelled) setScheduled(data.items || []); })
      .catch(() => { if (!cancelled) setScheduled([]); })
      .finally(() => { if (!cancelled) setSchedLoading(false); });
    return () => { cancelled = true; };
  }, [sentCount]);

  const template = useMemo(
    () => templates.find((t) => t.name === selectedTemplate) || templates[0] || null,
    [templates, selectedTemplate],
  );

  const upcoming = useMemo(
    () => scheduled
      .filter((item) => item.status === 'pending' && item.scheduledAt)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, 5),
    [scheduled],
  );

  const toggleBusinessType = (type) => {
    onFiltersChange((prev) => ({
      ...prev,
      businessTypes: prev.businessTypes.includes(type)
        ? prev.businessTypes.filter((t) => t !== type)
        : [...prev.businessTypes, type],
    }));
  };

  const toggleJoinStatus = (status) => {
    onFiltersChange((prev) => ({
      ...prev,
      joinedStatuses: prev.joinedStatuses.includes(status)
        ? prev.joinedStatuses.filter((t) => t !== status)
        : [...prev.joinedStatuses, status],
    }));
  };

  const handleSend = () => {
    if (!template?.name) return;
    onSend({ templateName: template.name });
  };

  return (
    <div className="wa-panel">
      {summary && (
        <div className="wa-stats">
          <div className="wa-stat">
            <strong>{summary.totalContacts}</strong>
            <span>Contacts</span>
            <button type="button" className="wa-stat-link" onClick={onViewContacts}>
              <Eye size={13} /> View all
            </button>
          </div>
          <div className="wa-stat wa-stat--accent">
            <strong>{summary.broadcastReadyCount}</strong>
            <span>Broadcast ready</span>
          </div>
          <div className="wa-stat">
            <strong>{summary.joinedCount}</strong>
            <span>Joined</span>
          </div>
          <div className="wa-stat">
            <strong>{totalFiltered}</strong>
            <span>Match filters</span>
          </div>
        </div>
      )}

      {sentCount !== null && lastSentTemplate && (
        <div className="wa-sent-banner">
          <Check size={15} />
          <span>
            Sent <strong>{lastSentTemplate}</strong> to <strong>{sentCount}</strong> contact{sentCount === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <div className="wa-layout">
        <aside className="wa-audience">
          <div className="wa-audience__head">
            <h3>Audience</h3>
          </div>

          <label className="adm-search wa-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name, phone, email…"
              className="adm-search-input"
            />
          </label>

          <div className="wa-filter-block">
            <span className="wa-filter-label">Business type</span>
            <div className="wa-chip-row">
              <Chip
                active={filters.businessTypes.length === 0}
                onClick={() => onFiltersChange((prev) => ({ ...prev, businessTypes: [] }))}
              >
                All
              </Chip>
              {businessTypeOptions.map((type) => (
                <Chip
                  key={type}
                  active={filters.businessTypes.includes(type)}
                  onClick={() => toggleBusinessType(type)}
                >
                  {type}
                </Chip>
              ))}
            </div>
          </div>

          <div className="wa-filter-block">
            <span className="wa-filter-label">WhatsApp status</span>
            <div className="wa-chip-row">
              <Chip
                active={filters.joinedStatuses.length === 0}
                onClick={() => onFiltersChange((prev) => ({ ...prev, joinedStatuses: [] }))}
              >
                All
              </Chip>
              {joinStatusOptions.map((status) => (
                <Chip
                  key={status}
                  active={filters.joinedStatuses.includes(status)}
                  onClick={() => toggleJoinStatus(status)}
                >
                  {formatJoinStatus(status)}
                </Chip>
              ))}
            </div>
          </div>

          <div className={`wa-match-count${totalFiltered ? ' wa-match-count--ready' : ''}`}>
            <Megaphone size={16} />
            <span><strong>{totalFiltered}</strong> contacts will receive this broadcast</span>
          </div>
        </aside>

        <section className="wa-compose">
          <h3>Compose broadcast</h3>

          <label className="wa-field">
            <span className="wa-field-label">Template</span>
            {templatesLoading ? (
              <div className="wa-loading"><Loader2 size={16} className="spin" /> Loading templates…</div>
            ) : (
              <select
                className="adm-select adm-select--enhanced"
                value={template?.name || ''}
                onChange={(e) => onSelectTemplate(e.target.value)}
              >
                {!templates.length && <option value="">No approved templates</option>}
                {templates.map((t) => (
                  <option key={t.id || t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            )}
          </label>

          <div className="wa-preview">
            <div className="wa-preview__label">Message preview</div>
            <div className="wa-preview__phone">
              <div className="wa-preview__bubble">
                {template?.headerText && (
                  <div className="wa-preview__header">{template.headerText}</div>
                )}
                <div className="wa-preview__body">
                  {template?.body || (templatesLoading ? 'Loading…' : 'Select a template to preview the broadcast message.')}
                </div>
                {template?.footer && (
                  <div className="wa-preview__footer">{template.footer}</div>
                )}
                {template?.buttons?.length > 0 && (
                  <div className="wa-preview__buttons">
                    {template.buttons.map((btn) => (
                      <span key={btn.index} className="wa-preview__btn">{btn.text}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {template && (
              <p className="wa-preview__meta adm-muted">
                {template.category && `${template.category} · `}
                {template.language || 'en'}
              </p>
            )}
          </div>

          <button
            type="button"
            className="adm-btn-red wa-send-btn"
            disabled={sending || !template?.name || !totalFiltered}
            onClick={handleSend}
          >
            {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
            {sending ? 'Sending…' : `Send to ${totalFiltered} contact${totalFiltered === 1 ? '' : 's'}`}
          </button>

          {upcoming.length > 0 && (
            <div className="wa-scheduled">
              <div className="wa-scheduled__head">Upcoming scheduled</div>
              <ul className="wa-scheduled__list">
                {schedLoading ? (
                  <li className="adm-muted">Loading…</li>
                ) : (
                  upcoming.map((item) => (
                    <li key={item.id}>
                      <strong>{item.templateName}</strong>
                      <span>{new Date(item.scheduledAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
