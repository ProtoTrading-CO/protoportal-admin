import { useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';

const AUDIENCE_LABELS = {
  requests: 'Trade Requests (this tab)',
  regular: 'Approved customers (this tab)',
  'proto-active': 'Proto Active (this tab)',
  'all-approved': 'All approved portal customers',
  'all-portal': 'All approved + Proto Active',
};

export default function CustomerEmailModal({
  open,
  onClose,
  customerTab,
  onSend,
  onShowToast,
  adminEmail = '',
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all-portal');
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  if (!open) return null;

  const tabAudience = customerTab === 'proto-active' ? 'proto-active' : customerTab;

  const handleSend = async (test = false) => {
    if (!subject.trim()) {
      onShowToast?.('Subject is required', 'error');
      return;
    }
    if (!body.trim()) {
      onShowToast?.('Email body is required', 'error');
      return;
    }
    const targetAudience = test ? audience : audience;
    const htmlContent = body.trim().split('\n').map((line) => `<p style="margin:0 0 12px;">${line.replace(/</g, '&lt;')}</p>`).join('');
    const textContent = body.trim();

    if (!test && !window.confirm(`Send this email to: ${AUDIENCE_LABELS[targetAudience] || targetAudience}?`)) return;

    if (test) {
      const testEmail = adminEmail || window.prompt('Send test to email address:');
      if (!testEmail?.trim()) return;
      setTestSending(true);
      try {
        await onSend({ audience: targetAudience, subject, htmlContent, textContent, testEmail: testEmail.trim() });
        onShowToast?.(`Test email sent to ${testEmail.trim()}`, 'success');
      } catch (err) {
        onShowToast?.(err.message || 'Test send failed', 'error');
      } finally {
        setTestSending(false);
      }
      return;
    }

    setSending(true);
    try {
      const result = await onSend({ audience: targetAudience, subject, htmlContent, textContent });
      onShowToast?.(`Sent to ${result.sent} customer(s)${result.failed ? ` — ${result.failed} failed` : ''}`, result.failed ? 'error' : 'success');
      onClose?.();
    } catch (err) {
      onShowToast?.(err.message || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title"><Mail size={18} /> Send email via Brevo</h3>
          <button type="button" className="adm-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Audience</label>
            <select className="adm-field-input" value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: '100%' }}>
              <option value={tabAudience}>{AUDIENCE_LABELS[tabAudience]}</option>
              {tabAudience !== 'all-portal' && <option value="all-portal">{AUDIENCE_LABELS['all-portal']}</option>}
              {tabAudience !== 'all-approved' && customerTab !== 'proto-active' && (
                <option value="all-approved">{AUDIENCE_LABELS['all-approved']}</option>
              )}
              {customerTab !== 'requests' && tabAudience !== 'requests' && (
                <option value="requests">{AUDIENCE_LABELS.requests}</option>
              )}
            </select>
          </div>
          <div>
            <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Subject</label>
            <input className="adm-field-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%' }} placeholder="Proto Trading update" />
          </div>
          <div>
            <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Message</label>
            <textarea className="adm-field-input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', resize: 'vertical' }} placeholder="Write your message…" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="adm-btn-red" disabled={sending} onClick={() => void handleSend(false)}>
              {sending ? <><Loader2 size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send email</>}
            </button>
            <button type="button" className="adm-btn-ghost" disabled={testSending} onClick={() => void handleSend(true)}>
              {testSending ? 'Sending test…' : 'Send test'}
            </button>
            <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
