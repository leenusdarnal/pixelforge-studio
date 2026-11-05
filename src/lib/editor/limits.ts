export const MAX_DOCUMENT_PIXELS = 24_000_000;
export const MAX_DOCUMENT_SIDE = 6_000;

export function isAllowedDocumentSize(width: number, height: number): boolean {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width <= MAX_DOCUMENT_SIDE
    && height <= MAX_DOCUMENT_SIDE && width * height <= MAX_DOCUMENT_PIXELS;
}
