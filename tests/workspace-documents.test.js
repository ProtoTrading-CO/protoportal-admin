import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  canExtractDocumentText,
  defaultDocumentCategory,
  documentExtension,
  documentVersionGroup,
  formatDocumentBytes,
  normalizeDocumentTags,
  safeDocumentFilename,
  validateDocumentFile,
} from '../lib/workspace-documents.mjs';

describe('workspace documents', () => {
  it('accepts common business files and rejects unsafe extensions', () => {
    expect(validateDocumentFile({ name: 'Supplier Quote.pdf', size: 1200 })).toMatchObject({ ok: true, extension: 'pdf' });
    expect(validateDocumentFile({ name: 'stock.xlsx', size: 1200 }).ok).toBe(true);
    expect(validateDocumentFile({ name: 'payload.exe', size: 1200 }).ok).toBe(false);
    expect(validateDocumentFile({ name: 'too-large.pdf', size: MAX_DOCUMENT_BYTES + 1 }).ok).toBe(false);
  });

  it('normalizes filenames without losing useful business punctuation', () => {
    expect(safeDocumentFilename('  Motarro / Winter Quote #4.xlsx  ')).toBe('Motarro - Winter Quote -4.xlsx');
    expect(documentExtension('PHOTO.JPEG')).toBe('jpeg');
    expect(documentVersionGroup('Quote Final.pdf')).toBe('quote final.pdf');
  });

  it('normalizes and deduplicates tags', () => {
    expect(normalizeDocumentTags(' Supplier, urgent action, supplier ')).toEqual(['supplier', 'urgent-action']);
  });

  it('classifies files and exposes bounded text extraction', () => {
    expect(defaultDocumentCategory('range.csv')).toBe('spreadsheet');
    expect(defaultDocumentCategory('photo.webp')).toBe('image');
    expect(canExtractDocumentText('notes.txt')).toBe(true);
    expect(canExtractDocumentText('contract.pdf')).toBe(false);
    expect(formatDocumentBytes(1536)).toBe('2 KB');
  });
});
