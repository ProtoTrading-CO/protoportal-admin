import { useEffect, useMemo, useState } from 'react';
import { Code2, Loader2, Mail, Send, Type } from 'lucide-react';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      return `<p style="margin:0 0 14px;line-height:1.55;">${lines.map((line) => escapeHtml(line)).join('<br />')}</p>`;
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

function wrapBroadcastHtml({ subject, bodyHtml, previewName = 'Customer' }) {
  const safeBody = bodyHtml || '<p style="color:#9ca3af;">Your message will appear here.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(subject || 'Email preview')}</title></head><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px;">
  ${previewName ? `<p style="margin:0 0 16px;">Hi ${escapeHtml(previewName)},</p>` : ''}
  ${safeBody}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="font-size:12px;color:#6b7280;margin:0;">Proto Trading · <a href="https://site.proto.co.za">site.proto.co.za</a></p>
</body></html>`;
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
  const [htmlPane, setHtmlPane] = useState('split');
  const [audience, setAudience] = useState('all-approved');
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAudience(defaultAudienceForTab(customerTab));
    setHtmlPane('split');
  }, [open, customerTab]);

  const selectedAudience = useMemo(
    () => AUDIENCE_OPTIONS.find((opt) => opt.value === audience) || AUDIENCE_OPTIONS[0],
    [audience],
  );

  const bodyHtml = useMemo(() => {
    if (!body.trim()) return '<p style="color:#9ca3af;margin:0;">Start typing or paste HTML to see a live preview.</p>';
    return buildPayload({ body, contentMode }).htmlContent || '<p style="color:#9ca3af;margin:0;">Empty message</p>';
  }, [body, contentMode]);

  const fullPreviewDoc = useMemo(
    () => wrapBroadcastHtml({
      subject: subject.trim() || 'Subject line',
      bodyHtml,
      previewName: 'Customer',
    }),
    [subject, bodyHtml],
  );

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
    if (mode === 'html') setHtmlPane('split');
  };

  const handleBodyChange = (value) => {
    setBody(value);
    if (contentMode === 'plain' && looksLikeHtml(value)) {
      setContentMode('html');
      setHtmlPane('split');
    }
  };

  const showHtmlEditor = contentMode === 'html' && htmlPane !== 'preview';
  const showHtmlPreview = contentMode === 'html' && htmlPane !== 'code';

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div
        className={`adm-modal adm-modal--form adm-email-modal${contentMode === 'html' ? ' adm-email-modal--html' : ''}`}
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
              Compose plain text or paste HTML. In HTML mode the preview updates live — exactly how customers receive it.
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
              </div>
            </div>

            {contentMode === 'html' && (
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
            )}

            {contentMode === 'plain' ? (
              <textarea
                className="adm-field-input adm-email-modal__textarea"
                rows={8}
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Write your message. Blank lines start new paragraphs."
                spellCheck
              />
            ) : (
              <div className={`adm-email-split${htmlPane === 'split' ? ' adm-email-split--split' : ''}`}>
                {showHtmlEditor && (
                  <div className="adm-email-split__editor">
                    <div className="adm-email-split__pane-label">HTML source</div>
                    <textarea
                      className="adm-field-input adm-email-modal__textarea adm-email-modal__textarea--html"
                      rows={14}
                      value={body}
                      onChange={(e) => handleBodyChange(e.target.value)}
                      placeholder={'<h2>Hello</h2>\n<p>Paste HTML from Brevo, Mailchimp, or your email template…</p>'}
                      spellCheck={false}
                    />
                  </div>
                )}
                {showHtmlPreview && (
                  <div className="adm-email-split__preview">
                    <div className="adm-email-preview adm-email-preview--full">
                      <div className="adm-email-preview__chrome">
                        <div className="adm-email-preview__chrome-row">
                          <span className="adm-email-preview__chrome-label">To</span>
                          <span className="adm-email-preview__chrome-value">customer@example.com</span>
                        </div>
                        <div className="adm-email-preview__chrome-row">
                          <span className="adm-email-preview__chrome-label">Subject</span>
                          <span className="adm-email-preview__chrome-value adm-email-preview__chrome-value--subject">
                            {subject.trim() || 'Subject line'}
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
                  </div>
                )}
              </div>
            )}

            {contentMode === 'html' && (
              <span className="adm-email-field__hint">
                Preview shows the full email with greeting and Proto Trading footer — same as what Brevo sends.
              </span>
            )}
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
