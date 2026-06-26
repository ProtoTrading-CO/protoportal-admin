import { ArrowRight, Loader2 } from 'lucide-react';
import { swapAdjacentImageSlots } from '../lib/productImages';

/**
 * Compact 4-slot image strip with adjacent swap controls (slots 1↔2, 2↔3, 3↔4).
 */
export default function ProductImageSlotReorder({
  images = [],
  onSwap,
  disabled = false,
  saving = false,
  compact = false,
}) {
  const slots = [0, 1, 2, 3].map((i) => images[i] || '');

  const handleSwap = (index) => {
    if (disabled || saving) return;
    const next = swapAdjacentImageSlots(slots, index);
    onSwap?.(next, index);
  };

  return (
    <div className={`pm-image-slot-reorder${compact ? ' pm-image-slot-reorder--compact' : ''}`}>
      <div className="pm-image-slot-reorder__row">
        {slots.map((url, index) => (
          <div key={index} className="pm-image-slot-reorder__pair">
            <div
              className={`pm-image-slot-reorder__thumb${url ? '' : ' pm-image-slot-reorder__thumb--empty'}`}
              title={`Image ${index + 1}`}
            >
              {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span>{index + 1}</span>}
            </div>
            {index < 3 && (
              <button
                type="button"
                className="pm-image-slot-reorder__swap"
                disabled={disabled || saving || (!slots[index] && !slots[index + 1])}
                title={`Swap image ${index + 1} ↔ ${index + 2}`}
                aria-label={`Swap image ${index + 1} and image ${index + 2}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSwap(index);
                }}
              >
                <ArrowRight size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      {saving && (
        <p className="pm-image-slot-reorder__saving">
          <Loader2 size={12} className="spin" /> Saving order…
        </p>
      )}
      {!compact && (
        <p className="adm-muted pm-image-slot-reorder__hint">
          Use arrows to swap image order (1, 2, 3, 4) before generating.
        </p>
      )}
    </div>
  );
}
