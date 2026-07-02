import { isNutstoreImageName } from './_nutstore-filename.js';

const DEFAULT_WEBDAV_URL = 'https://dav.jianguoyun.com/dav/';

function nutstoreConfig() {
  const baseUrl = String(process.env.NUTSTORE_WEBDAV_URL || DEFAULT_WEBDAV_URL).trim().replace(/\/+$/, '') + '/';
  const user = String(process.env.NUTSTORE_USER || '').trim();
  const password = String(process.env.NUTSTORE_APP_PASSWORD || '').trim();
  const rootPath = normalizeDavPath(process.env.NUTSTORE_ROOT_PATH || '/');
  return { baseUrl, user, password, rootPath };
}

export function isNutstoreConfigured() {
  const { user, password } = nutstoreConfig();
  return Boolean(user && password);
}

export function nutstoreSetupMessage() {
  if (isNutstoreConfigured()) return null;
  return 'Set NUTSTORE_USER and NUTSTORE_APP_PASSWORD on Vercel (Nutstore third-party app password).';
}

function authHeader() {
  const { user, password } = nutstoreConfig();
  if (!user || !password) throw new Error(nutstoreSetupMessage());
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

/** Normalize to /path/form without trailing slash (except root). */
export function normalizeDavPath(path) {
  let p = String(path || '/').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

function joinDavPath(...parts) {
  const joined = parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
  return normalizeDavPath(joined.startsWith('/') ? joined : `/${joined}`);
}

function davUrlForPath(path) {
  const { baseUrl } = nutstoreConfig();
  const normalized = normalizeDavPath(path);
  const encoded = normalized
    .split('/')
    .map((seg, i) => (i === 0 && !seg ? '' : encodeURIComponent(seg)))
    .join('/');
  return `${baseUrl}${encoded.startsWith('/') ? encoded.slice(1) : encoded}`;
}

function decodeHref(href) {
  try {
    return decodeURIComponent(String(href || '').trim());
  } catch {
    return String(href || '').trim();
  }
}

function hrefToDavPath(href) {
  const raw = decodeHref(href);
  const { baseUrl } = nutstoreConfig();
  let path = raw;
  if (path.startsWith(baseUrl)) path = path.slice(baseUrl.length);
  if (path.startsWith('/dav/')) path = path.slice(4);
  if (!path.startsWith('/')) path = `/${path}`;
  return normalizeDavPath(path);
}

function getTag(block, tag) {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function isCollection(block) {
  return /<(?:\w+:)?collection\b/i.test(block);
}

function parsePropfindResponse(xml) {
  const responses = [];
  const blocks = xml.match(/<(?:\w+:)?response[\s\S]*?<\/(?:\w+:)?response>/gi) || [];
  for (const block of blocks) {
    const href = getTag(block, 'href');
    if (!href) continue;
    const displayname = getTag(block, 'displayname') || '';
    const lastmod = getTag(block, 'getlastmodified') || '';
    const lenRaw = getTag(block, 'getcontentlength') || '0';
    const contentType = getTag(block, 'getcontenttype') || '';
    const size = Number.parseInt(lenRaw, 10) || 0;
    const path = hrefToDavPath(href);
    const name = displayname || path.split('/').pop() || '';
    const isDir = isCollection(block);
    responses.push({
      href,
      path,
      name,
      type: isDir ? 'dir' : 'file',
      size,
      contentType,
      modified: lastmod,
      isImage: !isDir && isNutstoreImageName(name),
    });
  }
  return responses;
}

function extractNextLink(linkHeader) {
  const raw = String(linkHeader || '');
  const m = raw.match(/<([^>]+)>;\s*rel="next"/i);
  return m ? m[1].trim() : null;
}

async function propfindOnce(url) {
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getlastmodified/>
    <getcontentlength/>
    <getcontenttype/>
  </prop>
</propfind>`,
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nutstore PROPFIND failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { entries: parsePropfindResponse(text), nextUrl: extractNextLink(res.headers.get('link') || res.headers.get('Link')) };
}

export async function listNutstoreDirectory(requestPath = '/') {
  const { rootPath } = nutstoreConfig();
  const path = normalizeDavPath(requestPath || rootPath);
  const url = davUrlForPath(path);
  const all = [];
  let currentUrl = url;

  while (currentUrl) {
    const { entries, nextUrl } = await propfindOnce(currentUrl);
    for (const entry of entries) {
      if (entry.path === path) continue;
      all.push(entry);
    }
    currentUrl = nextUrl;
  }

  all.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { path, entries: all };
}

export async function listNutstoreImagesRecursive(requestPath = '/') {
  const path = normalizeDavPath(requestPath);
  const images = [];
  const queue = [path];
  const seen = new Set();

  while (queue.length) {
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);

    try {
      const { entries } = await listNutstoreDirectory(dir);
      for (const entry of entries) {
        if (entry.type === 'dir') {
          queue.push(entry.path);
        } else if (entry.isImage) {
          images.push(entry);
        }
      }
    } catch {
      // skip unreadable folders
    }
  }

  images.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  return { path, images, count: images.length };
}

export async function downloadNutstoreFile(path) {
  const normalized = normalizeDavPath(path);
  const url = davUrlForPath(normalized);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nutstore download failed (${res.status}): ${text.slice(0, 120)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || guessContentType(normalized);
  return { buffer, contentType, path: normalized, filename: normalized.split('/').pop() || 'image.jpg' };
}

function guessContentType(path) {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function testNutstoreConnection() {
  const { rootPath } = nutstoreConfig();
  await listNutstoreDirectory(rootPath);
  return { ok: true, rootPath };
}

export { joinDavPath, nutstoreConfig };
