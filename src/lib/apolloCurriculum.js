/**
 * Apollo Curriculum report card — mirrors docs/APOLLO_CURRICULUM.md
 * For teachers in the admin Apollo panel (read-only).
 */

export const CURRICULUM_STATUS = {
  graduated: { label: 'Graduated', emoji: '🟢' },
  learning: { label: 'Learning', emoji: '🟡' },
  not_started: { label: 'Not started', emoji: '⚪' },
};

/** @type {Array<{ id: string, name: string, status: keyof typeof CURRICULUM_STATUS, graduation?: string }>} */
export const APOLLO_CURRICULUM_ROWS = [
  { id: '1.1', name: 'Live Product Truth', status: 'graduated', graduation: 'Graduated (LAN)' },
  { id: '1.1A', name: 'Intent-first Routing', status: 'graduated', graduation: 'Graduated' },
  { id: '1.2', name: 'Product Profitability', status: 'not_started' },
  { id: '1.3', name: 'Sales Intelligence', status: 'not_started' },
  { id: '1.4', name: 'Product Behaviour', status: 'not_started' },
  { id: '1.5', name: 'Product Judgement', status: 'not_started' },
];

export const APOLLO_MATURITY = [
  { level: 'Aware', pct: 100 },
  { level: 'Understanding', pct: 40 },
  { level: 'Judgement', pct: 10 },
  { level: 'Wisdom', pct: 0 },
];

export const SPRINT_QUESTION =
  'What business question can Apollo answer after this sprint that it couldn\'t answer before?';
