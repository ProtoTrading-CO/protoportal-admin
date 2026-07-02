import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Shield,
  Store,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  approveCustomer,
  deleteCustomer,
  fetchCustomersPage,
  fetchProtoActiveCustomersPage,
  seedProtoActiveCustomers,
  updateProtoActiveCustomer,
  updateCustomerAdmin,
  deleteProtoActiveCustomer,
  syncBrevoContacts,
  pushPortalCustomersToBrevo,
  sendCustomerEmailBroadcast,
  fetchCrmContactsPage,
} from '../../lib/customers';
import { BUSINESS_TYPES } from '../../lib/businessTypes';
import CustomerEmailModal from '../../components/CustomerEmailModal';

const ADMIN_PAGE_SIZE = 50;
const SPEND_BANDS = ['R0 – R5,000', 'R5,000 – R10,000', 'R10,000 – R25,000', 'R25,000 – R50,000', 'R50,000+'];

function compactItems(items = []) {
  return items.map((item) => `${item.code}${item.name ? ` ${item.name}` : ''} × ${item.qty}`).join(', ');
}

function WhatsappOptIn({ value }) {
  if (value == null) return <span className="adm-muted">—</span>;
  return value
    ? <Check size={16} color="#15803d" strokeWidth={3} aria-label="WhatsApp yes" />
    : <X size={16} color="#dc2626" strokeWidth={3} aria-label="WhatsApp no" />;
}

function DrawerField({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="adm-drawer-field">
      <Icon size={14} className="adm-drawer-field-icon" />
      <div>
        <div className="adm-drawer-field-label">{label}</div>
        <div className="adm-drawer-field-value">{value}</div>
      </div>
    </div>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} className="adm-btn-ghost" disabled={page <= 1}><ChevronLeft size={15} /> Prev</button>
      <span className="adm-muted">Page {page} of {totalPages}</span>
      <button type="button" onClick={() => onChange(Math.min(totalPages, page + 1))} className="adm-btn-ghost" disabled={page >= totalPages}>Next <ChevronRight size={15} /></button>
    </div>
  );
}

export default function CustomersTab({
  showToast,
  refreshDashboardStats,
  onPendingCountChange,
  customer,
  refreshNonce = 0,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');

  const [profileCustomer, setProfileCustomer] = useState(null);
  const [profileOrders, setProfileOrders] = useState([]);
  const [profileOrdersLoading, setProfileOrdersLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSource, setProfileSource] = useState('portal');

  const [customerApproveBusy, setCustomerApproveBusy] = useState(false);
  const customerExcelRef = useRef(null);

  const [customerTab, setCustomerTab] = useState('regular');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchDebounced, setCustomerSearchDebounced] = useState('');
  const [customerBusinessType, setCustomerBusinessType] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerRows, setCustomerRows] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerEmailOpen, setCustomerEmailOpen] = useState(false);
  const [brevoSyncBusy, setBrevoSyncBusy] = useState(false);
  const [brevoPushBusy, setBrevoPushBusy] = useState(false);
  const [brevoLastSync, setBrevoLastSync] = useState(null);
  const [approvalCodes, setApprovalCodes] = useState({});
  const [protoSeedBusy, setProtoSeedBusy] = useState(false);
  const [protoNameSaving, setProtoNameSaving] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setCustomerSearchDebounced(customerSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearchDebounced, customerBusinessType]);

  const refreshPendingCount = async () => {
    try {
      const data = await fetchCustomersPage({ tab: 'requests', pageSize: 1, searchQuery: '' });
      onPendingCountChange?.(data.total || 0);
    } catch {}
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = customerTab === 'proto-active'
        ? await fetchProtoActiveCustomersPage({ page: customerPage, pageSize: ADMIN_PAGE_SIZE, searchQuery: customerSearchDebounced })
        : await fetchCustomersPage({
          page: customerPage,
          pageSize: ADMIN_PAGE_SIZE,
          tab: customerTab,
          searchQuery: customerSearchDebounced,
          businessType: customerBusinessType,
        });
      setCustomerRows(data.rows);
      setCustomerTotal(data.total);
      if (data.migrationRequired && data.message) showToast(data.message, 'warning');
    } catch (err) {
      showToast(err.message || 'Failed to load customers', 'error');
      setCustomerRows([]);
      setCustomerTotal(0);
    } finally { setLoading(false); }
  };

  const importProtoActiveList = async () => {
    setProtoSeedBusy(true);
    try {
      const json = await seedProtoActiveCustomers();
      const dupNote = json.skippedDuplicates ? ` (${json.skippedDuplicates} duplicate emails merged)` : '';
      const nameNote = json.missingNames ? ` · ${json.withNames} with names, ${json.missingNames} still blank (edit inline)` : '';
      showToast(`Imported ${json.upserted} proto active customers${dupNote}${nameNote}`, 'success');
      setCustomerTab('proto-active');
      setCustomerPage(1);
      await loadCustomers();
    } catch (err) {
      showToast(err.message || 'Import failed — check console', 'error');
      console.error('proto active import:', err);
    } finally { setProtoSeedBusy(false); }
  };

  const saveProtoActiveName = async (row, field, value) => {
    const trimmed = String(value || '').trim();
    const current = String(row[field] || '').trim();
    if (trimmed === current) return;
    setProtoNameSaving(`${row.id}-${field}`);
    try {
      const updated = await updateProtoActiveCustomer(row.id, { [field]: trimmed || null });
      setCustomerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      if (profileCustomer?.id === row.id) setProfileCustomer((p) => ({ ...p, ...updated }));
      showToast('Saved', 'success');
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setProtoNameSaving(null);
    }
  };

  const handleBrevoSync = async () => {
    setBrevoSyncBusy(true);
    try {
      const json = await syncBrevoContacts();
      setBrevoLastSync(json.syncedAt || new Date().toISOString());
      showToast(`Synced ${json.upserted ?? json.succeeded ?? 0} contacts from Brevo`, 'success');
    } catch (err) {
      showToast(err.message || 'Brevo sync failed', 'error');
    } finally {
      setBrevoSyncBusy(false);
    }
  };

  const handlePushPortalToBrevo = async () => {
    if (!window.confirm('Push all approved + Proto Active customer emails to Brevo contacts?')) return;
    setBrevoPushBusy(true);
    try {
      const json = await pushPortalCustomersToBrevo();
      showToast(`Pushed ${json.pushed} portal emails to Brevo`, 'success');
    } catch (err) {
      showToast(err.message || 'Push to Brevo failed', 'error');
    } finally {
      setBrevoPushBusy(false);
    }
  };

  const removeProtoActiveCustomer = async (row) => {
    if (!window.confirm(`Remove ${row.name || row.email} from Proto Active list?`)) return;
    setSaving(`del-proto-${row.id}`);
    try {
      await deleteProtoActiveCustomer(row.id);
      await loadCustomers();
      if (profileCustomer?.id === row.id) closeCustomerProfile();
      showToast('Proto Active customer removed');
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally {
      setSaving('');
    }
  };

  const handleCustomerExcelApprove = async (file) => {
    if (!file) return;
    setCustomerApproveBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const emails = rows.flatMap((row) => {
        const val = row.email || row.Email || row.EMAIL || Object.values(row)[0];
        return val ? [String(val).trim().toLowerCase()] : [];
      }).filter(Boolean);
      const res = await fetch('/api/approve-customers-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk approve failed');
      await refreshPendingCount();
      await loadCustomers();
      showToast(`Approved ${json.approved || 0}${json.notFound?.length ? `, ${json.notFound.length} not found` : ''}`);
    } catch (err) {
      showToast(err.message || 'Excel approve failed', 'error');
    } finally {
      setCustomerApproveBusy(false);
    }
  };

  const openCustomerProfile = async (person, source = 'portal') => {
    setProfileCustomer(person);
    setProfileSource(source);
    setProfileEditing(false);
    setProfileOrders([]);
    if (source === 'proto-active') return;
    setProfileOrdersLoading(true);
    try {
      const res = await fetch(`/api/admin-orders?customerId=${person.id}&limit=20`);
      const json = await res.json();
      setProfileOrders(json.rows || []);
    } catch { /* silent */ }
    finally { setProfileOrdersLoading(false); }
  };

  const closeCustomerProfile = () => { setProfileCustomer(null); setProfileOrders([]); setProfileEditing(false); setProfileSource('portal'); };

  const startEditProfile = () => {
    setProfileForm({
      name: profileCustomer.name || '',
      email: profileCustomer.email || '',
      phone: profileCustomer.phone || '',
      business_name: profileCustomer.business_name || profileCustomer.name || '',
      business_type: profileCustomer.business_type || '',
      monthly_spend: profileCustomer.monthly_spend || '',
      website: profileCustomer.website || '',
      vat_number: profileCustomer.vat_number || '',
      company_address: profileCustomer.company_address || '',
      delivery_address: profileCustomer.delivery_address || '',
      contact_name: profileCustomer.contact_name || '',
      first_name: profileCustomer.first_name || '',
      account_code: profileCustomer.account_code || profileCustomer.customer_code || '',
    });
    setProfileEditing(true);
  };

  const saveProfileEdit = async () => {
    setSavingProfile(true);
    try {
      if (profileSource === 'proto-active') {
        const row = await updateProtoActiveCustomer(profileCustomer.id, {
          name: profileForm.business_name || profileForm.name,
          email: profileForm.email,
          contact_name: profileForm.contact_name,
          first_name: profileForm.first_name,
          account_code: profileForm.account_code,
        });
        setProfileCustomer(row);
        setProfileEditing(false);
        await loadCustomers();
        showToast('Proto Active customer updated');
      } else {
        const row = await updateCustomerAdmin(profileCustomer.id, profileForm);
        setProfileCustomer(row);
        setProfileEditing(false);
        await loadCustomers();
        showToast('Customer profile updated');
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally { setSavingProfile(false); }
  };

  const setPf = (key) => (e) => setProfileForm((f) => ({ ...f, [key]: e.target.value }));

  const approveRequest = async (person) => {
    const customerCode = String(approvalCodes[person.id] || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(customerCode)) {
      showToast('Enter a 6-character customer code before approving', 'error');
      return;
    }
    setSaving(person.id);
    try {
      const result = await approveCustomer(person.id, true, { customerCode });
      if (result.watiWelcome === 'failed') {
        showToast('Approved, but WhatsApp welcome message failed to send', 'error');
      }
      setApprovalCodes((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      await refreshPendingCount();
      void refreshDashboardStats();
      setCustomerTab('regular');
      setCustomerPage(1);
      await loadCustomers();
      closeCustomerProfile();
      showToast(`${person.business_name || person.name || 'Customer'} approved`);
    } catch (err) {
      showToast(err.message || 'Approval failed', 'error');
    } finally { setSaving(''); }
  };

  const removeCustomer = async (person, source = profileSource) => {
    const orderNote = person.orderCount > 0
      ? ` This customer has ${person.orderCount} order(s); order history will remain.`
      : '';
    if (!window.confirm(`Delete ${person.name || person.email}? This cannot be undone.${orderNote}`)) return;
    const savingKey = source === 'proto-active' ? `del-proto-${person.id}` : `del-${person.id}`;
    setSaving(savingKey);
    try {
      if (source === 'proto-active') {
        await deleteProtoActiveCustomer(person.id);
      } else {
        await deleteCustomer(person.id);
      }
      await loadCustomers();
      closeCustomerProfile();
      showToast('Customer removed');
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally { setSaving(''); }
  };

  const deactivateCustomer = async (person) => {
    if (!window.confirm(`Deactivate ${person.name || person.email}? They will lose portal access.`)) return;
    setSaving(`deact-${person.id}`);
    try {
      await updateCustomerAdmin(person.id, { is_approved: false });
      await loadCustomers();
      closeCustomerProfile();
      showToast('Customer deactivated');
    } catch (err) {
      showToast(err.message || 'Deactivate failed', 'error');
    } finally { setSaving(''); }
  };

  useEffect(() => { void loadCustomers(); }, [customerPage, customerTab, customerSearchDebounced, customerBusinessType]);

  useEffect(() => {
    if (refreshNonce > 0) void loadCustomers();
  }, [refreshNonce]);

  useEffect(() => {
    void fetchCrmContactsPage({ page: 1, pageSize: 1 })
      .then((data) => { if (data?.lastSyncedAt) setBrevoLastSync(data.lastSyncedAt); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void refreshPendingCount();
    const iv = setInterval(() => { void refreshPendingCount(); }, 60000);
    return () => clearInterval(iv);
  }, []);

  const customerPages = Math.max(1, Math.ceil(customerTotal / ADMIN_PAGE_SIZE));

  return (
    <>
      <div className="adm-panel">
        <div className="adm-section-head">
          <div>
            <h2 className="adm-section-title">Customer Management</h2>
            <p className="adm-section-note">
              Manage trade requests, approved customers, and Proto Active accounts. Sync with Brevo CRM, push portal emails to Brevo, and send email campaigns to any list.
              {brevoLastSync && ` Brevo last synced: ${new Date(brevoLastSync).toLocaleString('en-ZA')}.`}
            </p>
          </div>
          <div className="adm-customer-actions">
            <button type="button" className="adm-btn-red" onClick={() => setCustomerEmailOpen(true)}>
              <Mail size={14} /> Send email
            </button>
            <button type="button" className="adm-btn-ghost" disabled={brevoSyncBusy} onClick={() => void handleBrevoSync()}>
              {brevoSyncBusy ? <><Loader2 size={14} className="spin" /> Syncing…</> : <><CloudDownload size={14} /> Sync from Brevo</>}
            </button>
            <button type="button" className="adm-btn-ghost" disabled={brevoPushBusy} onClick={() => void handlePushPortalToBrevo()}>
              {brevoPushBusy ? 'Pushing…' : <><Upload size={14} /> Push portal → Brevo</>}
            </button>
            <button type="button" className="adm-btn-ghost" disabled={protoSeedBusy} onClick={() => void importProtoActiveList()}>
              {protoSeedBusy ? 'Importing…' : <><Upload size={14} /> Sync proto active list</>}
            </button>
            <input ref={customerExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) void handleCustomerExcelApprove(e.target.files[0]); e.target.value = ''; }} />
            <button type="button" className="adm-btn-ghost" disabled={customerApproveBusy} onClick={() => customerExcelRef.current?.click()}>
              {customerApproveBusy ? 'Importing…' : <><Upload size={14} /> Approve from Excel</>}
            </button>
          </div>
        </div>

        <div className="adm-customer-tabs">
          <button type="button" onClick={() => setCustomerTab('requests')} className={`adm-tab${customerTab === 'requests' ? ' adm-tab--active' : ''}`}>Trade Requests</button>
          <button type="button" onClick={() => setCustomerTab('regular')} className={`adm-tab${customerTab === 'regular' ? ' adm-tab--active' : ''}`}>Approved</button>
          <button type="button" onClick={() => setCustomerTab('proto-active')} className={`adm-tab${customerTab === 'proto-active' ? ' adm-tab--active' : ''}`}>Proto Active</button>
          <label className="adm-search adm-search--inline"><Search size={14} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" className="adm-search-input" /></label>
          {customerTab !== 'proto-active' && (
            <select
              className="adm-select"
              value={customerBusinessType}
              onChange={(e) => setCustomerBusinessType(e.target.value)}
              aria-label="Filter by business type"
            >
              <option value="">All business types</option>
              <option value="__unspecified__">Unspecified</option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          )}
        </div>

        {customerTab === 'proto-active' ? (
          <div className="adm-list">
            <div className="adm-list-head" style={{ gridTemplateColumns: '80px 1.2fr 110px 90px 1.1fr 100px 80px 100px 120px' }}>
              <span>Code</span><span>Business</span><span>Contact</span><span>First name</span><span>Email</span><span>12mo Sales</span><span>Invoices</span><span>Last purchase</span><span>Actions</span>
            </div>
            {customerRows.length === 0 && !loading && (
              <div className="adm-empty" style={{ padding: '24px 0' }}>
                No proto active customers loaded. Click <strong>Sync proto active list</strong> to import from the master file.
              </div>
            )}
            {customerRows.map((row) => (
              <div key={row.id || row.email} className="adm-list-row" style={{ gridTemplateColumns: '80px 1.2fr 110px 90px 1.1fr 100px 80px 100px 120px', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>{row.account_code}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</span>
                <input
                  type="text"
                  className="adm-tiny-input"
                  defaultValue={row.contact_name || ''}
                  placeholder="Contact name"
                  disabled={protoNameSaving === `${row.id}-contact_name`}
                  onBlur={(e) => void saveProtoActiveName(row, 'contact_name', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                  style={{ width: '100%', fontSize: 12, borderColor: row.contact_name ? undefined : '#fca5a5' }}
                  aria-label={`Contact name for ${row.email}`}
                />
                <input
                  type="text"
                  className="adm-tiny-input"
                  defaultValue={row.first_name || ''}
                  placeholder="First name"
                  disabled={protoNameSaving === `${row.id}-first_name`}
                  onBlur={(e) => void saveProtoActiveName(row, 'first_name', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                  style={{ width: '100%', fontSize: 12, fontWeight: 600, borderColor: row.first_name ? undefined : '#fca5a5' }}
                  aria-label={`First name for ${row.email}`}
                />
                <span style={{ fontSize: 12 }}>{row.email}</span>
                <span style={{ fontSize: 12 }}>R{Number(row.sales_last_12_months || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                <span style={{ fontSize: 12 }}>{row.invoice_count ?? '—'}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{row.last_purchase_date ? new Date(row.last_purchase_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button type="button" className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => openCustomerProfile(row, 'proto-active')}>Edit</button>
                  <button type="button" className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 7px', color: '#c40000' }} disabled={saving === `del-proto-${row.id}`} onClick={() => void removeProtoActiveCustomer(row)}>
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : customerTab === 'requests' ? (
          <div className="adm-list">
            <div className="adm-list-head" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 90px 200px' }}>
              <span>Business Name</span><span>Location</span><span>Date Applied</span><span>Email / Phone</span><span>Whatsapp</span><span>Code</span><span>Actions</span>
            </div>
            {customerRows.length === 0 && !loading && (
              <div className="adm-empty" style={{ padding: '24px 0' }}>No pending trade requests.</div>
            )}
            {customerRows.map((person) => (
              <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 90px 200px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {person.business_name || person.name || 'Unknown'}
                    {person.accept_whatsapp === true && (
                      <Check size={14} color="#15803d" strokeWidth={3} aria-label="WhatsApp opted in" />
                    )}
                  </div>
                  <div className="adm-muted" style={{ fontSize: 11 }}>{person.name}{person.business_type ? ` · ${person.business_type}` : ''}</div>
                </div>
                <div style={{ fontSize: 12 }}>{[person.city, person.province, person.country].filter(Boolean).join(', ') || '—'}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{new Date(person.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div>
                  <div style={{ fontSize: 12 }}>{person.email}</div>
                  <div className="adm-muted" style={{ fontSize: 11 }}>{person.phone || '—'}</div>
                </div>
                <div><WhatsappOptIn value={person.accept_whatsapp} /></div>
                <div>
                  <input
                    type="text"
                    className="adm-tiny-input"
                    placeholder="6-digit"
                    maxLength={6}
                    value={approvalCodes[person.id] || ''}
                    onChange={(e) => setApprovalCodes((prev) => ({
                      ...prev,
                      [person.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                    }))}
                    style={{ width: '72px', fontFamily: 'monospace', fontWeight: 700 }}
                    aria-label={`Customer code for ${person.email}`}
                  />
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>Edit</button>
                  <button
                    type="button"
                    onClick={() => void approveRequest(person)}
                    className="adm-btn-green adm-btn-sm"
                    disabled={saving === person.id || !/^[A-Z0-9]{6}$/.test(approvalCodes[person.id] || '')}
                  >
                    {saving === person.id ? '…' : <><Check size={12} /> Approve</>}
                  </button>
                  <button type="button" onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 7px', color: '#c40000' }} disabled={saving === `del-${person.id}`}>
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="adm-list">
            <div className="adm-list-head" style={{ gridTemplateColumns: '80px 1.1fr 1.1fr 1fr 80px 70px 90px' }}>
              <span>Code</span><span>Name</span><span>Email</span><span>Phone</span><span>WhatsApp</span><span>Orders</span><span></span>
            </div>
            {customerRows.length === 0 && !loading && (
              <div className="adm-empty" style={{ padding: '24px 0' }}>No approved customers yet.</div>
            )}
            {customerRows.map((person) => (
              <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '80px 1.1fr 1.1fr 1fr 80px 70px 90px' }}>
                <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12 }}>{person.customer_code || '—'}</span>
                <div>
                  <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {person.name || person.business_name || 'Unnamed'}
                    {person.accept_whatsapp === true && (
                      <Check size={14} color="#15803d" strokeWidth={3} aria-label="WhatsApp opted in" />
                    )}
                  </span>
                  {(person.first_name || person.contact_name) && (
                    <div className="adm-muted" style={{ fontSize: 11 }}>
                      {[person.first_name, person.contact_name && person.contact_name !== person.name ? person.contact_name : null].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 13 }}>{person.email}</span>
                <span style={{ fontSize: 13 }}>{person.phone || '—'}</span>
                <span><WhatsappOptIn value={person.accept_whatsapp} /></span>
                <span>{person.orderCount}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button type="button" onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>Edit</button>
                  <button type="button" onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" disabled={saving === `del-${person.id}`} style={{ color: '#c40000', padding: '4px 8px' }}>
                    {saving === `del-${person.id}` ? '…' : <X size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pager page={customerPage} totalPages={customerPages} onChange={setCustomerPage} />
      </div>

      {profileCustomer && (
        <div className="adm-drawer-backdrop" onClick={closeCustomerProfile}>
          <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <h3>Customer Profile</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!profileEditing && (
                  <button type="button" onClick={startEditProfile} className="adm-btn-ghost adm-btn-sm">Edit</button>
                )}
                <button type="button" onClick={closeCustomerProfile} className="adm-icon-btn"><X size={16} /></button>
              </div>
            </div>
            <div className="adm-drawer-body">
              <div className="adm-drawer-avatar">{(profileCustomer.business_name || profileCustomer.name || '?')[0].toUpperCase()}</div>
              <h2 className="adm-drawer-biz">{profileCustomer.business_name || profileCustomer.name}</h2>

              {profileEditing ? (
                <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
                  {profileSource === 'proto-active' ? (
                    <>
                      {[
                        ['Account code', 'account_code', 'text'],
                        ['Business name', 'business_name', 'text'],
                        ['Email', 'email', 'email'],
                        ['Contact name', 'contact_name', 'text'],
                        ['First name', 'first_name', 'text'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <input className="adm-field-input" type={type} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%' }} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        ['Contact person', 'name', 'text'],
                        ['Email', 'email', 'email'],
                        ['Phone', 'phone', 'tel'],
                        ['Business name', 'business_name', 'text'],
                        ['Business type', 'business_type', 'text'],
                        ['VAT number', 'vat_number', 'text'],
                        ['Website / social', 'website', 'text'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <input className="adm-field-input" type={type} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%' }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Monthly spend</label>
                        <select className="adm-field-input" value={profileForm.monthly_spend || ''} onChange={setPf('monthly_spend')} style={{ width: '100%' }}>
                          <option value="">—</option>
                          {SPEND_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      {[['Company address', 'company_address'], ['Delivery address', 'delivery_address']].map(([label, key]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <textarea className="adm-field-input" rows={2} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%', resize: 'vertical' }} />
                        </div>
                      ))}
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button type="button" className="adm-btn-green" onClick={() => void saveProfileEdit()} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
                    <button type="button" className="adm-btn-ghost" onClick={() => setProfileEditing(false)} disabled={savingProfile}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="adm-drawer-fields">
                  <DrawerField icon={User} label="Contact person" value={profileCustomer.contact_name || profileCustomer.name} />
                  <DrawerField icon={Mail} label="Email" value={profileCustomer.email} />
                  {profileSource !== 'proto-active' && <DrawerField icon={Phone} label="Phone" value={profileCustomer.phone} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Store} label="Business type" value={profileCustomer.business_type} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Store} label="Monthly spend" value={profileCustomer.monthly_spend} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Globe} label="Website / social" value={profileCustomer.website} />}
                  {profileSource !== 'proto-active' && (
                    <DrawerField icon={Shield} label="Accept WhatsApp" value={profileCustomer.accept_whatsapp == null ? null : profileCustomer.accept_whatsapp ? 'Yes' : 'No'} />
                  )}
                  <DrawerField icon={Building2} label="Customer code" value={profileCustomer.customer_code || profileCustomer.account_code} />
                  {profileCustomer.first_name && <DrawerField icon={User} label="First name" value={profileCustomer.first_name} />}
                  {profileCustomer.vat_number && <DrawerField icon={Shield} label="VAT number" value={profileCustomer.vat_number} />}
                  {profileCustomer.company_address && <DrawerField icon={MapPin} label="Company address" value={profileCustomer.company_address} />}
                  {profileCustomer.delivery_address && <DrawerField icon={MapPin} label="Delivery address" value={profileCustomer.delivery_address} />}
                  {profileCustomer.sales_last_12_months != null && (
                    <DrawerField icon={Store} label="12mo sales" value={`R${Number(profileCustomer.sales_last_12_months).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} />
                  )}
                  {profileCustomer.invoice_count != null && (
                    <DrawerField icon={Store} label="Invoices (12mo)" value={String(profileCustomer.invoice_count)} />
                  )}
                  {profileCustomer.last_purchase_date && (
                    <DrawerField icon={Building2} label="Last purchase" value={new Date(profileCustomer.last_purchase_date).toLocaleDateString('en-ZA')} />
                  )}
                  {profileSource !== 'proto-active' && profileCustomer.created_at && (
                    <DrawerField icon={Building2} label="Applied" value={new Date(profileCustomer.created_at).toLocaleString('en-ZA')} />
                  )}
                </div>
              )}

              {profileSource !== 'proto-active' && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, fontFamily: 'Outfit, sans-serif' }}>Order History</div>
                {profileOrdersLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
                    <Loader2 size={14} className="spin" /> Loading orders…
                  </div>
                )}
                {!profileOrdersLoading && profileOrders.length === 0 && (
                  <div className="adm-muted" style={{ fontSize: 13 }}>No orders found.</div>
                )}
                {!profileOrdersLoading && profileOrders.length > 0 && (
                  <div className="adm-profile-orders">
                    {profileOrders.map((order) => (
                      <div key={order.id} className="adm-profile-order">
                        <div className="adm-profile-order-head">
                          <span>{order.order_number || order.id.slice(0, 8)}</span>
                          <span className="adm-pill" style={{ fontSize: 10, padding: '2px 8px' }}>{order.status || 'pending'}</span>
                          <span className="adm-muted">{new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          {compactItems(order.original_items || order.items || [])}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
            <div className="adm-drawer-footer">
              <button type="button" onClick={closeCustomerProfile} className="adm-btn-ghost">Close</button>
              {profileSource !== 'proto-active' && !profileCustomer.is_approved && (
                <>
                  <input
                    type="text"
                    className="adm-tiny-input"
                    placeholder="6-digit code"
                    maxLength={6}
                    value={approvalCodes[profileCustomer.id] || ''}
                    onChange={(e) => setApprovalCodes((prev) => ({
                      ...prev,
                      [profileCustomer.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                    }))}
                    style={{ width: 88, fontFamily: 'monospace', fontWeight: 700 }}
                  />
                  <button
                    type="button"
                    onClick={() => void approveRequest(profileCustomer)}
                    className="adm-btn-green"
                    disabled={saving === profileCustomer.id || !/^[A-Z0-9]{6}$/.test(approvalCodes[profileCustomer.id] || '')}
                  >
                    {saving === profileCustomer.id ? 'Approving…' : <><Check size={15} /> Approve</>}
                  </button>
                </>
              )}
              {profileSource !== 'proto-active' && (
                <button type="button" onClick={() => void deactivateCustomer(profileCustomer)} className="adm-btn-ghost" disabled={saving === `deact-${profileCustomer.id}`}>
                  {saving === `deact-${profileCustomer.id}` ? '…' : 'Deactivate'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void removeCustomer(profileCustomer, profileSource)}
                className="adm-btn-ghost"
                style={{ color: '#c40000' }}
                disabled={saving === (profileSource === 'proto-active' ? `del-proto-${profileCustomer.id}` : `del-${profileCustomer.id}`)}
              >
                {saving === (profileSource === 'proto-active' ? `del-proto-${profileCustomer.id}` : `del-${profileCustomer.id}`) ? '…' : <><Trash2 size={14} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomerEmailModal
        open={customerEmailOpen}
        onClose={() => setCustomerEmailOpen(false)}
        customerTab={customerTab}
        onSend={sendCustomerEmailBroadcast}
        onShowToast={showToast}
        adminEmail={customer?.email || ''}
      />
    </>
  );
}
