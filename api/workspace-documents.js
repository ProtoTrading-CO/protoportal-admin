import { randomUUID } from 'node:crypto';
import { requireAdminKey, verifyAdminUser } from './_admin-auth.js';
import { getPortalAdminClient } from './_site-config.js';
import {
  ensureWorkspaceDocumentBucket,
  loadWorkspaceDocumentIndex,
  mutateWorkspaceDocumentIndex,
  WORKSPACE_DOCUMENT_BUCKET,
} from './_workspace-document-store.js';
import {
  DOCUMENT_CATEGORIES,
  MAX_EXTRACTED_TEXT,
  WORKSPACE_TYPES,
  canExtractDocumentText,
  documentVersionGroup,
  normalizeDocumentTags,
  safeDocumentFilename,
  validateDocumentFile,
} from '../lib/workspace-documents.mjs';

function cleanScope(value) {
  return String(value || '').trim().slice(0, 180);
}

function publicDocument(document) {
  if (!document) return null;
  const { extracted_text: _text, storage_bucket: _bucket, storage_path: _path, ...safe } = document;
  return safe;
}

function actorFallback(req) {
  return String(req.headers['x-admin-email'] || req.body?.actor || 'apollo').trim().toLowerCase() || 'apollo';
}

async function requestActor(req) {
  const user = await verifyAdminUser(req);
  return user?.email?.toLowerCase() || actorFallback(req);
}

function validateScope(workspaceType, category = 'general') {
  if (!WORKSPACE_TYPES.includes(workspaceType)) throw new Error('Unknown Apollo workspace');
  if (!DOCUMENT_CATEGORIES.includes(category)) throw new Error('Unknown document category');
}

async function prepareUpload(req, res, supabase, actor) {
  const {
    workspaceType = '', recordId = '', filename = '', contentType = 'application/octet-stream',
    byteSize = 0, category = 'general', tags = [], notes = '', title = '',
  } = req.body || {};
  validateScope(workspaceType, category);
  const validation = validateDocumentFile({ name: filename, size: byteSize });
  if (!validation.ok) return res.status(400).json({ error: validation.error });

  await ensureWorkspaceDocumentBucket(supabase);
  const safeName = safeDocumentFilename(filename);
  const versionGroup = documentVersionGroup(filename);
  const scopeId = cleanScope(recordId) || null;
  const id = randomUUID();
  const storagePath = `${workspaceType}/${scopeId || '_library'}/${id}/${safeName}`;

  const document = await mutateWorkspaceDocumentIndex(supabase, (documents) => {
    const previous = documents
      .filter((row) => row.workspace_type === workspaceType
        && (row.record_id || null) === scopeId
        && row.version_group === versionGroup)
      .sort((a, b) => b.version - a.version)[0] || null;
    const created = {
      id,
      workspace_type: workspaceType,
      record_id: scopeId,
      title: String(title || '').trim().slice(0, 180),
      filename: safeName,
      extension: validation.extension,
      content_type: String(contentType || 'application/octet-stream').slice(0, 180),
      byte_size: Number(byteSize),
      category,
      tags: normalizeDocumentTags(tags),
      notes: String(notes || '').trim().slice(0, 2000),
      storage_bucket: WORKSPACE_DOCUMENT_BUCKET,
      storage_path: storagePath,
      version_group: versionGroup,
      version: (previous?.version || 0) + 1,
      supersedes_id: previous?.id || null,
      upload_status: 'uploading',
      extraction_status: 'not_started',
      extracted_text: '',
      uploaded_by: actor,
      created_at: new Date().toISOString(),
      uploaded_at: null,
      deleted_at: null,
      deleted_by: null,
    };
    documents.push(created);
    return created;
  });

  const { data: signed, error: signError } = await supabase.storage
    .from(WORKSPACE_DOCUMENT_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signError) {
    await mutateWorkspaceDocumentIndex(supabase, (documents) => {
      const failed = documents.find((row) => row.id === id);
      if (failed) failed.upload_status = 'failed';
    });
    throw signError;
  }
  return res.status(201).json({ document: publicDocument(document), upload: signed, bucket: WORKSPACE_DOCUMENT_BUCKET });
}

async function completeUpload(req, res, supabase) {
  const id = cleanScope(req.body?.id);
  if (!id) return res.status(400).json({ error: 'Document id required' });
  const documents = await loadWorkspaceDocumentIndex(supabase);
  const pending = documents.find((row) => row.id === id);
  if (!pending) return res.status(404).json({ error: 'Document upload not found' });

  const slash = pending.storage_path.lastIndexOf('/');
  const folder = pending.storage_path.slice(0, slash);
  const name = pending.storage_path.slice(slash + 1);
  const { data: objects, error: listError } = await supabase.storage
    .from(pending.storage_bucket)
    .list(folder, { search: name, limit: 10 });
  if (listError) throw listError;
  if (!(objects || []).some((object) => object.name === name)) {
    return res.status(409).json({ error: 'The file did not reach private storage. Please retry the upload.' });
  }

  const textCapable = canExtractDocumentText(pending.filename);
  const extractedText = textCapable ? String(req.body?.extractedText || '').slice(0, MAX_EXTRACTED_TEXT) : '';
  const document = await mutateWorkspaceDocumentIndex(supabase, (index) => {
    const row = index.find((item) => item.id === id);
    if (!row) throw new Error('Document upload not found');
    row.upload_status = 'available';
    row.uploaded_at = new Date().toISOString();
    row.extracted_text = extractedText;
    row.extraction_status = textCapable ? (extractedText ? 'ready' : 'failed') : 'not_started';
    return row;
  });
  return res.status(200).json({ document: publicDocument(document) });
}

async function signedDocumentUrl(req, res, supabase) {
  const id = cleanScope(req.query?.id);
  if (!id) return res.status(400).json({ error: 'Document id required' });
  const document = (await loadWorkspaceDocumentIndex(supabase)).find((row) => row.id === id);
  if (!document || document.deleted_at || document.upload_status !== 'available') {
    return res.status(404).json({ error: 'Document not found' });
  }
  const { data, error } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 600, { download: req.query?.download === '1' ? document.filename : false });
  if (error) throw error;
  return res.status(200).json({ url: data.signedUrl, filename: document.filename, contentType: document.content_type, expiresIn: 600 });
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  const supabase = getPortalAdminClient();
  try {
    if (req.method === 'GET' && req.query?.action === 'url') return await signedDocumentUrl(req, res, supabase);

    if (req.method === 'GET') {
      const workspaceType = cleanScope(req.query?.workspaceType);
      const recordId = cleanScope(req.query?.recordId) || null;
      const archived = req.query?.archived === '1';
      validateScope(workspaceType);
      const documents = (await loadWorkspaceDocumentIndex(supabase))
        .filter((row) => row.workspace_type === workspaceType
          && (row.record_id || null) === recordId
          && row.upload_status === 'available'
          && (archived ? Boolean(row.deleted_at) : !row.deleted_at))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 200)
        .map(publicDocument);
      return res.status(200).json({ documents });
    }

    const actor = await requestActor(req);
    if (req.method === 'POST' && req.body?.action === 'prepare') return await prepareUpload(req, res, supabase, actor);
    if (req.method === 'POST' && req.body?.action === 'complete') return await completeUpload(req, res, supabase);

    if (req.method === 'PATCH') {
      const id = cleanScope(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Document id required' });
      const action = req.body?.action || 'update';
      const document = await mutateWorkspaceDocumentIndex(supabase, (documents) => {
        const row = documents.find((item) => item.id === id);
        if (!row) throw new Error('Document not found');
        if (action === 'restore') {
          row.deleted_at = null;
          row.deleted_by = null;
        } else if (action === 'archive') {
          row.deleted_at = new Date().toISOString();
          row.deleted_by = actor;
        } else {
          if (req.body?.title !== undefined) row.title = String(req.body.title || '').trim().slice(0, 180);
          if (req.body?.notes !== undefined) row.notes = String(req.body.notes || '').trim().slice(0, 2000);
          if (req.body?.tags !== undefined) row.tags = normalizeDocumentTags(req.body.tags);
          if (req.body?.category !== undefined) {
            if (!DOCUMENT_CATEGORIES.includes(req.body.category)) throw new Error('Unknown document category');
            row.category = req.body.category;
          }
        }
        return row;
      });
      return res.status(200).json({ document: publicDocument(document) });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = /Unknown|Unsupported|must be|empty|required|not found/i.test(error?.message || '') ? 400 : 500;
    return res.status(status).json({ error: error?.message || 'Document request failed' });
  }
}
