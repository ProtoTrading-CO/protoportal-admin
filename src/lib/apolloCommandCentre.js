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
    roleLabel: 'Operational',
    modules: ['Timeline', 'Tasks', 'Files', 'Commitments', 'Conversation', 'Apollo'],
  },
  {
    id: 'customers',
    label: 'Customers',
    objectTitle: 'Customer Workspace',
    emoji: '👥',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    roleLabel: null,
    modules: ['History', 'Knowledge', 'Orders', 'Quotes', 'Payments', 'Conversation'],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    objectTitle: 'Supplier Workspace',
    emoji: '🚚',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    roleLabel: null,
    modules: ['Reliability', 'Lead Times', 'Purchase Orders', 'Containers', 'Knowledge', 'Conversation'],
  },
  {
    id: 'containers',
    label: 'Containers',
    objectTitle: 'Container Workspace',
    emoji: '🚢',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    roleLabel: null,
    modules: ['Tracking', 'Arrivals', 'Allocations', 'Documents'],
  },
  {
    id: 'buying',
    label: 'Buying',
    objectTitle: 'Buying Workspace',
    emoji: '📈',
    featured: false,
    status: 'planning',
    statusLabel: 'Planning',
    roleLabel: null,
    modules: ['Stock cover', 'Quotes', 'Replenishment', 'Lessons'],
  },
];

/** @deprecated Use APOLLO_WORK_OBJECTS */
export const APOLLO_WORKSPACES = APOLLO_WORK_OBJECTS;

export function workObjectById(id) {
  return APOLLO_WORK_OBJECTS.find((row) => row.id === id) || null;
}

/** @deprecated Use workObjectById */
export const workspaceById = workObjectById;

export function isWorkObjectReady(id) {
  return workObjectById(id)?.status === 'ready';
}

/** @deprecated Use isWorkObjectReady */
export const isWorkspaceLive = isWorkObjectReady;
