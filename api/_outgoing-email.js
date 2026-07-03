import { getPortalAdminClient, SITE_CONFIG_BUCKET } from './_site-config.js';
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
const CACHE_TTL_MS = 60_000;

const LIMITS = { subject: 200, introText: 8000, htmlBlock: 16000 };

/** In-process overrides cache — invalidated on save/delete. */
let overridesCache = { templates: null, fetchedAt: 0 };

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

export function invalidateOutgoingCache() {
  overridesCache = { templates: null, fetchedAt: 0 };
}

export function isOutgoingConflictError(err) {
  return /Concurrent update conflict/i.test(String(err?.message || ''));
}

async function readOutgoingOverridesFromStorage() {
  try {
    const supabase = getPortalAdminClient();
    const { data, error } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(OUTGOING_STORE_FILE);
    if (error) {
      const notFound = /not found|object not found/i.test(String(error.message || ''));
      if (notFound) return { templates: {}, ok: true };
      console.warn('readOutgoingOverrides: storage error', error.message || error);
      return { templates: null, ok: false };
    }
    const text = await data.text();
    if (!String(text || '').trim()) return { templates: {}, ok: true };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn('readOutgoingOverrides: invalid JSON');
      return { templates: null, ok: false };
    }
    const templates = parsed?.templates && typeof parsed.templates === 'object'
      ? parsed.templates
      : {};
    return { templates, ok: true };
  } catch (err) {
    console.warn('readOutgoingOverrides:', err?.message || err);
    return { templates: null, ok: false };
  }
}

async function getOutgoingOverrides() {
  const now = Date.now();
  if (overridesCache.templates !== null && (now - overridesCache.fetchedAt) < CACHE_TTL_MS) {
    return overridesCache.templates;
  }

  const { templates, ok } = await readOutgoingOverridesFromStorage();
  if (ok && templates !== null) {
    overridesCache = { templates, fetchedAt: now };
    return templates;
  }

  if (overridesCache.templates !== null) {
    console.warn('outgoing-emails: storage read failed, using cached overrides');
    return overridesCache.templates;
  }

  console.warn('outgoing-emails: storage read failed, using code defaults');
  return {};
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
  return getOutgoingOverrides();
}

export async function loadOutgoingTemplate(slug) {
  if (!isOutgoingSlug(slug)) throw new Error(`Unknown outgoing email: ${slug}`);
  const overrides = await getOutgoingOverrides();
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

  invalidateOutgoingCache();
  return loadOutgoingTemplate(slug);
}

/** Remove stored override so live sends use code defaults again. */
export async function deleteOutgoingOverride(slug) {
  if (!isOutgoingSlug(slug)) throw new Error(`Unknown outgoing email: ${slug}`);

  await mutateSiteConfigJson(OUTGOING_STORE_FILE, EMPTY_STORE, (store) => {
    const templates = { ...(store?.templates || {}) };
    if (!templates[slug]) return { store: { templates } };
    delete templates[slug];
    return { store: { templates } };
  });

  invalidateOutgoingCache();
  return mergeOutgoingTemplate(slug, {});
}

export async function sendOutgoing(slug, { to, vars = {}, templateOverride = null, subjectPrefix = '' } = {}) {
  if (!to?.email) throw new Error('Recipient email is required');
  let template = templateOverride;
  if (!template) {
    try {
      template = await loadOutgoingTemplate(slug);
    } catch (err) {
      console.error(`sendOutgoing(${slug}): template load failed, using defaults`, err?.message || err);
      template = mergeOutgoingTemplate(slug, {});
    }
  }
  const composed = buildComposedEmail(template, vars);
  const subject = `${subjectPrefix}${composed.subject}`;
  await sendBrevoTransactional({
    to: { email: to.email, name: to.name || to.email },
    subject,
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
      previewLayout: meta.previewLayout || 'standard',
      systemNote: meta.systemNote || '',
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
