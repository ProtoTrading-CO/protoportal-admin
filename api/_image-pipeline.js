import { createClient } from '@supabase/supabase-js';
import { Jimp, HorizontalAlign, VerticalAlign, cssColorToHex } from 'jimp';

const BUCKET = 'product-images';
const IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';

const FIX_PROMPT = `Transform this into a professional wholesale e-commerce product photo.
Remove the background and place the product on a pure white (#FFFFFF) background.
Center the product with even padding. Preserve the exact product, colours, and shape.
No text, watermarks, or extra props. Clean catalogue-style square product shot.`;

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

export async function transformWithOpenRouter(base64, contentType, { prompt = FIX_PROMPT } = {}) {
  const apiKey = getOpenRouterKey();
  const safeType = contentType || 'image/jpeg';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'Proto Image Fix',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
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
      },
      max_tokens: 1024,
      temperature: 0.2,
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
    model: IMAGE_MODEL,
    tokensIn: usage.prompt_tokens || 0,
    tokensOut: usage.completion_tokens || 0,
  };
}

export async function uploadTransformedImage(buffer, filename, contentType = 'image/png') {
  const supabase = getStockAdminClient();
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const safeName = `gemini-${Date.now()}-${String(filename || 'product').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(safeName, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
  return publicUrl;
}

/** New Products pipeline: OpenRouter Gemini → 800×800 white canvas → upload. */
export async function fixImageFromUrl(imageUrl, { sku = 'product' } = {}) {
  const { base64, contentType } = await fetchImageBuffer(imageUrl);
  const transformed = await transformWithOpenRouter(base64, contentType);
  const resized = await resizeTo800White(transformed.buffer);
  const url = await uploadTransformedImage(resized, `${sku}.jpg`, 'image/jpeg');
  return {
    url,
    model: transformed.model,
    tokensIn: transformed.tokensIn,
    tokensOut: transformed.tokensOut,
  };
}

/** Used by New Products upload — accepts raw base64 from browser compression. */
export async function fixImageFromBase64(base64, contentType, filename = 'product.jpg') {
  const transformed = await transformWithOpenRouter(base64, contentType);
  const resized = await resizeTo800White(transformed.buffer);
  const url = await uploadTransformedImage(resized, filename.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg');
  return {
    url,
    base64: resized.toString('base64'),
    model: transformed.model,
    tokensIn: transformed.tokensIn,
    tokensOut: transformed.tokensOut,
  };
}
