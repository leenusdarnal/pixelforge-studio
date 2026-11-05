export const MAX_HISTORY_BYTES = 150 * 1024 * 1024;
export const MAX_HISTORY_ENTRIES = 24;

/**
 * Estimate the memory cost of a project's base64 canvas payloads.
 * @param {{ layers: Array<{ data?: string | null, maskData?: string | null }> } | null | undefined} state
 * @returns {number}
 */
export function estimateSnapshotBytes(state) {
  if (!state || !Array.isArray(state.layers)) return 0;
  return state.layers.reduce((total, layer) => {
    const imageBytes = (layer.data?.length || 0) + (layer.maskData?.length || 0);
    return total + imageBytes * 0.75;
  }, 0);
}
