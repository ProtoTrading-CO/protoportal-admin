import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Image, Loader2, Pencil, X } from 'lucide-react';
import ProductImageSlotReorder from './ProductImageSlotReorder';
import { productImagesFromRecord } from '../lib/productImages';

function ProductImageLightbox({ product, index, onClose, onChangeIndex }) {
  const images = productImagesFromRecord(product).filter(Boolean);
  const current = images[index];

  useEffect(() => {
    if (!images.length) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onChangeIndex(index - 1);
      if (e.key === 'ArrowRight' && index < images.length - 1) onChangeIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, index, onClose, onChangeIndex]);

  if (!product || index < 0 || !current) return null;

  return (
    <div className="apollo-ref-lightbox" role="dialog" aria-modal="true" aria-label="Product preview">
      <button type="button" className="apollo-ref-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="apollo-ref-lightbox-inner">
        <header className="apollo-ref-lightbox-head">
          <div>
            <strong>{product.title || product.name || product.sku}</strong>
            <span>{product.sku} · Image {index + 1} of {images.length}</span>
          </div>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="apollo-ref-lightbox-stage">
          {index > 0 && (
            <button type="button" className="apollo-ref-lightbox-nav apollo-ref-lightbox-nav--prev" onClick={() => onChangeIndex(index - 1)} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
          )}
          <img src={current} alt="" className="apollo-ref-lightbox-img" />
          {index < images.length - 1 && (
            <button type="button" className="apollo-ref-lightbox-nav apollo-ref-lightbox-nav--next" onClick={() => onChangeIndex(index + 1)} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Selected products strip — shows what the recipe will run against. */
export default function ApolloSelectedProductPreview({
  products = [],
  loading = false,
  activeSlots = [],
  onEditSelection,
  onDeselectProduct,
  onReorderImages,
  imageReorderSavingSku = '',
  compact = false,
}) {
  const [lightbox, setLightbox] = useState(null);

  if (loading) {
    return (
      <section className="apollo-scope-preview">
        <p className="apollo-scope-preview-loading"><Loader2 size={14} className="spin" /> Loading selected products…</p>
      </section>
    );
  }

  if (!products.length) return null;

  const slotSet = new Set(activeSlots);

  return (
    <section className={`apollo-scope-preview${compact ? ' apollo-scope-preview--compact' : ''}`}>
      <header className="apollo-scope-preview-head">
        <div>
          <h5>Selected products</h5>
          <p className="adm-muted">
            {products.length} product{products.length === 1 ? '' : 's'}
            {activeSlots.length > 0 && (
              <> · regenerating slot{activeSlots.length === 1 ? '' : 's'} {activeSlots.join(', ')}</>
            )}
            {onReorderImages && !compact && (
              <> · swap image order with arrows below each product</>
            )}
            {onDeselectProduct && (
              <> · tap × to remove from batch</>
            )}
          </p>
        </div>
        {onEditSelection && (
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onEditSelection}>
            <Pencil size={13} /> Edit selection
          </button>
        )}
      </header>

      <div className="apollo-scope-preview-grid">
        {products.map((p) => {
          const sku = p.sku || p.id;
          const images = productImagesFromRecord(p);
          const saving = imageReorderSavingSku === sku;
          return (
            <article
              key={sku}
              className="apollo-scope-preview-card"
            >
              {onDeselectProduct && (
                <button
                  type="button"
                  className="apollo-scope-preview-remove"
                  aria-label={`Remove ${p.title || p.name || sku} from batch`}
                  title="Remove from batch"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeselectProduct(sku);
                  }}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
              <div className="apollo-scope-preview-card-body">
                {onReorderImages && !compact ? (
                  <ProductImageSlotReorder
                    images={images}
                    onSwap={(nextImages) => onReorderImages(p, nextImages)}
                    disabled={!!imageReorderSavingSku}
                    saving={saving}
                    compact
                  />
                ) : (
                  <button
                    type="button"
                    className="apollo-scope-preview-thumb-row"
                    onClick={() => setLightbox({ product: p, index: 0 })}
                  >
                    <div className="apollo-scope-preview-thumbs">
                      {[1, 2, 3, 4].map((slot) => {
                        const url = images[slot - 1];
                        const willRegen = slotSet.has(slot);
                        return (
                          <div
                            key={slot}
                            className={`apollo-scope-preview-thumb${willRegen ? ' apollo-scope-preview-thumb--target' : ''}`}
                            title={willRegen ? `Image ${slot} — will regenerate` : `Image ${slot}`}
                          >
                            {url ? <img src={url} alt="" /> : <Image size={11} color="#cbd5e1" />}
                            <span className="apollo-scope-preview-slot">{slot}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                )}
                <div className="apollo-scope-preview-meta">
                  <strong>{p.title || p.name || sku}</strong>
                  <span>{sku}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {lightbox && (
        <ProductImageLightbox
          product={lightbox.product}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onChangeIndex={(index) => setLightbox((prev) => (prev ? { ...prev, index } : null))}
        />
      )}
    </section>
  );
}
