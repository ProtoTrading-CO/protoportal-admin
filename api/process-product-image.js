import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

// Cost per 1M tokens — Gemini Flash 1.5 via OpenRouter
const PRICE_IN_PER_M  = 0.075;
const PRICE_OUT_PER_M = 0.30;
const IMAGE_TOKEN_ESTIMATE = 350;

// Paid model — reliable vision, cheap (~$0.00003 per image)
const MODEL = 'google/gemini-flash-1.5';
const BUCKET = 'product-images';

const CATEGORIES = [
  'Arts Crafts & Stationery',
  'Beads Jewellery & Accessories',
  'Beauty & Personal Care',
  'Events & Parties',
  'Fashion & Accessories',
  'Food & Drinks',
  'Hardware',
  'Homeware & Kitchen',
  'Packaging',
  'Textiles',
  'Toys Games & Kids',
];

// Use main Supabase instance (has Storage configured) with service role key
function supabaseMain() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function storeImage(buffer, filename, contentType) {
  const sb = supabaseMain();
  // Ensure bucket exists
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const safe = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await sb.storage.from(BUCKET).upload(safe, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(safe);
  return publicUrl;
}

async function callGemini(apiKey, base64, contentType) {
  const prompt = `You are a wholesale e-commerce product analyst. Analyze this product image and return ONLY a valid JSON object — no markdown, no extra text:
{
  "title": "concise product title, 3–6 words",
  "category": "pick exactly one: ${CATEGORIES.join(' | ')}",
  "description": "one punchy sentence describing the product for a trade buyer"
}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'ProtoPortal Admin',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      max_tokens: 250,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${txt.slice(0, 300)}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64 } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

  const t0 = Date.now();
  const rawBuffer = Buffer.from(base64, 'base64');

  // 1. Store original image in Supabase Storage (main project)
  let imageUrl = '';
  try {
    imageUrl = await storeImage(rawBuffer, filename, contentType);
  } catch (err) {
    return res.status(500).json({ error: `Storage failed: ${err.message}` });
  }

  // 2. Call Gemini Flash for product metadata
  let title = '', category = '', description = '', tokensIn = IMAGE_TOKEN_ESTIMATE, tokensOut = 80, costUsd = 0;
  try {
    const json = await callGemini(apiKey, base64, contentType);
    const usage = json.usage || {};
    tokensIn  = usage.prompt_tokens     || IMAGE_TOKEN_ESTIMATE;
    tokensOut = usage.completion_tokens || 80;
    costUsd = parseFloat((((tokensIn / 1e6) * PRICE_IN_PER_M) + ((tokensOut / 1e6) * PRICE_OUT_PER_M)).toFixed(6));

    const raw = json.choices?.[0]?.message?.content ?? '';
    const text = typeof raw === 'string' ? raw : (Array.isArray(raw) ? (raw.find(c => c.type === 'text')?.text ?? '') : '');
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      title       = parsed.title       || '';
      category    = parsed.category    || '';
      description = parsed.description || '';
    }
  } catch (err) {
    // AI failed — still return image so product can be saved with filename as title
    return res.status(200).json({
      url: imageUrl, title: '', category: '', description: '',
      tokensIn: 0, tokensOut: 0, cost: 0, model: MODEL,
      aiError: err.message,
      processingMs: Date.now() - t0,
    });
  }

  return res.status(200).json({
    url: imageUrl,
    title,
    category,
    description,
    tokensIn,
    tokensOut,
    cost: costUsd,
    model: MODEL,
    processingMs: Date.now() - t0,
  });
}
