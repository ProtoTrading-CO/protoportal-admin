function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function postIntake(body) {
  const res = await fetch('/api/image-intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || 'Image intake request failed');
  return json;
}

export async function previewImageIntake(file) {
  const base64 = await fileToBase64(file);
  const json = await postIntake({
    action: 'preview',
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    base64,
  });
  return json.preview;
}

export async function processImageIntake(file, { dryRun = false } = {}) {
  const base64 = await fileToBase64(file);
  return postIntake({
    action: 'process',
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    base64,
    dryRun,
  });
}

export async function fetchImageIntakeHistory({ limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`/api/image-intake?${params}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load history');
  return json.rows || [];
}
