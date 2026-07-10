const BUSINESS_VALUE_SCORE = { high: 100, medium: 66, low: 33, none: 0 };
const DECISION_IMPACT = { action_taken: 3, escalated: 2, investigated: 1, no_action_taken: 0 };
const IMPACT_SCORE = { low: 1, medium: 2, high: 3, critical: 4 };

function isExceptionRow(row) {
  return row?.payload?.release === 'apollo-operational-v1.2'
    || String(row?.dedupe_key || '').startsWith('exception:');
}

function dayBounds(offsetDays = 0) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(start).getTime() && t < new Date(end).getTime();
}

function avg(nums) {
  const values = nums.filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

export function buildAuditSnapshot(item) {
  return {
    category: item.category,
    title: item.title,
    detail: item.detail,
    recommendation: item.recommendation,
    confidence: item.payload?.confidence ?? item.confidence ?? null,
    businessImpact: item.payload?.businessImpact || item.business_impact || null,
    evidence: item.payload?.evidence || item.evidence || [],
    capturedAt: new Date().toISOString(),
  };
}

export function calculateTrustScore(rows = []) {
  const reviewed = rows.filter((row) => row.feedback_status);
  if (!reviewed.length) return null;
  let score = 0;
  for (const row of reviewed) {
    if (row.feedback_status === 'useful') score += 1;
    if (row.feedback_status === 'false_positive') score -= 0.6;
    if (row.feedback_status === 'needs_threshold_adjustment') score -= 0.35;
    if (row.feedback_status === 'ignore_permanently') score -= 0.5;
  }
  const normalized = (score / reviewed.length) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function calculateBusinessValueScore(rows = []) {
  const rated = rows.filter((row) => row.business_value);
  if (!rated.length) return null;
  const total = rated.reduce((sum, row) => sum + (BUSINESS_VALUE_SCORE[row.business_value] || 0), 0);
  return Math.round(total / rated.length);
}

export function calculateUsefulRate(rows = []) {
  const reviewed = rows.filter((row) => row.feedback_status);
  if (!reviewed.length) return null;
  const useful = reviewed.filter((row) => row.feedback_status === 'useful').length;
  return Math.round((useful / reviewed.length) * 1000) / 10;
}

function detectorStats(rows = []) {
  const map = new Map();
  for (const row of rows.filter(isExceptionRow)) {
    const key = row.category || 'unknown';
    const current = map.get(key) || {
      type: key,
      triggered: 0,
      useful: 0,
      falsePositives: 0,
      decisionImpact: 0,
      confidence: [],
      businessImpact: [],
    };
    current.triggered += 1;
    if (row.feedback_status === 'useful') current.useful += 1;
    if (row.feedback_status === 'false_positive') current.falsePositives += 1;
    current.decisionImpact += DECISION_IMPACT[row.decision_outcome] || 0;
    if (Number.isFinite(Number(row.confidence))) current.confidence.push(Number(row.confidence));
    if (row.business_impact) current.businessImpact.push(IMPACT_SCORE[row.business_impact] || 0);
    map.set(key, current);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    averageConfidence: avg(entry.confidence),
    averageBusinessImpact: avg(entry.businessImpact),
    valueScore: entry.useful * 2 + entry.decisionImpact - entry.falsePositives,
  }));
}

export function buildRecommendation(report) {
  if (report.trustScore != null && report.trustScore >= 80
    && report.usefulRate != null && report.usefulRate >= 75
    && report.businessValueScore != null && report.businessValueScore >= 65) {
    return 'tag_release_1_2';
  }
  if (report.falsePositiveRate != null && report.falsePositiveRate > 25) return 'tune_thresholds';
  if (report.reviewedExceptions < 10) return 'extend_validation';
  return 'tune_thresholds';
}

export function buildDailyBriefScore({ todayRows = [], yesterdayRows = [] } = {}) {
  const todayExceptions = todayRows.filter(isExceptionRow);
  const yesterdayExceptions = yesterdayRows.filter(isExceptionRow);
  const yesterdayReviewed = yesterdayExceptions.filter((row) => row.feedback_status);

  return {
    notificationsGeneratedToday: todayRows.length,
    exceptionsGeneratedToday: todayExceptions.length,
    usefulExceptionsYesterday: yesterdayReviewed.filter((row) => row.feedback_status === 'useful').length,
    falsePositivesYesterday: yesterdayReviewed.filter((row) => row.feedback_status === 'false_positive').length,
    thresholdAdjustmentsYesterday: yesterdayReviewed.filter((row) => row.feedback_status === 'needs_threshold_adjustment').length,
    ignoredPermanentlyYesterday: yesterdayReviewed.filter((row) => row.feedback_status === 'ignore_permanently').length,
    usefulRate: calculateUsefulRate(yesterdayReviewed),
    trustScore: calculateTrustScore(yesterdayReviewed),
    businessValueScore: calculateBusinessValueScore(yesterdayReviewed),
  };
}

export function buildValidationReport(rows = [], { days = 7 } = {}) {
  const exceptionRows = rows.filter(isExceptionRow);
  const feedbackRows = exceptionRows.filter((row) => row.feedback_status);
  const falsePositiveCount = feedbackRows.filter((row) => row.feedback_status === 'false_positive').length;
  const usefulCount = feedbackRows.filter((row) => row.feedback_status === 'useful').length;
  const thresholdCount = feedbackRows.filter((row) => row.feedback_status === 'needs_threshold_adjustment').length;
  const ignoredCount = feedbackRows.filter((row) => row.feedback_status === 'ignore_permanently').length;
  const detectors = detectorStats(exceptionRows);
  const byType = exceptionRows.reduce((map, row) => {
    const key = row.category || 'unknown';
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  const trustScore = calculateTrustScore(feedbackRows);
  const businessValueScore = calculateBusinessValueScore(feedbackRows.filter((row) => row.business_value));
  const usefulRate = calculateUsefulRate(feedbackRows);

  const report = {
    periodDays: days,
    totalExceptions: exceptionRows.length,
    usefulExceptions: usefulCount,
    falsePositives: falsePositiveCount,
    needsThresholdAdjustment: thresholdCount,
    ignoredPermanently: ignoredCount,
    reviewedExceptions: feedbackRows.length,
    usefulRate,
    falsePositiveRate: feedbackRows.length ? Math.round((falsePositiveCount / feedbackRows.length) * 1000) / 10 : null,
    trustScore,
    businessValueScore,
    topRecurringExceptionTypes: Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count })),
    topValuableDetector: [...detectors].sort((a, b) => b.valueScore - a.valueScore)[0]?.type || null,
    topNoisyDetector: [...detectors].sort((a, b) => b.falsePositives - a.falsePositives || b.triggered - a.triggered)[0]?.type || null,
    detectorWithHighestDecisionImpact: [...detectors].sort((a, b) => b.decisionImpact - a.decisionImpact)[0]?.type || null,
    averageConfidenceByDetector: detectors.map((d) => ({ type: d.type, averageConfidence: d.averageConfidence })),
    averageBusinessImpactByDetector: detectors.map((d) => ({
      type: d.type,
      averageBusinessImpact: d.averageBusinessImpact == null ? null
        : d.averageBusinessImpact >= 3.5 ? 'critical'
          : d.averageBusinessImpact >= 2.5 ? 'high'
            : d.averageBusinessImpact >= 1.5 ? 'medium'
              : 'low',
    })),
    detectorActionSummary: detectors.map((d) => ({
      detector: d.type,
      triggered: d.triggered,
      actionTaken: exceptionRows.filter((row) => row.category === d.type && ['investigated', 'action_taken', 'escalated'].includes(row.decision_outcome)).length,
    })),
    recommendation: null,
  };
  report.recommendation = buildRecommendation(report);
  return report;
}

export function partitionRowsByDay(rows = []) {
  const today = dayBounds(0);
  const yesterday = dayBounds(-1);
  const todayRows = rows.filter((row) => inRange(row.detected_at || row.created_at, today.start, today.end));
  const yesterdayRows = rows.filter((row) => inRange(row.detected_at || row.created_at, yesterday.start, yesterday.end));
  return { todayRows, yesterdayRows };
}
