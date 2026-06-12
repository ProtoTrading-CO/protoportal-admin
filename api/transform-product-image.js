import { requireAdminKey } from './_admin-auth.js';
import { fixImageFromBase64 } from './_image-pipeline.js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64, prompt, imageStyle } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ error: 'Please upload a JPG, PNG, or WEBP image.' });
  }

  try {
    const t0 = Date.now();
    const result = await fixImageFromBase64(base64, contentType, filename, {
      userInstructions: prompt,
      imageStyle: imageStyle || 'standard',
    });
    return res.status(200).json({
      url: result.url,
      base64: result.base64,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      imageStyle: result.imageStyle,
      processingMs: Date.now() - t0,
    });
  } catch (error) {
    console.error('transform-product-image:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Gemini image generation failed' });
  }
}
