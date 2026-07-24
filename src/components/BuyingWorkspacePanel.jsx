import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ClipboardCheck, Loader2, PackagePlus, Plus, RefreshCw, Settings2, Truck } from 'lucide-react';
import {
  createIncomingShipment,
  getBuyingLedger,
  recordIncomingReceipt,
  saveSupplierRule,
  updateIncomingShipmentStatus,
} from '../lib/apolloBuyingLedger.js';

const STATUSES = ['Ordered', 'Departed', 'On the water', 'Customs', 'Landed â awaiting GRV', 'Partially received', 'Received', 'Cancelled'];
const ACTIVE_STATUSES = new Set(STATUSES.slice(0, 6));
const blankRule = { supplier: '', sku: '', leadTimeDays: '', moq: '', packSize: '', targetCoverMonths: 3, notes: '' };
const blankShipment = { shipmentRef: '', method: 'Container', supplier: '', eta: '', originalEta: '', status: 'Ordered', landedDate: '', notes: '', lines: [{ sku: '', description: '', quantity: '' }] };
const blankReceipt = { shipmentId: '', receiptRef: '', receivedDate: new Date().toISOString().slice(0, 10), sku: '', quantity: '', notes: '' };

function asNumber(value) { return Number(value || 0); }
function fmtDate(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'â'; }
function outstanding(shipment) {
  const received = new Map();
  for (const row of shipment.receipts || []) received.set(row.sku, asNumber(received.get(row.sku)) + asNumber(row.quantity));
  return (shipment.lines || []).map((line) => ({ ...line, outstanding: Math.max(0, asNumber(line.quantity) - asNumber(received.get(line.sku))) }));
}

function Section({ icon: Icon, title, note, children }) {
  return <section className="buying-section"><div className="buying-section-head"><span className="buying-section-icon"><Icon size={16} /></span><div><h3>{title}</h3><p>{note}</p></div></div>{children}</section>;
}

export default function BuyingWorkspacePanel({ onShowToast }) {
  const [ledger, setLedger] = useState({ rules: [], shipments: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [rule, setRule] = useState(blankRule);
  const [shipment, setShipment] = useState(blankShipment);
  const [receipt, setReceipt] = useState(blankReceipt);

  const toast = useCallback((message, type = 'success') => onShowToast?.(message, type), [onShowToast]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setLedger(await getBuyingLedger()); }
    catch (error) { toast(error.message || 'Could not load buying data', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeShipments = useMemo(() => ledger.shipments.filter((item) => ACTIVE_STATUSES.has(item.status)), [ledger.shipments]);
  const openRule = (row) => setRule({
    supplier: row.supplier || '', sku: row.sku || '', leadTimeDays: row.lead_time_days ?? '', moq: row.moq ?? '',
    packSize: row.pack_size ?? '', targetCoverMonths: row.target_cover_months ?? 3, notes: row.notes || '',
  });
  const saveRule = async () => {
    setSaving('rule');
    try { setLedger(await saveSupplierRule(rule)); setRule(blankRule); toast('Supplier rule saved. Apollo can now use it for this SKU.'); }
    catch (error) { toast(error.message || 'Could not save supplier rule', 'error'); }
    finally { setSaving(''); }
  };
  const updateLine = (index, field, value) => setShipment((current) => ({ ...current, lines: current.lines.map((row, i) => i === index ? { ...row, [field]: value } : row) }));
  const saveShipment = async () => {
    setSaving('shipment');
    try { setLedger(await createIncomingShipment(shipment)); setShipment(blankShipment); toast('Incoming shipment recorded. It is now available to Apollo.'); }
    catch (error) { toast(error.message || 'Could not record shipment', 'error'); }
    finally { setSaving(''); }
  };
  const saveReceipt = async () => {
    setSaving('receipt');
    try { setLedger(await recordIncomingReceipt(receipt)); setReceipt(blankReceipt); toast('Receipt recorded. Outstanding incoming stock has been reduced.'); }
    catch (error) { toast(error.message || 'Could not record receipt', 'error'); }
    finally { setSaving(''); }
  };
  const setStatus = async (shipmentId, status) => {
    const landedDate = status === 'Landed â awaiting GRV'
      ? window.prompt('Enter the landed date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10))
      : undefined;
    if (status === 'Landed â awaiting GRV' && !landedDate) return;
    setSaving(shipmentId);
    try { setLedger(await updateIncomingShipmentStatus({ shipmentId, status, landedDate })); toast('Shipment status updated.'); }
    catch (error) { toast(error.message || 'Could not update shipment', 'error'); }
    finally { setSaving(''); }
  };

  return <div className="buying-panel">
    <div className="buying-head">
      <div><p className="buying-kicker">Buyer-controlled replenishment</p><h2>Buying Workspace</h2><p>Record confirmed supplier facts and incoming quantities. Apollo advises; you decide whether to order.</p></div>
      <button type="button" className="adm-btn-ghost" onClick={() => void refresh()} disabled={loading}>{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh</button>
    </div>
    <div className="buying-guardrail"><CheckCircle2 size={16} /><span>Nothing here sends a purchase order. A suggested quantity stays a buyer review item until you approve it elsewhere.</span></div>

    <div className="buying-layout">
      <div className="buying-primary">
        <Section icon={Settings2} title="Supplier rule" note="Set the real lead time, MOQ and pack size for a product.">
          <div className="buying-form buying-form--rule">
            <label>Supplier<input value={rule.supplier} onChange={(e) => setRule({ ...rule, supplier: e.target.value })} placeholder="Supplier name (optional)" /></label>
            <label>SKU *<input value={rule.sku} onChange={(e) => setRule({ ...rule, sku: e.target.value.toUpperCase() })} placeholder="e.g. 8626100145" /></label>
            <label>Lead time (days)<input type="number" min="0" value={rule.leadTimeDays} onChange={(e) => setRule({ ...rule, leadTimeDays: e.target.value })} /></label>
            <label>MOQ<input type="number" min="0" value={rule.moq} onChange={(e) => setRule({ ...rule, moq: e.target.value })} /></label>
            <label>Pack size<input type="number" min="1" value={rule.packSize} onChange={(e) => setRule({ ...rule, packSize: e.target.value })} /></label>
            <label>Target cover (months)<input type="number" min="0.5" max="24" step="0.5" value={rule.targetCoverMonths} onChange={(e) => setRule({ ...rule, targetCoverMonths: e.target.value })} /></label>
            <label className="buying-field-wide">Buyer note<textarea value={rule.notes} onChange={(e) => setRule({ ...rule, notes: e.target.value })} placeholder="Known constraints, supplier notes or rationale" /></label>
          </div>
          <div className="buying-actions"><button type="button" className="adm-btn-green" onClick={() => void saveRule()} disabled={saving === 'rule'}>{saving === 'rule' ? <Loader2 size={14} className="spin" /> : <Settings2 size={14} />} Save rule</button><button type="button" className="adm-btn-ghost" onClick={() => setRule(blankRule)}>Clear</button></div>
        </Section>

        <Section icon={Truck} title="Confirmed incoming shipment" note="Add only stock already ordered or in transit. One shipment can contain many SKUs.">
          <div className="buying-form buying-form--shipment">
            <label>Shipment reference *<input value={shipment.shipmentRef} onChange={(e) => setShipment({ ...shipment, shipmentRef: e.target.value })} placeholder="Container / air waybill / supplier ref" /></label>
            <label>Method<select value={shipment.method} onChange={(e) => setShipment({ ...shipment, method: e.target.value })}><option>Container</option><option>Air</option></select></label>
            <label>Supplier<input value={shipment.supplier} onChange={(e) => setShipment({ ...shipment, supplier: e.target.value })} /></label>
            <label>Expected arrival *<input type="date" value={shipment.eta} onChange={(e) => setShipment({ ...shipment, eta: e.target.value })} /></label>
            <label>Status<select value={shipment.status} onChange={(e) => setShipment({ ...shipment, status: e.target.value })}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
            {shipment.status === 'Landed â awaiting GRV' && <label>Landed date *<input type="date" value={shipment.landedDate} onChange={(e) => setShipment({ ...shipment, landedDate: e.target.value })} /></label>}
            <label className="buying-field-wide">Note<textarea value={shipment.notes} onChange={(e) => setShipment({ ...shipment, notes: e.target.value })} placeholder="Optional shipping or buying context" /></label>
          </div>
          <div className="buying-lines"><div className="buying-lines-head"><strong>Incoming SKU lines</strong><button type="button" className="buying-text-button" onClick={() => setShipment((current) => ({ ...current, lines: [...current.lines, { sku: '', description: '', quantity: '' }] }))}><Plus size={13} /> Add SKU</button></div>
            {shipment.lines.map((line, index) => <div className="buying-line-form" key={index}><input value={line.sku} onChange={(e) => updateLine(index, 'sku', e.target.value.toUpperCase())} placeholder="SKU *" /><input value={line.description} onChange={(e) => updateLine(index, 'description', e.target.value)} placeholder="Description" /><input type="number" min="0.001" step="any" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} placeholder="Qty *" />{shipment.lines.length > 1 && <button type="button" aria-label="Remove line" className="buying-remove" onClick={() => setShipment((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Ã</button>}</div>)}
          </div>
          <div className="buying-actions"><button type="button" className="adm-btn-green" onClick={() => void saveShipment()} disabled={saving === 'shipment'}>{saving === 'shipment' ? <Loader2 size={14} className="spin" /> : <PackagePlus size={14} />} Record shipment</button></div>
        </Section>
      </div>

      <aside className="buying-side">
        <Section icon={ClipboardCheck} title="Record a receipt / GRV" note="A receipt reduces the remaining incoming quantity for that SKU.">
          <div className="buying-form">
            <label>Shipment *<select value={receipt.shipmentId} onChange={(e) => setReceipt({ ...receipt, shipmentId: e.target.value })}><option value="">Choose a shipment</option>{activeShipments.map((item) => <option key={item.id} value={item.id}>{item.shipment_ref} Â· {item.supplier || 'No supplier'}</option>)}</select></label>
            <label>GRV / receipt reference *<input value={receipt.receiptRef} onChange={(e) => setReceipt({ ...receipt, receiptRef: e.target.value })} /></label>
            <label>Received date *<input type="date" value={receipt.receivedDate} onChange={(e) => setReceipt({ ...receipt, receivedDate: e.target.value })} /></label>
            <label>SKU *<input value={receipt.sku} onChange={(e) => setReceipt({ ...receipt, sku: e.target.value.toUpperCase() })} /></label>
            <label>Quantity *<input type="number" min="0.001" step="any" value={receipt.quantity} onChange={(e) => setReceipt({ ...receipt, quantity: e.target.value })} /></label>
            <label>Note<textarea value={receipt.notes} onChange={(e) => setReceipt({ ...receipt, notes: e.target.value })} /></label>
          </div>
          <div className="buying-actions"><button type="button" className="adm-btn-green" onClick={() => void saveReceipt()} disabled={saving === 'receipt'}>{saving === 'receipt' ? <Loader2 size={14} className="spin" /> : <ClipboardCheck size={14} />} Record receipt</button></div>
        </Section>

        <Section icon={Settings2} title="Saved supplier rules" note={ledger.rules.length ? `${ledger.rules.length} buyer-entered rule${ledger.rules.length === 1 ? '' : 's'}` : 'No supplier rules entered yet.'}>
          <div className="buying-rule-list">{ledger.rules.length ? ledger.rules.map((item) => <button type="button" key={item.id} onClick={() => openRule(item)}><strong>{item.sku}</strong><span>{item.supplier || 'Default supplier'} Â· {item.lead_time_days ?? 'â'}d lead time Â· {item.target_cover_months}m cover</span></button>) : <p className="buying-empty">Save a supplier rule to make recommendations more precise.</p>}</div>
        </Section>
      </aside>
    </div>

    <Section icon={Truck} title="Incoming stock register" note="Only active shipment quantities are used by Apollo as confirmed incoming stock.">
      <div className="buying-shipment-list">{ledger.shipments.length ? ledger.shipments.map((item) => {
        const lines = outstanding(item); const total = lines.reduce((sum, line) => sum + line.outstanding, 0);
        return <article className="buying-shipment-card" key={item.id}><div className="buying-shipment-card-head"><div><strong>{item.shipment_ref}</strong><span>{item.method} Â· {item.supplier || 'Supplier not recorded'} Â· ETA {fmtDate(item.eta)}</span></div><label className="buying-status"><span>Status</span><select value={item.status} onChange={(e) => void setStatus(item.id, e.target.value)} disabled={saving === item.id}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label></div>
          <div className="buying-shipment-lines">{lines.map((line) => <div key={line.id}><strong>{line.sku}</strong><span>{line.description || 'No description'}</span><b>{line.outstanding} outstanding</b></div>)}</div><p>{total} units outstanding across {lines.length} SKU{lines.length === 1 ? '' : 's'}{item.notes ? ` Â· ${item.notes}` : ''}</p></article>;
      }) : <p className="buying-empty buying-empty--wide">No incoming shipments have been recorded. Apollo will say so explicitly rather than assume stock is on the way.</p>}</div>
    </Section>
  </div>;
}
