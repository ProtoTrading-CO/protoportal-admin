import { supabase } from './supabase';
import { readApiJson } from './apiError';
import {
  MAX_EXTRACTED_TEXT,
  canExtractDocumentText,
  normalizeDocumentTags,
  validateDocumentFile,
} from '../../lib/workspace-documents.mjs';

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return readApiJson(res, { fallback: 'Workspace document request failed' });
}

export async function listWorkspaceDocuments({ workspaceType, recordId = '', archived = false }) {
  const params = new URLSearchParams({ workspaceType });
  if (recordId) params.set('recordId', recordId);
  if (archived) params.set('archived', '1');
  const json = await request(`/api/workspace-documents?${params}`);
  return json.documents || [];
}

export async function getWorkspaceDocumentUrl(id, { download = false } = {}) {
  const params = new URLSearchParams({ action: 'url', id });
  if (download) params.set('download', '1');
  return request(`/api/workspace-documents?${params}`);
}

export async function updateWorkspaceDocument(id, fields) {
  const json = await request('/api/workspace-documents', {
    method: 'PATCH',
    body: JSON.stringify({ id, action: 'update', ...fields }),
  });
  return json.document;
}

export async function archiveWorkspaceDocument(id) {
  const json = await request('/api/workspace-documents', {
    method: 'PATCH',
    body: JSON.stringify({ id, action: 'archive' }),
  });
  return json.document;
}

export async function restoreWorkspaceDocument(id) {
  const json = await request('/api/workspace-documents', {
    method: 'PATCH',
    body: JSON.stringify({ id, action: 'restore' }),
  });
  return json.document;
}

async function safeExtractText(file) {
  if (!canExtractDocumentText(file.name)) return '';
  try {
    return String(await file.text()).slice(0, MAX_EXTRACTED_TEXT);
  } catch {
    return '';
  }
}

export async function uploadWorkspaceDocument({
  workspaceType,
  recordId = '',
  file,
  category = 'general',
  tags = [],
  notes = '',
  title = '',
}) {
  const validation = validateDocumentFile(file);
  if (!validation.ok) throw new Error(`${file.name}: ${validation.error}`);

  const prepared = await request('/api/workspace-documents', {
    method: 'POST',
    body: JSON.stringify({
      action: 'prepare',
      workspaceType,
      recordId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      byteSize: file.size,
      category,
      tags: normalizeDocumentTags(tags),
      notes,
      title,
    }),
  });

  const { error } = await supabase.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });
  if (error) throw error;

  const extractedText = await safeExtractText(file);
  const completed = await request('/api/workspace-documents', {
    method: 'POST',
    body: JSON.stringify({ action: 'complete', id: prepared.document.id, extractedText }),
  });
  return completed.document;
}

export async function uploadWorkspaceDocuments(options) {
  const files = Array.from(options.files || []);
  const uploaded = [];
  for (let index = 0; index < files.length; index += 1) {
    options.onProgress?.({ index, total: files.length, file: files[index] });
    uploaded.push(await uploadWorkspaceDocument({ ...options, file: files[index] }));
  }
  options.onProgress?.({ index: files.length, total: files.length, file: null });
  return uploaded;
}
