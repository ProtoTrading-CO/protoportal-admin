import { useRef, useState } from 'react';
import { FolderOpen, Loader2, Upload } from 'lucide-react';
import { isImageFile, parseIntakeFilename } from '../../lib/parseIntakeFilename';
import { catalogueDisplayTitle } from '../../lib/productLoaderDisplay.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProductLoaderImageReplace({ onShowToast }) {
  const folderRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');

  const handleFolder = async (fileList) => {
    const files = [...(fileList || [])].filter(isImageFile);
    if (!files.length) {
      setError('No image files in folder.');
      return;
    }
    setScanning(true);
    setError('');
    try {
      const parsed = files.map((file) => {
        const p = parseIntakeFilename(file.name);
        return {
          file,
          code: p.sourceSku,
          imageSlot: p.imageNumber,
          previewUrl: URL.createObjectURL(file),
        };
      }).filter((r) => r.code);

      const codes = [...new Set(parsed.map((r) => r.code))];
      const res = await fetch('/api/product-loader-batch-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: parsed.map((r) => r.file.name) }),
      });
      const json = await res.json();
      const byName = new Map((json.items || []).map((i) => [i.filename, i]));

      const merged = parsed.map((r) => {
        const match = byName.get(r.file.name);
        return {
          ...r,
          websiteRow: match?.websiteRow || null,
          title: catalogueDisplayTitle({ ...r, ...match, code: r.code }) || '',
          found: Boolean(match?.websiteRow),
        };
      });
      setRows(merged);
      const found = merged.filter((r) => r.found).length;
      onShowToast?.(`Matched ${found} of ${merged.length} images to website stock`, found ? 'success' : 'warning');
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const replaceAll = async () => {
    const ready = rows.filter((r) => r.found && r.file);
    if (!ready.length) return;
    setReplacing(true);
    setError('');
    try {
      const items = await Promise.all(ready.map(async (r) => ({
        sku: r.code,
        imageSlot: r.imageSlot,
        filename: r.file.name,
        contentType: r.file.type || 'image/jpeg',
        base64: await fileToBase64(r.file),
      })));
      const res = await fetch('/api/product-loader-image-replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error || 'Replace failed');
      onShowToast?.(`Replaced ${json.replaced || 0} image(s)${json.failed?.length ? `, ${json.failed.length} failed` : ''}`, json.failed?.length ? 'warning' : 'success');
      setRows([]);
    } catch (err) {
      setError(err.message || 'Replace failed');
    } finally {
      setReplacing(false);
    }
  };

  const foundCount = rows.filter((r) => r.found).length;

  return (
    <div className="pl-section">
      <p className="pl-section-note">
        Upload a folder of product images. <strong>BASHEWS.jpg</strong> replaces image 1;
        <strong> BASHEWS-2.jpg</strong> → image 2; <strong>BASHEWS-3.jpg</strong> → image 3, etc.
        Only SKUs already in website stock are updated.
      </p>
      <label className="adm-btn-ghost" style={{ display: 'inline-flex', gap: 8, cursor: 'pointer' }}>
        <FolderOpen size={15} />
        {scanning ? 'Scanning…' : 'Choose image folder'}
        <input
          ref={folderRef}
          type="file"
          accept="image/*"
          multiple
          webkitdirectory=""
          directory=""
          hidden
          onChange={(e) => { void handleFolder(e.target.files); e.target.value = ''; }}
        />
      </label>
      {error && <p className="pl-error">{error}</p>}
      {rows.length > 0 && (
        <>
          <div className="pl-folder-table-wrap" style={{ marginTop: 16 }}>
            <table className="pl-folder-table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>SKU</th>
                  <th>Slot</th>
                  <th>Product</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.code}-${r.imageSlot}-${r.file.name}`}>
                    <td>{r.previewUrl && <img src={r.previewUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />}</td>
                    <td><code>{r.code}</code></td>
                    <td>Image {r.imageSlot}</td>
                    <td>{r.title}</td>
                    <td>{r.found ? <span style={{ color: '#15803d', fontWeight: 700 }}>Found</span> : <span style={{ color: '#b91c1c' }}>Not on site</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pl-action-row" style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn-red" disabled={replacing || !foundCount} onClick={() => void replaceAll()}>
              {replacing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              Replace {foundCount} image(s) on website
            </button>
            <button type="button" className="adm-btn-ghost" onClick={() => setRows([])}>Clear</button>
          </div>
        </>
      )}
    </div>
  );
}
