import { useState } from 'react';
import {
  BarChart2,
  Bot,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Layout,
  MessageCircle,
  PackagePlus,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  User,
  Users,
} from 'lucide-react';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { buildCatalogParams } from '../hooks/useCatalog';

const NAV_GROUPS = [
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [{ id: 'catalogue', label: 'Product Manager', icon: PackagePlus }],
  },
  {
    id: 'merchandising',
    label: 'Merchandising',
    items: [
      { id: 'specials', label: 'Specials', icon: Star },
      { id: 'banner', label: 'Banner Editor', icon: Layout },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { id: 'customers', label: 'Customer Management', icon: Users },
      { id: 'crm', label: 'WhatsApp', icon: MessageCircle },
      { id: 'brevo-crm', label: 'CRM', icon: Users },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    items: [{ id: 'orders', label: 'Order Requests', icon: ShoppingBag }],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart2 },
      { id: 'cost-tracking', label: 'Cost Tracking', icon: DollarSign },
    ],
  },
  {
    id: 'assistant',
    label: 'Assistant',
    items: [{ id: 'apollo', label: 'Apollo', icon: Bot }],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { id: 'pricing', label: 'Pricing', icon: SlidersHorizontal },
      { id: 'team', label: 'Team', icon: User },
    ],
  },
];

function prefetchSection(sectionId) {
  if (sectionId === 'catalogue') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.catalog(buildCatalogParams({ status: 'live', page: 1 })),
      queryFn: async () => {
        const qs = new URLSearchParams({ status: 'live', page: '1', pageSize: '50', sort: 'title' });
        const res = await fetch(`/api/catalog?${qs}`);
        return res.json();
      },
    });
  }
  if (sectionId === 'catalogue' || sectionId === 'orders') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.dashboardStats(),
      queryFn: async () => {
        const res = await fetch('/api/dashboard-stats');
        return res.json();
      },
    });
  }
}

export default function GroupedSidebar({
  activeSection,
  onSelectSection,
  pendingCount = 0,
}) {
  const [openGroups, setOpenGroups] = useState(() => new Set(NAV_GROUPS.map((g) => g.id)));

  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <nav className="adm-nav-grouped" aria-label="Admin sections">
      {NAV_GROUPS.map((group) => {
        const isOpen = openGroups.has(group.id);
        const hasActive = group.items.some((i) => i.id === activeSection);
        return (
          <div key={group.id} className={`adm-nav-group${hasActive ? ' adm-nav-group--active' : ''}`}>
            <button
              type="button"
              className="adm-nav-group-head"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{group.label}</span>
            </button>
            {isOpen && (
              <ul className="adm-nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`adm-nav-item${active ? ' adm-nav-item--active' : ''}`}
                        onClick={() => onSelectSection(item.id)}
                        onMouseEnter={() => prefetchSection(item.id)}
                        onFocus={() => prefetchSection(item.id)}
                      >
                        <Icon size={16} />
                        <span>{item.label}</span>
                        {item.id === 'customers' && pendingCount > 0 && (
                          <span className="adm-nav-badge">{pendingCount}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export { NAV_GROUPS };
