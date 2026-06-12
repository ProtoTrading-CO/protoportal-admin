import { ArrowRight, Image, Loader2, Sparkles, X } from 'lucide-react';

/** Sticky live feed — visible on every tab while batch reprocess runs. */
export default function ReprocessLiveFeed({ queue, busy, onDismiss, onOpenNewProducts }) {
  if (!queue?.length) return null;

  const done = queue.filter((q) => q.status === 'done').length;
  const failed = queue.filter((q) => q.status === 'error').length;
  const active = queue.find((q) => q.status === 'transforming') || queue.find((q) => q.status === 'pending');

  return (
    <div className="reprocess-live-feed" role="status" aria-live="polite">
      <div className="reprocess-live-feed-head">
        <div className="reprocess-live-feed-title">
          <Sparkles size={15} />
          <span>{busy ? 'Live reprocess feed' : 'Reprocess complete'}</span>
          <span className="reprocess-live-feed-count">{done}/{queue.length}{failed ? ` · ${failed} failed` : ''}</span>
        </div>
        <div className="reprocess-live-feed-actions">
          <button type="button" className="reprocess-live-feed-link" onClick={onOpenNewProducts}>
            Open New Products
          </button>
          {!busy && (
            <button type="button" className="adm-icon-btn" onClick={onDismiss} aria-label="Dismiss feed">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {active && (
        <div className="reprocess-live-feed-active">
          <div className="reprocess-live-feed-thumbs">
            <div className="reprocess-live-feed-thumb" title="Before">
              {active.thumbUrl ? (
                <img src={active.thumbUrl} alt="" />
              ) : (
                <Image size={16} color="#cbd5e1" />
              )}
            </div>
            <ArrowRight size={14} className="reprocess-live-feed-arrow" />
            <div className={`reprocess-live-feed-thumb reprocess-live-feed-thumb--after${active.previewUrl ? ' reprocess-live-feed-thumb--done' : ''}`} title="After">
              {active.previewUrl ? (
                <img src={active.previewUrl} alt="" />
              ) : active.status === 'transforming' ? (
                <Loader2 size={16} className="spin" color="#f59e0b" />
              ) : (
                <Image size={16} color="#cbd5e1" />
              )}
            </div>
          </div>
          <div className="reprocess-live-feed-meta">
            <strong>{active.name || active.sku}</strong>
            <span>{active.message || (active.status === 'pending' ? 'Waiting…' : 'Processing…')}</span>
          </div>
        </div>
      )}

      <div className="reprocess-live-feed-bar">
        <div className="reprocess-live-feed-bar-fill" style={{ width: `${queue.length ? Math.round((done / queue.length) * 100) : 0}%` }} />
      </div>
    </div>
  );
}
