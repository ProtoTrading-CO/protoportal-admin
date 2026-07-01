import { useEffect, useMemo, useState } from 'react';
import { Code2, Eye, Loader2, Mail, Send, Type } from 'lucide-react';

const AUDIENCE_OPTIONS = [
  {
    value: 'all-approved',
    label: 'Approved only',
    hint: 'All approved portal customers — no Proto Active, no trade requests',
  },
  {
    value: 'requests',
    label: 'Trade requests only',
    hint: 'Pending applications waiting for approval',
  },
  {
    value: 'proto-active',
    label: 'Proto Active only',
    hint: 'Customers on the Proto Active allowlist',
  },
  {
    value: 'all-portal',
    label: 'Approved + Proto Active',
    hint: 'Everyone with portal access (deduped by email)',
  },
];

function defaultAudienceForTab(customerTab) {
  if (customerTab === 'requests') return 'requests';
  if (customerTab === 'proto-active') return 'proto-active';
  return 'all-approved';
}

function stripDangerousHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function looksLikeHtml(text) {
  const t = String(text || '').trim();
  return /<\s*\w+[^>]*>/i.test(t) || /<\s*\/\s*\w+\s*>/i.test(t);
}

function plainToHtml(text) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      return `<p style="margin:0 0 14px;line-height:1.55;">${lines.map((line) => line.replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br />')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildPayload({ body, contentMode }) {
  const trimmed = body.trim();
  const htmlContent = contentMode === 'html'
    ? stripDangerousHtml(trimmed)
    : plainToHtml(trimmed);
  const textContent = contentMode === 'html' ? htmlToText(trimmed) : trimmed;
  return { htmlContent, textContent };
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
  const [body, setBody] = useState('');
  const [contentMode, setContentMode] = useState('plain');
  const [showPreview, setShowPreview] = useState(false);
  const [audience, setAudience] = useState('all-approved');
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAudience(defaultAudienceForTab(customerTab));
    setShowPreview(false);
  }, [open, customerTab]);

  const selectedAudience = useMemo(
    () => AUDIENCE_OPTIONS.find((opt) => opt.value === audience) || AUDIENCE_OPTIONS[0],
    [audience],
  );

  const previewHtml = useMemo(() => {
    if (!body.trim()) return '<p style="color:#9ca3af;margin:0;">Your message preview will appear here.</p>';
    const { htmlContent } = buildPayload({ body, contentMode });
    return htmlContent || '<p style="color:#9ca3af;margin:0;">Empty message</p>';
  }, [body, contentMode]);

  if (!open) return null;

  const handleSend = async (test = false) => {
    if (!subject.trim()) {
      onShowToast?.('Subject is required', 'error');
      return;
    }
    if (!body.trim()) {
      onShowToast?.('Email body is required', 'error');
      return;
    }

    const { htmlContent, textContent } = buildPayload({ body, contentMode });
    if (!htmlContent && !textContent) {
      onShowToast?.('Email body is required', 'error');
      return;
    }

    if (!test && !window.confirm(`Send this email to: ${selectedAudience.label}?`)) return;

    if (test) {
      const testEmail = adminEmail || window.prompt('Send test to email address:');
      if (!testEmail?.trim()) return;
      setTestSending(true);
      try {
        await onSend({
          audience,
          subject: subject.trim(),
          htmlContent,
          textContent,
          testEmail: testEmail.trim(),
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
        htmlContent,
        textContent,
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

  const switchContentMode = (mode) => {
    if (mode === contentMode) return;
    if (mode === 'html' && contentMode === 'plain' && body.trim() && !looksLikeHtml(body)) {
      setBody(plainToHtml(body));
    }
    setContentMode(mode);
    setShowPreview(mode === 'html');
  };

  const handleBodyChange = (value) => {
    setBody(value);
    if (contentMode === 'plain' && looksLikeHtml(value)) {
      setContentMode('html');
      setShowPreview(true);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className="adm-modal adm-modal--form adm-email-modal"
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
              Compose plain text or paste HTML from your email builder. Recipients get a branded Proto Trading wrapper.
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
            <span className="adm-email-field__label">Subject</span>
            <input
              className="adm-field-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Proto Trading update"
            />
          </label>

          <div className="adm-email-field">
            <div className="adm-email-field__row">
              <span className="adm-email-field__label">Message</span>
              <div className="adm-email-mode-toggle" role="tablist" aria-label="Message format">
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentMode === 'plain'}
                  className={`adm-email-mode-toggle__btn${contentMode === 'plain' ? ' adm-email-mode-toggle__btn--active' : ''}`}
                  onClick={() => switchContentMode('plain')}
                >
                  <Type size={14} /> Plain text
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentMode === 'html'}
                  className={`adm-email-mode-toggle__btn${contentMode === 'html' ? ' adm-email-mode-toggle__btn--active' : ''}`}
                  onClick={() => switchContentMode('html')}
                >
                  <Code2 size={14} /> HTML
                </button>
                {contentMode === 'html' && (
                  <button
                    type="button"
                    className={`adm-email-mode-toggle__btn adm-email-mode-toggle__btn--preview${showPreview ? ' adm-email-mode-toggle__btn--active' : ''}`}
                    onClick={() => setShowPreview((v) => !v)}
                  >
                    <Eye size={14} /> {showPreview ? 'Hide preview' : 'Preview'}
                  </button>
                )}
              </div>
            </div>

            <textarea
              className={`adm-field-input adm-email-modal__textarea${contentMode === 'html' ? ' adm-email-modal__textarea--html' : ''}`}
              rows={contentMode === 'html' ? 12 : 8}
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder={contentMode === 'html'
                ? '<h2>Hello</h2>\n<p>Paste HTML from Brevo, Mailchimp, or your email template…</p>'
                : 'Write your message. Blank lines start new paragraphs.'}
              spellCheck={contentMode === 'plain'}
            />
            {contentMode === 'html' && (
              <span className="adm-email-field__hint">
                HTML is sent as-is (scripts stripped). Use Preview to check layout before sending.
              </span>
            )}
          </div>

          {contentMode === 'html' && showPreview && (
            <div className="adm-email-preview">
              <div className="adm-email-preview__label">Live preview</div>
              <div
                className="adm-email-preview__frame"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
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
