import { useMemo, useRef, useState } from 'react';
import { CheckSquare, FolderOpen, Loader2, RefreshCw, Square, Upload } from 'lucide-react';
import { isImageFile } from '../../lib/parseIntakeFilename';
import { catalogueDisplayTitle } from '../../lib/productLoaderDisplay.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProductLoaderApolloSend({ items = [], onSendToApollo, onShowToast }) {
  const [selected, setSelected] = useState(() => new Set());
  const rows = useMemo(
    () => items.filter((i) => i.code && i.group !== 'not_found'),
    [items],
  );

  const toggle = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.code)));
  };

  const send = () => {
    const picked = rows.filter((r) => selected.has(r.code));
    if (!picked.length) {
      onShowToast?.('Select at least one product', 'warning');
      return;
    }
    const products = picked.map((row) => ({
      id: row.code,
      sku: row.code,
      name: catalogueDisplayTitle(row) || row.code,
      title: catalogueDisplayTitle(row) || row.code,
      image: row.websiteRow?.image_url_one || row.previewUrl || '',
      images: [
        row.websiteRow?.image_url_one,
        row.websiteRow?.image_url_two,
        row.websiteRow?.image_url_three,
        row.websiteRow?.image_url_four,
      ].filter(Boolean),
    }));
    onSendToApollo?.(products);
  };

  if (!rows.length) return null;

  return (
    <section className="pl-apollo-send">
      <div className="pl-section-head">
        <h3>Send to Apollo Image Gen</h3>
        <button type="button" className="adm-btn-ghost adm-btn-sm" onClick={toggleAll}>
          {selected.size === rows.length ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <p className="pl-section-note">
        Positill data loaded — pick products and their image slots, then open Apollo to run batch image generation.
      </p>
      <div className="pl-apollo-grid">
        {rows.map((row) => {
          const slots = [
            row.websiteRow?.image_url_one,
            row.websiteRow?.image_url_two,
            row.websiteRow?.image_url_three,
            row.websiteRow?.image_url_four,
          ];
          const on = selected.has(row.code);
          return (
            <article key={row.code} className={`pl-apollo-card${on ? ' pl-apollo-card--on' : ''}`}>
              <button type="button" className="pl-apollo-check" onClick={() => toggle(row.code)} aria-pressed={on}>
                {on ? <CheckSquare size={18} /> : <Square size={18} />}
              </button>
              <div className="pl-apollo-slots">
                {slots.map((url, i) => (
                  <div key={i} className={`pl-apollo-slot${url ? '' : ' pl-apollo-slot--empty'}`} title={`Image ${i + 1}`}>
                    {url ? <img src={url} alt="" /> : <span>{i + 1}</span>}
                  </div>
                ))}
              </div>
              <div className="pl-apollo-meta">
                <strong>{row.code}</strong>
                <span>{catalogueDisplayTitle(row) || '—'}</span>
                <span>SOH {row.stockOnHand ?? row.sqlRow?.available ?? row.websiteRow?.available_stock ?? '—'}</span>
                <span>R{Number(row.price ?? row.sqlRow?.sell_price ?? row.websiteRow?.price ?? 0).toFixed(2)}</span>
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="adm-btn-red" disabled={!selected.size} onClick={send}>
        Send {selected.size || ''} to Apollo Image Gen
      </button>
    </section>
  );
}

export function ProductLoaderApolloSendFromItems(props) {
  return <ProductLoaderApolloSend {...props} />;
}
