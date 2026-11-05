// @ts-nocheck
// The existing editor engine is being migrated incrementally from JavaScript to typed feature modules.
/** Transitional editing runtime. Feature-level decomposition follows in later migration slices. */
import { isAllowedDocumentSize, fitWithinDocumentLimit } from "./limits";

let editorMounted = false;
export function mountEditor(): void {
  if (editorMounted) return;
  editorMounted = true;
(() => {
'use strict';
const $ = id => document.getElementById(id);
const display = $('displayCanvas'), overlay = $('overlayCanvas'), stage = $('stage'), viewport = $('canvasViewport');
const dctx = display.getContext('2d'), octx = overlay.getContext('2d');
let docW=1200, docH=800, zoom=.7, layers=[], activeId=null, tool='move', pointerStart=null, isDrawing=false, currentPath=[], selection=null, cropRect=null, moveBuffer=null, gridOn=false, docName='Untitled design', clipboardCanvas=null, clipboardX=0, clipboardY=0, draggingLayerId=null, moveMaskBuffer=null, pendingTextPosition=null, editingTextLayerId=null;
let history=[], redoStack=[], historyLabels=[], historyIndex=-1, lastAction='New document', drawingSnapshot=null, historyBytes=0;
const maxHistoryBytes=150*1024*1024;
const activeTouchPoints=new Map();let pinchGesture=null;
const maxHistory=24;
const toolNames={move:'Move tool',marquee:'Rectangular marquee',lasso:'Freehand lasso',crop:'Crop tool',brush:'Brush tool',pencil:'Pencil tool',eraser:'Eraser tool',fill:'Fill tool',eyedropper:'Eyedropper tool',text:'Type tool',rectangle:'Rectangle tool',ellipse:'Ellipse tool',line:'Line tool',hand:'Hand tool',zoom:'Zoom tool'};
const toolKeys={v:'move',m:'marquee',l:'lasso',c:'crop',b:'brush',p:'pencil',e:'eraser',g:'fill',i:'eyedropper',t:'text',u:'rectangle',o:'ellipse',h:'hand',z:'zoom'};
const uid=()=>Math.random().toString(36).slice(2,10);
function activeLayer(){return layers.find(l=>l.id===activeId)||layers[layers.length-1]}
function makeLayer(name='Layer',type='pixel') {const c=document.createElement('canvas');c.width=docW;c.height=docH;return {id:uid(),name,type,canvas:c,mask:null,editMask:false,_maskComposite:null,_maskCompositeDirty:true,visible:true,opacity:100,blend:'source-over',locked:false}}
function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),2100)}
function updateTitle(){ $('docTitle').textContent=docName; $('docDimensions').textContent=`${docW} × ${docH} px`; }
function resizeCanvases(){display.width=overlay.width=docW;display.height=overlay.height=docH;stage.style.width=(docW*zoom)+'px';stage.style.height=(docH*zoom)+'px';layers.forEach(l=>{if(l.canvas.width!==docW||l.canvas.height!==docH){const c=document.createElement('canvas');c.width=docW;c.height=docH;c.getContext('2d').drawImage(l.canvas,0,0);l.canvas=c}if(l.mask&&(l.mask.width!==docW||l.mask.height!==docH)){const m=document.createElement('canvas');m.width=docW;m.height=docH;m.getContext('2d').drawImage(l.mask,0,0);l.mask=m}invalidateLayerComposite(l)});render()}
function invalidateLayerComposite(layer){if(layer)layer._maskCompositeDirty=true}
function renderedLayerCanvas(layer){if(!layer.mask)return layer.canvas;if(!layer._maskComposite||layer._maskComposite.width!==docW||layer._maskComposite.height!==docH){layer._maskComposite=document.createElement('canvas');layer._maskComposite.width=docW;layer._maskComposite.height=docH;layer._maskCompositeDirty=true}if(layer._maskCompositeDirty){const x=layer._maskComposite.getContext('2d');x.clearRect(0,0,docW,docH);x.globalCompositeOperation='source-over';x.drawImage(layer.canvas,0,0);x.globalCompositeOperation='destination-in';x.drawImage(layer.mask,0,0);x.globalCompositeOperation='source-over';layer._maskCompositeDirty=false}return layer._maskComposite}
function paintTarget(layer){return layer&&layer.editMask&&layer.mask?layer.mask:layer?.canvas}
function maskPaintOperation(layer,toolName){if(toolName==='eraser')return'destination-out';if(layer?.editMask&&layer.mask){const hex=$('fgColor').value;const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(.299*r+.587*g+.114*b)<128?'destination-out':'source-over'}return'source-over'}
function addLayerMask(){const l=activeLayer();if(!l)return;if(l.locked){showToast('Unlock this layer before creating a mask');return}if(l.mask){l.editMask=true;renderLayers();showToast('Mask editing selected');return}commit('Before add layer mask');const m=document.createElement('canvas');m.width=docW;m.height=docH;const x=m.getContext('2d');x.fillStyle='#fff';if(selection){x.save();applySelectionClip(x);x.fillRect(0,0,docW,docH);x.restore()}else{x.fillRect(0,0,docW,docH)}l.mask=m;l.editMask=true;invalidateLayerComposite(l);render();updateTool();showToast(selection?'Mask created: selected area revealed':'White layer mask added')}
function hideSelectionWithMask(){const l=activeLayer();if(!l)return;if(!selection){showToast('Create a selection first');return}if(l.locked){showToast('Unlock this layer first');return}commit('Before hide selection on mask');if(!l.mask){l.mask=document.createElement('canvas');l.mask.width=docW;l.mask.height=docH;const base=l.mask.getContext('2d');base.fillStyle='#fff';base.fillRect(0,0,docW,docH)}const mctx=l.mask.getContext('2d');mctx.save();applySelectionClip(mctx);mctx.clearRect(0,0,docW,docH);mctx.restore();l.editMask=true;invalidateLayerComposite(l);render();updateTool();showToast('Selected area hidden by mask')}
function toggleMaskEditing(){const l=activeLayer();if(!l||!l.mask){showToast('Add a mask first');return}if(l.locked){showToast('Unlock this layer before editing its mask');return}l.editMask=!l.editMask;renderLayers();updateTool();showToast(l.editMask?'Editing layer mask: paint white to reveal, black to hide':'Editing layer pixels')}
function invertLayerMask(){const l=activeLayer();if(!l||!l.mask)return;if(l.locked){showToast('Unlock this layer before inverting its mask');return}commit('Before invert layer mask');const ctx=l.mask.getContext('2d'),img=ctx.getImageData(0,0,docW,docH),d=img.data;for(let i=3;i<d.length;i+=4)d[i]=255-d[i];ctx.putImageData(img,0,0);invalidateLayerComposite(l);render();showToast('Layer mask inverted')}
function applyLayerMask(){const l=activeLayer();if(!l||!l.mask)return;if(l.locked){showToast('Unlock this layer before applying its mask');return}commit('Before apply layer mask');rasterizeTextLayer(l);const ctx=l.canvas.getContext('2d');ctx.save();ctx.globalCompositeOperation='destination-in';ctx.drawImage(l.mask,0,0);ctx.restore();l.mask=null;l.editMask=false;l._maskComposite=null;render();showToast('Mask applied to layer pixels')}
function removeLayerMask(){const l=activeLayer();if(!l||!l.mask)return;if(l.locked){showToast('Unlock this layer before removing its mask');return}commit('Before remove layer mask');l.mask=null;l.editMask=false;l._maskComposite=null;render();showToast('Layer mask removed')}
function render(updateLayerPanel=true){dctx.clearRect(0,0,docW,docH);for(const l of layers){if(!l.visible)continue;dctx.save();dctx.globalAlpha=l.opacity/100;dctx.globalCompositeOperation=l.blend||'source-over';dctx.drawImage(renderedLayerCanvas(l),0,0);dctx.restore()}display.style.width=overlay.style.width=(docW*zoom)+'px';display.style.height=overlay.style.height=(docH*zoom)+'px';stage.style.width=(docW*zoom)+'px';stage.style.height=(docH*zoom)+'px';drawOverlay();if(updateLayerPanel)renderLayers();updateTitle()}
function drawOverlay(){octx.clearRect(0,0,docW,docH);if(selection){octx.save();octx.setLineDash([7,4]);octx.lineWidth=1.4/zoom;octx.strokeStyle='#ffffff';if(selection.path){octx.beginPath();octx.moveTo(selection.path[0].x,selection.path[0].y);selection.path.forEach(p=>octx.lineTo(p.x,p.y));octx.closePath();octx.stroke();octx.lineDashOffset=4;octx.strokeStyle='#1b1c20';octx.stroke()}else{octx.strokeRect(selection.x,selection.y,selection.w,selection.h);octx.lineDashOffset=4;octx.strokeStyle='#1b1c20';octx.strokeRect(selection.x,selection.y,selection.w,selection.h)}octx.restore()}if(cropRect){octx.save();octx.fillStyle='#0008';octx.fillRect(0,0,docW,docH);octx.clearRect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);octx.setLineDash([6,3]);octx.lineWidth=1.4/zoom;octx.strokeStyle='#fff';octx.strokeRect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);octx.restore()}if(gridOn){octx.save();octx.strokeStyle='#ffffff22';octx.lineWidth=1/zoom;const step=50;for(let x=step;x<docW;x+=step){octx.beginPath();octx.moveTo(x,0);octx.lineTo(x,docH);octx.stroke()}for(let y=step;y<docH;y+=step){octx.beginPath();octx.moveTo(0,y);octx.lineTo(docW,y);octx.stroke()}octx.restore()}}
function renderLayers(){
  const list=$('layerList');list.innerHTML='';
  [...layers].reverse().forEach(l=>{
    const row=document.createElement('div');row.className='layer-row'+(l.id===activeId?' active':'')+(l.editMask?' mask-editing':'');row.draggable=true;row.dataset.layerId=l.id;
    row.innerHTML=`<button class="visibility" title="Toggle visibility" aria-label="Toggle visibility">${l.visible?'◉':'◌'}</button><div class="thumb"><canvas width="72" height="68"></canvas></div><div class="layer-meta"><div class="layer-name"></div><div class="layer-type">${l.type==='text'?'TYPE LAYER':l.type==='image'?'IMAGE LAYER':'PIXEL LAYER'}</div></div><button class="layer-lock ${l.locked?'locked':''}" title="${l.locked?'Unlock layer':'Lock layer'}" aria-label="${l.locked?'Unlock layer':'Lock layer'}">${l.locked?'🔒':'♧'}</button>`;
    row.querySelector('.layer-name').textContent=l.name+(l.mask?'  ◧':'');
    const tc=row.querySelector('canvas').getContext('2d');tc.clearRect(0,0,72,68);tc.drawImage(renderedLayerCanvas(l),0,0,72,68);
    row.addEventListener('click',e=>{if(e.target.closest('button'))return;activeId=l.id;renderLayers();syncLayerControls()});
    row.querySelector('.visibility').addEventListener('click',e=>{e.stopPropagation();commit('Before visibility change');l.visible=!l.visible;render()});
    row.querySelector('.layer-lock').addEventListener('click',e=>{e.stopPropagation();commit('Before lock change');l.locked=!l.locked;renderLayers();syncLayerControls();showToast(l.locked?'Layer locked':'Layer unlocked')});
    row.querySelector('.layer-name').addEventListener('dblclick',e=>{e.stopPropagation();renameLayer(l)});
    row.addEventListener('dragstart',e=>{draggingLayerId=l.id;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.id)});
    row.addEventListener('dragend',()=>{draggingLayerId=null;row.classList.remove('dragging');list.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'))});
    row.addEventListener('dragover',e=>{e.preventDefault();if(draggingLayerId&&draggingLayerId!==l.id)row.classList.add('drop-target')});
    row.addEventListener('dragleave',()=>row.classList.remove('drop-target'));
    row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drop-target');const from=layers.findIndex(x=>x.id===draggingLayerId),to=layers.findIndex(x=>x.id===l.id);if(from<0||to<0||from===to)return;commit('Before reorder layers');const [item]=layers.splice(from,1);layers.splice(to,0,item);activeId=item.id;render();showToast('Layer reordered')});
    list.appendChild(row);
  });
  $('layerOpacity').disabled=!activeLayer();$('blendMode').disabled=!activeLayer();$('toggleLockBtn').disabled=!activeLayer();syncLayerControls();
}
function syncLayerControls(){const l=activeLayer();if(!l){$('editTextBtn').disabled=true;return}$('layerOpacity').value=l.opacity;$('layerOpacityOut').textContent=l.opacity+'%';$('blendMode').value=l.blend;$('toggleLockBtn').textContent=l.locked?'Unlock layer':'Lock layer';$('toggleLockBtn').style.background=l.locked?'#66512d':'';$('addMaskBtn').textContent=l.mask?'Mask active':'Add mask';$('editMaskBtn').disabled=!l.mask||l.locked;$('editMaskBtn').textContent=l.editMask?'Edit pixels':'Edit mask';$('invertMaskBtn').disabled=!l.mask||l.locked;$('applyMaskBtn').disabled=!l.mask||l.locked;$('removeMaskBtn').disabled=!l.mask||l.locked;$('hideSelectionMaskBtn').disabled=!selection||l.locked;$('editTextBtn').disabled=l.type!=='text'||!l.textData||l.locked}
function renameLayer(layer=activeLayer()){if(!layer)return;const name=prompt('Layer name:',layer.name);if(name===null)return;const next=name.trim();if(!next){showToast('Layer name cannot be empty');return}commit('Before rename layer');layer.name=next;renderLayers();showToast('Layer renamed')}
function applySelectionClip(ctx){if(!selection)return;ctx.beginPath();if(selection.path&&selection.path.length>2){ctx.moveTo(selection.path[0].x,selection.path[0].y);for(let i=1;i<selection.path.length;i++)ctx.lineTo(selection.path[i].x,selection.path[i].y);ctx.closePath()}else{ctx.rect(selection.x,selection.y,selection.w,selection.h)}ctx.clip()}
function isInsideSelection(x,y){if(!selection)return true;if(!selection.path)return x>=selection.x&&y>=selection.y&&x<=selection.x+selection.w&&y<=selection.y+selection.h;let inside=false;const pts=selection.path;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-12)+xi);if(hit)inside=!inside}return inside}
function selectAll(){selection={x:0,y:0,w:docW,h:docH};cropRect=null;drawOverlay();syncLayerControls();showToast('Entire canvas selected')}
function deselect(){selection=null;drawOverlay();syncLayerControls();showToast('Selection cleared')}
function selectionBounds(){if(!selection)return{x:0,y:0,w:docW,h:docH};return{x:Math.max(0,Math.floor(selection.x)),y:Math.max(0,Math.floor(selection.y)),w:Math.max(1,Math.min(docW-Math.floor(selection.x),Math.ceil(selection.w))),h:Math.max(1,Math.min(docH-Math.floor(selection.y),Math.ceil(selection.h)))}}
function copySelection(cut=false){const l=activeLayer();if(!l)return;if(l.editMask){showToast('Switch to Edit pixels before copying');return}if(cut&&l.locked){showToast('Unlock this layer before cutting');return}const b=selectionBounds(),c=document.createElement('canvas');c.width=b.w;c.height=b.h;const x=c.getContext('2d');if(selection)applySelectionClipTranslated(x,-b.x,-b.y);x.drawImage(l.canvas,-b.x,-b.y);clipboardCanvas=c;clipboardX=b.x;clipboardY=b.y;if(cut){commit('Before cut');rasterizeTextLayer(l);const ctx=l.canvas.getContext('2d');ctx.save();applySelectionClip(ctx);ctx.clearRect(b.x,b.y,b.w,b.h);ctx.restore();render()}showToast(cut?'Selection cut':'Copied to PixelForge clipboard')}
function applySelectionClipTranslated(ctx,dx,dy){if(!selection)return;ctx.beginPath();if(selection.path&&selection.path.length>2){ctx.moveTo(selection.path[0].x+dx,selection.path[0].y+dy);for(let i=1;i<selection.path.length;i++)ctx.lineTo(selection.path[i].x+dx,selection.path[i].y+dy);ctx.closePath()}else{ctx.rect(selection.x+dx,selection.y+dy,selection.w,selection.h)}ctx.clip()}
function pasteClipboard(){if(!clipboardCanvas){showToast('Nothing copied yet');return}commit('Before paste');const l=makeLayer('Pasted layer','image');l.canvas.getContext('2d').drawImage(clipboardCanvas,clipboardX,clipboardY);layers.push(l);activeId=l.id;selection=null;render();showToast('Pasted as a new layer')}
function clearSelection(){const l=activeLayer();if(!l||l.locked){showToast(l?.locked?'Unlock this layer first':'No active layer');return}if(!selection)return;const b=selectionBounds();commit('Before clear selection');if(!l.editMask)rasterizeTextLayer(l);const ctx=paintTarget(l).getContext('2d');ctx.save();applySelectionClip(ctx);ctx.clearRect(b.x,b.y,b.w,b.h);ctx.restore();invalidateLayerComposite(l);render();showToast('Selected pixels cleared')}
function setZoom(z){zoom=Math.min(4,Math.max(.1,z));stage.style.width=(docW*zoom)+'px';stage.style.height=(docH*zoom)+'px';display.style.width=overlay.style.width=(docW*zoom)+'px';display.style.height=overlay.style.height=(docH*zoom)+'px';$('zoomValue').value=Math.round(zoom*100)+'%'}
function fitCanvas(){const r=viewport.getBoundingClientRect();setZoom(Math.max(.1,Math.min((r.width-72)/docW,(r.height-72)/docH,1)));}
function updateTool(){document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const maskMode=!!activeLayer()?.editMask,maskTool=maskMode&&['brush','pencil','eraser','fill','rectangle','ellipse','line'].includes(tool),label=(maskTool?'Mask · ':'')+(toolNames[tool]||tool);$('toolTitle').textContent=label;$('activeToolLabel').textContent=label;stage.style.cursor=tool==='text'?'text':tool==='hand'?'grab':tool==='zoom'?'zoom-in':tool==='eyedropper'?'crosshair':tool==='move'?'move':'crosshair';$('canvasHint').textContent=tool==='crop'?'Drag a crop area, then press Enter to apply · Esc to cancel':tool==='marquee'?'Drag to create a rectangular selection · Delete clears selected pixels':maskTool?'Mask editing: white reveals · black or eraser hides':'Touch to edit · Pinch with two fingers to zoom · Panels for layers and adjustments'}
function setTool(t){tool=t;updateTool()}
function point(e){const r=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(docW,(e.clientX-r.left)/zoom)),y:Math.max(0,Math.min(docH,(e.clientY-r.top)/zoom))}}
function snap(){return {w:docW,h:docH,name:docName,activeId,layers:layers.map(l=>({id:l.id,name:l.name,type:l.type,visible:l.visible,opacity:l.opacity,blend:l.blend,locked:l.locked,textData:l.textData?{...l.textData}:null,editMask:false,data:l.canvas.toDataURL('image/png'),maskData:l.mask?l.mask.toDataURL('image/png'):null}))}}
function estimateSnapshotBytes(state){return state.layers.reduce((total,layer)=>total+((layer.data?.length||0)+(layer.maskData?.length||0))*0.75,0)}
function publishParentState(){const payload={type:'PIXELFORGE_STATE',project:{format:'PixelForgeProject',version:3,...snap()}};try{if(window.parent!==window)window.parent.postMessage(payload,location.origin);else window.dispatchEvent(new CustomEvent('pixelforge:state',{detail:payload}))}catch(error){showToast('Local recovery could not capture this edit')}}
let parentSaveTimer;
function scheduleParentSave(){clearTimeout(parentSaveTimer);parentSaveTimer=setTimeout(publishParentState,280)}
function commit(label='Edit'){history=history.slice(0,historyIndex+1);historyLabels=historyLabels.slice(0,historyIndex+1);historyBytes=history.reduce((total,state)=>total+estimateSnapshotBytes(state),0);const state=snap();history.push(state);historyBytes+=estimateSnapshotBytes(state);historyLabels.push(label.replace(/^Before /,''));while(history.length>1&&(history.length>maxHistory||historyBytes>maxHistoryBytes)){const removed=history.shift();historyBytes=Math.max(0,historyBytes-estimateSnapshotBytes(removed));historyLabels.shift();historyIndex=Math.max(0,historyIndex-1)}historyIndex=history.length-1;redoStack=[];lastAction=label;updateHistoryUI();$('saveState').textContent='Unsaved changes';scheduleParentSave()}
async function loadCanvasData(data,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;if(data){const ctx=c.getContext('2d');await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{ctx.drawImage(im,0,0,w,h);resolve()};im.onerror=reject;im.src=data})}return c}
async function restore(s){if(!isAllowedDocumentSize(s.w,s.h))throw Error('Document exceeds 24 MP');docW=s.w;docH=s.h;docName=s.name||'Untitled design';layers=[];for(const obj of s.layers){const c=await loadCanvasData(obj.data,docW,docH);const mask=obj.maskData?await loadCanvasData(obj.maskData,docW,docH):null;layers.push({...obj,canvas:c,mask,editMask:false,_maskComposite:null,_maskCompositeDirty:true})}activeId=layers.some(l=>l.id===s.activeId)?s.activeId:(layers.at(-1)?.id||null);selection=null;cropRect=null;resizeCanvases();render();updateHistoryUI()}
function updateHistoryUI(){
  const list=$('historyList');if(!list)return;list.innerHTML='';
  const start=Math.max(0,historyLabels.length-16);
  if(!historyLabels.length){list.innerHTML='<div class="hint">No actions yet.</div>';return}
  for(let i=historyLabels.length-1;i>=start;i--){const row=document.createElement('button');row.className='dropitem history-entry'+(i===historyIndex?' current':'');row.style.width='100%';row.textContent=historyLabels[i];row.title='Restore this point in the history';row.addEventListener('click',async()=>{if(i<historyIndex){while(historyIndex>i)await undo()}else if(i>historyIndex){showToast('Use Redo to move forward through history')} });list.appendChild(row)}
  $('undoBtn').style.opacity=historyIndex>0?'1':'.4';$('redoBtn').style.opacity=redoStack.length?'1':'.4';
}
async function undo(){if(historyIndex<=0)return;const cur=snap();redoStack.push(cur);const prev=history[historyIndex];historyIndex--;await restore(prev);showToast('Undo: '+(historyLabels[historyIndex+1]||'Edit'));updateHistoryUI();scheduleParentSave()}
async function redo(){if(!redoStack.length)return;const s=redoStack.pop();historyIndex++;if(history[historyIndex])history[historyIndex]=s;else{history.push(s);historyLabels.push('Redo edit')}await restore(s);showToast('Redo');updateHistoryUI();scheduleParentSave()}
function addLayer(name='Layer'){commit('Before new layer');const l=makeLayer(name);layers.push(l);activeId=l.id;render();showToast('Layer added')}
function duplicateLayer(){const l=activeLayer();if(!l)return;commit('Before duplicate layer');const n=makeLayer(l.name+' copy',l.type);n.canvas.getContext('2d').drawImage(l.canvas,0,0);if(l.mask){n.mask=document.createElement('canvas');n.mask.width=docW;n.mask.height=docH;n.mask.getContext('2d').drawImage(l.mask,0,0)}n.opacity=l.opacity;n.blend=l.blend;n.locked=false;n.textData=l.textData?{...l.textData}:null;invalidateLayerComposite(n);layers.splice(layers.indexOf(l)+1,0,n);activeId=n.id;render();showToast('Layer duplicated')}
function deleteLayer(){if(layers.length<=1){showToast('Keep at least one layer');return}const i=layers.findIndex(l=>l.id===activeId);if(i<0)return;commit('Before delete layer');layers.splice(i,1);activeId=layers[Math.max(0,i-1)].id;render();showToast('Layer deleted')}
function moveLayer(dir){const i=layers.findIndex(l=>l.id===activeId),j=i+dir;if(i<0||j<0||j>=layers.length)return;commit('Before reorder layers');[layers[i],layers[j]]=[layers[j],layers[i]];render();}
function clearLayer(){const l=activeLayer();if(!l)return;if(l.locked){showToast('Unlock this layer before clearing it');return}commit('Before clear layer');if(!l.editMask)rasterizeTextLayer(l);paintTarget(l).getContext('2d').clearRect(0,0,docW,docH);invalidateLayerComposite(l);render();showToast('Layer cleared')}
function flatten(){if(layers.length<2)return;commit('Before flatten');const c=document.createElement('canvas');c.width=docW;c.height=docH;const x=c.getContext('2d');for(const l of layers){if(!l.visible)continue;x.globalAlpha=l.opacity/100;x.globalCompositeOperation=l.blend;x.drawImage(renderedLayerCanvas(l),0,0)}const merged=makeLayer('Flattened image','image');merged.canvas.getContext('2d').drawImage(c,0,0);layers=[merged];activeId=merged.id;render();showToast('Layers flattened')}
function drawSample(){docW=1200;docH=800;layers=[];const bg=makeLayer('Aurora background','image');let c=bg.canvas.getContext('2d');let g=c.createLinearGradient(0,0,1200,800);g.addColorStop(0,'#101b34');g.addColorStop(.52,'#263c63');g.addColorStop(1,'#5e477b');c.fillStyle=g;c.fillRect(0,0,1200,800);let glow=c.createRadialGradient(830,260,20,830,260,550);glow.addColorStop(0,'#d4b8ed99');glow.addColorStop(1,'#a3c5fa00');c.fillStyle=glow;c.fillRect(0,0,1200,800);for(let i=0;i<90;i++){const x=(i*173)%1200,y=(i*97)%800,r=(i%3)+1;c.fillStyle=`rgba(255,255,255,${.15+(i%5)*.08})`;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}c.fillStyle='#101d35';c.beginPath();c.moveTo(0,600);c.lineTo(250,350);c.lineTo(450,590);c.lineTo(690,300);c.lineTo(1000,620);c.lineTo(1200,450);c.lineTo(1200,800);c.lineTo(0,800);c.fill();c.fillStyle='#0c172b';c.beginPath();c.moveTo(0,680);c.lineTo(300,500);c.lineTo(560,700);c.lineTo(850,480);c.lineTo(1200,700);c.lineTo(1200,800);c.lineTo(0,800);c.fill();layers.push(bg);const text=makeLayer('Typography','text');c=text.canvas.getContext('2d');c.fillStyle='#ffffff';c.font='700 94px Arial';c.fillText('FIND YOUR',92,210);c.fillText('OWN LIGHT.',92,310);c.fillStyle='#b9d2ff';c.font='500 24px Arial';c.fillText('A LITTLE SPACE TO CREATE SOMETHING BEAUTIFUL',98,365);c.fillStyle='#ffffffaa';c.fillRect(98,410,88,4);c.font='500 17px Arial';c.fillText('PIXELFORGE  /  CREATIVE STUDIES',98,455);layers.push(text);activeId=text.id;docName='Aurora — sample project';resizeCanvases();commit('Sample project created');fitCanvas()}
function newDocument(w,h,bg,name){if(!isAllowedDocumentSize(w,h)){showToast('The document target is 24 megapixels. Choose smaller dimensions.');return}docW=w;docH=h;docName=name||'Untitled design';layers=[];const l=makeLayer(bg==='transparent'?'Layer 1':'Background');if(bg!=='transparent'){const c=l.canvas.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,w,h)}layers.push(l);activeId=l.id;selection=null;cropRect=null;history=[];historyLabels=[];historyIndex=-1;redoStack=[];historyBytes=0;resizeCanvases();commit('New document');fitCanvas();showToast('New document ready')}
function importImage(file,asLayer=false){if(!file)return;const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{const fit=fitWithinDocumentLimit(im.naturalWidth,im.naturalHeight);if(!asLayer||!layers.length){commit('Before opening image');docW=fit.width;docH=fit.height;layers=[]}else{commit('Before placing image')}const l=makeLayer(file.name.replace(/\.[^.]+$/,'')||'Image','image');const scale=Math.min(docW/im.naturalWidth,docH/im.naturalHeight,1);const w=im.naturalWidth*scale,h=im.naturalHeight*scale;l.canvas.getContext('2d').drawImage(im,(docW-w)/2,(docH-h)/2,w,h);layers.push(l);activeId=l.id;docName=file.name.replace(/\.[^.]+$/,'')||'Image project';selection=null;resizeCanvases();fitCanvas();showToast(fit.scaled?'Image reduced to fit the 24 MP target':'Image loaded');scheduleParentSave();URL.revokeObjectURL(url)};im.onerror=()=>showToast('Could not open this image');im.src=url}
function exportImage(){ $('exportModal').classList.add('open') }
function downloadExport(){const fmt=$('exportFormat').value,q=Number($('exportQuality').value),out=document.createElement('canvas');out.width=docW;out.height=docH;const x=out.getContext('2d');if(fmt==='jpeg'){x.fillStyle='#fff';x.fillRect(0,0,docW,docH)}for(const l of layers){if(!l.visible)continue;x.globalAlpha=l.opacity/100;x.globalCompositeOperation=l.blend;x.drawImage(renderedLayerCanvas(l),0,0)}const mime=fmt==='jpeg'?'image/jpeg':`image/${fmt}`;out.toBlob(blob=>{if(!blob){showToast('Export failed');return}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(docName||'pixelforge-artwork').replace(/[^a-z0-9-_]+/gi,'-')+'.'+fmt;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);$('exportModal').classList.remove('open');showToast('Image exported')},mime,q)}
function saveProject(){const data=JSON.stringify({format:'PixelForgeProject',version:3,...snap()});const blob=new Blob([data],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(docName||'project').replace(/[^a-z0-9-_]+/gi,'-')+'.pfs';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);$('saveState').textContent='Project saved';showToast('Editable project saved')}
async function loadProject(file){try{const s=JSON.parse(await file.text());if(s.format!=='PixelForgeProject'||!Array.isArray(s.layers)||!isAllowedDocumentSize(s.w,s.h))throw Error('Unsupported project or document exceeds the 24 MP target');await restore(s);history=[];historyLabels=[];historyIndex=-1;redoStack=[];historyBytes=0;commit('Project opened');fitCanvas();showToast('Project opened')}catch(e){showToast('Could not read this project file')}}
function applyFilter(type){const l=activeLayer();if(!l)return;if(l.locked){showToast('Unlock this layer before applying a filter');return}if(l.editMask){showToast('Switch to Edit pixels before applying a filter');return}commit('Before '+type);rasterizeTextLayer(l);const c=l.canvas,ctx=c.getContext('2d');if(type==='blur'){const original=document.createElement('canvas');original.width=docW;original.height=docH;original.getContext('2d').drawImage(c,0,0);const tmp=document.createElement('canvas');tmp.width=docW;tmp.height=docH;const tx=tmp.getContext('2d');tx.filter='blur(3px)';tx.drawImage(c,0,0);ctx.clearRect(0,0,docW,docH);ctx.drawImage(original,0,0);ctx.save();applySelectionClip(ctx);ctx.drawImage(tmp,0,0);ctx.restore()}else if(type==='sharpen'){const img=ctx.getImageData(0,0,docW,docH),d=img.data,src=new Uint8ClampedArray(d),w=docW,h=docH;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){if(!isInsideSelection(x,y))continue;let i=(y*w+x)*4;for(let k=0;k<3;k++){d[i+k]=Math.max(0,Math.min(255,5*src[i+k]-src[i-4+k]-src[i+4+k]-src[i-w*4+k]-src[i+w*4+k]))}}ctx.putImageData(img,0,0)}else{const img=ctx.getImageData(0,0,docW,docH),d=img.data;for(let y=0;y<docH;y++)for(let x=0;x<docW;x++){if(!isInsideSelection(x,y))continue;const i=(y*docW+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(type==='invert'){d[i]=255-r;d[i+1]=255-g;d[i+2]=255-b}else if(type==='grayscale'){const v=.299*r+.587*g+.114*b;d[i]=d[i+1]=d[i+2]=v}else if(type==='sepia'){d[i]=Math.min(255,.393*r+.769*g+.189*b);d[i+1]=Math.min(255,.349*r+.686*g+.168*b);d[i+2]=Math.min(255,.272*r+.534*g+.131*b)}else if(type==='vintage'){d[i]=Math.min(255,r*.92+15);d[i+1]=Math.min(255,g*.82+11);d[i+2]=Math.min(255,b*.66+5)}}ctx.putImageData(img,0,0)}invalidateLayerComposite(l);render();showToast(type[0].toUpperCase()+type.slice(1)+' applied')}
function applyAdjust(){const l=activeLayer();if(!l)return;if(l.locked){showToast('Unlock this layer before adjusting it');return}if(l.editMask){showToast('Switch to Edit pixels before adjusting');return}const b=+$('brightness').value,ct=+$('contrast').value,s=+$('saturation').value,hue=+$('hue').value;if(!b&&!ct&&!s&&!hue){showToast('No adjustment values changed');return}commit('Before tonal adjustment');rasterizeTextLayer(l);const ctx=l.canvas.getContext('2d'),img=ctx.getImageData(0,0,docW,docH),d=img.data,contrast=(259*(ct+255))/(255*(259-ct)),angle=hue*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);for(let i=0;i<d.length;i+=4){const px=(i/4)%docW,py=Math.floor(i/(docW*4));if(!isInsideSelection(px,py))continue;let r=d[i]+b,g=d[i+1]+b,bl=d[i+2]+b;r=contrast*(r-128)+128;g=contrast*(g-128)+128;bl=contrast*(bl-128)+128;const avg=.299*r+.587*g+.114*bl,fac=1+s/100;r=avg+(r-avg)*fac;g=avg+(g-avg)*fac;bl=avg+(bl-avg)*fac;const nr=(.213+cos*.787-sin*.213)*r+(.715-cos*.715-sin*.715)*g+(.072-cos*.072+sin*.928)*bl,ng=(.213-cos*.213+sin*.143)*r+(.715+cos*.285+sin*.140)*g+(.072-cos*.072-sin*.283)*bl,nb=(.213-cos*.213-sin*.787)*r+(.715-cos*.715+sin*.715)*g+(.072+cos*.928+sin*.072)*bl;d[i]=Math.max(0,Math.min(255,nr));d[i+1]=Math.max(0,Math.min(255,ng));d[i+2]=Math.max(0,Math.min(255,nb))}ctx.putImageData(img,0,0);invalidateLayerComposite(l);render();showToast('Adjustments applied')}
function applyCrop(){if(!cropRect)return;let {x,y,w,h}=cropRect;x=Math.max(0,Math.min(docW-1,Math.round(x)));y=Math.max(0,Math.min(docH-1,Math.round(y)));w=Math.max(1,Math.min(docW-x,Math.round(w)));h=Math.max(1,Math.min(docH-y,Math.round(h)));if(w<2||h<2){cropRect=null;drawOverlay();showToast('Crop area is too small');return}commit('Before crop');layers.forEach(l=>{rasterizeTextLayer(l);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(l.canvas,x,y,w,h,0,0,w,h);l.canvas=c;if(l.mask){const m=document.createElement('canvas');m.width=w;m.height=h;m.getContext('2d').drawImage(l.mask,x,y,w,h,0,0,w,h);l.mask=m}invalidateLayerComposite(l)});docW=w;docH=h;cropRect=null;selection=null;resizeCanvases();fitCanvas();showToast('Crop applied')}
function rotateCanvas(){commit('Before rotate');layers.forEach(l=>{rasterizeTextLayer(l);const c=document.createElement('canvas');c.width=docH;c.height=docW;const x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(Math.PI/2);x.drawImage(l.canvas,-docW/2,-docH/2);l.canvas=c;if(l.mask){const m=document.createElement('canvas');m.width=docH;m.height=docW;const mx=m.getContext('2d');mx.translate(m.width/2,m.height/2);mx.rotate(Math.PI/2);mx.drawImage(l.mask,-docW/2,-docH/2);l.mask=m}invalidateLayerComposite(l)});[docW,docH]=[docH,docW];resizeCanvases();fitCanvas()}
function flipCanvas(horizontal){commit(horizontal?'Before flip horizontal':'Before flip vertical');layers.forEach(l=>{rasterizeTextLayer(l);const c=document.createElement('canvas');c.width=docW;c.height=docH;const x=c.getContext('2d');x.translate(horizontal?docW:0,horizontal?0:docH);x.scale(horizontal?-1:1,horizontal?1:-1);x.drawImage(l.canvas,0,0);l.canvas=c;if(l.mask){const m=document.createElement('canvas');m.width=docW;m.height=docH;const mx=m.getContext('2d');mx.translate(horizontal?docW:0,horizontal?0:docH);mx.scale(horizontal?-1:1,horizontal?1:-1);mx.drawImage(l.mask,0,0);l.mask=m}invalidateLayerComposite(l)});render()}
function resizeImage(w,h){if(!isAllowedDocumentSize(w,h)){showToast('Image dimensions must stay within the 24 MP target');return}commit('Before image resample');const scaleX=w/docW,scaleY=h/docH;layers.forEach(l=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(l.canvas,0,0,w,h);l.canvas=c;if(l.textData){l.textData.x*=scaleX;l.textData.y*=scaleY;l.textData.fontSize=Math.max(8,Math.min(300,l.textData.fontSize*Math.sqrt(scaleX*scaleY)))}if(l.mask){const m=document.createElement('canvas');m.width=w;m.height=h;const mx=m.getContext('2d');mx.imageSmoothingEnabled=true;mx.imageSmoothingQuality='high';mx.drawImage(l.mask,0,0,w,h);l.mask=m}invalidateLayerComposite(l)});docW=w;docH=h;selection=null;cropRect=null;resizeCanvases();fitCanvas();$('imageSizeModal').classList.remove('open');showToast('Image resampled')}
function resizeDoc(w,h){if(!isAllowedDocumentSize(w,h)){showToast('Canvas dimensions must stay within the 24 MP target');return}commit('Before canvas resize');layers.forEach(l=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(l.canvas,0,0);l.canvas=c;if(l.mask){const m=document.createElement('canvas');m.width=w;m.height=h;m.getContext('2d').drawImage(l.mask,0,0);l.mask=m}invalidateLayerComposite(l)});docW=w;docH=h;resizeCanvases();fitCanvas();$('resizeModal').classList.remove('open')}
function openTextEditor(x=0,y=0,layer=null){
  editingTextLayerId=layer?.id||null;
  pendingTextPosition={x:Number(x)||0,y:Number(y)||0};
  const data=layer?.textData||null;
  $('textModalTitle').textContent=data?'Edit text layer':'Add text layer';
  $('textContent').value=data?.text??'Your text here';
  $('textFontFamily').value=data?.fontFamily??$('fontFamily').value;
  $('textFontSize').value=data?.fontSize??Math.max(8,Math.min(300,+$('fontSize').value||64));
  $('textFontWeight').value=String(data?.fontWeight??700);
  $('textAlign').value=data?.align??'left';
  $('textColor').value=data?.color??$('fgColor').value;
  $('textOpacity').value=data?.opacity??$('toolOpacity').value;
  $('textLineHeight').value=String(data?.lineHeight??1.2);
  $('saveTextBtn').textContent=data?'Update text':'Add text layer';
  $('textModal').classList.add('open');
  requestAnimationFrame(()=>$('textContent').focus());
}
function renderTextLayer(layer){
  if(!layer?.textData)return;
  const d=layer.textData,ctx=layer.canvas.getContext('2d');
  ctx.clearRect(0,0,docW,docH);
  ctx.save();ctx.globalAlpha=Math.max(1,Math.min(100,Number(d.opacity)||100))/100;
  ctx.fillStyle=d.color;ctx.font=`${d.fontWeight} ${d.fontSize}px "${String(d.fontFamily).replace(/["\\]/g,'')}"`;
  ctx.textBaseline='top';ctx.textAlign=d.align;
  String(d.text).split('\n').forEach((line,index)=>ctx.fillText(line,d.x,d.y+index*d.fontSize*d.lineHeight));
  ctx.restore();invalidateLayerComposite(layer);
}
function addText(x,y){openTextEditor(x,y)}
function saveTextLayer(){
  const text=$('textContent').value;
  if(!text.trim()){showToast('Enter some text first');$('textContent').focus();return}
  const existing=editingTextLayerId?layers.find(layer=>layer.id===editingTextLayerId):null;
  if(editingTextLayerId&&!existing){showToast('This text layer is no longer available');$('textModal').classList.remove('open');return}
  const x=existing?.textData?.x??pendingTextPosition?.x??0;
  const y=existing?.textData?.y??pendingTextPosition?.y??0;
  const fontSize=Math.max(8,Math.min(300,Number($('textFontSize').value)||64));
  const opacity=Math.max(1,Math.min(100,Number($('textOpacity').value)||100));
  const data={version:1,text,fontFamily:$('textFontFamily').value,fontSize,fontWeight:Math.max(400,Math.min(800,Number($('textFontWeight').value)||700)),align:$('textAlign').value,color:$('textColor').value,opacity,lineHeight:Math.max(1,Math.min(1.8,Number($('textLineHeight').value)||1.2)),x,y};
  if(existing){
    if(existing.locked){showToast('Unlock this text layer before editing');return}
    commit('Before edit text');
    existing.textData=data;renderTextLayer(existing);activeId=existing.id;
  }else{
    commit('Before add text');
    const layer=makeLayer(text.trim().split('\n')[0].slice(0,28)||'Text','text');
    layer.textData=data;renderTextLayer(layer);layers.push(layer);activeId=layer.id;
  }
  $('textModal').classList.remove('open');
  pendingTextPosition=null;editingTextLayerId=null;
  render();showToast(existing?'Text layer updated':'Text layer added');scheduleParentSave();
}
function rasterizeTextLayer(layer){
  if(!layer?.textData)return false;
  layer.textData=null;layer.type='image';return true;
}
function floodFill(x,y){
  const l=activeLayer();if(!l)return;if(l.locked){showToast('Unlock this layer before filling');return}
  const ix=Math.floor(x),iy=Math.floor(y);if(!isInsideSelection(ix,iy))return;
  const targetCanvas=paintTarget(l),ctx=targetCanvas.getContext('2d'),img=ctx.getImageData(0,0,docW,docH),d=img.data,start=(iy*docW+ix)*4;
  const maskMode=!!(l.editMask&&l.mask),hex=$('fgColor').value,r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  const target=maskMode?[d[start+3]]:[d[start],d[start+1],d[start+2],d[start+3]];
  const fillAlpha=maskMode?(maskPaintOperation(l,'brush')==='destination-out'?0:255):255;
  if(maskMode&&target[0]===fillAlpha){showToast('Already this mask value');return}
  if(!maskMode&&target[0]===r&&target[1]===g&&target[2]===b&&target[3]===255){showToast('Already this colour');return}
  commit('Before fill');if(!maskMode)rasterizeTextLayer(l);
  const stack=[ix,iy],seen=new Uint8Array(docW*docH),tol=24,limit=docW*docH;let visited=0;
  while(stack.length&&visited<limit){const cy=stack.pop(),cx=stack.pop();if(cx<0||cy<0||cx>=docW||cy>=docH)continue;const p=cy*docW+cx;if(seen[p])continue;seen[p]=1;visited++;if(!isInsideSelection(cx,cy))continue;const i=p*4;
    const matches=maskMode?Math.abs(d[i+3]-target[0])<=tol:(Math.abs(d[i]-target[0])<=tol&&Math.abs(d[i+1]-target[1])<=tol&&Math.abs(d[i+2]-target[2])<=tol&&Math.abs(d[i+3]-target[3])<=tol);if(!matches)continue;
    if(maskMode){d[i]=d[i+1]=d[i+2]=255;d[i+3]=fillAlpha}else{d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255}stack.push(cx+1,cy,cx-1,cy,cx,cy+1,cx,cy-1)
  }
  ctx.putImageData(img,0,0);invalidateLayerComposite(l);render();showToast(maskMode?'Mask fill applied':'Fill applied');
}
function drawShape(layer,kind,a,b){const ctx=paintTarget(layer).getContext('2d');ctx.save();applySelectionClip(ctx);ctx.globalAlpha=+$('toolOpacity').value/100;ctx.globalCompositeOperation=layer.editMask?maskPaintOperation(layer,'shape'):'source-over';ctx.strokeStyle=layer.editMask?'#fff':$('fgColor').value;ctx.fillStyle=layer.editMask?'#fff':$('fgColor').value;ctx.lineWidth=Math.max(1,+$('brushSize').value);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();if(kind==='rectangle'){ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y)}else if(kind==='ellipse'){ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2)}else{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}if(kind==='line'||$('shapeMode').value==='stroke')ctx.stroke();else ctx.fill();ctx.restore();invalidateLayerComposite(layer)}
function onDown(e){
  if(e.pointerType==='touch'){
    activeTouchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activeTouchPoints.size===2){
      const pts=[...activeTouchPoints.values()],dx=pts[0].x-pts[1].x,dy=pts[0].y-pts[1].y;
      pinchGesture={distance:Math.max(1,Math.hypot(dx,dy)),zoom,centerX:(pts[0].x+pts[1].x)/2,centerY:(pts[0].y+pts[1].y)/2,scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop};
      isDrawing=false;pointerStart=null;currentPath=[];moveBuffer=null;moveMaskBuffer=null;viewport.dataset.panning='';
      try{stage.setPointerCapture(e.pointerId)}catch(_){}
      render();e.preventDefault();return;
    }
    if(activeTouchPoints.size>2||pinchGesture)return;
  }
  if(pinchGesture)return;
  if(e.button!==0&&e.pointerType!=='touch')return;const p=point(e);$('cursorPosition').textContent=`X: ${Math.round(p.x)}  Y: ${Math.round(p.y)}`;if(tool==='eyedropper'){const px=dctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data;$('fgColor').value='#'+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join('');showToast('Foreground colour sampled');return}if(tool==='text'){addText(p.x,p.y);return}if(tool==='fill'){floodFill(p.x,p.y);return}if(tool==='zoom'){setZoom(zoom*1.25);return}if(tool==='hand'){viewport.dataset.panning='1';pointerStart={clientX:e.clientX,clientY:e.clientY,scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop};stage.setPointerCapture(e.pointerId);return}const l=activeLayer();if(!l)return;if(tool==='move'){if(l.locked){showToast('Unlock this layer before moving it');return}commit('Before move layer');pointerStart={...p,mode:'move'};moveBuffer=document.createElement('canvas');moveBuffer.width=docW;moveBuffer.height=docH;moveBuffer.getContext('2d').drawImage(l.canvas,0,0);moveMaskBuffer=null;if(l.mask){moveMaskBuffer=document.createElement('canvas');moveMaskBuffer.width=docW;moveMaskBuffer.height=docH;moveMaskBuffer.getContext('2d').drawImage(l.mask,0,0)}stage.setPointerCapture(e.pointerId);return}if(tool==='marquee'||tool==='crop'||tool==='lasso'){pointerStart=p;isDrawing=true;currentPath=[p];stage.setPointerCapture(e.pointerId);return}if(l.locked){showToast('This layer is locked');return}if(['brush','pencil','eraser','rectangle','ellipse','line'].includes(tool)){commit('Before '+tool);if(!l.editMask)rasterizeTextLayer(l);drawingSnapshot={x:p.x,y:p.y};pointerStart=p;isDrawing=true;stage.setPointerCapture(e.pointerId);if(tool==='brush'||tool==='pencil'||tool==='eraser'){const target=paintTarget(l),ctx=target.getContext('2d');ctx.save();applySelectionClip(ctx);ctx.globalAlpha=+$('toolOpacity').value/100;ctx.globalCompositeOperation=maskPaintOperation(l,tool);ctx.strokeStyle=l.editMask?'#fff':$('fgColor').value;ctx.fillStyle=l.editMask?'#fff':$('fgColor').value;ctx.lineWidth=tool==='pencil'?1:+$('brushSize').value;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y+.1);ctx.stroke();ctx.restore();invalidateLayerComposite(l);render()}}}
function onMove(e){
  if(e.pointerType==='touch'&&activeTouchPoints.has(e.pointerId)){
    activeTouchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinchGesture&&activeTouchPoints.size>=2){
      const pts=[...activeTouchPoints.values()].slice(0,2),dx=pts[0].x-pts[1].x,dy=pts[0].y-pts[1].y;
      const cx=(pts[0].x+pts[1].x)/2,cy=(pts[0].y+pts[1].y)/2;
      setZoom(pinchGesture.zoom*Math.hypot(dx,dy)/pinchGesture.distance);
      viewport.scrollLeft=pinchGesture.scrollLeft+(pinchGesture.centerX-cx);
      viewport.scrollTop=pinchGesture.scrollTop+(pinchGesture.centerY-cy);
      return;
    }
  }
  if(pinchGesture)return;
  const p=point(e);
  $('cursorPosition').textContent=`X: ${Math.round(p.x)}  Y: ${Math.round(p.y)}`;
  if(viewport.dataset.panning==='1'&&pointerStart){
    viewport.scrollLeft=pointerStart.scrollLeft-(e.clientX-pointerStart.clientX);
    viewport.scrollTop=pointerStart.scrollTop-(e.clientY-pointerStart.clientY);
    return;
  }
  if(!isDrawing&&!pointerStart)return;
  const l=activeLayer();
  if(tool==='move'&&pointerStart?.mode==='move'&&moveBuffer){
    const dx=p.x-pointerStart.x,dy=p.y-pointerStart.y;
    const ctx=l.canvas.getContext('2d');
    ctx.clearRect(0,0,docW,docH);
    ctx.drawImage(moveBuffer,dx,dy);
    if(l.mask&&moveMaskBuffer){const mx=l.mask.getContext('2d');mx.clearRect(0,0,docW,docH);mx.drawImage(moveMaskBuffer,dx,dy);invalidateLayerComposite(l)}
    render(false);
    return;
  }
  if(!isDrawing)return;
  if(['brush','pencil','eraser'].includes(tool)){
    const ctx=paintTarget(l).getContext('2d');
    ctx.save();
    applySelectionClip(ctx);
    ctx.globalAlpha=+$('toolOpacity').value/100;
    ctx.globalCompositeOperation=maskPaintOperation(l,tool);
    ctx.strokeStyle=l.editMask?'#fff':$('fgColor').value;
    ctx.lineWidth=tool==='pencil'?1:+$('brushSize').value;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    ctx.moveTo(pointerStart.x,pointerStart.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
    invalidateLayerComposite(l);pointerStart=p;render(false);
  }else if(['marquee','crop'].includes(tool)){
    const x=Math.min(pointerStart.x,p.x),y=Math.min(pointerStart.y,p.y);
    const w=Math.abs(pointerStart.x-p.x),h=Math.abs(pointerStart.y-p.y);
    if(tool==='crop')cropRect={x,y,w,h};else selection={x,y,w,h};
    drawOverlay();if(tool==='marquee')syncLayerControls();
  }else if(tool==='lasso'){
    currentPath.push(p);octx.clearRect(0,0,docW,docH);octx.save();
    octx.strokeStyle='#fff';octx.lineWidth=1/zoom;octx.setLineDash([4,3]);octx.beginPath();
    octx.moveTo(currentPath[0].x,currentPath[0].y);currentPath.forEach(q=>octx.lineTo(q.x,q.y));
    octx.stroke();octx.restore();
  }else if(['rectangle','ellipse','line'].includes(tool)){
    octx.clearRect(0,0,docW,docH);octx.save();
    octx.globalAlpha=+$('toolOpacity').value/100;octx.strokeStyle=$('fgColor').value;
    octx.fillStyle=$('fgColor').value;octx.lineWidth=Math.max(1,+$('brushSize').value);octx.beginPath();
    if(tool==='rectangle')octx.rect(pointerStart.x,pointerStart.y,p.x-pointerStart.x,p.y-pointerStart.y);
    else if(tool==='ellipse')octx.ellipse((pointerStart.x+p.x)/2,(pointerStart.y+p.y)/2,Math.abs(p.x-pointerStart.x)/2,Math.abs(p.y-pointerStart.y)/2,0,0,Math.PI*2);
    else{octx.moveTo(pointerStart.x,pointerStart.y);octx.lineTo(p.x,p.y);}
    if(tool==='line'||$('shapeMode').value==='stroke')octx.stroke();else octx.fill();
    octx.restore();
  }
}
function onUp(e){
  if(e.pointerType==='touch'){
    activeTouchPoints.delete(e.pointerId);
    if(pinchGesture){
      if(activeTouchPoints.size<2){pinchGesture=null;isDrawing=false;pointerStart=null;currentPath=[];moveBuffer=null;moveMaskBuffer=null;render();}
      return;
    }
  }
  if(viewport.dataset.panning==='1'){viewport.dataset.panning='';pointerStart=null;return}if(tool==='move'&&pointerStart?.mode==='move'){const l=activeLayer(),p=point(e);if(l?.textData){l.textData.x+=p.x-pointerStart.x;l.textData.y+=p.y-pointerStart.y}pointerStart=null;moveBuffer=null;moveMaskBuffer=null;render();scheduleParentSave();return}if(!isDrawing){pointerStart=null;return}const p=point(e),l=activeLayer();if(tool==='lasso'&&currentPath.length>2){const xs=currentPath.map(a=>a.x),ys=currentPath.map(a=>a.y);selection={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),path:currentPath};drawOverlay();syncLayerControls()}else if(tool==='lasso'){selection=null;drawOverlay()}else if(tool==='crop'){drawOverlay()}else if(tool==='marquee'){drawOverlay()}else if(['rectangle','ellipse','line'].includes(tool)){octx.clearRect(0,0,docW,docH);drawShape(l,tool,pointerStart,p);render()}else{render()}isDrawing=false;pointerStart=null;currentPath=[];drawingSnapshot=null}
stage.addEventListener('pointerdown',onDown);stage.addEventListener('pointermove',onMove);stage.addEventListener('pointerup',onUp);stage.addEventListener('pointercancel',onUp);
// Menus and tool controls
$('newBtn').onclick=()=>$('newModal').classList.add('open');$('openBtn').onclick=()=>$('imageInput').click();$('exportBtn').onclick=exportImage;$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('projectInput').onchange=e=>{const f=e.target.files[0];if(f)loadProject(f);e.target.value=''};
$('createDocBtn').onclick=()=>{const w=+$('newWidth').value,h=+$('newHeight').value;if(!isAllowedDocumentSize(w,h)){showToast('Choose valid dimensions up to 24 megapixels');return}newDocument(w,h,$('newBg').value,$('newName').value);$('newModal').classList.remove('open')};$('saveTextBtn').onclick=saveTextLayer;$('editTextBtn').onclick=()=>{const l=activeLayer();if(l?.type==='text'&&l.textData)openTextEditor(0,0,l)};$('downloadExport').onclick=downloadExport;$('addLayerBtn').onclick=()=>addLayer();$('duplicateLayerBtn').onclick=duplicateLayer;$('renameLayerBtn').onclick=()=>renameLayer();$('toggleLockBtn').onclick=()=>{const l=activeLayer();if(!l)return;commit('Before lock change');l.locked=!l.locked;renderLayers();showToast(l.locked?'Layer locked':'Layer unlocked')};$('addMaskBtn').onclick=addLayerMask;$('editMaskBtn').onclick=toggleMaskEditing;$('invertMaskBtn').onclick=invertLayerMask;$('applyMaskBtn').onclick=applyLayerMask;$('removeMaskBtn').onclick=removeLayerMask;$('hideSelectionMaskBtn').onclick=hideSelectionWithMask;$('deleteLayerBtn').onclick=deleteLayer;$('layerUpBtn').onclick=()=>moveLayer(1);$('layerDownBtn').onclick=()=>moveLayer(-1);$('layerOpacity').oninput=e=>{const l=activeLayer();if(l){l.opacity=+e.target.value;$('layerOpacityOut').textContent=l.opacity+'%';render()}};$('layerOpacity').onpointerdown=()=>commit('Before layer opacity');$('layerOpacity').onchange=()=>{};$('blendMode').onchange=e=>{const l=activeLayer();if(l){commit('Change blend mode');l.blend=e.target.value;render()}};
$('toolOpacity').oninput=e=>$('opacityValue').textContent=e.target.value+'%';$('applyAdjustments').onclick=applyAdjust;['brightness','contrast','saturation','hue'].forEach(id=>$(id).oninput=e=>$(id+'Out').textContent=e.target.value+(id==='hue'?'°':''));$('resizeDocBtn').onclick=()=>resizeDoc(+$('resizeWidth').value,+$('resizeHeight').value);$('resizeImageBtn').onclick=()=>resizeImage(+$('imageWidth').value,+$('imageHeight').value);$('imageWidth').oninput=()=>{if($('keepAspect').checked){const w=+$('imageWidth').value;if(w>0)$('imageHeight').value=Math.max(1,Math.round(w*docH/docW))}};$('imageHeight').oninput=()=>{if($('keepAspect').checked){const h=+$('imageHeight').value;if(h>0)$('imageWidth').value=Math.max(1,Math.round(h*docW/docH))}};
$('zoomIn').onclick=()=>setZoom(zoom*1.2);$('zoomOut').onclick=()=>setZoom(zoom/1.2);$('fitBtn').onclick=fitCanvas;$('fitBtn').title='Fit on screen';$('zoomValue').onchange=e=>{const z=parseFloat(e.target.value);if(z>0)setZoom(z/100);else e.target.value=Math.round(zoom*100)+'%'};$('fitBtn').onclick=fitCanvas;$('canvasViewport').addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(zoom*(e.deltaY<0?1.1:.9))}},{passive:false});
document.querySelectorAll('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));['layers','adjust','history'].forEach(t=>$(t+'Panel').hidden=t!==b.dataset.tab)});
document.querySelectorAll('.menuslot > .menuitem').forEach(b=>b.onclick=e=>{const p=b.parentElement;document.querySelectorAll('.menuslot').forEach(m=>{if(m!==p)m.classList.remove('open')});p.classList.toggle('open');e.stopPropagation()});document.addEventListener('click',()=>document.querySelectorAll('.menuslot').forEach(m=>m.classList.remove('open')));
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;switch(a){case'new':$('newModal').classList.add('open');break;case'open':$('imageInput').click();break;case'import':$('imageInput').dataset.asLayer='1';$('imageInput').click();break;case'export':exportImage();break;case'undo':undo();break;case'redo':redo();break;case'duplicate':duplicateLayer();break;case'delete':deleteLayer();break;case'clear':clearLayer();break;case'copy':copySelection(false);break;case'cut':copySelection(true);break;case'paste':pasteClipboard();break;case'selectAll':selectAll();break;case'deselect':deselect();break;case'addLayer':addLayer();break;case'up':moveLayer(1);break;case'down':moveLayer(-1);break;case'flatten':flatten();break;case'fit':fitCanvas();break;case'actual':setZoom(1);break;case'grid':gridOn=!gridOn;drawOverlay();break;case'resize':$('resizeWidth').value=docW;$('resizeHeight').value=docH;$('resizeModal').classList.add('open');break;case'imageSize':$('imageWidth').value=docW;$('imageHeight').value=docH;$('imageSizeModal').classList.add('open');break;case'rotate':rotateCanvas();break;case'flipH':flipCanvas(true);break;case'flipV':flipCanvas(false);break;case'projectSave':saveProject();break;case'projectLoad':$('projectInput').click();break}});
$('imageInput').addEventListener('change',e=>{const f=e.target.files[0];if(f){const asLayer=e.target.dataset.asLayer==='1';delete e.target.dataset.asLayer;importImage(f,asLayer)}e.target.value=''});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>applyFilter(b.dataset.filter));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove('open'));document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}));
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea,[contenteditable="true"]'))return;
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&key==='y'){e.preventDefault();redo();return}
  if(mod&&key==='o'){e.preventDefault();$('imageInput').click();return}
  if(mod&&key==='n'){e.preventDefault();$('newModal').classList.add('open');return}
  if(mod&&key==='s'){e.preventDefault();saveProject();return}
  if(mod&&e.shiftKey&&key==='e'){e.preventDefault();exportImage();return}
  if(mod&&key==='c'){e.preventDefault();copySelection(false);return}
  if(mod&&key==='x'){e.preventDefault();copySelection(true);return}
  if(mod&&key==='v'){e.preventDefault();pasteClipboard();return}
  if(mod&&key==='a'){e.preventDefault();selectAll();return}
  if(mod&&key==='d'){e.preventDefault();deselect();return}
  if(e.key==='Escape'){selection=null;cropRect=null;drawOverlay();syncLayerControls();return}
  if(e.key==='Enter'&&cropRect){applyCrop();return}
  if(e.key==='Delete'&&selection){e.preventDefault();clearSelection();return}
  if(e.key==='['){$('brushSize').value=Math.max(1,+$('brushSize').value-3);return}
  if(e.key===']'){$('brushSize').value=Math.min(300,+$('brushSize').value+3);return}
  const t=toolKeys[key];if(t)setTool(t);
});
// Mobile panels drawer and installable PWA support
const sidePanel=document.querySelector('.sidepanel'),panelScrim=$('panelScrim');
function setPanelsOpen(open){sidePanel.classList.toggle('panel-open',!!open);panelScrim.classList.toggle('visible',!!open);$('panelToggle').setAttribute('aria-expanded',String(!!open));}
$('panelToggle').onclick=()=>setPanelsOpen(!sidePanel.classList.contains('panel-open'));
panelScrim.onclick=()=>setPanelsOpen(false);
document.querySelectorAll('.sidepanel .tab').forEach(b=>b.addEventListener('click',()=>setPanelsOpen(true)));
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false;});
$('installBtn').onclick=async()=>{
  if(!deferredInstallPrompt){showToast('Use your browser menu and choose Install app or Add to Home screen');return;}
  deferredInstallPrompt.prompt();
  try{await deferredInstallPrompt.userChoice;}catch(_){}
  deferredInstallPrompt=null;$('installBtn').hidden=true;
};
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;$('installBtn').hidden=true;showToast('PixelForge installed');});
// The SvelteKit application shell owns service-worker registration and updates.
window.addEventListener('orientationchange',()=>setTimeout(()=>fitCanvas(),180));
document.addEventListener('pointerup',()=>scheduleParentSave(),true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')publishParentState()});
window.addEventListener('message',async event=>{
  const sourceIsHost=window.parent===window?event.source===window:event.source===window.parent;
  if(!sourceIsHost||event.origin!==location.origin)return;
  const message=event.data||{};
  if(message.type==='PIXELFORGE_REQUEST_STATE'){publishParentState();return}
  if(message.type==='PIXELFORGE_RESTORE'&&message.project){
    try{
      await restore(message.project);
      history=[];historyLabels=[];historyIndex=-1;redoStack=[];historyBytes=0;
      commit('Recovered local project');fitCanvas();showToast('Local project recovered');
      if(window.parent!==window)window.parent.postMessage({type:'PIXELFORGE_RESTORED'},location.origin);else window.dispatchEvent(new Event('pixelforge:restored'));
    }catch(error){showToast('The local recovery could not be opened')}
  }
});
// starter project
function boot(){drawSample();setTool('move');$('saveState').textContent='Local editing';requestAnimationFrame(()=>fitCanvas());}
boot();
if(window.parent!==window)window.parent.postMessage({type:'PIXELFORGE_READY'},location.origin);else requestAnimationFrame(()=>window.dispatchEvent(new Event('pixelforge:ready')));
}})();
}
