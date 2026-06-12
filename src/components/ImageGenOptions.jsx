import { Sparkles } from 'lucide-react';

export const IMAGE_STYLE_OPTIONS = [
  { id: 'standard', label: 'Standard', hint: 'White background, clean catalogue shot' },
  { id: 'shadow', label: 'White + shadow', hint: 'White background with soft studio drop shadow' },
  { id: 'generative', label: 'Generative AI', hint: 'Custom creative direction (canvas art, scenes, etc.)' },
];

export const IMAGE_MODEL_LABEL = 'Gemini 3 Pro Image (OpenRouter)';

export default function ImageGenOptions({
  style,
  onStyleChange,
  prompt,
  onPromptChange,
  compact = false,
}) {
  const showPrompt = style === 'generative' || style === 'shadow' || prompt;

  return (
    <div className={`image-gen-options${compact ? ' image-gen-options--compact' : ''}`}>
      <div className="image-gen-options-row">
        <label className="image-gen-label">
          <Sparkles size={13} />
          Image style
        </label>
        <select
          className="adm-select image-gen-select"
          value={style}
          onChange={(e) => onStyleChange(e.target.value)}
        >
          {IMAGE_STYLE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} title={opt.hint}>{opt.label}</option>
          ))}
        </select>
        <span className="image-gen-model-tag">{IMAGE_MODEL_LABEL}</span>
      </div>
      {showPrompt && (
        <textarea
          className="image-gen-prompt"
          rows={compact ? 2 : 3}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={
            style === 'generative'
              ? 'e.g. Place on white background with the product clearly in view and a beautiful landscape painting displayed on the canvas'
              : 'Optional extra instructions (leave blank for defaults)'
          }
        />
      )}
      <p className="image-gen-hint">
        {IMAGE_STYLE_OPTIONS.find((o) => o.id === style)?.hint}
        {' · '}
        Output: 800×800 JPEG. Live site unchanged until Go live.
      </p>
    </div>
  );
}
