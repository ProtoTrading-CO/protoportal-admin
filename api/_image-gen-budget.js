/**
 * Image gen spend budgets — daily/monthly limits, email alerts, optional hard block.
 */

import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import { isMissingTableError } from './_image-gen-db-locks.js';

const ALERTS_FILE = 'image-gen/budget-alerts.json';
const WARN_PCT = 80;
const BLOCK_PCT = 100;
const USD_TO_ZAR_FALLBACK = 18.0;
let cachedFxRate = null;
let cachedFxAt = 0;

async function fetchUsdToZarRate() {
  const now = Date.now();
  if (cachedFxRate && (now - cachedFxAt) < 6 * 60 * 60 * 1000) return cachedFxRate;
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=ZAR');
    if (!response.ok) throw new Error(`FX ${response.status}`);
    const payload = await response.json();
    const rate = Number(payload?.rates?.ZAR);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid ZAR rate');
    cachedFxRate = rate;
    cachedFxAt = now;
    return rate;
  } catch {
    return cachedFxRate || USD_TO_ZAR_FALLBACK;
  }
}
const WARN_PCT = 80;
const BLOCK_PCT = 100;

function parsePositiveUsd(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getImageGenBudgetConfig() {
  const dailyUsd = parsePositiveUsd(process.env.IMAGE_GEN_BUDGET_DAILY_USD);
  const monthlyUsd = parsePositiveUsd(process.env.IMAGE_GEN_BUDGET_MONTHLY_USD);
  const alertEmail = String(process.env.IMAGE_GEN_ALERT_EMAIL || 'danieljoffeinfo@gmail.com').trim();
  const blockAtLimit = String(process.env.IMAGE_GEN_BUDGET_BLOCK || 'true').toLowerCase() !== 'false';
  return {
    dailyUsd,
    monthlyUsd,
    alertEmail,
    blockAtLimit,
    configured: Boolean(dailyUsd || monthlyUsd),
  };
}

function utcDayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function periodKey(period, d = new Date()) {
  if (period === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}

async function sumCostsFromDb(sb, sinceIso) {
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('image_gen_cost_logs')
      .select('cost_usd, status')
      .gte('created_at', sinceIso);
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    let usd = 0;
    for (const row of data || []) {
      if (row.status === 'error') continue;
      usd += Number(row.cost_usd) || 0;
    }
    return usd;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    console.warn('sumCostsFromDb:', err?.message || err);
    return null;
  }
}

async function sumCostsFromJson(sinceMs) {
  try {
    const store = await readSiteConfigJson('image-gen/cost-logs.json', { logs: [] });
    let usd = 0;
    for (const row of store.logs || []) {
      if (row.status === 'error') continue;
      const t = new Date(row.created_at || row.createdAt || 0).getTime();
      if (t >= sinceMs) usd += Number(row.cost_usd ?? row.costUsd ?? 0);
    }
    return usd;
  } catch {
    return 0;
  }
}

/** Spend totals for today and current UTC month (USD). */
export async function getImageGenSpendTotals(sb) {
  const now = new Date();
  const dayStart = utcDayStart(now);
  const monthStart = utcMonthStart(now);

  const [dayDb, monthDb] = await Promise.all([
    sumCostsFromDb(sb, dayStart.toISOString()),
    sumCostsFromDb(sb, monthStart.toISOString()),
  ]);

  const dayUsd = dayDb != null
    ? dayDb
    : await sumCostsFromJson(dayStart.getTime());
  const monthUsd = monthDb != null
    ? monthDb
    : await sumCostsFromJson(monthStart.getTime());

  const usdToZar = await fetchUsdToZarRate();
  return {
    dayUsd: parseFloat(dayUsd.toFixed(6)),
    monthUsd: parseFloat(monthUsd.toFixed(6)),
    dayZar: parseFloat((dayUsd * usdToZar).toFixed(4)),
    monthZar: parseFloat((monthUsd * usdToZar).toFixed(4)),
    usdToZar,
    dayKey: periodKey('day', now),
    monthKey: periodKey('month', now),
    source: dayDb != null ? 'database' : 'json',
  };
}

function levelForPct(pct) {
  if (pct >= BLOCK_PCT) return 'exceeded';
  if (pct >= WARN_PCT) return 'warning';
  return 'ok';
}

function buildPeriodStatus(spent, limitUsd, period) {
  if (!limitUsd) {
    return { period, limitUsd: null, spentUsd: spent, pct: null, level: 'ok' };
  }
  const pct = Math.round((spent / limitUsd) * 1000) / 10;
  return {
    period,
    limitUsd,
    spentUsd: parseFloat(spent.toFixed(6)),
    pct,
    level: levelForPct(pct),
  };
}

export async function getImageGenBudgetStatus(sb) {
  const config = getImageGenBudgetConfig();
  const spend = await getImageGenSpendTotals(sb);
  const daily = buildPeriodStatus(spend.dayUsd, config.dailyUsd, 'daily');
  const monthly = buildPeriodStatus(spend.monthUsd, config.monthlyUsd, 'monthly');

  const worstLevel = [daily.level, monthly.level].includes('exceeded')
    ? 'exceeded'
    : [daily.level, monthly.level].includes('warning')
      ? 'warning'
      : 'ok';

  return {
    configured: config.configured,
    blockAtLimit: config.blockAtLimit,
    alertEmail: config.alertEmail,
    warnPct: WARN_PCT,
    spend,
    daily,
    monthly,
    level: worstLevel,
    blocked: config.blockAtLimit && worstLevel === 'exceeded' && config.configured,
  };
}

export function estimateImageGenBatchCostUsd({ jobCount = 0, slotPlans = null, defaultStyle = 'shadow' } = {}) {
  const PRO = 0.55;
  const FLASH = 0.04;
  let total = 0;
  let jobs = 0;

  if (slotPlans && typeof slotPlans === 'object') {
    for (const slot of [1, 2, 3, 4]) {
      const plan = slotPlans[slot];
      if (!plan?.enabled) continue;
      jobs += 1;
      const style = plan.style || defaultStyle;
      const usePro = slot === 1 || style === 'generative' || style === 'measurements';
      total += usePro ? PRO : FLASH;
    }
    return {
      perProductUsd: parseFloat(total.toFixed(4)),
      jobsPerProduct: jobs,
      estimatedBatchUsd: parseFloat((total * Math.max(0, Number(jobCount) || 0)).toFixed(4)),
    };
  }

  jobs = Math.max(0, Number(jobCount) || 0);
  total = jobs * PRO;
  return {
    perProductUsd: PRO,
    jobsPerProduct: 1,
    estimatedBatchUsd: parseFloat(total.toFixed(4)),
  };
}

async function readAlertState() {
  return readSiteConfigJson(ALERTS_FILE, { sent: {} });
}

async function markAlertSent(period, periodKeyVal, level) {
  const state = await readAlertState();
  const key = `${period}:${periodKeyVal}:${level}`;
  state.sent = state.sent || {};
  state.sent[key] = new Date().toISOString();
  await writeSiteConfigJson(ALERTS_FILE, state);
}

async function wasAlertSent(period, periodKeyVal, level) {
  const state = await readAlertState();
  const key = `${period}:${periodKeyVal}:${level}`;
  return Boolean(state.sent?.[key]);
}

async function sendBudgetEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !to) {
    console.warn('image-gen budget alert: BREVO_API_KEY or alert email missing');
    return false;
  }
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Proto Admin', email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    console.warn('image-gen budget email failed:', resp.status, txt.slice(0, 200));
    return false;
  }
  return true;
}

function formatUsd(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

async function maybeAlertPeriod(sb, { period, periodKeyVal, spent, limitUsd, config }) {
  if (!limitUsd) return null;
  const pct = (spent / limitUsd) * 100;
  const level = levelForPct(pct);
  if (level === 'ok') return null;
  if (await wasAlertSent(period, periodKeyVal, level)) return null;

  const label = period === 'daily' ? 'Daily' : 'Monthly';
  const subject = level === 'exceeded'
    ? `Proto image gen: ${label} budget exceeded (${Math.round(pct)}%)`
    : `Proto image gen: ${label} budget at ${Math.round(pct)}%`;

  const html = `
    <p><strong>${label} image generation budget</strong></p>
    <p>Spent: <strong>${formatUsd(spent)}</strong> of <strong>${formatUsd(limitUsd)}</strong> (${pct.toFixed(1)}%)</p>
    <p>Period: ${periodKeyVal} (UTC)</p>
    ${level === 'exceeded' && config.blockAtLimit
    ? '<p style="color:#991b1b"><strong>New image generation is blocked</strong> until the next period or you raise <code>IMAGE_GEN_BUDGET_DAILY_USD</code> / <code>IMAGE_GEN_BUDGET_MONTHLY_USD</code> in Vercel.</p>'
    : '<p>Consider pausing large Apollo batches until the period resets.</p>'}
    <p><a href="https://protoportal-admin.vercel.app">Open Cost Tracking in admin</a></p>
  `;

  const sent = await sendBudgetEmail({ to: config.alertEmail, subject, html });
  if (sent) await markAlertSent(period, periodKeyVal, level);
  return { period, level, pct, sent };
}

/** Fire deduped email alerts when thresholds crossed. */
export async function maybeSendImageGenBudgetAlerts(sb) {
  const config = getImageGenBudgetConfig();
  if (!config.configured || !config.alertEmail) return { alerts: [] };

  const spend = await getImageGenSpendTotals(sb);
  const alerts = [];

  if (config.dailyUsd) {
    const a = await maybeAlertPeriod(sb, {
      period: 'daily',
      periodKeyVal: spend.dayKey,
      spent: spend.dayUsd,
      limitUsd: config.dailyUsd,
      config,
    });
    if (a) alerts.push(a);
  }

  if (config.monthlyUsd) {
    const a = await maybeAlertPeriod(sb, {
      period: 'monthly',
      periodKeyVal: spend.monthKey,
      spent: spend.monthUsd,
      limitUsd: config.monthlyUsd,
      config,
    });
    if (a) alerts.push(a);
  }

  return { alerts, spend, config };
}

/** Throws when hard block is enabled and a limit is exceeded. */
export async function assertImageGenBudgetAllowsSpend(sb) {
  const status = await getImageGenBudgetStatus(sb);
  if (!status.blocked) return status;

  const parts = [];
  if (status.daily.level === 'exceeded' && status.daily.limitUsd) {
    parts.push(`daily ${formatUsd(status.daily.spentUsd)} / ${formatUsd(status.daily.limitUsd)}`);
  }
  if (status.monthly.level === 'exceeded' && status.monthly.limitUsd) {
    parts.push(`monthly ${formatUsd(status.monthly.spentUsd)} / ${formatUsd(status.monthly.limitUsd)}`);
  }

  const err = new Error(
    `Image generation budget exceeded (${parts.join('; ')}). `
    + 'Raise limits in Vercel or wait for the next period. See Cost Tracking in admin.',
  );
  err.code = 'IMAGE_GEN_BUDGET_EXCEEDED';
  err.budgetStatus = status;
  throw err;
}
