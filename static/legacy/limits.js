export const MAX_DOCUMENT_PIXELS = 24_000_000;
export const MAX_DOCUMENT_SIDE = 6_000;

export function isAllowedDocumentSize(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width <= MAX_DOCUMENT_SIDE
    && height <= MAX_DOCUMENT_SIDE && width * height <= MAX_DOCUMENT_PIXELS;
}

export function fitWithinDocumentLimit(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new RangeError('Image dimensions must be positive numbers.');
  }
  const scale = Math.min(1, MAX_DOCUMENT_SIDE / width, MAX_DOCUMENT_SIDE / height,
    Math.sqrt(MAX_DOCUMENT_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scaled: scale < 1 };
}
