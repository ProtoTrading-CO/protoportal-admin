/**
 * Additional category placements for a product.
 *
 * The primary category still lives on the product itself and is edited the
 * usual way; these are the EXTRA locations it also appears under. window.fetch
 * is patched in adminKey.js to attach the admin JWT, so plain fetch is enough.
 */

async function readJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Placement request failed');
  return json;
}

export async function fetchPlacements(websiteSku) {
  const sku = String(websiteSku || '').trim();
  if (!sku) return { primaryPath: [], placements: [] };
  const res = await fetch(`/api/product-placements?websiteSku=${encodeURIComponent(sku)}`, {
    cache: 'no-store',
  });
  const json = await readJson(res);
  return {
    primaryPath: Array.isArray(json.primaryPath) ? json.primaryPath : [],
    placements: Array.isArray(json.placements) ? json.placements : [],
  };
}

export async function addPlacement(websiteSku, nodePath) {
  const res = await fetch('/api/product-placements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteSku, nodePath }),
  });
  const json = await readJson(res);
  return Array.isArray(json.placements) ? json.placements : [];
}

export async function removePlacement(websiteSku, { id, nodePath } = {}) {
  const res = await fetch('/api/product-placements', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteSku, id, nodePath }),
  });
  const json = await readJson(res);
  return Array.isArray(json.placements) ? json.placements : [];
}

/** Human-readable trail for a placement, falling back to raw ids when orphaned. */
export function placementTrail(placement) {
  if (placement?.labels?.length) return placement.labels.join(' › ');
  const path = placement?.nodePath || [];
  return path.map((id) => String(id).replace(/-/g, ' ')).join(' › ');
}
