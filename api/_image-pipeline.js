import { createClient } from '@supabase/supabase-js';
import { Jimp, HorizontalAlign, VerticalAlign, cssColorToHex } from 'jimp';

const BUCKET = 'product-images';

/** Strongest OpenRouter image model — override with OPENROUTER_IMAGE_MODEL env. */
export const DEFAULT_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-3-pro-image-preview';
export const FAST_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL_FAST || 'google/gemini-2.5-flash-image';

export const IMAGE_STYLES = {
  standard: 'standard',
  shadow: 'shadow',
  generative: 'generative',
};

const FIX_PROMPT = `Transform this into a professional wholesale e-commerce product photo.
Remove the background and place the product on a pure white (#FFFFFF) background.
Center the product with even padding. Preserve the exact product, colours, and shape.
No text, watermarks, or extra props. Clean catalogue-style square product shot.`;

export function resolveImageModel(imageStyle = 'standard') {
  if (imageStyle === IMAGE_STYLES.generative || imageStyle === IMAGE_STYLES.shadow) {
    return DEFAULT_IMAGE_MODEL;
  }
  return DEFAULT_IMAGE_MODEL;
}

export function inferImageStyle(userInstructions = '', userQuery = '') {
  const text = `${userQuery} ${userInstructions}`.toLowerCase();
  if (/generative|painting on|artwork on|art on the canvas|on the canvas|lifestyle scene|show.*canvas|canvas.*paint|styled scene|creative/i.test(text)) {
    return IMAGE_STYLES.generative;
  }
  if (/\bshadow\b|drop shadow|soft shadow/i.test(text)) {
    return IMAGE_STYLES.shadow;
  }
  return IMAGE_STYLES.standard;
}

/** Build prompt for OpenRouter image model from style + admin instructions. */
export function buildImagePrompt({ style = IMAGE_STYLES.standard, userInstructions = '', productTitle = '' } = {}) {
  const custom = String(userInstructions || '').trim();
  const productCtx = productTitle
    ? `\nProduct name: "${productTitle}". Keep this exact product — same shape, branding, colours, and proportions as the source photo.`
    : '';

  if (style === IMAGE_STYLES.generative) {
    const direction = custom || 'Place the product on a pure white background, clearly in view, professional catalogue quality.';
    return `You are an expert product photographer and generative image editor for wholesale e-commerce.${productCtx}

CREATIVE DIRECTION — follow precisely:
${direction}

RULES:
- The source photo is the ground truth for the product itself — preserve identity, branding, and colours.
- You MAY synthesize scene elements when the direction asks (e.g. a painting displayed on a canvas, props, lighting) as long as the product remains accurate.
- Professional catalogue hero shot; product must be clearly visible and the hero of the frame.
- Clean pure white (#FFFFFF) studio background unless the direction explicitly asks for something else.
- Square 1:1 composition. No watermarks, no garbled text, no distorted logos.`;
  }

  if (style === IMAGE_STYLES.shadow) {
    const base = custom || 'Remove the background and isolate the product.';
    return `${base}${productCtx}

Place the product on a pure white (#FFFFFF) background with a soft, realistic drop shadow beneath it — subtle contact shadow plus gentle ambient shadow, as in a professional studio shot. Shadow must look natural (not harsh, oversized, or floating). Centre the product with even padding. Preserve exact product colours and shape. No text or watermarks.`;
  }

  if (custom) {
    return `${custom}${productCtx}

Additional requirements: remove distracting backgrounds, preserve exact product shape and colours, no text or watermarks. Pure white (#FFFFFF) background, product centred with even padding.`;
  }

  return FIX_PROMPT + productCtx;
}

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
  return key;
}

function guessContentType(url, buffer) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Model returned an invalid image data URL');
  return { buffer: Buffer.from(m[2], 'base64'), contentType: m[1] || 'image/png' };
}

function extractGeneratedImage(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error('No model response');

  for (const image of message.images || []) {
    const url = image?.image_url?.url || image?.imageUrl?.url;
    if (url) return parseDataUrl(url);
  }

  const parts = Array.isArray(message.content) ? message.content : [];
  for (const part of parts) {
    if (part?.type === 'image_url' && part.image_url?.url) {
      return parseDataUrl(part.image_url.url);
    }
  }

  if (typeof message.content === 'string' && message.content.includes('data:image')) {
    const m = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (m) return parseDataUrl(m[0]);
  }

  throw new Error('Model did not return an image — try again or check OPENROUTER_IMAGE_MODEL');
}

function resolveTemperature(imageStyle) {
  if (imageStyle === IMAGE_STYLES.generative) return 0.45;
  if (imageStyle === IMAGE_STYLES.shadow) return 0.35;
  return 0.2;
}

/** Fit on 800×800 white canvas — matches New Products client compress. */
export async function resizeTo800White(buffer) {
  const image = await Jimp.read(buffer);
  image.contain({
    w: 800,
    h: 800,
    align: HorizontalAlign.CENTER | VerticalAlign.MIDDLE,
    background: cssColorToHex('#ffffffff'),
  });
  return image.getBuffer('image/jpeg');
}

export async function fetchImageBuffer(imageUrl) {
  const raw = String(imageUrl || '').split(',')[0].trim();
  if (!raw) throw new Error('No image URL');

  let lastErr = null;
  for (const url of [raw, encodeURI(raw)]) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('Empty image');
      const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || guessContentType(url, buf);
      return { buffer: buf, contentType, filename: url.split('/').pop() || 'product.jpg', base64: buf.toString('base64') };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(lastErr?.message || 'Could not download image');
}

export async function transformWithOpenRouter(base64, contentType, { prompt = FIX_PROMPT, model = DEFAULT_IMAGE_MODEL, imageStyle = IMAGE_STYLES.standard } = {}) {
  const apiKey = getOpenRouterKey();
  const safeType = contentType || 'image/jpeg';
  const usePro = String(model).includes('gemini-3-pro');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'Proto Image Gen',
    },
    body: JSON.stringify({
      model,
      modalities: ['image', 'text'],
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${safeType};base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      image_config: {
        aspect_ratio: '1:1',
        ...(usePro ? { image_size: '2K' } : {}),
      },
      max_tokens: 2048,
      temperature: resolveTemperature(imageStyle),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenRouter ${response.status}`);
  }

  const generated = extractGeneratedImage(payload);
  const usage = payload.usage || {};
  return {
    ...generated,
    model,
    tokensIn: usage.prompt_tokens || 0,
    tokensOut: usage.completion_tokens || 0,
  };
}

export async function uploadTransformedImage(buffer, filename, contentType = 'image/png') {
  const supabase = getStockAdminClient();
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const safeName = `gen-${Date.now()}-${String(filename || 'product').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(safeName, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
  return publicUrl;
}

/**
 * Full pipeline: download → Gemini image gen → 800×800 white canvas → upload.
 */
export async function fixImageFromUrl(imageUrl, {
  sku = 'product',
  prompt,
  imageStyle = IMAGE_STYLES.standard,
  userInstructions = '',
  productTitle = '',
} = {}) {
  const style = imageStyle || IMAGE_STYLES.standard;
  const finalPrompt = prompt || buildImagePrompt({ style, userInstructions, productTitle });
  const model = resolveImageModel(style);

  const { base64, contentType } = await fetchImageBuffer(imageUrl);
  const transformed = await transformWithOpenRouter(base64, contentType, {
    prompt: finalPrompt,
    model,
    imageStyle: style,
  });
  const resized = await resizeTo800White(transformed.buffer);
  const url = await uploadTransformedImage(resized, `${sku}.jpg`, 'image/jpeg');
  return {
    url,
    model: transformed.model,
    tokensIn: transformed.tokensIn,
    tokensOut: transformed.tokensOut,
    imageStyle: style,
  };
}

/** New Products upload — accepts raw base64 from browser compression. */
export async function fixImageFromBase64(base64, contentType, filename = 'product.jpg', {
  imageStyle = IMAGE_STYLES.standard,
  userInstructions = '',
  productTitle = '',
} = {}) {
  const style = imageStyle || IMAGE_STYLES.standard;
  const finalPrompt = buildImagePrompt({ style, userInstructions, productTitle });
  const model = resolveImageModel(style);

  const transformed = await transformWithOpenRouter(base64, contentType, {
    prompt: finalPrompt,
    model,
    imageStyle: style,
  });
  const resized = await resizeTo800White(transformed.buffer);
  const url = await uploadTransformedImage(resized, filename.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg');
  return {
    url,
    base64: resized.toString('base64'),
    model: transformed.model,
    tokensIn: transformed.tokensIn,
    tokensOut: transformed.tokensOut,
    imageStyle: style,
  };
}
