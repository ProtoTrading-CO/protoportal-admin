import { Sparkles } from 'lucide-react';

export const IMAGE_STYLE_OPTIONS = [
  { id: 'standard', label: 'Standard', hint: 'White background, clean catalogue shot' },
  { id: 'shadow', label: 'White + shadow', hint: 'White background with soft studio drop shadow' },
  { id: 'generative', label: 'Generative AI', hint: 'Custom creative direction (canvas art, scenes, etc.)' },
];

export const IMAGE_GEN_PRESETS = [
  {
    id: 'canvas-showcase',
    label: 'Canvas showcase',
    style: 'generative',
    prompt: 'Pure white background. Product clearly in view with a soft studio drop shadow. Display a colourful kids painting on the canvas surface.',
  },
  {
    id: 'white-shadow',
    label: 'White + shadow',
    style: 'shadow',
    prompt: 'Remove background. Pure white background with soft realistic drop shadow. Product centred and clearly visible.',
  },
];

export const IMAGE_MODEL_LABEL = 'Pro for hero / generative · Flash for routine slots';

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
              ? 'e.g. White background, product clearly in view, soft shadow, colourful kids painting on the canvas'
              : 'Optional extra instructions (leave blank for defaults)'
          }
        />
      )}
      <div className="image-gen-presets">
        {IMAGE_GEN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="image-gen-preset-btn"
            onClick={() => {
              onStyleChange(preset.style);
              onPromptChange(preset.prompt);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="image-gen-hint">
        {IMAGE_STYLE_OPTIONS.find((o) => o.id === style)?.hint}
        {' · '}
        Output: 800×800 JPEG. Live site unchanged until Go live.
      </p>
    </div>
  );
}
