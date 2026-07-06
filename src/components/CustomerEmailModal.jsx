import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, CalendarClock, Code2, ImagePlus, Loader2, Mail, Send } from 'lucide-react';
import { scheduleCustomerEmail } from '../lib/customers';
import { PROTO_URLS } from '../lib/protoUrls';
import { BUSINESS_TYPES } from '../lib/businessTypes';
import {
  MERGE_TAGS,
  PREVIEW_MERGE_VARS,
  applyMergeTags,
  buildEmailBodyHtml,
  wrapBroadcastHtml,
} from '../lib/emailMergeTags';

const AUDIENCE_OPTIONS = [
  {
    value: 'all-approved',
    label: 'Approved trade customers only',
    hint: 'Customers with trade portal access',
  },
  {
    value: 'requests',
    label: 'Trade requests only',
    hint: 'Pending applications waiting for approval',
  },
  {
    value: 'proto-active',
    label: 'Pre-registration only',
    hint: 'CRM contacts on the pre-registration email list',
  },
  {
    value: 'all-portal',
    label: 'Approved + Pre-registration',
    hint: 'Everyone you can email (deduped by email)',
  },
];

function defaultAudienceForTab(customerTab) {
  if (customerTab === 'requests') return 'requests';
  if (customerTab === 'proto-active') return 'proto-active';
  return 'all-approved';
}

function insertAtCursor(textarea, insertValue) {
  if (!textarea) return insertValue;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const next = `${textarea.value.slice(0, start)}${insertValue}${textarea.value.slice(end)}`;
  const pos = start + insertValue.length;
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
  return next;
}

function MergeTagBar({ onInsert }) {
  return (
    <div className="adm-email-merge-bar">
      <span className="adm-email-merge-bar__label">Insert field</span>
      <div className="adm-email-merge-bar__chips">
        {MERGE_TAGS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="adm-email-merge-chip"
            onClick={() => onInsert(`{{${key}}}`)}
            title={`Insert {{${key}}}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CustomerEmailModal({
  open,
  onClose,
  customerTab,
  onSend,
  onShowToast,
  adminEmail = '',
}) {
  const [subject, setSubject] = useState('');
  const [introBody, setIntroBody] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [htmlPane, setHtmlPane] = useState('split');
  const [audience, setAudience] = useState('all-approved');
  const [filterBusinessTypes, setFilterBusinessTypes] = useState(false);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const subjectRef = useRef(null);
  const introRef = useRef(null);
  const htmlRef = useRef(null);
  const imageRef = useRef(null);
  const activeFieldRef = useRef('intro');

  useEffect(() => {
    if (!open) return;
    setAudience(defaultAudienceForTab(customerTab));
    setHtmlPane('split');
    setFilterBusinessTypes(false);
    setBusinessTypes([]);
  }, [open, customerTab]);

  // Delivery analytics for recent campaigns, shown inside the compose modal.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/email-campaigns')
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setCampaigns(json.campaigns || []); })
      .catch(() => { if (!cancelled) setCampaigns([]); });
    return () => { cancelled = true; };
  }, [open]);

  const recentCampaigns = useMemo(() => (campaigns || []).slice(0, 3), [campaigns]);

  const handleAttachImage = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-reference-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, contentType: file.type || 'image/jpeg' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Image upload failed');
      const imgTag = `<p style="margin:16px 0;"><img src="${json.url}" alt="" style="max-width:100%;border-radius:8px;" /></p>`;
      setHtmlBody((prev) => (prev ? `${prev}\n${imgTag}` : imgTag));
      if (htmlPane === 'preview') setHtmlPane('split');
      onShowToast?.('Image attached to the email body', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Image upload failed', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const selectedAudience = useMemo(
    () => AUDIENCE_OPTIONS.find((opt) => opt.value === audience) || AUDIENCE_OPTIONS[0],
    [audience],
  );

  const previewSubject = useMemo(
    () => applyMergeTags(subject.trim() || 'Subject line', PREVIEW_MERGE_VARS),
    [subject],
  );

  const previewBodyHtml = useMemo(
    () => buildEmailBodyHtml({ introText: introBody, htmlBlock: htmlBody }, PREVIEW_MERGE_VARS)
      || '<p style="color:#9ca3af;margin:0;">Write a message body and/or HTML block to preview.</p>',
    [introBody, htmlBody],
  );

  const fullPreviewDoc = useMemo(
    () => wrapBroadcastHtml({
      subject: previewSubject,
      bodyHtml: previewBodyHtml,
      siteUrl: PROTO_URLS.site,
      registerUrl: PROTO_URLS.register,
    }),
    [previewSubject, previewBodyHtml],
  );

  if (!open) return null;

  const insertMergeTag = (token) => {
    const field = activeFieldRef.current;
    if (field === 'subject' && subjectRef.current) {
      setSubject(insertAtCursor(subjectRef.current, token));
      return;
    }
    if (field === 'html' && htmlRef.current) {
      setHtmlBody(insertAtCursor(htmlRef.current, token));
      return;
    }
    if (introRef.current) {
      activeFieldRef.current = 'intro';
      setIntroBody(insertAtCursor(introRef.current, token));
    }
  };

  const toggleBusinessType = (type) => {
    setBusinessTypes((prev) => (
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    ));
  };

  const handleSchedule = async () => {
    if (!subject.trim()) {
      onShowToast?.('Subject is required', 'error');
      return;
    }
    if (!introBody.trim() && !htmlBody.trim()) {
      onShowToast?.('Write a message body and/or HTML block', 'error');
      return;
    }
    if (!scheduledAt) {
      onShowToast?.('Pick a date and time to schedule the send', 'error');
      return;
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      onShowToast?.('Scheduled time must be in the future', 'error');
      return;
    }
    setScheduling(true);
    try {
      await scheduleCustomerEmail({
        scheduledAt: when.toISOString(),
        audience,
        subject: subject.trim(),
        introText: introBody.trim(),
        htmlBlock: htmlBody.trim(),
        businessTypes: filterBusinessTypes ? businessTypes : [],
      });
      onShowToast?.(`Email scheduled for ${when.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — see the Scheduled tab`, 'success');
      onClose?.();
    } catch (err) {
      onShowToast?.(err.message || 'Scheduling failed', 'error');
    } finally {
      setScheduling(false);
    }
  };

  const handleSend = async (test = false) => {
    if (!subject.trim()) {
      onShowToast?.('Subject is required', 'error');
      return;
    }
    if (!introBody.trim() && !htmlBody.trim()) {
      onShowToast?.('Write a message body and/or HTML block', 'error');
      return;
    }

    if (!test && filterBusinessTypes && !businessTypes.length) {
      onShowToast?.('Select at least one business type or turn off the filter', 'error');
      return;
    }

    if (!test && !window.confirm(`Send this email to: ${selectedAudience.label}${filterBusinessTypes && businessTypes.length ? ` (${businessTypes.length} business type${businessTypes.length === 1 ? '' : 's'})` : ''}?`)) return;

    if (test) {
      const testEmail = adminEmail || window.prompt('Send test to email address:');
      if (!testEmail?.trim()) return;
      setTestSending(true);
      try {
        await onSend({
          audience,
          subject: subject.trim(),
          introText: introBody.trim(),
          htmlBlock: htmlBody.trim(),
          testEmail: testEmail.trim(),
          businessTypes: filterBusinessTypes ? businessTypes : [],
        });
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
      const result = await onSend({
        audience,
        subject: subject.trim(),
        introText: introBody.trim(),
        htmlBlock: htmlBody.trim(),
        businessTypes: filterBusinessTypes ? businessTypes : [],
      });
      onShowToast?.(
        `Sent to ${result.sent} customer(s)${result.failed ? ` — ${result.failed} failed` : ''}`,
        result.failed ? 'error' : 'success',
      );
      onClose?.();
    } catch (err) {
      onShowToast?.(err.message || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const showHtmlEditor = htmlPane !== 'preview';
  const showHtmlPreview = htmlPane !== 'code';

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal adm-modal--form adm-email-modal adm-email-modal--html"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="customer-email-title"
      >
        <div className="adm-modal-header">
          <div>
            <h3 id="customer-email-title" className="adm-modal-title">
              <Mail size={18} /> Send email via Brevo
            </h3>
            <p className="adm-email-modal__lead">
              Write your message above, add optional HTML below, and use fields like {'{{name}}'} or {'{{business_name}}'} — replaced per customer on send.
            </p>
          </div>
          <button type="button" className="adm-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="adm-modal-body adm-email-modal__body">
          {recentCampaigns.length > 0 && (
            <div className="adm-email-field" style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
              <span className="adm-email-field__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart2 size={14} /> Recent delivery analytics
              </span>
              {recentCampaigns.map((c, idx) => {
                const ev = c.events || {};
                const sent = c.sent || c.recipientCount || 0;
                const pct = (part) => (sent ? `${Math.round(((part || 0) / sent) * 100)}%` : '0%');
                return (
                  <div key={c.id || idx} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, padding: '4px 0', borderTop: idx ? '1px solid #eef2f7' : 'none' }}>
                    <strong style={{ minWidth: 140, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject || c.audience || 'Campaign'}</strong>
                    <span>{sent} sent</span>
                    <span style={{ color: '#15803d' }}>{ev.delivered || 0} delivered ({pct(ev.delivered)})</span>
                    <span>{ev.opened || 0} opened ({pct(ev.opened)})</span>
                    <span>{ev.clicked || 0} clicked</span>
                    <span style={{ color: (ev.bounced || 0) ? '#b91c1c' : '#6b7280' }}>{ev.bounced || 0} bounced</span>
                  </div>
                );
              })}
            </div>
          )}

          <label className="adm-email-field">
            <span className="adm-email-field__label">Audience</span>
            <select
              className="adm-field-input adm-select--enhanced"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="adm-email-field__hint">{selectedAudience.hint}</span>
          </label>

          <label className="adm-email-field">
            <span className="adm-email-field__label">Filter by business type?</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={filterBusinessTypes}
                  onChange={(e) => setFilterBusinessTypes(e.target.checked)}
                />
                Yes — only send to selected business types
              </label>
            </div>
            {filterBusinessTypes && (
              <div className="adm-email-merge-bar" style={{ marginTop: 8 }}>
                <div className="adm-email-merge-bar__chips">
                  {BUSINESS_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`adm-email-merge-chip${businessTypes.includes(type) ? ' adm-email-merge-chip--active' : ''}`}
                      onClick={() => toggleBusinessType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </label>

          <div className="adm-email-field">
            <span className="adm-email-field__label">Subject</span>
            <input
              ref={subjectRef}
              className="adm-field-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => { activeFieldRef.current = 'subject'; }}
              placeholder="Proto Trading update for {{business_name}}"
            />
            <MergeTagBar onInsert={insertMergeTag} />
          </div>

          <div className="adm-email-field adm-email-field--intro">
            <span className="adm-email-field__label">Message body</span>
            <textarea
              ref={introRef}
              className="adm-field-input adm-email-modal__textarea"
              rows={6}
              value={introBody}
              onChange={(e) => setIntroBody(e.target.value)}
              onFocus={() => { activeFieldRef.current = 'intro'; }}
              placeholder={'Hi {{first_name}},\n\nWe have an update for {{business_name}}…'}
              spellCheck
            />
            <span className="adm-email-field__hint">Plain text intro shown above any HTML. Blank lines start new paragraphs.</span>
            <MergeTagBar onInsert={insertMergeTag} />
          </div>

          <div className="adm-email-field">
            <div className="adm-email-field__row">
              <span className="adm-email-field__label">
                <Code2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                HTML block (optional)
              </span>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { void handleAttachImage(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button
                type="button"
                className="adm-btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px' }}
                disabled={uploadingImage}
                onClick={() => imageRef.current?.click()}
                title="Upload an image and embed it in the email"
              >
                {uploadingImage ? <Loader2 size={13} className="spin" /> : <ImagePlus size={13} />}
                Attach image
              </button>
              <div className="adm-email-pane-toggle" role="tablist" aria-label="HTML editor view">
                <button
                  type="button"
                  className={`adm-email-pane-toggle__btn${htmlPane === 'code' ? ' adm-email-pane-toggle__btn--active' : ''}`}
                  onClick={() => setHtmlPane('code')}
                >
                  HTML code
                </button>
                <button
                  type="button"
                  className={`adm-email-pane-toggle__btn${htmlPane === 'split' ? ' adm-email-pane-toggle__btn--active' : ''}`}
                  onClick={() => setHtmlPane('split')}
                >
                  Split view
                </button>
                <button
                  type="button"
                  className={`adm-email-pane-toggle__btn${htmlPane === 'preview' ? ' adm-email-pane-toggle__btn--active' : ''}`}
                  onClick={() => setHtmlPane('preview')}
                >
                  Preview only
                </button>
              </div>
            </div>

            <div className={`adm-email-split${htmlPane === 'split' ? ' adm-email-split--split' : ''}`}>
              {showHtmlEditor && (
                <div className="adm-email-split__editor">
                  <textarea
                    ref={htmlRef}
                    className="adm-field-input adm-email-modal__textarea adm-email-modal__textarea--html"
                    rows={12}
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    onFocus={() => { activeFieldRef.current = 'html'; }}
                    placeholder={'<table>...</table>\n<p>Optional rich HTML banner or template below your message body.</p>'}
                    spellCheck={false}
                  />
                  <MergeTagBar onInsert={insertMergeTag} />
                </div>
              )}
              {showHtmlPreview && (
                <div className="adm-email-split__preview">
                  <div className="adm-email-preview adm-email-preview--full">
                    <div className="adm-email-preview__chrome">
                      <div className="adm-email-preview__chrome-row">
                        <span className="adm-email-preview__chrome-label">To</span>
                        <span className="adm-email-preview__chrome-value">{PREVIEW_MERGE_VARS.email}</span>
                      </div>
                      <div className="adm-email-preview__chrome-row">
                        <span className="adm-email-preview__chrome-label">Subject</span>
                        <span className="adm-email-preview__chrome-value adm-email-preview__chrome-value--subject">
                          {previewSubject}
                        </span>
                      </div>
                    </div>
                    <iframe
                      title="HTML email preview"
                      className="adm-email-preview__iframe"
                      srcDoc={fullPreviewDoc}
                      sandbox="allow-same-origin"
                    />
                  </div>
                  <span className="adm-email-field__hint">Preview uses sample data for merge fields. Each customer gets their own values on send.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="adm-modal-footer adm-modal-footer--end adm-email-modal__footer">
          <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={sending || testSending}>
            Cancel
          </button>
          <div className="adm-email-modal__footer-actions" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <CalendarClock size={14} />
              <input
                type="datetime-local"
                className="adm-field-input"
                style={{ padding: '6px 8px', fontSize: 12 }}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                aria-label="Schedule send date and time"
              />
            </label>
            <button
              type="button"
              className="adm-btn-ghost"
              disabled={sending || testSending || scheduling || !scheduledAt}
              onClick={() => void handleSchedule()}
              title="Queue this email to send automatically at the chosen time"
            >
              {scheduling ? <><Loader2 size={14} className="spin" /> Scheduling…</> : <><CalendarClock size={14} /> Schedule send</>}
            </button>
            <button
              type="button"
              className="adm-btn-ghost"
              disabled={sending || testSending || scheduling}
              onClick={() => void handleSend(true)}
            >
              {testSending ? <><Loader2 size={14} className="spin" /> Sending test…</> : 'Send test'}
            </button>
            <button
              type="button"
              className="adm-btn-red"
              disabled={sending || testSending || scheduling}
              onClick={() => void handleSend(false)}
            >
              {sending ? <><Loader2 size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send now</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
