import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Loader2, Mail, Send } from 'lucide-react';
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

  const subjectRef = useRef(null);
  const introRef = useRef(null);
  const htmlRef = useRef(null);
  const activeFieldRef = useRef('intro');

  useEffect(() => {
    if (!open) return;
    setAudience(defaultAudienceForTab(customerTab));
    setHtmlPane('split');
    setFilterBusinessTypes(false);
    setBusinessTypes([]);
  }, [open, customerTab]);

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
      websiteUrl: PROTO_URLS.website,
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
          <div className="adm-email-modal__footer-actions">
            <button
              type="button"
              className="adm-btn-ghost"
              disabled={sending || testSending}
              onClick={() => void handleSend(true)}
            >
              {testSending ? <><Loader2 size={14} className="spin" /> Sending test…</> : 'Send test'}
            </button>
            <button
              type="button"
              className="adm-btn-red"
              disabled={sending || testSending}
              onClick={() => void handleSend(false)}
            >
              {sending ? <><Loader2 size={14} className="spin" /> Sending…</> : <><Send size={14} /> Send email</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
