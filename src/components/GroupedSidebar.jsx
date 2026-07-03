import {
  BarChart2,
  Bot,
  DollarSign,
  Grip,
  Layout,
  Mail,
  MessageCircle,
  PackagePlus,
  ScanLine,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  User,
  Users,
} from 'lucide-react';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { buildCatalogParams } from '../hooks/useCatalog';

const NAV_ITEMS = [
  { id: 'orders', label: 'Order Requests', icon: ShoppingBag },
  { id: 'product-loader', label: 'Product Loader', icon: ScanLine },
  { id: 'apollo', label: 'Apollo', icon: Bot },
  { id: 'cost-tracking', label: 'Cost Tracking', icon: DollarSign },
  { id: 'catalogue', label: 'Product Manager', icon: PackagePlus },
  { id: 'reorder', label: 'Reorder Grid', icon: Grip },
  { id: 'customers', label: 'Customer Management', icon: Users },
  { id: 'specials', label: 'Specials', icon: Star },
  { id: 'brevo', label: 'Brevo CRM', icon: Mail },
  { id: 'crm', label: 'WhatsApp', icon: MessageCircle },
  { id: 'banner', label: 'Banner Editor', icon: Layout },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'pricing', label: 'Pricing', icon: SlidersHorizontal },
  { id: 'team', label: 'Team', icon: User },
];

// Warm the JS chunk for lazy panels on hover/focus so the click-through is
// instant. Vite dedups the import() call with the React.lazy() call in
// AdminPage, so the chunk is fetched once per session.
const CHUNK_PREFETCH = {
  pricing: () => import('./PricingPanel'),
  reorder: () => import('./ReorderPanel'),
};

function prefetchSection(sectionId) {
  if (sectionId === 'catalogue' || sectionId === 'reorder') {
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
  const chunkLoader = CHUNK_PREFETCH[sectionId];
  if (chunkLoader) chunkLoader().catch(() => { /* best-effort */ });
}

export default function GroupedSidebar({
  activeSection,
  onSelectSection,
  pendingCount = 0,
}) {
  return (
    <nav aria-label="Admin sections">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectSection(item.id)}
            onMouseEnter={() => prefetchSection(item.id)}
            onFocus={() => prefetchSection(item.id)}
            className={`adm-nav-btn${active ? ' adm-nav-btn--active' : ''}`}
          >
            <Icon size={17} />
            {item.label}
            {item.id === 'customers' && pendingCount > 0 && (
              <span className="adm-nav-badge">{pendingCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export { NAV_ITEMS as NAV_GROUPS };
