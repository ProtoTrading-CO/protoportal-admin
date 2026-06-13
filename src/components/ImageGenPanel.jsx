import { Loader2, Sparkles, X } from 'lucide-react';
import ImageGenOptions from './ImageGenOptions';

export { IMAGE_STYLE_OPTIONS, IMAGE_GEN_PRESETS, IMAGE_MODEL_LABEL } from './ImageGenOptions';

/** Unified image generation controls — style, prompt, presets. */
export default function ImageGenPanel({
  style,
  onStyleChange,
  prompt,
  onPromptChange,
  compact = false,
  className = '',
}) {
  return (
    <div className={className}>
      <ImageGenOptions
        style={style}
        onStyleChange={onStyleChange}
        prompt={prompt}
        onPromptChange={onPromptChange}
        compact={compact}
      />
    </div>
  );
}

/** Modal wrapper for batch image generation from Product Manager selection. */
export function ImageGenModal({
  open,
  onClose,
  title = 'Generate images',
  targetCount = 0,
  style,
  onStyleChange,
  prompt,
  onPromptChange,
  onRun,
  busy = false,
}) {
  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="adm-modal adm-modal--md" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h3 className="adm-modal-title">
            <Sparkles size={16} style={{ color: '#8B1A1A' }} /> {title}
          </h3>
          {!busy && (
            <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          )}
        </div>
        <p className="adm-section-note" style={{ margin: '0 0 12px' }}>
          {targetCount} product{targetCount === 1 ? '' : 's'} selected. Live site unchanged until Go live in New Items.
        </p>
        <ImageGenPanel
          style={style}
          onStyleChange={onStyleChange}
          prompt={prompt}
          onPromptChange={onPromptChange}
        />
        <div className="adm-modal-foot">
          <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="adm-btn-red" onClick={onRun} disabled={busy || !targetCount}>
            {busy ? <><Loader2 size={14} className="spin" /> Generating…</> : <><Sparkles size={14} /> Generate</>}
          </button>
        </div>
      </div>
    </div>
  );
}
