import { RefreshCw, Search, X } from 'lucide-react';

export default function CrmContactsModal({
  open,
  onClose,
  contacts,
  loading,
  search,
  onSearchChange,
  meta,
  onPageChange,
  onRefresh,
  formatJoinStatus,
  formatRelativeDate,
  formatDateTime,
}) {
  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil((meta.totalFiltered || 0) / (meta.pageSize || 25)));

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal" style={{ maxWidth: 1100, width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>WhatsApp Contacts</h3>
            <p className="adm-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{meta.totalFiltered} contacts • engagement and broadcast history</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn-ghost" onClick={onRefresh}><RefreshCw size={15} /></button>
            <button type="button" className="adm-btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <label className="adm-search" style={{ marginBottom: 14 }}>
          <Search size={14} />
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search contact, phone, email…" className="adm-search-input" />
        </label>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
          <div className="adm-list-head" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 0.8fr' }}>
            <span>Contact</span><span>Joined</span><span>Business Type</span><span>Last Broadcast</span><span>Last Response</span><span>Status</span>
          </div>
          {loading ? (
            <div className="adm-muted" style={{ padding: 18, fontSize: 13 }}>Loading WhatsApp contacts…</div>
          ) : contacts.length === 0 ? (
            <div className="adm-muted" style={{ padding: 18, fontSize: 13 }}>No contacts found.</div>
          ) : contacts.map((contact) => (
            <div key={contact.id || contact.phone} className="adm-list-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 0.8fr', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{contact.displayName || contact.phone}</div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{contact.phoneDisplay}</div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{contact.email || 'No email saved'}</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{formatJoinStatus(contact.joinedStatus)}</div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{formatRelativeDate(contact.joinedAt)}</div>
              </div>
              <div style={{ fontSize: 13 }}>{contact.businessType || '—'}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{contact.lastBroadcastName || '—'}</div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{contact.lastBroadcastAt ? formatDateTime(contact.lastBroadcastAt) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 13 }}>{formatDateTime(contact.lastRespondedAt)}</div>
                <div className="adm-muted" style={{ fontSize: 11 }}>{contact.lastRespondedAt ? formatRelativeDate(contact.lastRespondedAt) : '—'}</div>
              </div>
              <div>
                <span className="adm-pill" style={{ background: contact.engaged ? '#ecfdf5' : '#f8fafc', color: contact.engaged ? '#15803d' : '#64748b', borderColor: contact.engaged ? '#bbf7d0' : '#e2e8f0' }}>
                  {contact.engaged ? 'Engaged' : 'Quiet'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <div className="adm-muted" style={{ fontSize: 13 }}>Page {meta.page} of {totalPages}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn-ghost" disabled={meta.page <= 1 || loading} onClick={() => onPageChange((meta.page || 1) - 1)}>Previous</button>
            <button type="button" className="adm-btn-ghost" disabled={loading || (meta.page || 1) >= totalPages} onClick={() => onPageChange((meta.page || 1) + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
