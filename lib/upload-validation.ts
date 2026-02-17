/**
 * Server-side validation helpers for file uploads.
 * Keeps user data in memory only — nothing is written to disk.
 */

const MAX_TEXT_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TEXT_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
]);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateTextFile(file: File): ValidationResult {
  if (file.size > MAX_TEXT_SIZE) {
    return { valid: false, error: `파일 크기가 너무 큽니다 (최대 ${MAX_TEXT_SIZE / 1024 / 1024}MB)` };
  }

  // Accept files with allowed MIME types or common text extensions
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowedExtensions = new Set(['txt', 'csv', 'json', 'md']);

  if (!ALLOWED_TEXT_TYPES.has(file.type) && !allowedExtensions.has(ext)) {
    return { valid: false, error: '허용되지 않는 파일 형식입니다 (.txt, .csv, .json, .md만 가능)' };
  }

  return { valid: true };
}

export function validateImageFile(file: File): ValidationResult {
  if (file.size > MAX_IMAGE_SIZE) {
    return { valid: false, error: `파일 크기가 너무 큽니다 (최대 ${MAX_IMAGE_SIZE / 1024 / 1024}MB)` };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif']);

  if (!ALLOWED_IMAGE_TYPES.has(file.type) && !allowedExtensions.has(ext)) {
    return { valid: false, error: '허용되지 않는 파일 형식입니다 (JPG, PNG, HEIC만 가능)' };
  }

  return { valid: true };
}

/**
 * Sanitise raw text before it reaches the LLM.
 * Strips potential prompt-injection markers without changing real content.
 */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/<\/?script[^>]*>/gi, '')  // strip script tags
    .replace(/\0/g, '')                  // strip null bytes
    .slice(0, 200_000);                  // hard character cap
}
