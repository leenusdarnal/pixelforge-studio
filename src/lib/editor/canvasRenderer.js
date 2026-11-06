/** Canvas compositing primitives shared by the editor renderer and layer tools. */
/** @param {{ _maskCompositeDirty?: boolean } | null | undefined} layer */
export function invalidateCanvasComposite(layer) {
  if (layer) layer._maskCompositeDirty = true;
}
/**
 * @param {{ canvas: HTMLCanvasElement, mask?: HTMLCanvasElement | null, _maskComposite?: HTMLCanvasElement, _maskCompositeDirty?: boolean }} layer
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function getRenderedLayerCanvas(layer, width, height) {
  if (!layer.mask) return layer.canvas;
  if (!layer._maskComposite || layer._maskComposite.width !== width || layer._maskComposite.height !== height) {
    layer._maskComposite = document.createElement('canvas');
    layer._maskComposite.width = width;
    layer._maskComposite.height = height;
    layer._maskCompositeDirty = true;
  }
  if (layer._maskCompositeDirty) {
    const context = layer._maskComposite.getContext('2d');
    if (!context) throw new Error('Could not create a layer mask compositing context.');
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
    context.drawImage(layer.canvas, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(layer.mask, 0, 0);
    context.globalCompositeOperation = 'source-over';
    layer._maskCompositeDirty = false;
  }
  return layer._maskComposite;
}
/** @param {{ editMask?: boolean, mask?: HTMLCanvasElement | null, canvas?: HTMLCanvasElement } | null | undefined} layer */
export function getPaintTarget(layer) {
  return layer && layer.editMask && layer.mask ? layer.mask : layer?.canvas;
}
