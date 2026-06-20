import { requireCronOrAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

function getMainClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function brevoFetch(path, { params = {} } = {}) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY not configured');
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.brevo.com/v3${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: { 'api-key': key, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Brevo ${res.status}`);
  return json;
}

/** Background sync — curated Brevo subset into crm_contacts. Cron: every 15 min. */
export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'BREVO_API_KEY not configured' });

  try {
    const sb = getMainClient();
    const syncedAt = new Date().toISOString();

    let campaignSummary = { name: null, sentAt: null, openRate: null, clickRate: null };
    try {
      const campaigns = await brevoFetch('/emailCampaigns', { params: { limit: '5', sort: 'desc' } });
      const latest = campaigns?.campaigns?.[0];
      if (latest) {
        campaignSummary = {
          name: latest.name || null,
          sentAt: latest.sentDate || latest.scheduledAt || null,
          openRate: latest.statistics?.globalStats?.uniqueOpens ?? null,
          clickRate: latest.statistics?.globalStats?.uniqueClicks ?? null,
        };
      }
    } catch (err) {
      console.warn('brevo-sync campaigns:', err.message);
    }

    const listPayload = await brevoFetch('/contacts/lists', { params: { limit: '50' } });
    const listMap = new Map((listPayload?.lists || []).map((l) => [l.id, l.name]));

    let offset = 0;
    const limit = 500;
    let upserted = 0;

    while (true) {
      const batch = await brevoFetch('/contacts', { params: { limit: String(limit), offset: String(offset) } });
      const contacts = batch?.contacts || [];
      if (!contacts.length) break;

      const rows = contacts
        .map((c) => {
          const email = String(c.email || '').trim().toLowerCase();
          if (!email) return null;
          const listIds = c.listIds || [];
          const listNames = listIds.map((id) => listMap.get(id)).filter(Boolean);
          const attrs = c.attributes || {};
          return {
            brevo_id: c.id,
            email,
            name: [attrs.FIRSTNAME, attrs.LASTNAME].filter(Boolean).join(' ') || attrs.FNAME || null,
            list_ids: listIds,
            list_names: listNames,
            last_campaign_name: campaignSummary.name,
            last_sent_at: campaignSummary.sentAt,
            last_open_at: null,
            last_click_at: null,
            synced_at: syncedAt,
          };
        })
        .filter(Boolean);

      if (!rows.length) {
        if (contacts.length < limit) break;
        offset += limit;
        if (offset >= 5000) break;
        continue;
      }

      const { error } = await sb.from('crm_contacts').upsert(rows, { onConflict: 'brevo_id' });
      if (error) throw error;
      upserted += rows.length;
      if (contacts.length < limit) break;
      offset += limit;
      if (offset >= 5000) break;
    }

    return res.status(200).json({
      ok: true,
      upserted,
      syncedAt,
      campaign: campaignSummary,
    });
  } catch (err) {
    console.error('brevo-sync:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Brevo sync failed' });
  }
}
