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
  revertOutgoingTemplate,
  saveOutgoingTemplate,
  sendOutgoingTest,
} from '../lib/outgoingEmails';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';
import useDebouncedValue from '../hooks/useDebouncedValue';

const ORDER_PREVIEW_NOTE = 'Sample order line items, customer details, and PDF attachment appear below your intro on live send.';

const EMPTY_BASELINE = { slug: '', subject: '', introText: '', htmlBlock: '' };

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
  const [htmlPane, setHtmlPane] = useState('split');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [baseline, setBaseline] = useState(EMPTY_BASELINE);

  const subjectRef = useRef(null);
  const introRef = useRef(null);
  const htmlRef = useRef(null);
  const activeFieldRef = useRef('intro');

  const selected = useMemo(
    () => templates.find((t) => t.slug === slug) || null,
    [templates, slug],
  );

  const isDirty = useMemo(() => {
    if (!slug || baseline.slug !== slug) return false;
    return (
      subject !== baseline.subject
      || introBody !== baseline.introText
      || htmlBody !== baseline.htmlBlock
    );
  }, [slug, subject, introBody, htmlBody, baseline]);

  const previewVars = selected?.previewVars || {};
  const debouncedIntro = useDebouncedValue(introBody, 300);
  const debouncedHtml = useDebouncedValue(htmlBody, 300);

  const previewSubject = useMemo(
    () => applyMergeTags(subject.trim() || 'Subject line', previewVars),
    [subject, previewVars],
  );

  const previewBodyHtml = useMemo(() => {
    const intro = buildEmailBodyHtml({ introText: debouncedIntro, htmlBlock: debouncedHtml }, previewVars);
    if (selected?.previewLayout === 'order') {
      const sampleBlock = `<div style="margin-top:16px;padding:14px 16px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;line-height:1.55">${ORDER_PREVIEW_NOTE}</div>`;
      return (intro || '<p style="color:#9ca3af;margin:0;">Write an intro to preview.</p>') + sampleBlock;
    }
    return intro || '<p style="color:#9ca3af;margin:0;">Write a plain intro and/or HTML below to preview.</p>';
  }, [debouncedIntro, debouncedHtml, previewVars, selected?.previewLayout]);

  const fullPreviewDoc = useMemo(() => {
    if (selected?.previewLayout === 'order') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${previewSubject}</title></head><body style="font-family:Arial,sans-serif;padding:16px;max-width:640px;margin:0 auto;color:#111827;line-height:1.55">${previewBodyHtml}</body></html>`;
    }
    return wrapBroadcastHtml({
      subject: previewSubject,
      bodyHtml: previewBodyHtml,
      websiteUrl: PROTO_URLS.website,
    });
  }, [previewSubject, previewBodyHtml, selected?.previewLayout]);

  const applyTemplate = useCallback((row) => {
    if (!row) return;
    const nextSubject = row.subject || '';
    const nextIntro = row.introText || '';
    const nextHtml = row.htmlBlock || '';
    setSubject(nextSubject);
    setIntroBody(nextIntro);
    setHtmlBody(nextHtml);
    setHtmlPane('split');
    setBaseline({
      slug: row.slug,
      subject: nextSubject,
      introText: nextIntro,
      htmlBlock: nextHtml,
    });
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

  const confirmDiscard = () => {
    if (!isDirty) return true;
    return window.confirm('Discard unsaved changes to this template?');
  };

  const handleSlugChange = (nextSlug) => {
    if (nextSlug === slug) return;
    if (!confirmDiscard()) return;
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
      const msg = err.status === 409
        ? 'Someone else saved this template — reload and try again'
        : (err.message || 'Save failed');
      onShowToast?.(msg, 'error');
      if (err.status === 409) await load();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected || !slug) return;
    if (!window.confirm('Remove your custom copy and restore built-in defaults? This cannot be undone.')) return;
    setSaving(true);
    try {
      await revertOutgoingTemplate(slug);
      await load();
      onShowToast?.('Template restored to default', 'success');
    } catch (err) {
      const msg = err.status === 409
        ? 'Someone else updated templates — reload and try again'
        : (err.message || 'Revert failed');
      onShowToast?.(msg, 'error');
      if (err.status === 409) await load();
    } finally {
      setSaving(false);
    }
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

  const showHtmlEditor = htmlPane !== 'preview';
  const showHtmlPreview = htmlPane !== 'code';

  return (
    <div className="adm-panel adm-outgoing-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title"><Mail size={20} style={{ verticalAlign: -4, marginRight: 8 }} />Outgoing emails</h2>
          <p className="adm-section-note">
            Edit automated system emails. Use plain text for a simple intro, HTML for full layout, or HTML only (leave intro blank).
            Footer links to proto.co.za on all sends.
            {isDirty && <span style={{ display: 'block', marginTop: 4, color: '#b45309' }}>Unsaved changes</span>}
          </p>
        </div>
        {loading && <Loader2 size={18} className="spin" aria-label="Loading" />}
      </div>

      <div className="adm-email-modal__body adm-outgoing-editor">
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
            <>
              <span className="adm-email-field__hint">{selected.trigger}</span>
              {selected.systemNote && (
                <span className="adm-email-field__hint">{selected.systemNote}</span>
              )}
            </>
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
          <span className="adm-email-field__label">Plain text intro (optional)</span>
          <textarea
            ref={introRef}
            className="adm-field-input adm-email-modal__textarea"
            rows={5}
            value={introBody}
            onChange={(e) => setIntroBody(e.target.value)}
            onFocus={() => { activeFieldRef.current = 'intro'; }}
            disabled={!slug}
            placeholder={'Hi {{name}},\n\nOptional intro shown above your HTML…'}
            spellCheck
          />
          <span className="adm-email-field__hint">Blank lines start new paragraphs. Leave empty to send HTML only.</span>
          <MergeTagBar tags={selected?.mergeTags} onInsert={insertMergeTag} />
        </div>

        <div className="adm-email-field">
          <div className="adm-email-field__row">
            <span className="adm-email-field__label">
              <Code2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              HTML body
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
                  rows={14}
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  onFocus={() => { activeFieldRef.current = 'html'; }}
                  disabled={!slug}
                  placeholder={'<p>Hi {{name}},</p>\n<p>Your full HTML email can go here.</p>'}
                  spellCheck={false}
                />
                <MergeTagBar tags={selected?.mergeTags} onInsert={insertMergeTag} />
              </div>
            )}
            {showHtmlPreview && (
              <div className="adm-email-split__preview">
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
                <span className="adm-email-field__hint">
                  Preview uses sample data (e.g. Jane Smith). Live sends use each recipient&apos;s real fields.
                  Test emails are prefixed with [TEST].
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            type="button"
            className="adm-btn-red"
            onClick={() => void handleSave()}
            disabled={!slug || saving || loading || !isDirty}
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
            onClick={() => void handleReset()}
            disabled={!slug || saving || loading || !selected?.isCustomized}
            title="Remove custom copy and restore built-in defaults"
          >
            <RotateCcw size={14} /> Reset to default
          </button>
        </div>
      </div>
    </div>
  );
}
