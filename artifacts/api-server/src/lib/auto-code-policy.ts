import path from 'node:path';

export const MAX_AUTOCODE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AUTOCODE_UPLOADS_PER_TURN = 5;
export const MAX_AUTOCODE_TOTAL_UPLOAD_BYTES = 20 * 1024 * 1024;

const textExtensions = new Set([
  '.css', '.csv', '.html', '.js', '.jsx', '.json', '.md', '.markdown',
  '.mjs', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const imageTypes = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const writableRoots = [
  'artifacts/code-me-generation/src/',
  'artifacts/api-server/src/',
  'lib/db/src/',
];
const writableExtensions = new Set(['.css', '.html', '.json', '.md', '.ts', '.tsx', '.yaml', '.yml']);
const forbiddenPathParts = new Set(['.git', '.agents', '.env', 'node_modules', 'test', 'tests']);

export function normalizeAutoCodeAttachment(name: string, contentType: string) {
  const extension = path.extname(name).toLowerCase();
  if (imageTypes.has(extension)) return imageTypes.get(extension)!;
  if (extension === '.pdf') return 'application/pdf';
  if (textExtensions.has(extension)) {
    if (extension === '.json') return 'application/json';
    if (extension === '.html') return 'text/html';
    if (extension === '.css') return 'text/css';
    if (extension === '.csv') return 'text/csv';
    if (extension === '.md' || extension === '.markdown') return 'text/markdown';
    if (extension === '.yaml' || extension === '.yml') return 'text/yaml';
    return 'text/plain';
  }
  const normalizedType = contentType.toLowerCase().split(';')[0].trim();
  if (['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(normalizedType)) {
    return normalizedType;
  }
  if (normalizedType.startsWith('text/')) return normalizedType;
  if (normalizedType === 'application/json') return normalizedType;
  return null;
}

export function isCredentialLike(value: string) {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value) ||
    /\b(?:AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(value) ||
    /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i.test(value)
  );
}

export function isWritablePlatformPath(rawPath: string, sourcePaths: Set<string>) {
  if (
    rawPath.length === 0 ||
    rawPath.length > 500 ||
    rawPath.startsWith('/') ||
    rawPath.includes('\\') ||
    rawPath.includes('\0')
  ) {
    return false;
  }
  const normalized = path.posix.normalize(rawPath);
  if (normalized !== rawPath || normalized.startsWith('../') || normalized === '..') return false;
  const segments = normalized.split('/');
  if (segments.some((segment) => segment.startsWith('.') || forbiddenPathParts.has(segment.toLowerCase()))) {
    return false;
  }
  if (!writableRoots.some((root) => normalized.startsWith(root))) return false;
  if (!writableExtensions.has(path.posix.extname(normalized).toLowerCase())) return false;
  return sourcePaths.has(normalized) || writableRoots.some((root) => normalized.startsWith(root));
}

export function sanitizeAutoCodePreview(html: string) {
  let safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|form)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:src|href|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' href="#"');

  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; media-src data:; connect-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">';
  if (/<head\b[^>]*>/i.test(safe)) {
    safe = safe.replace(/<head\b[^>]*>/i, (head) => `${head}${csp}`);
  } else if (/<html\b[^>]*>/i.test(safe)) {
    safe = safe.replace(/<html\b[^>]*>/i, (htmlTag) => `${htmlTag}<head>${csp}</head>`);
  } else {
    safe = `<!doctype html><html><head>${csp}</head><body>${safe}</body></html>`;
  }
  return safe;
}
