/** Apollo Command Centre — modes and work-object registry (presentation only). */

/** Three operational modes — attention, execution, memory. */
export const APOLLO_COMMAND_MODES = [
  { id: 'today', label: 'Today', emoji: '🏠', tagline: 'What deserves my attention?' },
  { id: 'work', label: 'Work', emoji: '📦', tagline: 'Now let me work on it.' },
  { id: 'knowledge', label: 'Knowledge', emoji: '🧠', tagline: 'What do we know?' },
];

export const APOLLO_COMMAND_DEFAULT_MODE = 'today';

/** @deprecated Use APOLLO_COMMAND_MODES */
export const APOLLO_COMMAND_NAV = APOLLO_COMMAND_MODES;

/** @deprecated Use APOLLO_COMMAND_DEFAULT_MODE */
export const APOLLO_COMMAND_DEFAULT_NAV = APOLLO_COMMAND_DEFAULT_MODE;

/** Status badges — what Apollo can be trusted with today. */
export const APOLLO_WORK_STATUS_BADGES = {
  ready: '🟢',
  planning: '🟡',
  future: '⚪',
};

/** Operational objects behind Work — not tabs, not dashboards. */
export const APOLLO_WORK_OBJECTS = [
  {
    id: 'orders',
    label: 'Orders',
    objectTitle: 'Orders',
    emoji: '📦',
    featured: true,
    status: 'ready',
    statusLabel: 'Ready',
    statusBadge: APOLLO_WORK_STATUS_BADGES.ready,
    roleLabel: 'Operational',
    summary: 'Manage customer orders, timelines, tasks and commitments.',
    modules: ['Timeline', 'Tasks', 'Files', 'Commitments', 'Conversation', 'Apollo'],
    openLabel: 'Open Orders',
  },
  {
    id: 'customers',
    label: 'Customers',
    objectTitle: 'Customer Workspace',
    emoji: '👥',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    statusBadge: APOLLO_WORK_STATUS_BADGES.planning,
    roleLabel: null,
    summary: null,
    modules: ['History', 'Knowledge', 'Orders', 'Quotes', 'Payments', 'Conversation'],
    openLabel: null,
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    objectTitle: 'Supplier Workspace',
    emoji: '🚚',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    statusBadge: APOLLO_WORK_STATUS_BADGES.planning,
    roleLabel: null,
    summary: null,
    modules: ['Reliability', 'Lead Times', 'Purchase Orders', 'Containers', 'Knowledge', 'Conversation'],
    openLabel: null,
  },
  {
    id: 'containers',
    label: 'Containers',
    objectTitle: 'Container Workspace',
    emoji: '🚢',
    featured: false,
    status: 'future',
    statusLabel: 'Future',
    statusBadge: APOLLO_WORK_STATUS_BADGES.future,
    roleLabel: null,
    summary: null,
    modules: ['Tracking', 'Arrivals', 'Allocations', 'Documents'],
    openLabel: null,
  },
  {
    id: 'buying',
    label: 'Buying',
    objectTitle: 'Buying Workspace',
    emoji: '📈',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    statusBadge: APOLLO_WORK_STATUS_BADGES.planning,
    roleLabel: null,
    summary: null,
    modules: ['Stock cover', 'Quotes', 'Replenishment', 'Lessons'],
    openLabel: null,
  },
];

/** @deprecated Use APOLLO_WORK_OBJECTS */
export const APOLLO_WORKSPACES = APOLLO_WORK_OBJECTS;

export function workObjectById(id) {
  return APOLLO_WORK_OBJECTS.find((row) => row.id === id) || null;
}

/** @deprecated Use workObjectById */
export const workspaceById = workObjectById;

/** Knowledge domains — stewardship areas inside Knowledge mode. */
export const APOLLO_KNOWLEDGE_DOMAINS = [
  {
    id: 'customer',
    label: 'Customer Knowledge',
    description: 'Preferences, promises and payment behaviour.',
    countType: 'verified',
    emptyCopy: 'No customer knowledge recorded.',
  },
  {
    id: 'supplier',
    label: 'Supplier Knowledge',
    description: 'Reliability, lead times and quality.',
    countType: 'verified',
    emptyCopy: 'No supplier knowledge recorded.',
  },
  {
    id: 'buying',
    label: 'Buying Knowledge',
    description: 'Seasonal lessons and reorder lessons.',
    countType: 'verified',
    emptyCopy: 'No buying knowledge recorded.',
  },
  {
    id: 'decision',
    label: 'Decision Knowledge',
    description: 'Recommendations, outcomes and lessons learned.',
    countType: 'verified',
    emptyCopy: 'No decision knowledge recorded.',
  },
  {
    id: 'operational',
    label: 'Operational State',
    description: 'Active commitments and temporary operational context.',
    countType: 'active',
    emptyCopy: 'No operational state recorded.',
  },
];

export function knowledgeDomainById(id) {
  return APOLLO_KNOWLEDGE_DOMAINS.find((row) => row.id === id) || null;
}

export function isWorkObjectReady(id) {
  return workObjectById(id)?.status === 'ready';
}

/** @deprecated Use isWorkObjectReady */
export const isWorkspaceLive = isWorkObjectReady;

/**
 * Apollo 3.0 UI is feature-complete.
 * No new UI components unless a real user needed them during daily operation.
 * Next work is operational capability (3.x), not visual redesign.
 */
export const APOLLO_3_FEATURE_COMPLETE = true;
