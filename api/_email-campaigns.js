import { randomUUID } from 'crypto';
import { readSiteConfigJson } from './_site-config.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';

export const CAMPAIGNS_FILE = 'email-campaigns.json';
const EMPTY_STORE = { campaigns: [] };

export async function appendEmailCampaign(entry) {
  return mutateSiteConfigJson(CAMPAIGNS_FILE, EMPTY_STORE, (store) => {
    const campaigns = Array.isArray(store?.campaigns) ? [...store.campaigns] : [];
    campaigns.unshift({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry,
    });
    return { store: { campaigns } };
  });
}

export async function recordEmailWebhookEvent({ messageId, event, email, meta = {} }) {
  if (!messageId || !event) return null;
  return mutateSiteConfigJson(CAMPAIGNS_FILE, EMPTY_STORE, (store) => {
    const campaigns = Array.isArray(store?.campaigns) ? store.campaigns.map((c) => ({ ...c })) : [];
    let matched = false;
    for (const campaign of campaigns) {
      const ids = campaign.messageIds || [];
      if (!ids.includes(messageId)) continue;
      matched = true;
      campaign.events = campaign.events || {};
      const key = normalizeEventKey(event);
      campaign.events[key] = (campaign.events[key] || 0) + 1;
      campaign.lastEventAt = new Date().toISOString();
      if (email && !campaign.eventEmails) campaign.eventEmails = {};
      if (email) {
        campaign.eventEmails[key] = campaign.eventEmails[key] || [];
        if (!campaign.eventEmails[key].includes(email)) campaign.eventEmails[key].push(email);
      }
      if (meta.subject && !campaign.subject) campaign.subject = meta.subject;
    }
    if (!matched) return { abort: true };
    return { store: { campaigns } };
  });
}

function normalizeEventKey(event) {
  const raw = String(event || '').trim().toLowerCase();
  if (raw.includes('deliver')) return 'delivered';
  if (raw.includes('open')) return 'opened';
  if (raw.includes('click')) return 'clicked';
  if (raw.includes('bounce')) return 'bounced';
  if (raw.includes('spam') || raw.includes('complaint')) return 'complained';
  if (raw.includes('unsub')) return 'unsubscribed';
  return raw || 'unknown';
}

export async function readEmailCampaigns() {
  const store = await readSiteConfigJson(CAMPAIGNS_FILE, EMPTY_STORE);
  return Array.isArray(store?.campaigns) ? store.campaigns : [];
}
