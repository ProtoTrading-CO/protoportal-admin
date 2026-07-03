import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Loader2, Mail, RotateCcw, Save } from 'lucide-react';
import {
  applyMergeTags,
  buildEmailBodyHtml,
  wrapBroadcastHtml,
} from '../lib/emailMergeTags';
import { PROTO_URLS } from '../lib/protoUrls';
import {
  fetchOutgoingTemplates,
  saveOutgoingTemplate,
  sendOutgoingTest,
} from '../lib/outgoingEmails';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';

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

function MergeTagBar({ tags, onInsert }) {
  if (!tags?.length) return null;
  return (
    <div className="adm-email-merge-bar">
      <span className="adm-email-merge-bar__label">Insert field</span>
      <div className="adm-email-merge-bar__chips">
        {tags.map((key) => (
          <button
            key={key}
            type="button"
            className="adm-email-merge-chip"
            onClick={() => onInsert(`{{${key}}}`)}
            title={`Insert {{${key}}}`}
          >
            {key.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OutgoingPanel({ onShowToast, adminEmail = '' }) {
  const [templates, setTemplates] = useState([]);
  const [slug, setSlug] = useState('');
  const [subject, setSubject] = useState('');
  const [introBody, setIntroBody] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const subjectRef = useRef(null);
  const introRef = useRef(null);
  const htmlRef = useRef(null);
  const activeFieldRef = useRef('intro');

  const selected = useMemo(
    () => templates.find((t) => t.slug === slug) || null,
    [templates, slug],
  );

  const previewVars = selected?.previewVars || {};

  const previewSubject = useMemo(
    () => applyMergeTags(subject.trim() || 'Subject line', previewVars),
    [subject, previewVars],
  );

  const previewBodyHtml = useMemo(
    () => buildEmailBodyHtml({ introText: introBody, htmlBlock: htmlBody }, previewVars)
      || '<p style="color:#9ca3af;margin:0;">Write a message body to preview.</p>',
    [introBody, htmlBody, previewVars],
  );

  const fullPreviewDoc = useMemo(
    () => wrapBroadcastHtml({
      subject: previewSubject,
      bodyHtml: previewBodyHtml,
      websiteUrl: PROTO_URLS.website,
    }),
    [previewSubject, previewBodyHtml],
  );

  const applyTemplate = useCallback((row) => {
    if (!row) return;
    setSubject(row.subject || '');
    setIntroBody(row.introText || '');
    setHtmlBody(row.htmlBlock || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOutgoingTemplates();
      setTemplates(rows);
      setSlug((prev) => {
        const next = prev && rows.some((r) => r.slug === prev) ? prev : rows[0]?.slug || '';
        const row = rows.find((r) => r.slug === next);
        if (row) applyTemplate(row);
        return next;
      });
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load outgoing emails', 'error');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [applyTemplate, onShowToast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onRefresh = (event) => {
      if (event.detail === 'outgoing') void load();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  const handleSlugChange = (nextSlug) => {
    setSlug(nextSlug);
    const row = templates.find((t) => t.slug === nextSlug);
    applyTemplate(row);
  };

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

  const handleSave = async () => {
    if (!slug) return;
    if (!subject.trim()) {
      onShowToast?.('Subject is required', 'error');
      return;
    }
    if (!introBody.trim() && !htmlBody.trim()) {
      onShowToast?.('Write a message body and/or HTML block', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveOutgoingTemplate(slug, {
        subject: subject.trim(),
        introText: introBody,
        htmlBlock: htmlBody,
      });
      await load();
      onShowToast?.('Email template saved', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!selected) return;
    if (!window.confirm('Reset editor to built-in default copy? Click Save to persist.')) return;
    setSubject(selected.defaultSubject || '');
    setIntroBody(selected.defaultIntroText || '');
    setHtmlBody(selected.defaultHtmlBlock || '');
  };

  const handleTestSend = async () => {
    if (!slug) return;
    const testEmail = adminEmail || window.prompt('Send test to email address:');
    if (!testEmail?.trim()) return;
    setTestSending(true);
    try {
      await sendOutgoingTest(slug, {
        testEmail: testEmail.trim(),
        subject: subject.trim(),
        introText: introBody,
        htmlBlock: htmlBody,
      });
      onShowToast?.(`Test email sent to ${testEmail.trim()}`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Test send failed', 'error');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title"><Mail size={20} style={{ verticalAlign: -4, marginRight: 8 }} />Outgoing emails</h2>
          <p className="adm-section-note">
            Edit automated emails sent by the system — trade signup, approval, and admin password reset.
            Footer links to proto.co.za on all sends.
          </p>
        </div>
        {loading && <Loader2 size={18} className="spin" aria-label="Loading" />}
      </div>

      <div className="adm-email-modal__body" style={{ maxWidth: 960 }}>
        <label className="adm-email-field">
          <span className="adm-email-field__label">Email type</span>
          <select
            className="adm-field-input adm-select--enhanced"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            disabled={loading || !templates.length}
          >
            {templates.map((row) => (
              <option key={row.slug} value={row.slug}>
                {row.label}{row.isCustomized ? ' (custom)' : ''}
              </option>
            ))}
          </select>
          {selected && (
            <span className="adm-email-field__hint">{selected.trigger}</span>
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
            disabled={!slug}
          />
          <MergeTagBar tags={selected?.mergeTags} onInsert={insertMergeTag} />
        </div>

        <div className="adm-email-field adm-email-field--intro">
          <span className="adm-email-field__label">Message body</span>
          <textarea
            ref={introRef}
            className="adm-field-input adm-email-modal__textarea"
            rows={8}
            value={introBody}
            onChange={(e) => setIntroBody(e.target.value)}
            onFocus={() => { activeFieldRef.current = 'intro'; }}
            disabled={!slug}
            spellCheck
          />
          <span className="adm-email-field__hint">Plain text intro. Blank lines start new paragraphs.</span>
          <MergeTagBar tags={selected?.mergeTags} onInsert={insertMergeTag} />
        </div>

        {selected?.hasHtmlBlock && (
          <div className="adm-email-field">
            <span className="adm-email-field__label">
              <Code2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              HTML block
            </span>
            <textarea
              ref={htmlRef}
              className="adm-field-input adm-email-modal__textarea adm-email-modal__textarea--html"
              rows={6}
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              onFocus={() => { activeFieldRef.current = 'html'; }}
              disabled={!slug}
              spellCheck={false}
            />
            <MergeTagBar tags={selected?.mergeTags} onInsert={insertMergeTag} />
          </div>
        )}

        <div className="adm-email-field">
          <span className="adm-email-field__label">Preview</span>
          <div className="adm-email-preview adm-email-preview--full">
            <div className="adm-email-preview__chrome">
              <div className="adm-email-preview__chrome-row">
                <span className="adm-email-preview__chrome-label">Subject</span>
                <span className="adm-email-preview__chrome-value adm-email-preview__chrome-value--subject">
                  {previewSubject}
                </span>
              </div>
            </div>
            <iframe
              title="Outgoing email preview"
              className="adm-email-preview__iframe"
              srcDoc={fullPreviewDoc}
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            type="button"
            className="adm-btn-red"
            onClick={() => void handleSave()}
            disabled={!slug || saving || loading}
          >
            {saving ? <><Loader2 size={14} className="spin" /> Saving…</> : <><Save size={14} /> Save template</>}
          </button>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={() => void handleTestSend()}
            disabled={!slug || testSending || loading}
          >
            {testSending ? <><Loader2 size={14} className="spin" /> Sending test…</> : 'Send test'}
          </button>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={handleReset}
            disabled={!slug || loading}
            title="Load default copy into the editor (click Save to persist)"
          >
            <RotateCcw size={14} /> Reset to default
          </button>
        </div>
      </div>
    </div>
  );
}
