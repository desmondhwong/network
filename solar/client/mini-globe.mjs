// Machine-authored by Codex/OpenAI, 2026-09-07, claim 260907-202059-001/solar-system-0.3.
// Original Canvas globe. Natural Earth public-domain outlines have their own retained accession.
// The sibling globe project informed interaction design only; no source bytes were copied.
// Body-fixed minimaps extended by Codex/OpenAI, claim 260922-151159-001.
import { validateObserver } from './observer.mjs';
import { ALL_BODIES as BODIES } from './astro.mjs';
import {surfaceGridGeometry,surfaceMarkings,surfaceTexture} from './surface-overlays.mjs';
import {earthSurfaceGeometry} from './surface-map.mjs';
import {renderEarthImagery,drawEarthImagery} from './earth-imagery.mjs';
import {bodySurfaceOpacity} from './body-surfaces.mjs';

const RAD = Math.PI / 180;
const norm = n => ((n % 360) + 360) % 360;
const signed = n => norm(n + 180) - 180;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const backgrounds = ['#473317','#34312e','#443926','#0c2030','#34343e','#472921','#42362f','#433e2c','#183e43','#202946','#39342f'];
const bodyStyles = new Map(BODIES.map((body,index)=>[body.id,{...body,background:backgrounds[index]??'#34343e',index}]));

/** Project the exact surface tangent, so the arrow uses the camera heading
 * without a finite geographic step bending it near a pole or globe limb. */
export function projectHeading(latitude,longitude,heading,view={latitude:0,longitude:0}) {
  validateObserver({latitude,longitude});validateObserver(view);
  if(!Number.isFinite(heading))throw new RangeError('Heading must be finite.');
  const p=latitude*RAD,l=longitude*RAD,b=heading*RAD,p0=view.latitude*RAD,l0=view.longitude*RAD;
  const east=[-Math.sin(l),Math.cos(l),0],north=[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)];
  const direction=north.map((n,i)=>n*Math.cos(b)+east[i]*Math.sin(b));
  const right=[-Math.sin(l0),Math.cos(l0),0],up=[-Math.sin(p0)*Math.cos(l0),-Math.sin(p0)*Math.sin(l0),Math.cos(p0)];
  const dot=(a,v)=>a.reduce((sum,x,i)=>sum+x*v[i],0);
  return {x:dot(direction,right),y:dot(direction,up)};
}

/** Orthographic unit-disk projection: +x east/right, +y north/up, +z toward viewer. */
export function projectGlobe(latitude, longitude, view = { latitude: 0, longitude: 0 }) {
  validateObserver({ latitude, longitude }); validateObserver(view);
  const p = latitude * RAD, p0 = view.latitude * RAD, dl = (longitude - view.longitude) * RAD;
  const x = Math.cos(p) * Math.sin(dl);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl);
  const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  return { x, y, z, visible: z >= -1e-12 };
}

/** Inverse of the visible hemisphere; points outside the disk have no surface intersection. */
export function unprojectGlobe(x, y, view = { latitude: 0, longitude: 0 }) {
  validateObserver(view);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const radius2 = x * x + y * y; if (radius2 > 1 + 1e-12) return null;
  const z = Math.sqrt(Math.max(0, 1 - radius2)); const p0 = view.latitude * RAD;
  const latitude = Math.asin(clamp(y * Math.cos(p0) + z * Math.sin(p0), -1, 1)) / RAD;
  const longitude = signed(view.longitude + Math.atan2(x, z * Math.cos(p0) - y * Math.sin(p0)) / RAD);
  return { latitude, longitude };
}

export async function loadLand(url = new URL('./data/earth-land.json', import.meta.url), { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('Earth coastlines could not be loaded.');
  const land = await response.json();
  if (!land || !Array.isArray(land.rings) || land.rings.length > 2000 || land.rings.reduce((n, ring) => n + (Array.isArray(ring) ? ring.length : 100001), 0) > 100000
      || land.rings.some(ring => !Array.isArray(ring) || ring.length < 4 || ring.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180.000001 || Math.abs(point[1]) > 90))) throw new Error('Earth coastline data is not valid.');
  return land;
}

/** render({bodyId='Earth',latitude,longitude,heading,land,showSurfaceMarkings=true,
 * showZodiac,zodiac}); coordinates are body-fixed, and only Earth uses land/zodiac.
 * onObserverChange({latitude,longitude},{bodyId}) preserves the legacy first arg.
 * No implicit fetch, physical texture claim or animation loop. */
export class MiniGlobe {
  constructor(canvas, { onObserverChange = () => {}, onHeightChange = null, onDoubleClick = null } = {}) {
    this.canvas = canvas; this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('A Canvas 2D context is required for the observer globe.');
    this.onObserverChange = onObserverChange; this.onHeightChange = onHeightChange; this.onDoubleClick=onDoubleClick;this.state = { bodyId: 'Earth', pinMode:false, latitude: 0, longitude: 0, heading: 0, showSurfaceMarkings: true };
    this.view = null; this.zoom = 1; this.pan = { x: 0, y: 0 }; this.drag = null; this.destroyed = false;
    this.touchPointers = new Map(); this.touchGesture = null; this.lastTouchTap = null; this.suppressDoubleClickUntil = 0;
    this.originalTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none'; canvas.tabIndex = canvas.tabIndex < 0 ? 0 : canvas.tabIndex;
    this.describe();
    this.handlers = {
      pointerdown: event => this.pointerDown(event), pointermove: event => this.pointerMove(event),
      pointerup: event => this.pointerUp(event), pointercancel: event => this.cancelPointer(event),
      lostpointercapture: event => this.cancelPointer(event), blur: () => this.cancelInteraction(),
      wheel: event => { event.preventDefault();if(this.drag?.mode==='height')return;this.zoom = clamp(this.zoom * Math.exp(-event.deltaY * 0.0015), 0.65, 3); this.render(); },
      dblclick: event => { event.preventDefault(); if(this.touchGesture||Date.now()<this.suppressDoubleClickUntil)return;const observer = this.observerAt(this.local(event)); if(observer)this.activateAt(observer); },
      keydown: event => this.keyDown(event),
    };
    for (const [name, handler] of Object.entries(this.handlers)) canvas.addEventListener(name, handler, name === 'wheel' ? { passive: false } : undefined);
    if (typeof globalThis.ResizeObserver === 'function') { this.resizeObserver = new ResizeObserver(() => this.render()); this.resizeObserver.observe(canvas); }
  }

  describe() {
    this.canvas.setAttribute('aria-label', `${this.state.bodyId} observer globe. ${this.state.pinMode?'Pin mode: drag base to move; drag ball up to raise, down to lower camera. PageUp and PageDown change height.':'Stable body overview; camera pin is inactive.'} Drag globe to rotate; shift-drag to pan; scroll to zoom. Two fingers pan and pinch to zoom. Double-click or double-tap a surface point, or Enter at map center, to place pin and enter Pin mode. Home recenters.${this.state.bodyId==='Earth'?'':' Markings are schematic.'}`);
  }

  focusObserver() {
    this.view = this.state.pinMode?{ latitude: clamp(this.state.latitude + 12, -85, 85), longitude: signed(this.state.longitude - 18) }:{latitude:15,longitude:-20};
    this.pan = { x: 0, y: 0 }; this.render();
  }

  local(event) { const box = this.canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; }
  screen(point) { return { x: this.cx + point.x * this.radius, y: this.cy - point.y * this.radius }; }
  observerAt(point, snapToRim = false) {
    let x = (point.x - this.cx) / this.radius, y = (this.cy - point.y) / this.radius;
    const distance = Math.hypot(x, y);
    if (snapToRim && distance > 0.999999) { x *= 0.999999 / distance; y *= 0.999999 / distance; }
    return unprojectGlobe(x, y, this.view);
  }
  changeObserver(observer) {
    if(!this.state.pinMode)return false;
    validateObserver(observer);
    const position={latitude:observer.latitude,longitude:observer.longitude};
    this.state = { ...this.state, ...position,...(this.state.surfacePin?{surfacePin:{...this.state.surfacePin,...position}}:{}) }; this.onObserverChange(position,{bodyId:this.state.bodyId}); this.render();
  }

  activateAt(observer) {
    validateObserver(observer);
    if(typeof this.onDoubleClick==='function')this.onDoubleClick({latitude:observer.latitude,longitude:observer.longitude},{bodyId:this.state.bodyId});
    else if(this.state.pinMode)this.changeObserver(observer);
  }

  heightEditable() { return this.state.pinMode===true&&typeof this.onHeightChange==='function'&&this.state.heightEditable===true; }
  changeHeight(heightM) {
    if(!this.heightEditable()||!Number.isFinite(heightM))return;
    heightM=clamp(heightM,2,1e28);
    this.state.surfacePin={bodyId:this.state.bodyId,latitude:this.state.latitude,longitude:this.state.longitude,...this.state.surfacePin,heightM};
    this.onHeightChange(heightM,{bodyId:this.state.bodyId});this.render();
  }

  pointerDown(event) {
    if (this.destroyed || ![0, 1].includes(event.button ?? 0)) return;
    const touch=event.pointerType==='touch';
    if((!touch&&(this.drag||this.touchPointers.size))||(touch&&this.drag&&!this.touchPointers.size))return;
    event.preventDefault(); this.canvas.focus?.({ preventScroll: true });
    const point = this.local(event);
    if(touch){
      this.touchPointers.set(event.pointerId,point);
      this.capturePointer(event.pointerId);
      if(this.touchPointers.size>1||this.touchGesture){
        const wasHeight=this.drag?.mode==='height';this.drag=null;this.lastTouchTap=null;this.suppressDoubleClickUntil=Date.now()+500;
        if(wasHeight)this.render();
        this.beginTouchGesture();return;
      }
    }
    const pin = this.pin;
    const pointSize=clamp(this.state.pinPointSize??5,2,16);
    const headDistance=pin?Math.hypot(point.x-pin.headX,point.y-pin.headY):Infinity,baseDistance=pin?Math.hypot(point.x-pin.x,point.y-pin.y):Infinity;
    // Large styled glyphs can overlap at low altitude. The nearer center wins;
    // clicking the base must still move location, not accidentally edit height.
    const hitsHead=pin?.visible&&headDistance<Math.max(touch?22:11,pointSize+4)&&headDistance<=baseDistance;
    const hitsPin=pin?.visible&&(baseDistance<Math.max(touch?22:12,pointSize*.6+4)||(!this.onHeightChange&&hitsHead));
    const mode=hitsHead&&this.heightEditable()?'height':hitsPin?'pin':event.shiftKey||event.button===1?'pan':'rotate';
    const startHeight=pin?.heightM??2,stem=pin?Math.hypot(pin.x-pin.headX,pin.y-pin.headY):18,bodyRadiusM=bodyStyles.get(this.state.bodyId).radiusKm*1000;
    this.drag = { id: event.pointerId, mode, touch, moved:false, startHeight, heightPerPixel:Math.max((startHeight+bodyRadiusM*.0001)/60,startHeight/Math.max(1,stem-12)),scale:{radius:this.radius,cx:this.cx,cy:this.cy,autoScale:this.autoScale,stem},point, offset: hitsPin ? { x: point.x - pin.x, y: point.y - pin.y } : { x: 0, y: 0 }, view: { ...this.view }, pan: { ...this.pan } };
    if(!touch)this.capturePointer(event.pointerId);
  }

  pointerMove(event) {
    if(this.touchPointers.has(event.pointerId)){
      const point=this.local(event);this.touchPointers.set(event.pointerId,point);
      if(this.touchGesture){
        event.preventDefault();
        const gesture=this.touchGesture,[first,second]=gesture.ids.map(id=>this.touchPointers.get(id));
        if(!first||!second||!gesture.ids.includes(event.pointerId))return;
        const centroid={x:(first.x+second.x)/2,y:(first.y+second.y)/2},distance=Math.hypot(first.x-second.x,first.y-second.y);
        this.zoom=clamp(gesture.zoom*(distance>2&&gesture.distance>2?distance/gesture.distance:1),.65,3);
        const ratio=this.zoom/gesture.zoom;
        this.pan={x:clamp(centroid.x-(gesture.centroid.x-gesture.center.x)*ratio-this.width/2,-this.width*.4,this.width*.4),y:clamp(centroid.y-(gesture.centroid.y-gesture.center.y)*ratio-(this.height/2-5),-this.height*.4,this.height*.4)};
        this.render();return;
      }
    }
    if (!this.drag || this.drag.id !== event.pointerId) return;
    event.preventDefault(); const point = this.local(event), dx = point.x - this.drag.point.x, dy = point.y - this.drag.point.y;
    if(Math.hypot(dx,dy)>=6)this.drag.moved=true;
    if(this.drag.mode==='height')this.changeHeight(clamp(this.drag.startHeight-dy*this.drag.heightPerPixel,2,1e28));
    else if (this.drag.mode === 'pin') { const observer = this.observerAt({ x: point.x - this.drag.offset.x, y: point.y - this.drag.offset.y }, true); if (observer) this.changeObserver(observer); }
    else if (this.drag.mode === 'pan') { this.pan = { x: clamp(this.drag.pan.x + dx, -this.width * .4, this.width * .4), y: clamp(this.drag.pan.y + dy, -this.height * .4, this.height * .4) }; this.render(); }
    else { const radius=Math.max(40,this.radius);this.view = { latitude: clamp(this.drag.view.latitude + dy / radius / RAD, -89.9, 89.9), longitude: signed(this.drag.view.longitude - dx / radius / RAD) }; this.render(); }
  }

  pointerUp(event) {
    const touch=this.touchPointers.delete(event.pointerId);
    if(touch&&this.touchGesture){
      this.suppressDoubleClickUntil=Date.now()+500;
      if(this.touchPointers.size>=2)this.beginTouchGesture();
      else if(!this.touchPointers.size)this.touchGesture=null;
      this.releasePointer(event.pointerId);return;
    }
    if (this.drag?.id !== event.pointerId) return;
    const drag=this.drag,wasHeight=drag.mode==='height';this.drag = null;
    this.releasePointer(event.pointerId);
    if(wasHeight)this.render();
    if(touch&&drag.mode==='rotate'&&!drag.moved){
      const point=this.local(event),now=Date.now(),previous=this.lastTouchTap;
      if(previous&&now-previous.time<=350&&Math.hypot(point.x-previous.point.x,point.y-previous.point.y)<22){
        this.lastTouchTap=null;this.suppressDoubleClickUntil=now+500;
        const observer=this.observerAt(point);if(observer)this.activateAt(observer);
      }else this.lastTouchTap={point,time:now};
    }else this.lastTouchTap=null;
  }

  capturePointer(id) { try { this.canvas.setPointerCapture?.(id); } catch { /* Detached canvases need no capture. */ } }
  releasePointer(id) { try { if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture(id); } catch { /* Capture can already be lost. */ } }
  beginTouchGesture() {
    const entries=[...this.touchPointers.entries()].slice(0,2);
    if(entries.length<2)return;
    const [[firstId,first],[secondId,second]]=entries;
    this.touchGesture={ids:[firstId,secondId],distance:Math.hypot(first.x-second.x,first.y-second.y),centroid:{x:(first.x+second.x)/2,y:(first.y+second.y)/2},zoom:this.zoom,center:{x:this.cx,y:this.cy}};
  }
  cancelPointer(event) { if(this.touchPointers.has(event.pointerId)||this.drag?.id===event.pointerId)this.cancelInteraction(); }
  cancelInteraction() {
    const ids=new Set(this.touchPointers.keys()),wasHeight=this.drag?.mode==='height';
    if(this.drag)ids.add(this.drag.id);
    if(this.touchGesture)this.suppressDoubleClickUntil=Date.now()+500;
    this.drag=null;this.touchPointers.clear();this.touchGesture=null;this.lastTouchTap=null;
    for(const id of ids)this.releasePointer(id);
    if(wasHeight)this.render();
  }

  keyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', '+', '=', '-', 'PageUp','PageDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation?.();
    if (event.key === 'Home') { this.focusObserver(); return; }
    if(['PageUp','PageDown'].includes(event.key)){this.changeHeight(((this.state.surfacePin?.heightM??2)+100)*(event.key==='PageUp'?1.2:1/1.2)-100);return;}
    if (event.key === 'Enter') { this.activateAt({ ...this.view }); return; }
    if (['+', '='].includes(event.key)) this.zoom = clamp(this.zoom * 1.15, .65, 3);
    else if (event.key === '-') this.zoom = clamp(this.zoom / 1.15, .65, 3);
    else if (event.key === 'ArrowLeft') this.view.longitude = signed(this.view.longitude - 10);
    else if (event.key === 'ArrowRight') this.view.longitude = signed(this.view.longitude + 10);
    else this.view.latitude = clamp(this.view.latitude + (event.key === 'ArrowUp' ? 10 : -10), -89.9, 89.9);
    this.render();
  }

  stroke(points, color, width = 1) {
    const ctx = this.context; ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    let previous = null;
    for (const [longitude, latitude] of points) {
      const point = projectGlobe(latitude, clamp(longitude, -180, 180), this.view);
      if (previous && (previous.visible || point.visible)) {
        let a = previous, b = point;
        if (a.visible !== b.visible) {
          const fraction = a.z / (a.z - b.z);
          let x = a.x + fraction * (b.x - a.x), y = a.y + fraction * (b.y - a.y);
          const length = Math.hypot(x, y); if (length) { x /= length; y /= length; }
          const edge = { x, y };
          if (a.visible) b = edge; else a = edge;
        }
        const start = this.screen(a), end = this.screen(b); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
      }
      previous = point;
    }
    ctx.stroke();
  }

  drawZodiac(zodiac) {
    if (!zodiac) return;
    const coordinate = point => {
      const v = point?.earthFixed;
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || !Math.hypot(...v)) return null;
      return [Math.atan2(v[1], v[0]) / RAD, Math.asin(clamp(v[2] / Math.hypot(...v), -1, 1)) / RAD];
    };
    if (Array.isArray(zodiac.ecliptic)) this.stroke(zodiac.ecliptic.map(coordinate).filter(Boolean), '#d8b57b', 1.35);
    const ctx = this.context; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0d4a4';
    for (const sector of this.state.showZodiacLabels===false?[]:zodiac.sectors || []) {
      const pair = coordinate(sector.center); if (!pair) continue;
      const projected = projectGlobe(pair[1], pair[0], this.view); if (!projected.visible) continue;
      const p = this.screen(projected); ctx.fillText(String(sector.sign).slice(0, 3), p.x, p.y - 5);
    }
    for (const boundary of zodiac.boundaries || []) {
      const pair = coordinate(boundary); if (!pair) continue;
      const projected = projectGlobe(pair[1], pair[0], this.view); if (!projected.visible) continue;
      const p = this.screen(projected); ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI); ctx.fill();
    }
  }

  fillSurface(points,color,opacity){
    const projected=points.map(([lon,lat])=>projectGlobe(lat,lon,this.view)),visible=[];
    for(let i=0;i<projected.length;i++){
      const a=projected[i],b=projected[(i+1)%projected.length];if(a.visible)visible.push(a);
      if(a.visible!==b.visible){const t=a.z/(a.z-b.z),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,r=Math.hypot(x,y)||1;visible.push({x:x/r,y:y/r});}
    }
    if(visible.length<3)return;const ctx=this.context;ctx.save();ctx.globalAlpha=opacity*bodySurfaceOpacity(this.state,this.state.bodyId);ctx.fillStyle=color;ctx.beginPath();
    visible.forEach((p,i)=>{const s=this.screen(p);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.closePath();ctx.fill();ctx.restore();
  }

  render(next = {}) {
    if (this.destroyed) return;
    const candidate={...this.state,...next},bodyId=BODIES.find(body=>body.id.toLowerCase()===String(candidate.bodyId).toLowerCase())?.id;
    if(!bodyId)throw new RangeError('Choose a supported Sun, planet or moon minimap.');
    candidate.pinMode=candidate.pinMode===true;
    if(candidate.pinMode&&candidate.surfacePin?.bodyId===bodyId){candidate.latitude=candidate.surfacePin.latitude;candidate.longitude=candidate.surfacePin.longitude;}
    validateObserver({latitude:candidate.latitude,longitude:candidate.longitude});
    const heightM=candidate.pinMode&&candidate.surfacePin?.bodyId===bodyId?candidate.surfacePin.heightM:0;
    if(!Number.isFinite(heightM)||heightM<0||heightM>1e28)throw new RangeError('Camera pin height must be finite, between 0 and 1e28 metres.');
    if(bodyId!==this.state.bodyId||candidate.pinMode!==this.state.pinMode){this.cancelInteraction();this.view=null;this.pan={x:0,y:0};}
    this.state = {...candidate,bodyId}; this.describe();
    if (!this.view) this.view = this.state.pinMode?{ latitude: clamp(this.state.latitude + 12, -85, 85), longitude: signed(this.state.longitude - 18) }:{latitude:15,longitude:-20};
    if(this.drag?.mode==='height')this.view={...this.drag.view};
    const box = this.canvas.getBoundingClientRect(); this.width = Math.max(1, box.width || this.canvas.clientWidth || 240); this.height = Math.max(1, box.height || this.canvas.clientHeight || 240);
    const dpr = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    if (this.canvas.width !== Math.round(this.width * dpr) || this.canvas.height !== Math.round(this.height * dpr)) { this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr); }
    const ctx = this.context; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    const style=bodyStyles.get(bodyId),earth=bodyId==='Earth',opacity=bodySurfaceOpacity(this.state,bodyId);this.renderedSurfaceOpacity=opacity;
    const projected = projectGlobe(this.state.latitude, this.state.longitude, this.view),radial=Math.hypot(projected.x,projected.y),heightRatio=heightM/(style.radiusKm*1000);
    // A stable body-fixed overview ignores moving camera coordinates. In Pin
    // mode, the radial height diagram scales to fit; a drag freezes its map.
    this.autoScale=this.state.pinMode?1/(1+heightRatio):1;
    this.radius=Math.min(this.width,this.height)*.405*this.zoom*this.autoScale;this.cx=this.width/2+this.pan.x;this.cy=this.height/2-5+this.pan.y;
    if(this.drag?.mode==='height'){this.radius=this.drag.scale.radius;this.cx=this.drag.scale.cx;this.cy=this.drag.scale.cy;this.autoScale=this.drag.scale.autoScale;}
    const terrain=earth&&this.state.showEarthTerrain!==false?earthSurfaceGeometry(this.state.land,{detail:this.state.earthTerrainDetail??'medium'}):null;
    ctx.save();ctx.globalAlpha=opacity; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, 2 * Math.PI); ctx.fillStyle = terrain?.oceanColor??style.background; ctx.fill(); ctx.clip();
    this.earthImageRaster=null;let painted=false;
    if(terrain&&this.radius>1e-8){
      const lat=this.view.latitude*RAD,lon=this.view.longitude*RAD,right=[-Math.sin(lon),Math.cos(lon),0],up=[-Math.sin(lat)*Math.cos(lon),-Math.sin(lat)*Math.sin(lon),Math.cos(lat)],forward=[-Math.cos(lat)*Math.cos(lon),-Math.cos(lat)*Math.sin(lon),-Math.sin(lat)];
      this.earthImageRaster=renderEarthImagery({width:this.width,height:this.height,projection:'orthographic',right,up,forward,radiusPixels:this.radius,centerX:this.cx,centerY:this.cy,style:this.state.earthMapStyle??'schematic',detail:this.state.earthImageDetail??75,schematicDetail:this.state.earthTerrainDetail??'medium',bounds:{x:this.cx-this.radius,y:this.cy-this.radius,width:2*this.radius,height:2*this.radius}});
      painted=drawEarthImagery(ctx,this.earthImageRaster);
    }
    // Historical headless callers without any Canvas image factory retain the
    // vector fallback. Browser/app consumers always upload the bounded raster.
    if(terrain&&!painted)for(const patch of terrain.patches)this.fillSurface(patch.points,patch.color,1);
    if(this.state.showSurfaceTexture&&!terrain)for(const patch of surfaceTexture(bodyId))this.fillSurface(patch.points,patch.tone==='light'?'#ffffff':'#000000',clamp(this.state.surfaceTextureOpacity??.55,0,1)*(patch.opacity??.3));
    // Missing new flags keep the historical minimap API usable; new clients pass
    // independent flags explicitly, so markings never govern their grid.
    if(this.state.showSurfaceGrid??(this.state.showSurfaceMarkings!==false)){
      const grid=surfaceGridGeometry({spacing:this.state.surfaceGridSpacing??30,viewLatitude:this.view.latitude,viewLongitude:this.view.longitude,capDegrees:90});
      ctx.save();ctx.globalAlpha=clamp(this.state.surfaceGridOpacity??.7,0,1)*opacity;
      for(const line of grid.paths)this.stroke(line.points,earth?'#6b969e':style.color,['prime','equator'].includes(line.kind)?1.2:.65);ctx.restore();
    }
    if(earth&&(this.state.showSurfaceGrid!==undefined||this.state.showSurfaceMarkings!==false)&&this.state.showSurfaceMap!==false)for(const ring of this.state.land?.rings||[])this.stroke(ring,'#7ea5a0',1.1);
    if(!earth&&this.state.showSurfaceMarkings!==false)for(const mark of surfaceMarkings(bodyId))this.stroke(mark.points,style.color,1.6);
    if (earth&&this.state.showAstrology!==false&&this.state.showZodiac) this.drawZodiac(this.state.zodiac || this.state.zodiacEarth || this.state.zodiacLines);
    ctx.restore();ctx.save();ctx.globalAlpha=opacity; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, 2 * Math.PI); ctx.strokeStyle = style.color; ctx.lineWidth = 1; ctx.stroke();ctx.restore();
    // A body-surface normal is radial. Its orthographic projection must share
    // the center-to-base line, including the southern hemisphere. Near-ground
    // magnification changes length only, never direction. Exact disk-center
    // stems point along the line of sight and truthfully collapse to a dot.
    const position = this.screen(projected),physicalOffset=this.radius*heightRatio*radial,localScale=style.radiusKm*1000*.000001;
    const magnifiedOffset=radial>1e-10?(18+36*heightM/(heightM+localScale))/(1+heightRatio):0;let offset=Math.max(physicalOffset,magnifiedOffset);
    if(this.drag?.mode==='height')offset=Math.max(0,this.drag.scale.stem+(heightM-this.drag.startHeight)/this.drag.heightPerPixel);
    const headX=position.x+(radial>1e-10?projected.x/radial*offset:0),headY=position.y-(radial>1e-10?projected.y/radial*offset:0);
    this.pin = { ...position, headX, headY, visible: this.state.pinMode&&projected.visible&&this.state.showSurfacePin!==false,latitude:this.state.latitude,longitude:this.state.longitude,heightM,heightMagnified:magnifiedOffset>physicalOffset,physicalOffset };
    if (this.pin.visible) {
      const heading = Number.isFinite(this.state.heading) ? this.state.heading : 0;
      const direction=projectHeading(this.state.latitude,this.state.longitude,heading,this.view);
      const dx=direction.x,dy=-direction.y,size=Math.hypot(dx,dy);
      this.pin.heading=norm(heading);this.pin.headingArrow=null;
      // At the globe's limb a tangent may point exactly along the sightline.
      // Its zero projection has no screen heading; avoid amplifying roundoff.
      if(size>1e-10){
        const ex=position.x+dx/size*26,ey=position.y+dy/size*26;
        this.pin.headingArrow={from:{...position},to:{x:ex,y:ey}};
        ctx.strokeStyle='#f2bd73';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(position.x,position.y);ctx.lineTo(ex,ey);
        ctx.moveTo(ex-dx/size*6+dy/size*4,ey-dy/size*6-dx/size*4);ctx.lineTo(ex,ey);ctx.lineTo(ex-dx/size*6-dy/size*4,ey-dy/size*6+dx/size*4);ctx.stroke();
      }
      ctx.save();ctx.globalAlpha=clamp(this.state.pinStemOpacity??.8,0,1);ctx.strokeStyle = this.state.pinStemColor??'#ffcc74'; ctx.lineWidth = clamp(this.state.pinStemWidth??2,.5,8); ctx.beginPath(); ctx.moveTo(position.x, position.y); ctx.lineTo(headX, headY); ctx.stroke();
      ctx.globalAlpha=clamp(this.state.pinPointOpacity??1,0,1);ctx.fillStyle = this.state.pinPointColor??'#ffdf9c';const pointSize=clamp(this.state.pinPointSize??5,2,16);ctx.beginPath(); ctx.arc(position.x, position.y, pointSize*.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(headX, headY, pointSize, 0, Math.PI * 2); ctx.fill();ctx.restore();
    }
    ctx.fillStyle = '#abc2c5'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${bodyId} · ${earth?'body-fixed coordinates':style.radiusEstimated?'schematic · 1 km placeholder radius':'schematic reference sphere'}`, this.width / 2, 13);
    const displayHeight=heightM>=1e7?heightM.toExponential(2):heightM.toFixed(heightM<100?1:0);
    const hint = !this.state.pinMode?'Overview · double-click to place pin':!projected.visible ? 'Pin on far side · Home to recenter' : this.state.surfacePin&&this.state.showSurfacePin!==false?`Camera ${displayHeight} m · ${radial<=1e-10?'stem along sightline':this.pin.heightMagnified?'local height magnified':'radial height'}`:`Heading ${norm(this.state.heading || 0).toFixed(0)}° · N=0 E=90`;
    ctx.fillText(hint, this.width / 2, this.height - 6);
  }

  destroy() {
    if (this.destroyed) return;
    this.cancelInteraction();
    for (const [name, handler] of Object.entries(this.handlers)) this.canvas.removeEventListener(name, handler);
    this.resizeObserver?.disconnect(); this.canvas.style.touchAction = this.originalTouchAction; this.drag = null; this.destroyed = true;
  }
}
