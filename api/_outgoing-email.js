import { readSiteConfigJson } from './_site-config.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import { buildComposedEmail, sendBrevoTransactional } from './_brevo-email.js';
import {
  OUTGOING_SLUGS,
  getOutgoingDefaults,
  getOutgoingMeta,
  isOutgoingSlug,
} from '../lib/outgoing-emails.mjs';

export const OUTGOING_STORE_FILE = 'outgoing-emails.json';
const EMPTY_STORE = { templates: {} };

const LIMITS = { subject: 200, introText: 8000, htmlBlock: 16000 };

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

export function mergeOutgoingTemplate(slug, override = {}) {
  const defaults = getOutgoingDefaults(slug);
  if (!defaults) throw new Error(`Unknown outgoing email: ${slug}`);
  return {
    subject: clip(override.subject ?? defaults.subject, LIMITS.subject),
    introText: clip(override.introText ?? defaults.introText, LIMITS.introText),
    htmlBlock: clip(override.htmlBlock ?? defaults.htmlBlock ?? '', LIMITS.htmlBlock),
  };
}

export async function readOutgoingOverrides() {
  const store = await readSiteConfigJson(OUTGOING_STORE_FILE, EMPTY_STORE);
  return store?.templates && typeof store.templates === 'object' ? store.templates : {};
}

export async function loadOutgoingTemplate(slug) {
  if (!isOutgoingSlug(slug)) throw new Error(`Unknown outgoing email: ${slug}`);
  const overrides = await readOutgoingOverrides();
  return mergeOutgoingTemplate(slug, overrides[slug] || {});
}

export async function saveOutgoingTemplate(slug, patch) {
  if (!isOutgoingSlug(slug)) throw new Error(`Unknown outgoing email: ${slug}`);
  const subject = clip(patch.subject, LIMITS.subject).trim();
  const introText = clip(patch.introText, LIMITS.introText);
  const htmlBlock = clip(patch.htmlBlock, LIMITS.htmlBlock);
  if (!subject) throw new Error('Subject is required');
  if (!introText.trim() && !htmlBlock.trim()) {
    throw new Error('Message body or HTML block is required');
  }

  await mutateSiteConfigJson(OUTGOING_STORE_FILE, EMPTY_STORE, (store) => {
    const templates = { ...(store?.templates || {}) };
    templates[slug] = {
      subject,
      introText,
      htmlBlock,
      updatedAt: new Date().toISOString(),
    };
    return { store: { templates } };
  });

  return loadOutgoingTemplate(slug);
}

export async function sendOutgoing(slug, { to, vars = {}, templateOverride = null } = {}) {
  if (!to?.email) throw new Error('Recipient email is required');
  const template = templateOverride || await loadOutgoingTemplate(slug);
  const composed = buildComposedEmail(template, vars);
  await sendBrevoTransactional({
    to: { email: to.email, name: to.name || to.email },
    subject: composed.subject,
    htmlContent: composed.htmlContent,
    textContent: composed.textContent,
  });
  return { ok: true, slug };
}

export function buildOutgoingList(overrides = {}) {
  return OUTGOING_SLUGS.map((slug) => {
    const meta = getOutgoingMeta(slug);
    const merged = mergeOutgoingTemplate(slug, overrides[slug] || {});
    const defaults = meta.defaults;
    const override = overrides[slug] || {};
    const isCustomized = Boolean(
      override.subject !== undefined
      || override.introText !== undefined
      || override.htmlBlock !== undefined,
    );
    return {
      slug,
      label: meta.label,
      trigger: meta.trigger,
      mergeTags: meta.mergeTags,
      previewVars: meta.previewVars,
      subject: merged.subject,
      introText: merged.introText,
      htmlBlock: merged.htmlBlock,
      isCustomized,
      defaultSubject: defaults.subject,
      defaultIntroText: defaults.introText,
      defaultHtmlBlock: defaults.htmlBlock || '',
    };
  });
}
