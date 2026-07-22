import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import CategoryPathSelect from './productLoader/CategoryPathSelect';
import { addPlacement, fetchPlacements, placementTrail, removePlacement } from '../lib/placements';
import { resolvePathLabels } from './CategorySidebar';

/**
 * View and edit the EXTRA categories a product appears under.
 *
 * The primary category is shown read-only for context — it is edited with the
 * normal category controls, and the API rejects adding a placement equal to it.
 */
export default function PlacementsEditor({ websiteSku, taxonomyTree = [] }) {
  const [placements, setPlacements] = useState([]);
  const [primaryPath, setPrimaryPath] = useState([]);
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!websiteSku) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchPlacements(websiteSku);
      setPlacements(data.placements);
      setPrimaryPath(data.primaryPath);
    } catch (err) {
      setError(err.message || 'Could not load placements');
    } finally {
      setLoading(false);
    }
  }, [websiteSku]);

  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    if (!draft.length || busy) return;
    setBusy(true);
    setError('');
    try {
      setPlacements(await addPlacement(websiteSku, draft));
      setDraft([]);
    } catch (err) {
      setError(err.message || 'Could not add that location');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (placement) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setPlacements(await removePlacement(websiteSku, { id: placement.id }));
    } catch (err) {
      setError(err.message || 'Could not remove that location');
    } finally {
      setBusy(false);
    }
  };

  const primaryTrail = primaryPath.length
    ? resolvePathLabels(taxonomyTree, primaryPath).join(' › ')
    : 'Uncategorised';

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Also appears in
      </div>
      <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
        Primary: {primaryTrail}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 10, color: '#64748b' }}>
          <Loader2 size={14} className="spin" /> Loading…
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!placements.length && (
            <div className="adm-muted" style={{ fontSize: 12 }}>
              Only in its primary category.
            </div>
          )}
          {placements.map((placement) => (
            <div
              key={placement.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                background: placement.orphaned ? '#fef2f2' : '#f8fafc',
                border: `1px solid ${placement.orphaned ? '#fecaca' : '#e2e8f0'}`,
                borderRadius: 8, padding: '5px 8px',
              }}
            >
              <span style={{ flex: 1, color: placement.orphaned ? '#b91c1c' : '#334155' }}>
                {placementTrail(placement)}
                {placement.orphaned && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700 }}>
                    category deleted — remove this
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void onRemove(placement)}
                disabled={busy}
                className="adm-btn-ghost"
                title="Remove this location"
                aria-label={`Remove ${placementTrail(placement)}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
        <CategoryPathSelect
          taxonomyTree={taxonomyTree}
          value={draft}
          onChange={setDraft}
          mainLabel="Add another location"
          mainPlaceholder="— Choose a category —"
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={!draft.length || busy}
          className="adm-btn"
          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          Add location
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
