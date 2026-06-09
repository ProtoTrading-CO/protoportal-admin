import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Send, Trash2 } from 'lucide-react';
import { BUSINESS_TYPES, JOIN_STATUS_OPTIONS } from '../lib/businessTypes';
import { deleteScheduledBroadcast, fetchBroadcastSchedule, saveBroadcastSchedule } from '../lib/broadcastSchedule';

function uuid() {
  return crypto.randomUUID?.() || `sched-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function monthLabel(date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function BroadcastCalendar({
  templates,
  templatesLoading,
  filters,
  onSendNow,
  sending,
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('');
  const [form, setForm] = useState({
    templateName: '',
    businessType: '',
    joinedStatus: '',
    time: '09:00',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchBroadcastSchedule();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);
  const startPad = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();

  const itemsByDay = useMemo(() => {
    const map = {};
    for (const item of items) {
      const key = item.scheduledAt?.slice(0, 10);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const openDay = (dateStr) => {
    setSelectedDay(dateStr);
    const dayItems = itemsByDay[dateStr] || [];
    const first = dayItems[0];
    setForm({
      templateName: first?.templateName || templates[0]?.name || '',
      businessType: first?.businessTypes?.[0] || '',
      joinedStatus: first?.joinedStatuses?.[0] || '',
      time: first?.scheduledAt ? new Date(first.scheduledAt).toTimeString().slice(0, 5) : '09:00',
    });
  };

  const scheduleBroadcast = async () => {
    if (!selectedDay || !form.templateName) return;
    setSaving(true);
    try {
      const scheduledAt = new Date(`${selectedDay}T${form.time}:00`).toISOString();
      const nextItem = {
        id: uuid(),
        scheduledAt,
        templateName: form.templateName,
        broadcastName: form.templateName,
        businessTypes: form.businessType ? [form.businessType] : [],
        joinedStatuses: form.joinedStatus ? [form.joinedStatus] : [],
        status: 'pending',
      };
      const withoutDay = items.filter((item) => item.scheduledAt?.slice(0, 10) !== selectedDay || item.status !== 'pending');
      const saved = await saveBroadcastSchedule([...withoutDay, nextItem]);
      setItems(saved.items || []);
    } catch (err) {
      alert(err.message || 'Failed to schedule broadcast');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (id) => {
    try {
      const saved = await deleteScheduledBroadcast(id);
      setItems(saved.items || []);
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const selectedDayItems = selectedDay ? (itemsByDay[selectedDay] || []) : [];

  return (
    <div className="adm-crm-compose">
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Broadcast Calendar</div>
      <div className="adm-muted" style={{ fontSize: 13, marginBottom: 12 }}>Click a day to schedule a WhatsApp broadcast for a customer group.</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button type="button" className="adm-btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <strong>{monthLabel(cursor)}</strong>
        <button type="button" className="adm-btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 16 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="adm-muted" style={{ fontSize: 11, textAlign: 'center', fontWeight: 700 }}>{d}</div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          const key = dayKey(date);
          const dayItems = itemsByDay[key] || [];
          const isSelected = selectedDay === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => openDay(key)}
              style={{
                minHeight: 64,
                border: isSelected ? '2px solid #dc2626' : '1px solid #e5e7eb',
                borderRadius: 10,
                background: dayItems.length ? '#fef2f2' : '#fff',
                padding: 6,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12 }}>{day}</div>
              {dayItems.slice(0, 2).map((item) => (
                <div key={item.id} style={{ fontSize: 10, color: '#dc2626', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.templateName}
                </div>
              ))}
            </button>
          );
        })}
      </div>

      {loading && <div className="adm-muted" style={{ fontSize: 13, marginBottom: 12 }}>Loading schedule…</div>}

      {selectedDay && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fff', display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Schedule for {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Template</label>
              <select value={form.templateName} onChange={(e) => setForm((p) => ({ ...p, templateName: e.target.value }))} className="adm-field-input" style={{ width: '100%' }} disabled={templatesLoading}>
                <option value="">{templatesLoading ? 'Loading…' : 'Select template'}</option>
                {templates.map((t) => <option key={t.id || t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Send time</label>
              <input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} className="adm-field-input" style={{ width: '100%' }} />
            </div>
            <div>
              <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Business type</label>
              <select value={form.businessType} onChange={(e) => setForm((p) => ({ ...p, businessType: e.target.value }))} className="adm-field-input" style={{ width: '100%' }}>
                <option value="">All business types</option>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Joined status</label>
              <select value={form.joinedStatus} onChange={(e) => setForm((p) => ({ ...p, joinedStatus: e.target.value }))} className="adm-field-input" style={{ width: '100%' }}>
                {JOIN_STATUS_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {!!selectedDayItems.length && (
            <div style={{ display: 'grid', gap: 8 }}>
              {selectedDayItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
                  <span><strong>{item.templateName}</strong> • {item.status} • {new Date(item.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  {item.status === 'pending' && (
                    <button type="button" className="adm-icon-btn" onClick={() => void removeItem(item.id)} title="Cancel"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn-red" disabled={saving || !form.templateName} onClick={() => void scheduleBroadcast()}>
              {saving ? 'Saving…' : 'Schedule broadcast'}
            </button>
            <button
              type="button"
              className="adm-btn-ghost"
              disabled={sending || !form.templateName}
              onClick={() => onSendNow({
                templateName: form.templateName,
                businessTypes: form.businessType ? [form.businessType] : filters.businessTypes,
                joinedStatuses: form.joinedStatus ? [form.joinedStatus] : filters.joinedStatuses,
              })}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Send size={14} /> Send now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
