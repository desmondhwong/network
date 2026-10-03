/* Machine-authored by Codex / OpenAI; updated for 260924-161257-001/solar-system-overlays-imagery.
 * Canvas scene using the bundled ephemeris and catalogue. Symbol radii are display encodings.
 * Surface Sun/Moon disks use physical angular radii. Coil coordinates retain linear AU.
 * 261003-070650: responsive contours, composed touch input and exact-pose render reuse. */
import { helioPositionsAt, starHorizontal, horizontal, getPositionProviderRevision } from './astro.mjs';
import { getTrailData, pointInTrailFrame, equatorialToEcliptic, equatorialToGalactic, catalogueVector, eclipticToGalactic, DAY_MS, YEAR_DAYS, AU_KM, TRAIL_PLANETS } from './trails.mjs';
import { Rotation_ECT_EQD, EquatorFromVector, RotateVector, Vector, Observer, Horizon, Illumination } from './vendor/astronomy-engine-2.1.19.mjs';
import { GALACTIC_MODEL, solarOrbitAt, galacticOrbitPoints, embedSolarPosition } from './galactic.mjs';
import { zodiacAt, getAstrologyGeometry, pickAstrologyCoordinate, ASTROLOGY_BODY_IDS } from './zodiac.mjs';
import { surfaceGridGeometry, surfaceMarkings, surfaceTexture, surfacePinGeometry } from './surface-overlays.mjs';
import { currentOrbitPaths,meanOrbitShape } from './orbital-paths.mjs';
import {ellipseMayEnterView} from './orbit-visibility.mjs';
import { issStateAt } from './iss.mjs';
import { ISS_GEOMETRY } from './iss-geometry.mjs';
import { issRasterContains } from './iss-renderer.mjs';
import { saturnRingRasterContains,SATURN_RINGS } from './saturn-rings.mjs';
import {renderGeometry} from './geometry-raster.mjs';
import {GeometryRasterClient} from './geometry-raster-client.mjs';
import { asteroidBeltAt, ASTEROID_BELT_METADATA } from './asteroid-belt.mjs';
import { lunarShadowAt } from './lunar-eclipse.mjs';
import {milkyWayModel,createMilkyWayFrame,createMilkyWayPositionBuffer,updateMilkyWayPositionBuffer,MILKY_WAY_METADATA} from './milky-way.mjs';
import { modelDate, timeKey, addTime, differenceMillis } from './time.mjs';
import { buildGalacticCoils, galacticCoilPosition } from './space-paths.mjs';
import { buildSurfaceMap, earthSurfaceGeometry } from './surface-map.mjs';
import {renderEarthImagery,drawEarthImagery} from './earth-imagery.mjs';
import {MOON_DETAIL_METADATA} from './moon-metadata.mjs';
import {MoonRasterClient} from './moon-raster-client.mjs';
import {solarVisibilityAt} from './physical-shadows.mjs';
import {bodySurfaceOpacity} from './body-surfaces.mjs';
import {issFootprintAt} from './iss-passes.mjs';
import { DEFAULT_FOV, MAX_FOV, EARTH_RADIUS_M, GROUND_HEIGHT_M, solarDistanceGain, altitudeForLimb, stepAltitude, clipScreenSegment } from './zoom.mjs';
import { globeBasis, globeLocationAt, anchorGlobe } from './globe-camera.mjs';
import { galacticToENU, approachCamera, projectApproach } from './approach-camera.mjs';
import * as Flight from './flight-camera.mjs';
import { getElapsedTrails } from './trails.mjs';
import { galacticCenterAt, solarOrbitReference, solarDisplacementBetween } from './galactic.mjs';
import { expandedStarCatalogue, createStellarFrame, createStellarPositionBuffer, updateStellarPositionBuffer, spatialStarMagnitude, constellationLabelAnchors } from './spatial-stars.mjs';
const MAX_BODY_SCALE = 1e12;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const length = v => Math.hypot(...v);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a, b) => a.map((n, i) => n - b[i]);
const direction = (az, alt) => [Math.sin(az * RAD) * Math.cos(alt * RAD), Math.cos(az * RAD) * Math.cos(alt * RAD), Math.sin(alt * RAD)];
const wrap = n => (n % 360 + 360) % 360;
const sameHeading = (a,b) => Number.isFinite(a)&&Number.isFinite(b)&&Math.min(Math.abs(a-b)%360,360-Math.abs(a-b)%360)<1e-10;
const YAW_RATE = .9;
const cardinal = heading => ['N','NE','E','SE','S','SW','W','NW'][Math.round(wrap(heading)/45)%8];
const movementKey = event => event.code==='Comma' ? ',' : event.code==='Period' ? '.' : /^Key[WASDQE]$/.test(event.code || '') ? event.code.slice(3).toLowerCase() : /^Arrow(Left|Right|Up|Down)$/.test(event.code || '') ? event.code.toLowerCase() : String(event.key).toLowerCase();
const smoothstep = (lo, hi, value) => { const t = clamp((value-lo)/(hi-lo),0,1); return t*t*(3-2*t); };
const issBearing = heading => ['Along-track','Forward/right','Starboard','Back/right','Against-track','Back/left','Port','Forward/left'][Math.round(wrap(heading)/45)%8];
function segmentRoots(a,b,c) {
  const magnitude=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));if(!magnitude)return [];
  a/=magnitude;b/=magnitude;c/=magnitude;
  if(Math.abs(a)<1e-14)return Math.abs(b)>1e-14?[-c/b]:[];
  const discriminant=b*b-4*a*c;if(discriminant<0)return [];
  const q=-.5*(b+(b<0?-1:1)*Math.sqrt(discriminant));return q?[q/a,c/q]:[-b/(2*a)];
}
const moonParent = body => body?.artificial?null:body?.parentId || (body?.id === 'Moon' ? 'Earth' : null);
const symbolRadii = { Sun: 12, Mercury: 4, Venus: 6, Earth: 7, Moon: 3, Mars: 5, Jupiter: 9, Saturn: 8, Uranus: 7, Neptune: 7, Pluto: 3 };
const palettes = {
  light: { background: '#f2f3ef', surface: '#fafbf7', text: '#191b19', muted: '#5f655f', line: '#cdd1ca', faint: '#dfe2dc', signal: '#d9472b', ground: '#e3e6df' },
  dark: { background: '#0f1110', surface: '#171a18', text: '#e9ece7', muted: '#a0a7a0', line: '#323832', faint: '#242a25', signal: '#ff7255', ground: '#1d231f' },
};

export class Scene {
  constructor(canvas, { onSelect = () => {}, onViewChange = () => {}, onMove = () => {}, onAstrologyPick = () => {}, moonRenderer=null, moonWorkerOptions={}, geometryWorkerOptions={} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('This browser could not create the solar-system canvas.');
    this.onSelect = onSelect;
    this.onViewChange = onViewChange;
    this.onMove = onMove;
    this.onAstrologyPick=onAstrologyPick;this.astrologyPick=null;this.astrologyHits=[];this.selectedAstrologyPoint=null;
    this.state = null;
    this.flight = null;
    this.yaw = -0.25;
    this.pitch = 0.74;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.azimuth = 180;
    this.elevation = 25;
    this.fov = 60;
    this.globe = null;
    this.lastInputFov = null;
    this.lastInputHeading = null;
    this.labelPlacements = new Map();
    this.labelEdgeSince = new Map();
    this.labelVisibility = new Map();
    this.labelQueue = [];
    this.trailCache = null;
    this.orbitCache = null;
    this.catalogueCache = null;
    this.surfaceStarCache = null;
    this.savedViews = new Map();
    this.hits = [];
    this.hoverPoint = null;
    this.hoveredBody = null;
    this.pointers = new Map();
    this.dragDistance = 0;
    this.listeners = [];
    this.disposed = false;
    this.moonRasterClient=new MoonRasterClient({...moonWorkerOptions,renderer:moonRenderer,onReady:()=>{if(!this.disposed&&!this.interactiveDetail())this.redraw();}});
    this.geometryRasterClients=Object.fromEntries(['iss','saturn'].map(kind=>[kind,new GeometryRasterClient({...geometryWorkerOptions,onReady:()=>{if(!this.disposed&&!this.interactiveDetail())this.redraw();}})]));
    this.heldKeys = new Set();
    this.movementInputs = new Map();
    this.moveFrame = null;
    this.moveLast = null;
    this.zoomFrame = null;
    this.zoomAnimation = null;
    this.slowMovement = false;
    this.lastFlightSpeedMps = 0;
    this.navigationAnimation = null;
    this.navigationFrame = null;
    this.canvas.style.touchAction = 'none';
    if (!this.canvas.hasAttribute('tabindex')) this.canvas.tabIndex = 0;
    if(!this.canvas.hasAttribute('aria-label'))this.canvas.setAttribute('aria-label', 'Interactive solar system. WASDQE moves the camera. In deliberate Pin mode, WASD and Shift-drag move at fixed height; Q and E change radial height. Drag to look, Option or Alt-drag to orbit. Arrows roll and pitch; hold comma or period to yaw, release to stop turning. G toggles Pin, Shift+G lowers and levels roll, R resets attitude. L and F toggle orbit and spin locks without moving the camera. Hover highlights a body; click selects it. Escape releases pointer lock.');
    this.listen('pointerdown', e => this.pointerDown(e));
    this.listen('pointermove', e => this.deferInputPaint(()=>this.pointerMove(e)));
    this.listen('pointerup', e => this.pointerUp(e));
    this.listen('pointerleave', () => { if(!this.pointers.size){this.hoverPoint=null;this.hoveredBody=null;this.updateAstrologyPick(null);this.redraw();} });
    this.listen('pointercancel', e => this.pointerUp(e,{cancelled:true}));
    this.listen('lostpointercapture', e => this.pointerUp(e,{cancelled:true}));
    this.listen('wheel', e => this.deferInputPaint(()=>{
      e.preventDefault();
      this.markInteraction();
      const factor=Math.exp(clamp(e.deltaY, -100, 100) * 0.002);
      this.changeZoom(factor, false, this.localPoint(e));
    }), { passive: false });
    this.listen('keydown', e => this.keyDown(e));
    this.listen('keyup', e => { const yaw=this.yawControl(),held=this.setMovementInput('keyboard',movementKey(e),false);this.slowMovement=!!e.shiftKey;const moved=this.lastFlightSpeedMps!==0;if(!this.heldKeys.size)this.stopMovement();if(this.state?.unifiedFlight&&(held||moved||yaw!==this.yawControl())){this.notify({},{drawPending:true});this.redraw();} });
    // Moving focus to an app control is not an instruction to abandon a jump.
    this.listen('blur', () => {const held=this.heldKeys.size;this.stopMovement();if(held&&this.state?.unifiedFlight){this.notify({},{drawPending:true});this.redraw();}});
    this.pageHide = () => { this.cancelInputPaint();this.cancelPointerInput();clearTimeout(this.refineTimer);this.refineTimer=null;this.interactionActive=false;this.stopMovement(); this.cancelZoomAnimation(); this.cancelNavigation();this.moonRasterClient.invalidate();for(const client of Object.values(this.geometryRasterClients))client.invalidate(); };
    globalThis.addEventListener?.('pagehide', this.pageHide);
    this.inputDocument=this.canvas.ownerDocument||globalThis.document;
    this.pointerLockChange=()=>{if(this.inputDocument?.pointerLockElement!==this.canvas){const held=this.heldKeys.size;this.stopMovement();if(held&&this.state?.unifiedFlight){this.notify({},{drawPending:true});this.redraw();}}};
    this.inputDocument?.addEventListener?.('pointerlockchange',this.pointerLockChange);
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.redraw()) : null;
    this.observer?.observe(canvas);
  }

  listen(name, handler, options) {
    this.canvas.addEventListener(name, handler, options);
    this.listeners.push([name, handler, options]);
  }

  render(state,{paint=true}={}) {
    if (this.disposed) return;
    if (state.unifiedFlight) return this.renderFlight(state,{paint});
    if (this.zoomAnimation && this.state && (state.mode !== this.state.mode || state.selected !== this.state.selected || Number.isFinite(state.fov) && state.fov !== this.fov)) this.cancelZoomAnimation();
    const enteringSurface = state.mode === 'surface' && this.state?.mode !== 'surface';
    if (state.mode !== 'surface') this.stopMovement();
    const viewKey = mode => ['space', 'surface', 'coil', 'galactic'].includes(mode) ? mode : 'system';
    const previousView = viewKey(this.state?.mode), nextView = viewKey(state.mode);
    if ((!this.state && nextView !== 'system') || (this.state && previousView !== nextView)) {
      if (this.state) this.savedViews.set(previousView, { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, pan: { ...this.pan }, globe: this.globe ? { ...this.globe } : null });
      Object.assign(this, this.savedViews.get(nextView) || this.defaultCamera(nextView));
    }
    const incomingFov = finite(state.fov, 60);
    if (incomingFov !== this.lastInputFov) {
      this.fov = clamp(incomingFov, 0.12, MAX_FOV);
      this.lastInputFov = incomingFov;
    }
    this.state = state;
    if (state.mode === 'surface' && !this.globe) this.globe = { latitude: finite(state.latitude), longitude: finite(state.longitude), altitudeM: GROUND_HEIGHT_M };
    if (this.globe) {
      if (state.mode === 'space' && state.selected !== 'Earth') this.globe = null;
      else { this.globe.latitude = finite(state.latitude); this.globe.longitude = finite(state.longitude); }
    }
    if (Number.isFinite(state.heading) && state.heading !== this.lastInputHeading) this.setHeading(state.heading);
    if (enteringSurface && !this.trackedBody(state)) this.elevation = -10;
    if (this.syncSurfaceAim()) this.notify();
    if(paint)this.redraw();
  }

  // Motion changes sampling density only. The saved display settings and all
  // body positions stay exact, and a quiet frame restores their full detail.
  interactiveDetail() { return !!(this.state?.playing||this.state?.galacticPlaying||this.pointers.size||this.heldKeys.size||this.navigationAnimation||this.zoomAnimation||this.interactionActive); }

  markInteraction() {
    this.interactionActive=true;clearTimeout(this.refineTimer);
    this.refineTimer=setTimeout(()=>this.endInteraction(),160);
    this.refineTimer?.unref?.();
  }

  endInteraction() {
    clearTimeout(this.refineTimer);this.refineTimer=null;this.interactionActive=false;
    if(!this.disposed)this.redraw();
  }

  deferInputPaint(action) {
    if(!this.state?.unifiedFlight)return action();
    const previous=this.deferredInputPaint;this.deferredInputPaint=true;
    try{return action();}finally{this.deferredInputPaint=previous;}
  }

  cancelInputPaint() {
    if(this.inputPaintFrame!=null)globalThis.cancelAnimationFrame?.(this.inputPaintFrame);
    this.inputPaintFrame=null;
  }

  syncSurfaceAim() {
    const state = this.state;
    const target=this.trackedBody(state);
    if (!target || !(this.globe || state.mode === 'space' && state.selected === 'Earth')) return false;
    const body = (state.sky || []).find(body => body.id === target);
    if (!body) return false;
    const changed = this.azimuth !== body.azimuth || this.elevation !== body.altitude;
    this.azimuth = finite(body.azimuth, 180);
    this.elevation = clamp(finite(body.altitude, 25), -89.9999, 89.9999);
    return changed;
  }

  reset() {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) { this.flight = Flight.createFlight(); this.fov = 60; this.notify({},{drawPending:true}); this.redraw(); return; }
    this.cancelZoomAnimation();
    if (this.globe) { this.pan = { x: 0, y: 0 }; this.elevation = -10; this.fov = DEFAULT_FOV; this.notify({},{drawPending:true}); this.redraw(); return; }
    Object.assign(this, this.defaultCamera(this.state?.mode));
    this.azimuth = 180;
    this.elevation = 25;
    this.fov = 60;
    if (this.state?.mode === 'surface') this.lookAtSun();
    this.notify({},{drawPending:true});
    this.redraw();
  }

  defaultCamera(mode) {
    return { yaw: mode === 'coil' ? -0.64 : mode === 'galactic' ? 0 : -0.25, pitch: mode === 'coil' ? 0.52 : mode === 'galactic' ? 1.15 : 0.74, zoom: 1, pan: { x: 0, y: 0 }, globe: null };
  }

  get camera() { if (this.state?.unifiedFlight && this.flight) return this.flightCamera(); return { heading: wrap(this.azimuth), azimuth: this.azimuth, elevation: this.elevation, yaw: this.yaw, pitch: this.pitch, zoom: this.zoom, pan: { ...this.pan }, globe: this.globe ? { ...this.globe } : null, effectiveSolarScale: this.solarDistanceFactor(), curvature: 1 }; }

  solarDistanceFactor() {
    if (this.state?.unifiedFlight || this.state?.mode !== 'space' || this.state.keepSolarVisible === false) return 1;
    return solarDistanceGain(this.zoom, finite(this.state.solarDistanceScale, 1e7));
  }

  setHeading(degrees) {
    if (this.state?.unifiedFlight && this.flight && Number.isFinite(degrees)) {
      this.cancelNavigation();
      if (this.flight.tether) { this.flight.tether.heading = wrap(degrees); this.syncTether(); }
      else {
        const delta=(degrees-this.flightCamera().heading)*RAD;
        Object.assign(this.flight,Flight.lookBasis(Flight.rotateAxis(this.flight.forward,[0,0,1],-delta),Flight.rotateAxis(this.flight.up,[0,0,1],-delta)));
      }
      this.lastInputHeading = degrees; return;
    }
    if (!Number.isFinite(degrees)) return;
    this.azimuth = wrap(degrees);
    this.lastInputHeading = degrees;
  }

  recenter() {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) { this.aimFlight(this.state.selected || 'Sun'); this.notify({manualAim:true},{drawPending:true}); this.redraw(); return; }
    if (!this.state) return;
    this.cancelZoomAnimation();
    if (this.state.mode === 'surface') {
      const body = (this.state.sky || []).find(body => body.id === this.state.selected) || (this.state.sky || []).find(body => body.id === 'Sun');
      if (body) { this.azimuth = wrap(body.azimuth); this.elevation = clamp(body.altitude, -89.9999, 89.9999); }
    } else {
      let position = [0, 0, 0];
      if (this.state.mode === 'space') position = this.spacePosition(this.state.selected || 'Sun');
      else if (this.state.mode === 'coil') position = this.coilData?.tracks.find(track => track.id === this.state.selected)?.points.at(-1)?.position || this.coilData?.tracks.find(track => track.id === 'Sun')?.points.at(-1)?.position || position;
      else if (this.state.mode !== 'galactic') {
        const bodies = this.bodies(), body = bodies.find(body => body.id === this.state.selected);
        if (body) position = this.displayPosition(body, bodies);
      }
      const point = this.worldProject(position);
      this.pan.x += this.width / 2 - point.x; this.pan.y += this.height / 2 - point.y;
    }
    if (this.globe) this.pan = { x: 0, y: 0 };
    this.notify({ manualAim: true },{drawPending:true}); this.redraw();
  }

  fitBody(id, radiusPixels = 80) {
    if (this.state?.unifiedFlight) return this.flyTo(id);
    if (!this.state || ['surface', 'galactic'].includes(this.state.mode) || !Number.isFinite(radiusPixels) || radiusPixels <= 0) return false;
    const bodies = this.bodies(), body = bodies.find(body => body.id === id);
    if (!body) return false;
    const position = this.state.mode === 'coil'
      ? pointInTrailFrame(body.position, this.state.date, this.coilData?.end ?? this.state.date, this.state.trailFrame)
      : this.state.mode === 'space' ? this.spacePosition(id) : this.displayPosition(body, bodies);
    const radius = this.bodyRadius(body, this.worldProject(position));
    if (!(radius > 0)) return false;
    const zoom = clamp(this.zoom * radiusPixels / radius, this.state.mode === 'coil' ? 0.22 : 0.02, 1e7);
    const ratio = zoom / this.zoom;
    this.zoom = zoom; this.unit *= ratio;
    this.pan.x *= ratio; this.pan.y *= ratio;
    const point = this.worldProject(position);
    this.pan.x += this.width / 2 - point.x; this.pan.y += this.height / 2 - point.y;
    this.notify({},{drawPending:true}); this.redraw();
    return true;
  }

  panBy(dx, dy) {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) {
      const start=[...this.flight.position],t=this.flight.tether,step=(t?t.altitudeM/Flight.AU_M:this.flightDistance())/Math.max(100,this.height);
      if(t?.bodyId==='ISS')return;
      if(t) { const frame=Flight.bodyFrame(t.bodyId,this.state.date),center=this.spacePosition(t.bodyId);
        if(t.controlMode==='free'){Flight.moveSpinCamera(this.flight,{right:-dx,up:dy,distanceM:step*Flight.AU_M},center,frame);this.constrainFlight(start);this.retainSpinPosition();}
        else Flight.moveTether(this.flight,{right:-dx,forward:dy,distanceM:step*Flight.AU_M},center,frame); }
      else {Flight.panFlight(this.flight,-dx*step,dy*step);this.constrainFlight(start);}
      this.notify({manualAim:true},{drawPending:true});this.redraw();return;
    }
    this.cancelZoomAnimation();
    if (this.state?.mode === 'surface') { this.changeDirection(dx, dy); return; }
    this.pan.x += dx; this.pan.y += dy;
    this.notify({},{drawPending:true}); this.redraw();
  }

  fitGalaxy() {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) { const center=this.spacePosition('Sagittarius A*'), radius=GALACTIC_MODEL.radiusPc*GALACTIC_MODEL.pcInAU; this.flight.tether=null; this.flight.followBody=null; this.flight.position=Flight.add(center,[0,-radius*1.7,radius*1.3]); this.aimFlight('Sagittarius A*'); this.notify({},{drawPending:true}); this.redraw(); return true; }
    if (this.state?.mode !== 'space') return false;
    this.cancelZoomAnimation();
    this.globe = null;
    const radius = GALACTIC_MODEL.radiusPc * GALACTIC_MODEL.pcInAU;
    this.zoom = 30 / (radius * 1.3);
    this.pan = { x: 0, y: 0 };
    this.redraw();
    const point = this.worldProject(this.spacePosition('Sagittarius A*'));
    this.pan.x = this.width / 2 - point.x; this.pan.y = this.height / 2 - point.y;
    this.notify({},{drawPending:true}); this.redraw();
    return true;
  }

  aimSurfaceMap(elevation = -45) {
    this.cancelNavigation();
    if (this.state?.unifiedFlight && this.flight?.tether) { this.flight.tether.elevation=elevation; this.syncTether(); this.notify({manualAim:true},{drawPending:true}); this.redraw(); return; }
    if (this.state?.mode !== 'surface') return;
    this.cancelZoomAnimation();
    this.elevation = clamp(finite(elevation, -45), -89.9999, 89.9999);
    this.notify({ manualAim: true },{drawPending:true}); this.redraw();
  }

  setFov(degrees) {
    if(!Number.isFinite(degrees))return false;
    this.cancelNavigation();this.cancelZoomAnimation();
    this.fov=clamp(degrees,.12,MAX_FOV);this.lastInputFov=this.fov;
    if(this.state)this.state={...this.state,fov:this.fov};
    this.notify({},{drawPending:true});this.redraw();return true;
  }

  trackedBody(state=this.state) { return typeof state?.trackBody==='string'&&state.trackBody ? state.trackBody : state?.trackSun ? 'Sun' : null; }

  trackBody(id) {
    if(!this.state)return false;
    if(id!==null&&!this.bodies().some(body=>body.id===id))return false;
    this.state={...this.state,trackBody:id,trackSun:id==='Sun'};
    if(id)return this.lookAtBody(id);
    this.notify();return true;
  }

  lookAtSun(sky = this.state?.sky || []) { return this.lookAtBody('Sun',sky); }

  lookAtBody(id,sky = this.state?.sky || []) {
    if(this.state?.unifiedFlight&&!this.bodies().some(body=>body.id===id))return false;
    this.cancelNavigation();
    if (this.state?.unifiedFlight) { this.aimFlight(id); this.notify({},{drawPending:true}); this.redraw(); return true; }
    const body = sky.find(b => b.id === id);
    if (!body) return false;
    this.cancelZoomAnimation();
    this.azimuth = wrap(finite(body.azimuth, 180));
    this.elevation = clamp(finite(body.altitude, 25), -89.9999, 89.9999);
    this.notify({},{drawPending:true});
    this.redraw();return true;
  }

  notify(extra = {}, {drawPending=false}={}) {
    const camera=this.camera;
    // Root mirrors reported heading into state. Do not mistake that echo for a new absolute heading command.
    if(this.state?.unifiedFlight)this.lastInputHeading=camera.heading;
    this.onViewChange({ fov: this.fov, ...camera, ...extra, drawPending });
  }

  redraw() {
    if (!this.state || this.disposed) return;
    if(this.deferredInputPaint&&typeof globalThis.requestAnimationFrame==='function'){
      if(this.inputPaintFrame==null)this.inputPaintFrame=globalThis.requestAnimationFrame(()=>{this.inputPaintFrame=null;this.redraw();});
      return;
    }
    this.cancelInputPaint();
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 540);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const pixelWidth = Math.round(this.width * dpr);
    const pixelHeight = Math.round(this.height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.palette = palettes[this.state.theme] || palettes.light;
    this.ctx.fillStyle = this.palette.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    this.hits = [];
    this.labelBounds = [];
    this.labelQueue = [];
    this.approach = null;
    if (this.state.unifiedFlight) {
      try {this.drawFlight();} finally {this.frameVisibility=null;this.frameVectors=null;this.frameEarthLocation=undefined;}
    }
    else if (this.globe || this.state.mode === 'surface') this.drawSurface();
    else if (this.state.mode === 'space') this.drawSpace();
    else if (this.state.mode === 'coil') this.drawCoil();
    else if (this.state.mode === 'galactic') this.drawGalactic();
    else this.drawSystem();
    this.flushLabels();
  }

  bodies() {
    if(!this.bodyCache||this.bodyCache.source!==this.state.bodies){
      const rows=(Array.isArray(this.state.bodies)?this.state.bodies:Object.values(this.state.bodies||{})).filter(b=>Array.isArray(b.position)&&b.position.length===3&&b.position.every(Number.isFinite));
      this.bodyCache={source:this.state.bodies,rows,byId:new Map(rows.map(body=>[body.id,body])),positions:new Map(rows.map(body=>[body.id,eclipticToGalactic(body.position)]))};
    }
    return this.bodyCache.rows;
  }

  hasSurface(id) { return !!this.state&&Flight.hasBodySurface(id)&&this.bodies().some(body=>body.id===id&&body.surfaceAvailable!==false); }
  canPin(id) { return !!this.state&&Flight.canPinBody(id)&&this.bodies().some(body=>body.id===id); }

  moonEnabled(body) {
    const parent=moonParent(body);return !parent||(this.state.showMoons!==false&&(parent==='Earth'||this.state.showNonEarthMoons!==false)&&this.state.moonVisibility?.[body.id]!==false);
  }

  // The extent of a moon's *orbit*, measured from its parent's center, controls
  // visibility. Projected moon separation would blink at every conjunction.
  displayBodyScale() { return this.state.markerMode==='physical'?clamp(finite(this.state.bodyScale,1),1,MAX_BODY_SCALE):1; }

  flightBodyVisibility(body) {
    if(!this.frameVisibility)return this.computeFlightBodyVisibility(body);
    if(!this.frameVisibility.has(body.id))this.frameVisibility.set(body.id,this.computeFlightBodyVisibility(body));
    return this.frameVisibility.get(body.id);
  }

  computeFlightBodyVisibility(body) {
    if(body.minorBody&&this.state.showMinorBodies===false)return {dot:0,label:0,priority:0};
    if(!this.moonEnabled(body))return {dot:0,label:0,priority:0};
    const scaledResolved=this.displayBodyScale()>1&&Flight.bodyRadiusAU(body.id)*this.displayBodyScale()*this.focal/Math.max(1e-15,this.flightBodyDistance(body.id))>=1.3;
    const parentId=moonParent(body),focused=body.id===this.state.selected||body.id===this.flight.followBody||body.id===this.flight.tether?.bodyId||body.id===this.trackedBody();
    if(body.artificial){const range=this.flightBodyDistance(body.parentId||'Earth'),extent=finite(body.orbitAU,.000045)*this.focal/Math.max(1e-15,range),visible=body.id!=='ISS'||this.state.showISS!==false,dot=visible?smoothstep(24,120,extent):0;return {dot,label:visible?smoothstep(70,180,extent):0,markerScale:.25+.75*dot,priority:92,orbitPixels:extent};}
    if(parentId){
      const parentDistance=this.flightBodyDistance(parentId);
      const orbitPixels=Math.max(0,finite(body.semimajorAxisAU,finite(body.orbitAU,body.id==='Moon'?.00257:0)))*this.focal/Math.max(1e-15,parentDistance);
      return {dot:focused||scaledResolved?1:smoothstep(8,22,orbitPixels),label:focused?1:smoothstep(24,48,orbitPixels),priority:60,orbitPixels};
    }
    const systemPixels=40*this.focal/Math.max(1e-15,Flight.norm(this.flight.position));
    return {dot:body.id==='Sun'||scaledResolved?1:smoothstep(18,60,systemPixels),label:body.id==='Sun'?1:smoothstep(32,90,systemPixels),priority:body.id==='Sun'?98:body.id==='Earth'?94:90,systemPixels};
  }

  displayPosition(body, bodies) {
    const p = body.position;
    const radius = length(p);
    if (radius < 1e-12) return [0, 0, 0];
    if (this.state.scale === 'true') return p.map(v => v / 3);
    if (moonParent(body)) {
      const earth = bodies.find(b => b.id === moonParent(body));
      if (earth) {
        const earthPosition = this.displayPosition(earth, bodies);
        const difference = minus(p, earth.position);
        const norm = length(difference);
        if (norm > 1e-12) return earthPosition.map((v, i) => v + difference[i] / norm * 0.64);
      }
    }
    const compressedRadius = 10 * Math.log1p(radius) / Math.log1p(30.1);
    return p.map(v => v / radius * compressedRadius);
  }

  worldProject(p) {
    if (this.state?.unifiedFlight) return Flight.projectFlight(p,this.flight,{width:this.width,height:this.height,fov:this.fov});
    const v = minus(p, this.origin);
    if (this.approach) return projectApproach(this.approach.toENU(v), this.approach, { x: this.width / 2 + this.pan.x, y: this.height / 2 + this.pan.y });
    const x = v[0] * Math.cos(this.yaw) - v[1] * Math.sin(this.yaw);
    const y = v[0] * Math.sin(this.yaw) + v[1] * Math.cos(this.yaw);
    const vertical = y * Math.sin(this.pitch) + v[2] * Math.cos(this.pitch);
    const depth = y * Math.cos(this.pitch) - v[2] * Math.sin(this.pitch);
    const perspective = ['space', 'coil', 'galactic'].includes(this.state.mode) ? 1 : 48 / Math.max(4, 48 + depth);
    return { x: this.width * 0.5 + this.pan.x + x * this.unit * perspective, y: this.height * 0.5 + this.pan.y - vertical * this.unit * perspective, z: depth, factor: perspective };
  }

  drawSystem() {
    const { ctx: c, palette: p, state } = this;
    const bodies = this.bodies().filter(body=>this.moonEnabled(body));
    const selected = bodies.find(b => b.id === state.selected);
    this.origin = state.mode === 'track' && selected ? this.displayPosition(selected, bodies) : [0, 0, 0];
    this.unit = Math.min(this.width, this.height * 1.34) * 0.039 * this.zoom;
    if (state.mode === 'track') this.unit *= 1.45;
    c.save();
    this.drawStarField();
    if (state.showZodiac) this.drawZodiac(false);
    if (state.orbits !== false) {
      for (const body of bodies) {
        if (body.id === 'Sun') continue;
        const guide = this.orbitGuides().find(track => track.id === body.id);
        if (!guide) continue;
        const earth = bodies.find(b => b.id === 'Earth');
        c.beginPath();
        for (let index = 0; index < guide.points.length; index++) {
          let position = guide.points[index];
          if (body.id === 'Moon' && earth) position = earth.position.map((value, axis) => value + position[axis]);
          const point = this.worldProject(this.displayPosition({ id: body.id, position }, bodies));
          if (index === 0) c.moveTo(point.x, point.y); else c.lineTo(point.x, point.y);
        }
        c.strokeStyle = body.id === state.selected ? p.muted : p.line;
        c.globalAlpha = body.id === state.selected ? 0.65 : 0.72;
        c.lineWidth = 1;
        if (body.id === 'Moon') c.setLineDash([2, 4]);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
    }
    if (state.showEcliptic !== false) {
      c.strokeStyle = p.line;
      c.globalAlpha = 0.6;
      c.setLineDash([3, 6]);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const start = this.worldProject([0, 0, 0]);
        const end = this.worldProject([Math.cos(angle) * 10.7, Math.sin(angle) * 10.7, 0]);
        c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x, end.y); c.stroke();
      }
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    const placed = bodies.map(body => ({ body, point: this.worldProject(this.displayPosition(body, bodies)) }))
      .sort((a, b) => b.point.z - a.point.z);
    for (const { body, point } of placed) {
      const r = this.bodyRadius(body, point);
      if (point.x + r < 0 || point.y + r < 0 || point.x - r > this.width || point.y - r > this.height) continue;
      this.drawBody(body, point.x, point.y, r);
      this.hits.push({ id: body.id, x: point.x, y: point.y, radius: Math.max(13, r + 7) });
      if (body.id === state.selected) this.drawSelection(point.x, point.y, r + 7);
    }
    if (state.labels !== false) {
      // Selected labels take the most legible available position first.
      placed.sort((a, b) => Number(b.body.id === state.selected) - Number(a.body.id === state.selected));
      for (const { body, point } of placed) {
        const r = this.bodyRadius(body, point);
        this.drawLabel(body.name || body.id, point.x, point.y, r, body.id === state.selected);
      }
    }
    c.restore();
    this.drawOrientation();
  }

  spacePosition(id) {
    if (this.state?.unifiedFlight) { if (id==='Sagittarius A*') return galacticCenterAt(this.state.date,finite(this.state.galacticYears)); this.bodies(); return this.bodyCache.positions.get(id)||[0,0,0]; }
    if (id === 'Sagittarius A*') return solarOrbitAt(finite(this.state.galacticYears)).position.map(value => -value * GALACTIC_MODEL.pcInAU);
    const body = this.bodies().find(body => body.id === id);
    return body ? eclipticToGalactic(body.position).map(value => value * this.solarDistanceFactor()) : [0, 0, 0];
  }

  spaceCoils() {
    const key = `${timeKey(this.state.date).split('T')[0]}|${finite(this.state.galacticCoils, 12)}`;
    if (this.spaceCoilCache?.key === key) return this.spaceCoilCache.tracks;
    const bodies = this.bodies();
    const templates = this.orbitGuides().filter(guide => guide.id !== 'Moon').map(guide => {
      const body = bodies.find(body => body.id === guide.id), ring = guide.points.slice(0, -1);
      if (!body) return guide;
      let nearest = 0, distance = Infinity;
      ring.forEach((point, index) => { const delta = length(minus(point, body.position)); if (delta < distance) { nearest = index; distance = delta; } });
      const points = [...ring.slice(nearest), ...ring.slice(0, nearest)];
      points[0] = [...body.position]; points.push([...body.position]);
      return { id: guide.id, points };
    });
    const tracks = buildGalacticCoils(templates, clamp(finite(this.state.galacticCoils, 12), 1, 64));
    this.spaceCoilCache = { key, tracks };
    return tracks;
  }

  updateSpaceProjection() {
    this.approach = null;
    this.origin = this.spacePosition(this.state.selected || 'Sun');
    this.unit = Math.min(this.width, this.height) * 0.42 / 30 * this.zoom;
    if (this.state.selected === 'Earth') {
      const entry = this.earthEntry();
      this.approach = approachCamera({ zoom: this.zoom, entryZoom: entry.zoom, focal: entry.focal, unit: this.unit,
        yaw: this.yaw, pitch: this.pitch, azimuth: this.azimuth, toENU: galacticToENU(this.state.date, finite(this.state.latitude), finite(this.state.longitude)), auM: AU_KM * 1000, displayScale: this.state.markerMode === 'physical' ? clamp(finite(this.state.bodyScale, 1), 1, MAX_BODY_SCALE) : 1 });
    }
  }

  drawSpace() {
    const { state, ctx: c, palette: p, width: w, height: h } = this;
    const bodies = this.bodies().filter(body=>this.moonEnabled(body)), factor = this.solarDistanceFactor();
    const phase = solarOrbitAt(finite(state.galacticYears)).phaseRadians;
    this.updateSpaceProjection();
    this.spaceData = { effectiveSolarScale: factor, phase, galacticCenter: this.spacePosition('Sagittarius A*'), phaseCompressed: state.showGalacticTrails !== false, earthTurns: finite(state.galacticCoils, 12) };
    this.drawStarField();
    if (state.showZodiac) this.drawZodiac(false);
    c.save();
    // Persistent coarse context, refined by the recent physical trajectories.
    // Never fade one representation out before the other exists.
    c.strokeStyle = p.muted; c.lineWidth = 1; c.globalAlpha = .35; c.beginPath();
    this.strokeWorldPath(Array.from({ length: 721 }, (_, index) => galacticCoilPosition({ angle: -index / 720 * TAU, localAU: [0, 0, 0] }, phase)), 720);
    c.stroke();
    this.trailLOD = { fullOrbit: true, coils: [], recent: true };
    if (state.showGalacticTrails !== false) {
      const selection = new Set(Array.isArray(state.trailBodies) ? state.trailBodies : TRAIL_PLANETS);
      const detail = this.zoom < 1e-6 ? 720 : this.zoom < 1 ? 2048 : 8192;
      for (const track of this.spaceCoils()) {
        if (!selection.has(track.id)) continue;
        const body = bodies.find(body => body.id === track.id);
        c.strokeStyle = body?.color || p.muted; c.lineWidth = track.id === state.selected ? 1.5 : .9;
        c.globalAlpha = track.id === state.selected ? .65 : .35; c.beginPath();
        const points = track.points.map((sample, index) => index === track.points.length - 1 ? this.spacePosition(track.id) : galacticCoilPosition(sample, phase, factor));
        this.strokeWorldPath(points, detail); c.stroke();
        this.trailLOD.coils.push({ id: track.id, available: points.length, detail });
      }
    }
    this.drawRecentSpaceTrails(1);
    if (state.orbits !== false) {
      const earth = bodies.find(body => body.id === 'Earth');
      for (const guide of this.orbitGuides()) {
        c.strokeStyle = p.muted; c.globalAlpha = guide.id === state.selected ? 0.6 : 0.25; c.lineWidth = 1; c.beginPath();
        this.strokeWorldPath(guide.points.map(sample => {
          const local = guide.id === 'Moon' && earth ? sample.map((value, axis) => value + earth.position[axis]) : sample;
          return eclipticToGalactic(local).map(value => value * factor);
        }), 160);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    const center = this.worldProject(this.spaceData.galacticCenter);
    if (center.x >= -15 && center.x <= w + 15 && center.y >= -15 && center.y <= h + 15) {
      c.strokeStyle = p.signal; c.beginPath(); c.moveTo(center.x - 5, center.y); c.lineTo(center.x + 5, center.y); c.moveTo(center.x, center.y - 5); c.lineTo(center.x, center.y + 5); c.stroke();
      this.hits.push({ id: 'Sagittarius A*', x: center.x, y: center.y, radius: 12 });
      if (state.labels !== false) this.drawLabel('Sagittarius A* / Galactic center', center.x, center.y, 5, state.selected === 'Sagittarius A*');
    }
    const placed = bodies.map(body => ({ body, point: this.projectSpaceBody(body) })).filter(({ point }) => !(point.depth <= 0)).sort((a, b) => b.point.z - a.point.z);
    for (const { body, point } of placed) {
      let radius = this.bodyRadius(body, point);
      if (this.approach && body.id !== 'Earth') {
        const physical = finite(body.radiusKm) / AU_KM * this.approach.scale * point.factor;
        radius += (physical - radius) * this.approach.t;
      }
      if (point.x + radius < 0 || point.y + radius < 0 || point.x - radius > w || point.y - radius > h) continue;
      this.drawBody(body, point.x, point.y, radius);
      this.hits.push({ id: body.id, x: point.x, y: point.y, radius: Math.max(12, radius + 5) });
      if (body.id === state.selected) this.drawSelection(point.x, point.y, radius + 6);
      if (state.labels !== false) this.drawLabel(body.id, point.x, point.y, radius, body.id === state.selected);
    }
    c.restore();
    this.drawScaleBar(); this.drawOrientation();
  }

  projectSpaceBody(body) {
    const position = this.spacePosition(body.id);
    if (!this.approach || body.id === 'Earth') return this.worldProject(position);
    const sky = (this.state.sky || []).find(row => row.id === body.id);
    if (!sky || !Number.isFinite(sky.distanceAU)) return this.worldProject(position);
    const geometric = this.approach.toENU(minus(position, this.origin));
    const apparent = direction(sky.azimuth, sky.altitude).map(value => value * sky.distanceAU);
    apparent[2] += (EARTH_RADIUS_M + GROUND_HEIGHT_M) / (AU_KM * 1000);
    const vector = geometric.map((value, index) => value + (apparent[index] - value) * this.approach.t);
    return projectApproach(vector, this.approach, { x: this.width / 2 + this.pan.x, y: this.height / 2 + this.pan.y });
  }

  projectWorldPolygon(points) {
    if (this.approach || this.state?.unifiedFlight) {
      const clipped = [], near = 1e-7;
      for (let index = 0; index < points.length; index++) {
        const a = points[index], b = points[(index + 1) % points.length];
        const da = this.worldProject(a).depth, db = this.worldProject(b).depth;
        if (da >= near) clipped.push(a);
        if ((da >= near) !== (db >= near)) {
          const weight = (near - da) / (db - da);
          clipped.push(a.map((value, axis) => value + (b[axis] - value) * weight));
        }
      }
      points = clipped;
    }
    return this.clipViewport(points.map(point => this.worldProject(point)));
  }

  strokeWorldPath(points, limit = 8192) {
    const stride = Math.max(1, Math.ceil((points.length - 1) / limit));
    if(this.state?.unifiedFlight) {
      const eye=this.flight.position,r=this.right,u=this.up,f=this.forward;let ax,ay,az,previous=false;
      for(let i=0;i<points.length;i=Math.min(points.length-1,i+stride)){
        const p=points[i],x=(p[0]-eye[0])*Flight.AU_M,y=(p[1]-eye[1])*Flight.AU_M,z=(p[2]-eye[2])*Flight.AU_M,bx=x*r[0]+y*r[1]+z*r[2],by=x*u[0]+y*u[1]+z*u[2],bz=x*f[0]+y*f[1]+z*f[2];
        if(previous)this.strokeCameraSegment(ax,ay,az,bx,by,bz);ax=bx;ay=by;az=bz;previous=true;if(i===points.length-1)break;
      }return;
    }
    let previous = null;
    for (let index = 0; index < points.length; index = Math.min(points.length - 1, index + stride)) {
      const current = points[index];
      if (previous) {
        let first = this.worldProject(previous), last = this.worldProject(current);
        const near = 1e-7;
        if (!(first.depth < near && last.depth < near)) {
          if ((this.approach || this.state.unifiedFlight) && (first.depth < near || last.depth < near)) {
            const weight = (near - first.depth) / (last.depth - first.depth);
            const crossing = this.worldProject(previous.map((value, axis) => value + (current[axis] - value) * weight));
            if (first.depth < near) first = crossing; else last = crossing;
          }
          const segment = clipScreenSegment(first, last, this.width, this.height);
          if (segment) { this.ctx.moveTo(segment[0].x, segment[0].y); this.ctx.lineTo(segment[1].x, segment[1].y); }
        }
      }
      previous = current;
      if (index === points.length - 1) break;
    }
  }

  drawRecentSpaceTrails(alpha) {
    const { state, ctx: c, palette: p } = this;
    const data = state.trails?.tracks ? state.trails : this.trailData();
    const now = state.date, start = addTime(now, -finite(state.trailYears, 2) * YEAR_DAYS * DAY_MS);
    const factor = this.solarDistanceFactor(), sun = pointInTrailFrame([0, 0, 0], now, data.end ?? now, data.frame);
    const selection = new Set(Array.isArray(state.trailBodies) ? state.trailBodies : TRAIL_PLANETS);
    selection.add('Sun');
    const transform = position => (data.frame === 'heliocentric' ? eclipticToGalactic(position) : minus(position, sun)).map(value => value * factor);
    this.recentSpaceTrails = { start, end: now, frame: data.frame, tracks: [] };
    for (const track of data.tracks) {
      if (!selection.has(track.id)) continue;
      const points = track.points.filter(point => differenceMillis(point.time, start) >= 0 && differenceMillis(point.time, now) <= 0).map(point => ({ time: point.time, position: transform(point.position) }));
      const before = track.points.findIndex(point => differenceMillis(point.time, start) >= 0);
      if (before > 0 && differenceMillis(track.points[before].time, start) > 0) {
        const a = track.points[before - 1], b = track.points[before], t = differenceMillis(start, a.time) / differenceMillis(b.time, a.time);
        points.unshift({ time: start, position: transform(a.position.map((value, axis) => value + (b.position[axis] - value) * t)) });
      }
      const body = this.bodies().find(body => body.id === track.id);
      if (body) {
        const endpoint = { time: now, position: this.spacePosition(track.id) };
        if (points.length && differenceMillis(points.at(-1).time, now) === 0) points[points.length - 1] = endpoint; else points.push(endpoint);
      }
      this.recentSpaceTrails.tracks.push({ id: track.id, points });
      c.strokeStyle = body?.color || p.muted; c.lineWidth = track.id === state.selected ? 1.5 : 0.9;
      c.globalAlpha = alpha * (track.id === state.selected ? 0.65 : 0.32); c.beginPath();
      this.strokeWorldPath(points.map(sample => sample.position), this.zoom < 1e-6 ? 256 : 4096);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  orbitGuides() {
    const day = timeKey(this.state.date).split('T')[0];
    if (this.orbitCache?.day === day) return this.orbitCache.tracks;
    const periods = { Mercury: 87.969, Venus: 224.701, Earth: 365.256, Moon: 27.322, Mars: 686.98, Jupiter: 4332.59, Saturn: 10759.22, Uranus: 30688.5, Neptune: 60182 };
    const tracks = Object.entries(periods).map(([id, period]) => {
      const span = period * DAY_MS, start = addTime(this.state.date, -span / 2);
      const points = Array.from({ length: 161 }, (_, index) => {
        const samples = helioPositionsAt(addTime(start, span * index / 160), id === 'Moon' ? ['Moon', 'Earth'] : [id]);
        return id === 'Moon' ? minus(samples[0].position, samples[1].position) : samples[0].position;
      });
      return { id, points };
    });
    this.orbitCache = { day, tracks };
    return tracks;
  }

  catalogue() {
    if (this.catalogueCache?.source === this.state.stars) return this.catalogueCache.stars;
    const stars = (this.state.stars || []).filter(star => Number.isFinite(Number(star.ra)) && Number.isFinite(Number(star.dec))).map(star => {
      const equatorial = Array.isArray(star.vector) ? star.vector : catalogueVector(star.ra, star.dec);
      return { ...star, id: String(star.id), equatorial, ecliptic: equatorialToEcliptic(equatorial), galactic: equatorialToGalactic(equatorial) };
    });
    this.catalogueCache = { source: this.state.stars, stars };
    this.surfaceStarCache = null;
    return stars;
  }

  /** Directions at infinity share the scene camera orientation, with no fabricated distances. */
  celestialProject(vector) {
    const x = vector[0] * Math.cos(this.yaw) - vector[1] * Math.sin(this.yaw);
    const y = vector[0] * Math.sin(this.yaw) + vector[1] * Math.cos(this.yaw);
    const vertical = y * Math.sin(this.pitch) + vector[2] * Math.cos(this.pitch);
    const depth = y * Math.cos(this.pitch) - vector[2] * Math.sin(this.pitch);
    if (depth <= 0.02) return null;
    const focal = this.state.mode === 'space' ? this.height / (2 * Math.tan(this.fov * RAD / 2)) : this.state.mode === 'coil' ? Math.min(this.width, this.height) * .82 * clamp(Math.sqrt(this.zoom), .25, 100) : 48 * this.unit;
    return { x: this.width / 2 + this.pan.x + focal * x / depth, y: this.height * 0.5 + this.pan.y - focal * vertical / depth, depth };
  }

  drawStarField(surface = false) {
    const { ctx: c, palette: p, state, width: w, height: h } = this;
    if (!state.showStars && !state.showConstellations) return;
    const catalogue = this.catalogue();
    const coordinateKey = `${timeKey(state.date)}|${state.latitude}|${state.longitude}|${state.height || 0}|${state.refraction || 'none'}`;
    if ((surface || this.approach) && this.surfaceStarCache?.key !== coordinateKey) {
      this.surfaceStarCache = { key: coordinateKey, directions: new Map(catalogue.map(star => {
        const horizontal = starHorizontal(star.ra, star.dec, state.date, finite(state.latitude), finite(state.longitude), { height: finite(state.height), refraction: state.refraction || 'none' });
        return [star.id, direction(horizontal.azimuth, horizontal.altitude)];
      })) };
    }
    const getVector = star => surface ? this.surfaceStarCache.directions.get(star.id) : this.approach ? this.approach.toENU(star.galactic).map((value, index) => value + (this.surfaceStarCache.directions.get(star.id)[index] - value) * this.approach.t) : star[state.mode === 'space' || (state.mode === 'coil' && state.trailFrame !== 'heliocentric') ? 'galactic' : 'ecliptic'];
    const project = vector => {
      if (!surface && this.approach) {
        const depth = dot(vector, this.approach.forward);
        if (depth <= .02) return null;
        return { x: w / 2 + this.pan.x + this.approach.focal * dot(vector, this.approach.right) / depth, y: h / 2 + this.pan.y - this.approach.focal * dot(vector, this.approach.up) / depth, depth };
      }
      if (!surface) return this.celestialProject(vector);
      const depth = dot(vector, this.forward);
      if (depth <= 0.02) return null;
      return { x: (this.surfaceCenter?.x ?? w / 2) + this.focal * dot(vector, this.right) / depth, y: (this.surfaceCenter?.y ?? h / 2) - this.focal * dot(vector, this.up) / depth, depth };
    };
    c.save();
    if (state.showConstellations) {
      const lookup = new Map(catalogue.map(star => [star.id, star]));
      c.strokeStyle = p.muted; c.lineWidth = 0.7; c.globalAlpha = state.theme === 'dark' ? 0.36 : 0.3;
      for (const constellation of state.constellations || []) {
        c.beginPath();
        const labelPoints = [];
        for (const [aId, bId] of constellation.lines || []) {
          const a = lookup.get(String(aId)), b = lookup.get(String(bId));
          if (!a || !b) continue;
          const av = getVector(a), bv = getVector(b);
          let previous = null;
          for (let step = 0; step <= 16; step++) {
            const t = step / 16;
            const vector = av.map((v, index) => v * (1 - t) + bv[index] * t);
            const point = project(vector);
            if (!point || Math.abs(point.x) > w * 4 || Math.abs(point.y) > h * 4) { previous = null; continue; }
            if (previous) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y);
            previous = point;
            if ((step === 0 || step === 16) && point.x > 25 && point.x < w - 25 && point.y > 55 && point.y < h - 55) labelPoints.push(point);
          }
        }
        c.stroke();
        if (state.labels !== false && labelPoints.length >= 4 && constellation.name) {
          const x = labelPoints.reduce((sum, point) => sum + point.x, 0) / labelPoints.length;
          const y = labelPoints.reduce((sum, point) => sum + point.y, 0) / labelPoints.length;
          this.drawLabel(constellation.name, x, y, 0, false, { category: 'constellation', size: 10, priority: 10 });
        }
      }
    }
    if (state.showStars) {
      c.fillStyle = p.text;
      for (const star of catalogue) {
        if (star.render === false || finite(star.mag, 99) > 6.5) continue;
        const point = project(getVector(star));
        if (!point || point.x < 0 || point.x > w || point.y < 0 || point.y > h) continue;
        const magnitude = finite(star.mag, 4);
        const radius = clamp(1.65 - magnitude * 0.22, 0.5, 2.2);
        c.globalAlpha = clamp(0.86 - (magnitude + 1.5) * 0.095, 0.28, 0.92);
        c.beginPath(); c.arc(point.x, point.y, radius, 0, TAU); c.fill();
        if (state.labels !== false && star.name && magnitude < 1.5) this.drawLabel(star.name, point.x, point.y, radius, false, { category: 'star', size: 10, priority: 30 });
      }
    }
    c.restore();
  }

  trailData() {
    const { state } = this;
    const years = clamp(finite(state.trailYears, 2), 0.01, 100);
    const frame = state.trailFrame === 'heliocentric' ? 'heliocentric' : 'galactic';
    const day = timeKey(state.date).split('T')[0];
    const key = `${day}|${years}|${frame}`;
    if (this.trailCache?.key !== key) this.trailCache = { key, data: getTrailData(state.date, years, frame) };
    return this.trailCache.data;
  }

  drawCoil() {
    const { ctx: c, palette: p, state, width: w, height: h } = this;
    const data = state.trails?.tracks ? state.trails : this.trailData();
    const now = state.date;
    const start = addTime(now, -finite(state.trailYears, 2) * YEAR_DAYS * DAY_MS);
    const selection = new Set(Array.isArray(state.trailBodies) ? state.trailBodies : TRAIL_PLANETS);
    selection.add('Sun');
    const bodies = this.bodies();
    const byId = new Map(bodies.map(body => [body.id, body]));
    const tracks = data.tracks.filter(track => selection.has(track.id)).map(track => {
      const points = track.points.filter(point => differenceMillis(point.time, start) >= 0 && differenceMillis(point.time, now) <= 0);
      const before = track.points.findIndex(point => differenceMillis(point.time, start) >= 0);
      if (before > 0 && differenceMillis(track.points[before].time, start) > 0) {
        const a = track.points[before - 1], b = track.points[before];
        const t = differenceMillis(start, a.time) / differenceMillis(b.time, a.time);
        points.unshift({ time: start, position: a.position.map((v, index) => v + (b.position[index] - v) * t) });
      }
      const body = byId.get(track.id);
      if (body) {
        const endpoint = { time: now, position: pointInTrailFrame(body.position, now, data.end, data.frame) };
        if (points.length && differenceMillis(points.at(-1).time, now) === 0) points[points.length - 1] = endpoint;
        else points.push(endpoint);
      }
      return { id: track.id, body, points };
    }).filter(track => track.points.length);
    const all = tracks.flatMap(track => track.points);
    if (!all.length) return;
    const minima = [Infinity, Infinity, Infinity], maxima = [-Infinity, -Infinity, -Infinity];
    for (const { position } of all) for (let axis = 0; axis < 3; axis++) { minima[axis] = Math.min(minima[axis], position[axis]); maxima[axis] = Math.max(maxima[axis], position[axis]); }
    this.origin = minima.map((value, axis) => (value + maxima[axis]) / 2);
    this.unit = 1;
    let horizontal = 0, vertical = 0;
    for (const { position } of all) {
      const point = this.worldProject(position);
      horizontal = Math.max(horizontal, Math.abs(point.x - w / 2 - this.pan.x));
      vertical = Math.max(vertical, Math.abs(point.y - h * 0.5 - this.pan.y));
    }
    this.unit = Math.min(Math.max(80, w - 100) / Math.max(1, horizontal * 2), Math.max(80, h - 100) / Math.max(1, vertical * 2)) * this.zoom;
    this.coilData = { ...data, visibleStart: start, visibleEnd: now, tracks };
    this.drawStarField();
    if (state.showZodiac) this.drawZodiac(false);
    c.save();
    if (state.showEcliptic !== false) {
      const sun = pointInTrailFrame([0, 0, 0], now, data.end, data.frame);
      const orbitExtent = Math.max(1, ...tracks.filter(track => track.body).map(track => length(track.body.position)));
      c.strokeStyle = p.muted; c.lineWidth = 0.8; c.globalAlpha = 0.28; c.setLineDash([3, 6]);
      c.beginPath();
      for (let index = 0; index <= 128; index++) {
        const angle = index / 128 * TAU;
        let offset = [Math.cos(angle) * orbitExtent, Math.sin(angle) * orbitExtent, 0];
        if (data.frame === 'galactic') offset = eclipticToGalactic(offset);
        const point = this.worldProject(sun.map((v, axis) => v + offset[axis]));
        if (index) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y);
      }
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    }
    tracks.sort((a, b) => this.worldProject(b.points.at(-1).position).z - this.worldProject(a.points.at(-1).position).z).forEach(track => {
      const points = track.points.map(point => ({ ...this.worldProject(point.position), time: point.time }));
      const selected = state.selected === track.id;
      c.strokeStyle = track.body?.color || (track.id === 'Sun' ? '#cf983a' : p.muted);
      c.lineWidth = selected ? 1.8 : track.id === 'Sun' ? 1 : 1.1;
      // Four age bands communicate time while retaining the measured trajectory shape.
      for (let band = 0; band < 4; band++) {
        c.globalAlpha = track.id === 'Sun' ? 0.7 : 0.22 + band * 0.19;
        const low = addTime(start, differenceMillis(now, start) * band / 4);
        const high = addTime(start, differenceMillis(now, start) * (band + 1) / 4);
        c.beginPath();
        let drawing = false;
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1], b = points[index], duration = differenceMillis(b.time, a.time);
          if (differenceMillis(b.time, low) < 0 || differenceMillis(a.time, high) > 0 || duration <= 0) { drawing = false; continue; }
          const first = clamp(differenceMillis(low, a.time) / duration, 0, 1), last = clamp(differenceMillis(high, a.time) / duration, 0, 1);
          if (!drawing) c.moveTo(a.x + (b.x - a.x) * first, a.y + (b.y - a.y) * first);
          c.lineTo(a.x + (b.x - a.x) * last, a.y + (b.y - a.y) * last); drawing = true;
        }
        c.stroke();
      }
    });
    c.globalAlpha = 1;
    for (const track of tracks) {
      const point = this.worldProject(track.points.at(-1).position);
      const body = track.body || { id: track.id, name: track.id };
      const radius = this.bodyRadius(body, point);
      this.drawBody(body, point.x, point.y, radius);
      if (state.selected === track.id) this.drawSelection(point.x, point.y, radius + 6);
      this.hits.push({ id: track.id, x: point.x, y: point.y, radius: Math.max(12, radius + 6) });
    }
    if (state.labels !== false) {
      for (const track of [...tracks].sort((a, b) => Number(b.id === state.selected) - Number(a.id === state.selected))) {
        const point = this.worldProject(track.points.at(-1).position);
        this.drawLabel(track.id, point.x, point.y, this.bodyRadius(track.body || {}, point), state.selected === track.id);
      }
    }
    c.restore();
    this.drawScaleBar();
    this.drawOrientation();
  }

  drawScaleBar() {
    const { ctx: c, palette: p, height: h } = this;
    const targetAU = 80 / this.unit;
    const divisor = this.state.mode === 'space' && targetAU > GALACTIC_MODEL.pcInAU * 1000 ? GALACTIC_MODEL.pcInAU * 1000 : this.state.mode === 'space' && targetAU > GALACTIC_MODEL.pcInAU ? GALACTIC_MODEL.pcInAU : 1;
    const unitName = divisor > GALACTIC_MODEL.pcInAU ? 'kpc' : divisor > 1 || this.state.mode === 'galactic' ? 'pc' : 'AU';
    const target = targetAU / divisor, magnitude = 10 ** Math.floor(Math.log10(target));
    const size = [1, 2, 5, 10].find(value => value * magnitude >= target) * magnitude;
    const width = size * divisor * this.unit;
    c.save(); c.strokeStyle = p.muted; c.fillStyle = p.muted; c.lineWidth = 1;
    c.beginPath(); c.moveTo(20, h - 53); c.lineTo(20 + width, h - 53);
    c.moveTo(20, h - 57); c.lineTo(20, h - 49); c.moveTo(20 + width, h - 57); c.lineTo(20 + width, h - 49); c.stroke();
    c.font = '10px ui-monospace, monospace'; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(`${Number(size.toPrecision(4))} ${unitName}`, 20, h - 59);
    c.restore();
    this.labelBounds.push({ x: 10, y: h - 82, w: Math.max(130, width + 20), h: 45, key: 'scale' });
  }

  drawGalactic() {
    const { ctx: c, palette: p, state } = this;
    this.origin = [0, 0, 0];
    this.unit = Math.min(this.width, this.height) * 0.42 / GALACTIC_MODEL.radiusPc * this.zoom;
    const years = finite(state.galacticYears);
    const orbit = this.galacticOrbit ||= galacticOrbitPoints(721);
    this.galacticData = { ...solarOrbitAt(years), periodYears: GALACTIC_MODEL.periodYears, center: [0, 0, 0] };
    c.save(); c.strokeStyle = p.muted; c.lineWidth = 1; c.globalAlpha = 0.65; c.beginPath();
    for (let index = 0; index < orbit.length; index++) {
      const point = this.worldProject(orbit[index].position);
      if (index) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y);
    }
    c.stroke(); c.globalAlpha = 1;
    const center = this.worldProject([0, 0, 0]), sun = this.worldProject(this.galacticData.position);
    c.strokeStyle = p.line; c.setLineDash([3, 6]); c.beginPath(); c.moveTo(center.x, center.y); c.lineTo(sun.x, sun.y); c.stroke(); c.setLineDash([]);
    // This cross marks the coordinate origin; it is not a drawn black-hole radius.
    c.strokeStyle = p.signal; c.beginPath();
    c.moveTo(center.x - 5, center.y); c.lineTo(center.x + 5, center.y);
    c.moveTo(center.x, center.y - 5); c.lineTo(center.x, center.y + 5); c.stroke();
    this.hits.push({ id: 'Sagittarius A*', x: center.x, y: center.y, radius: 12 });
    if (state.labels !== false) this.drawLabel('Sagittarius A* / Galactic center', center.x, center.y, 5, state.selected === 'Sagittarius A*', { priority: 90 });
    const bodies = this.bodies();
    const displayed = (this.zoom < 1e6 ? bodies.filter(body => body.id === 'Sun') : bodies).filter(body=>this.moonEnabled(body));
    for (const body of displayed) {
      const point = this.worldProject(embedSolarPosition(body.position, years));
      const radius = this.bodyRadius(body, point);
      this.drawBody(body, point.x, point.y, radius);
      this.hits.push({ id: body.id, x: point.x, y: point.y, radius: Math.max(12, radius + 5) });
      if (state.selected === body.id) this.drawSelection(point.x, point.y, radius + 7);
      if (state.labels !== false) this.drawLabel(body.id === 'Sun' ? 'Sun / solar system' : body.id, point.x, point.y, radius, state.selected === body.id);
    }
    if (state.labels !== false && this.zoom <= 2) {
      for (const fraction of [0, 0.25, 0.5, 0.75]) {
        const point = this.worldProject(solarOrbitAt(fraction * GALACTIC_MODEL.periodYears).position);
        this.drawLabel(`${(fraction * GALACTIC_MODEL.periodYears / 1e6).toFixed(1)} Myr`, point.x, point.y, 4, false, { category: 'orbital-time', size: 10, priority: 25 });
      }
    }
    c.restore();
    this.drawScaleBar(); this.drawOrientation();
  }

  clipSkyPolygon(vectors, near = 0.025) {
    const output = [];
    for (let index = 0; index < vectors.length; index++) {
      const a = vectors[index], b = vectors[(index + 1) % vectors.length];
      const da = dot(a, this.forward), db = dot(b, this.forward);
      if (da >= near) output.push(a);
      if ((da >= near) !== (db >= near)) {
        const t = (near - da) / (db - da);
        output.push(a.map((value, axis) => value + (b[axis] - value) * t));
      }
    }
    return output.map(vector => {
      const depth = dot(vector, this.forward);
      return { x: (this.surfaceCenter?.x ?? this.width / 2) + this.focal * dot(vector, this.right) / depth, y: (this.surfaceCenter?.y ?? this.height / 2) - this.focal * dot(vector, this.up) / depth };
    });
  }

  drawZodiac(surface) {
    const { state, ctx: c, palette: p } = this;
    if (state.mode === 'galactic') return;
    const data = zodiacAt(state.date, finite(state.latitude), finite(state.longitude));
    this.zodiacData = data;
    const bodies = this.bodies(), earth = bodies.find(body => body.id === 'Earth');
    let center = earth ? this.displayPosition(earth, bodies) : [0, 0, 0];
    if (state.mode === 'coil') center = earth ? pointInTrailFrame(earth.position, state.date, this.coilData?.end ?? state.date, state.trailFrame) : [0, 0, 0];
    if (state.mode === 'space') center = this.spacePosition('Earth');
    const radius = state.mode === 'space' ? 32 * this.solarDistanceFactor() : state.mode === 'coil' ? 12 : 11;
    const worldDirection = vector => state.mode === 'space' || (state.mode === 'coil' && state.trailFrame !== 'heliocentric') ? eclipticToGalactic(vector) : vector;
    const worldPosition = (point, multiplier = 1) => worldDirection(point.eclipticJ2000).map((value, axis) => center[axis] + value * radius * multiplier);
    const worldPoint = (point, multiplier = 1) => this.worldProject(worldPosition(point, multiplier));
    c.save();
    data.sectors.forEach((sector, index) => {
      const points = surface ? this.clipSkyPolygon(sector.polygon.map(point => point.horizon))
        : this.projectWorldPolygon([...sector.points.map(point => worldPosition(point, 0.82)), ...[...sector.points].reverse().map(point => worldPosition(point, 1))]);
      if (points.length > 2) {
        c.beginPath(); points.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.closePath();
        c.strokeStyle = p.muted; c.lineWidth = 0.7; c.globalAlpha = 0.24; c.stroke();
      }
      if (surface) this.skyLine(sector.boundaryMeridian.map(point => [point.azimuth, point.altitude]), { color: p.muted, alpha: 0.18, dash: [2, 7], width: 0.7 });
      else {
        c.beginPath(); this.strokeWorldPath([worldPosition(sector.boundaries[0], .82), worldPosition(sector.boundaries[0], 1)]); c.stroke();
      }
      if (state.labels !== false) {
        const point = surface ? this.skyProject(sector.center.azimuth, sector.center.altitude) : worldPoint(sector.center, 0.92);
        if (point && !(point.depth <= 0)) this.drawLabel(sector.sign, point.x, point.y, 0, false, { category: 'zodiac', priority: 55, size: 11 });
      }
    });
    if (surface && state.labels !== false) {
      for (const [name, point] of [['ASC', data.ascendant], ['MC', data.midheaven], ['DSC', data.descendant], ['IC', data.imumCoeli]]) {
        if (!point) continue;
        const projected = this.skyProject(point.azimuth, point.altitude);
        if (projected) this.drawLabel(`${name} ${point.degree.toFixed(1)}° ${point.sign}`, projected.x, projected.y, 3, false, { category: 'angle', priority: 90, size: 10 });
      }
    }
    c.restore();
  }

  bodyRadius(body, point = { factor: 1 }) {
    if (this.state.mode === 'space' && this.state.markerMode !== 'physical') return (symbolRadii[body.id] || 5) * clamp(finite(this.state.markerSize, 1), 0.25, 4);
    const scale = Math.max(0, finite(this.state.bodyScale, 1));
    const worldPerAU = this.state.mode === 'galactic' ? 1 / GALACTIC_MODEL.pcInAU : ['space', 'coil'].includes(this.state.mode) ? 1 : this.state.scale === 'true' ? 1 / 3 : 1;
    return Math.max(0, finite(body.radiusKm)) / AU_KM * worldPerAU * this.unit * scale * finite(point.factor, 1);
  }

  drawBody(body, x, y, r) {
    const { ctx: c, palette: p } = this;
    const color = body.color || p.muted;
    if(body.artificial){this.drawArtificialSymbol(x,y,color);return;}
    c.save();
    const opacity=this.surfaceOpacity(body.id);c.globalAlpha=opacity;
    if (body.id === 'Saturn') {
      c.save(); c.translate(x, y); c.rotate(-0.32);
      c.strokeStyle = color; c.globalAlpha = 0.65*opacity; c.lineWidth = r * 0.28;
      c.beginPath(); c.ellipse(0, 0, r * 1.75, r * 0.48, 0, 0, TAU); c.stroke(); c.restore();
    }
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.restore();
  }

  drawSelection(x, y, r) {
    const c = this.ctx;
    c.strokeStyle = this.palette.signal; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      c.beginPath(); c.arc(x, y, r, a + 0.13, a + 0.62); c.stroke();
    }
  }

  drawLabel(text, x, y, r, selected = false, options = {}) {
    if (![x, y, r].every(Number.isFinite) || x < 0 || y < 0 || x > this.width || y > this.height) return;
    const category = options.category || 'body';
    this.labelQueue.push({ text: String(text), x, y, r, selected, category, size: options.size || 11,
      priority: selected ? 100 : options.priority ?? 80, color:options.color, opacity:clamp(finite(options.opacity,1),0,1), bodyId:options.bodyId, required:options.required===true, key: options.key||`${category}:${text}` });
  }

  labelAvoidsAnchors(box,width,height) {
    return !(this.labelAnchors||[]).some(anchor=>Math.hypot(clamp(anchor.x,box.x-5,box.x+width+5)-anchor.x,clamp(anchor.y,box.y-4,box.y+height+4)-anchor.y)<anchor.radius);
  }

  drawRequiredLabels(labels) {
    const c=this.ctx,w=this.width,h=this.height,p=this.palette,margin=10;
    this.requiredLabelLayout=[];this.requiredLabelOffsets??=new Map();
    const reserved=[...this.labelBounds];c.save();
    // At most fourteen Earth astrology points. Reserve their boxes before stars,
    // bodies and zodiac names; a collision changes placement, never visibility.
    for(const label of labels.sort((a,b)=>a.key.localeCompare(b.key))){
      const size=label.size,th=size+3;c.font=`${label.selected?600:400} ${size}px ui-sans-serif, system-ui, sans-serif`;
      const tw=Math.min(c.measureText(label.text).width,Math.max(1,w-2*margin)),xMax=Math.max(margin,w-margin-tw),yMax=Math.max(margin,h-margin-th);
      const bounded=(x,y)=>({x:clamp(x,margin,xMax),y:clamp(y,margin,yMax)});
      const overlap=box=>reserved.reduce((sum,other)=>sum+Math.max(0,Math.min(box.x+tw+4,other.x+other.w+4)-Math.max(box.x-4,other.x-4))*Math.max(0,Math.min(box.y+th+3,other.y+other.h+3)-Math.max(box.y-3,other.y-3)),0);
      const previous=this.requiredLabelOffsets.get(label.key),candidates=[];
      if(previous)candidates.push(bounded(label.x+previous.x,label.y+previous.y));
      candidates.push(bounded(label.x+label.r+8,label.y-th/2),bounded(label.x-tw-label.r-8,label.y-th/2),bounded(label.x-tw/2,label.y+label.r+8),bounded(label.x-tw/2,label.y-th-label.r-8));
      for(let y=margin;y<=yMax;y+=th+7)for(const x of [label.x+label.r+8,label.x-tw-label.r-8,margin,xMax])candidates.push(bounded(x,y));
      for(let y=margin;y<=yMax;y+=th+7)for(let x=margin;x<=xMax;x+=Math.max(30,tw+10))candidates.push(bounded(x,y));
      const clear=candidates.filter(box=>this.labelAvoidsAnchors(box,tw,th));
      let at=clear.slice(0,previous&&clear[0]===candidates[0]?1:0).find(box=>overlap(box)===0);
      if(!at)at=clear.sort((a,b)=>overlap(a)-overlap(b)||(Math.hypot(a.x+tw/2-label.x,a.y+th/2-label.y)-Math.hypot(b.x+tw/2-label.x,b.y+th/2-label.y)))[0];
      if(!at)continue;
      const edge={x:clamp(label.x,at.x,at.x+tw),y:clamp(label.y,at.y,at.y+th)},distance=Math.hypot(edge.x-label.x,edge.y-label.y);
      if(distance>label.r+3){const gap=Math.min(distance,Math.max(5,Math.min(label.r,8)+2));c.globalAlpha=.65*label.opacity;c.strokeStyle=label.color||p.muted;c.lineWidth=.75;c.beginPath();c.moveTo(label.x+(edge.x-label.x)*gap/distance,label.y+(edge.y-label.y)*gap/distance);c.lineTo(edge.x,edge.y);c.stroke();}
      c.fillStyle=p.background;c.globalAlpha=.9*label.opacity;c.fillRect(at.x-3,at.y-2,tw+6,th+4);
      c.fillStyle=label.color||p.muted;c.globalAlpha=label.opacity;c.textAlign='left';c.textBaseline='top';c.fillText(label.text,at.x,at.y,tw);
      const box={...at,w:tw,h:th,key:label.key};reserved.push(box);this.labelBounds.push(box);this.requiredLabelLayout.push({...box,text:label.text,anchor:{x:label.x,y:label.y},opacity:label.opacity,leader:distance>label.r+3});
      this.requiredLabelOffsets.set(label.key,{x:at.x-label.x,y:at.y-label.y});
    }
    c.restore();
  }

  flushLabels() {
    const { ctx: c, width: w, height: h, palette: p } = this;
    const queued=this.labelQueue.splice(0);
    this.labelAnchors=[...queued.map(label=>({x:label.x,y:label.y,radius:clamp(label.r,3,8)})),...this.hits,...(this.astrologyHits||[])].filter(anchor=>Number.isFinite(anchor.x)&&Number.isFinite(anchor.y)&&anchor.x>=0&&anchor.x<=w&&anchor.y>=0&&anchor.y<=h).map(anchor=>({...anchor,radius:clamp(finite(anchor.radius,4),3,8)}));
    this.drawRequiredLabels(queued.filter(label=>label.required));
    const labels = queued.filter(label=>!label.required).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
    const seen = new Set();
    c.save();
    for (const label of labels) {
      if (seen.has(label.key)) continue;
      seen.add(label.key);
      const { text, x, y, r, size } = label;
      c.font = `${label.selected ? 600 : 400} ${size}px ui-sans-serif, system-ui, sans-serif`;
      const tw = c.measureText(text).width, th = size + 3;
      const options = [
        { x: x + r + 8, y: y - th / 2 }, { x: x - tw - r - 8, y: y - th / 2 },
        { x: x - tw / 2, y: y + r + 8 }, { x: x - tw / 2, y: y - r - th - 8 },
        { x: x + r + 8, y: y - r - th - 8 }, { x: x - tw - r - 8, y: y + r + 8 },
      ];
      const preferred = this.labelPlacements.get(label.key);
      const order = Number.isInteger(preferred) ? [preferred, ...options.map((_, index) => index).filter(index => index !== preferred)] : options.map((_, index) => index);
      const valid = box => box.x >= 10 && box.y >= 10 && box.x + tw <= w - 10 && box.y + th <= h - 10 &&
        !this.labelBounds.some(other => box.x - 4 < other.x + other.w && box.x + tw + 4 > other.x && box.y - 3 < other.y + other.h && box.y + th + 3 > other.y) &&
        this.labelAvoidsAnchors(box,tw,th);
      // Keep a chosen side while it remains in bounds. A temporary collision hides
      // a low-priority label rather than making it hop around the object each frame.
      const inside = box => box.x >= 10 && box.y >= 10 && box.x + tw <= w - 10 && box.y + th <= h - 10;
      let index;
      if (Number.isInteger(preferred) && inside(options[preferred])) {
        this.labelEdgeSince.delete(label.key);
        if (valid(options[preferred])) index = preferred;
      } else {
        const now = globalThis.performance?.now?.() ?? 0;
        if (Number.isInteger(preferred) && !this.labelEdgeSince.has(label.key)) this.labelEdgeSince.set(label.key, now);
        if (!Number.isInteger(preferred) || now - this.labelEdgeSince.get(label.key) >= 300) index = order.find(index => valid(options[index]));
      }
      const now = globalThis.performance?.now?.() ?? 0;
      let visibility = this.labelVisibility.get(label.key);
      if (index === undefined) {
        if (visibility) this.labelVisibility.set(label.key, { shown: false, clearSince: null });
        continue;
      }
      let fade = 1;
      if (visibility && !visibility.shown) {
        visibility.clearSince ??= now;
        if (now - visibility.clearSince < 120) continue;
        fade = clamp((now - visibility.clearSince - 120) / 100, 0, 1);
        if (fade >= 1) visibility.shown = true;
      } else if (!visibility) this.labelVisibility.set(label.key, { shown: true, clearSince: null });
      const at = options[index];
      this.labelPlacements.set(label.key, index);
      c.fillStyle = p.background; c.globalAlpha = 0.9 * fade * label.opacity; c.fillRect(at.x - 3, at.y - 2, tw + 6, th + 4);
      c.globalAlpha = (label.category === 'constellation' ? 0.68 : 1) * fade * label.opacity;
      c.fillStyle = label.color || (label.selected ? p.signal : p.muted);
      c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(text, at.x, at.y);
      this.labelBounds.push({ ...at, w: tw, h: th, key: label.key });
    }
    c.restore();
  }

  drawOrientation() {
    const { ctx: c, width: w, height: h, palette: p } = this;
    const galactic = this.state.mode === 'space' || this.state.mode === 'galactic' || (this.state.mode === 'coil' && this.state.trailFrame !== 'heliocentric');
    const localGalactic = this.state.mode === 'space' || (this.state.mode === 'coil' && this.state.trailFrame !== 'heliocentric');
    const phase = this.state.mode === 'space' ? solarOrbitAt(finite(this.state.galacticYears)).phaseRadians : 0;
    const cx = w - (galactic ? 46 : 35), cy = h - (galactic ? 62 : 40);
    c.save(); c.lineWidth = 1; c.strokeStyle = p.muted; c.fillStyle = p.muted;
    for (const [axis, vec] of [[localGalactic ? 'GC' : 'x', [Math.cos(phase), -Math.sin(phase), 0]], [localGalactic ? '90°' : 'y', [Math.sin(phase), Math.cos(phase), 0]], [localGalactic ? 'N' : 'z', [0, 0, 1]]]) {
      const rotatedX = vec[0] * Math.cos(this.yaw) - vec[1] * Math.sin(this.yaw);
      const rotatedY = (vec[0] * Math.sin(this.yaw) + vec[1] * Math.cos(this.yaw)) * Math.sin(this.pitch) + vec[2] * Math.cos(this.pitch);
      const x = cx + rotatedX * 17, y = cy - rotatedY * 17;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
      c.font = '9px ui-monospace, monospace'; c.textAlign = 'center'; c.fillText(axis, x + rotatedX * 7, y - rotatedY * 7);
    }
    c.restore();
    this.labelBounds.push({ x: w - 88, y: h - 98, w: 78, h: 88, key: 'orientation' });
  }

  skyProject(azimuth, altitude) {
    return this.skyVectorProject(direction(azimuth, altitude));
  }

  skyVectorProject(v) {
    const depth = dot(v, this.forward);
    if (depth <= 0.005) return null;
    return { x: (this.surfaceCenter?.x ?? this.width / 2) + this.focal * dot(v, this.right) / depth, y: (this.surfaceCenter?.y ?? this.height / 2) - this.focal * dot(v, this.up) / depth, depth };
  }

  skyLine(points, { color = this.palette.line, dash = [], alpha = 1, width = 1 } = {}) {
    const c = this.ctx;
    c.beginPath(); let previous = null;
    for (const [az, alt] of points) {
      const point = this.skyProject(az, alt);
      if (!point || Math.abs(point.x) > this.width * 4 || Math.abs(point.y) > this.height * 4) { previous = null; continue; }
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < Math.max(this.width, this.height)) c.lineTo(point.x, point.y);
      else c.moveTo(point.x, point.y);
      previous = point;
    }
    c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = width; c.setLineDash(dash); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  }

  eclipticPoints() {
    if (Array.isArray(this.state.ecliptic)) return this.state.ecliptic.map(v => Array.isArray(v) ? v : [v.azimuth, v.altitude]);
    const time = timeKey(this.state.date);
    const { state } = this;
    const key = `${time}|${state.latitude}|${state.longitude}|${state.height || 0}|${state.refraction || 'none'}`;
    if (this.eclipticCache?.key === key) return this.eclipticCache.points;
    const date = modelDate(this.state.date), rotation = Rotation_ECT_EQD(date);
    const observer = new Observer(finite(state.latitude), finite(state.longitude), finite(state.height));
    const points = Array.from({ length: 181 }, (_, index) => {
      const longitude = index * 2 * RAD;
      const eq = EquatorFromVector(RotateVector(rotation, new Vector(Math.cos(longitude), Math.sin(longitude), 0, date)));
      const point = Horizon(date, observer, eq.ra, eq.dec, state.refraction === 'normal' ? 'normal' : undefined);
      return [point.azimuth, point.altitude];
    });
    this.eclipticCache = { key, points };
    return points;
  }

  drawSurface() {
    const { ctx: c, palette: p, state, width: w, height: h } = this;
    const globe = this.globe || { latitude: finite(state.latitude), longitude: finite(state.longitude), altitudeM: GROUND_HEIGHT_M };
    const basis = globeBasis(globe, this.globeCamera());
    this.forward = basis.forward; this.right = basis.right; this.up = basis.up; this.focal = basis.focal;
    this.surfaceCenter = { x: basis.x, y: basis.y };
    const horizonY = basis.y + this.focal * Math.tan(basis.elevation * RAD);
    const sky = (state.sky || []).map(body => {
      if (!(Number.isFinite(body.distanceAU) && body.distanceAU > 0) || globe.altitudeM === GROUND_HEIGHT_M) return body;
      const distance = body.distanceAU * AU_KM * 1000;
      const vector = direction(body.azimuth, body.altitude).map(value => value * distance);
      vector[2] -= globe.altitudeM - GROUND_HEIGHT_M;
      const norm = length(vector);
      return { ...body, altitude: Math.asin(clamp(vector[2] / norm, -1, 1)) / RAD, azimuth: wrap(Math.atan2(vector[0], vector[1]) / RAD),
        distanceAU: norm / (AU_KM * 1000), angularRadius: Math.asin(clamp(Math.sin(body.angularRadius * RAD) * distance / norm, 0, 1)) / RAD };
    });
    const sun = sky.find(b => b.id === 'Sun');
    const earthOpacity = this.surfaceOpacity('Earth');
    const visualRadiusM = EARTH_RADIUS_M, eyeHeightM = globe.altitudeM;
    const horizonDip = Math.acos(visualRadiusM / (visualRadiusM + eyeHeightM)) / RAD;
    this.groundMask = { opacity: earthOpacity, horizonY, horizonDip, visualRadiusM, eyeHeightM };
    this.globeView = { latitude: globe.latitude, longitude: globe.longitude, altitudeM: eyeHeightM, elevation: basis.elevation, physicalRadiusM: EARTH_RADIUS_M, focal: this.focal };
    c.save();
    this.drawStarField(true);
    if (state.showZodiac) this.drawZodiac(true);
    if (this.fov > 6) {
      for (const alt of [-60, -30, 0, 30, 60]) {
        this.skyLine(Array.from({ length: 181 }, (_, i) => [i * 2, alt]), { alpha: 0.55, dash: alt ? [2, 6] : [] });
      }
      for (let az = 0; az < 360; az += 45) {
        this.skyLine(Array.from({ length: 91 }, (_, i) => [az, i * 2 - 90]), { alpha: 0.32, dash: [2, 6] });
      }
    }
    if (state.showEcliptic !== false) {
      this.skyLine(this.eclipticPoints(), { color: p.signal, alpha: 0.45, dash: [5, 5] });
    }
    const objects = sky.filter(body=>this.moonEnabled(body)).sort((a, b) => (a.id === 'Moon' ? 2 : a.id === 'Sun' ? 1 : 0) - (b.id === 'Moon' ? 2 : b.id === 'Sun' ? 1 : 0));
    this.surfaceDisks = new Map();
    for (const body of objects) {
      const disk = this.angularDisk(body);
      this.surfaceDisks.set(body.id, disk);
      if (disk.polygon.length < 3) continue;
      c.save();c.globalAlpha=this.surfaceOpacity(body.id);this.drawAngularBody(body, sun, disk);c.restore();
      const angularRadius = Math.max(0, finite(body.angularRadius));
      const visible = earthOpacity < 1 || body.altitude + angularRadius >= -horizonDip;
      const point = disk.point || { x: (disk.bounds.left + disk.bounds.right) / 2, y: (disk.bounds.top + disk.bounds.bottom) / 2 };
      const r = Math.max(disk.bounds.right - disk.bounds.left, disk.bounds.bottom - disk.bounds.top) / 2;
      if (visible && body.id === state.selected) this.drawSelection(point.x, point.y, r + 6);
      if (visible) this.hits.push({ id: body.id, x: point.x, y: point.y, radius: Math.max(12, Math.min(r, 24)), polygon: disk.polygon });
      if (visible && state.labels !== false) this.drawLabel(body.name || body.id, point.x, point.y, r, body.id === state.selected);
    }
    c.restore();
    this.flushLabels();
    // The physical reference sphere masks all celestial layers with one horizon.
    this.drawSurfaceGround();
    if (eyeHeightM === GROUND_HEIGHT_M && horizonY >= 0 && horizonY <= h) {
      c.strokeStyle = p.muted; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, horizonY); c.lineTo(w, horizonY); c.stroke();
      for (const [az, label] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
        const point = this.skyProject(az, 0);
        if (!point || point.x < 15 || point.x > w - 15) continue;
        c.beginPath(); c.moveTo(point.x, horizonY - 5); c.lineTo(point.x, horizonY + 5); c.stroke();
        this.drawLabel(label, point.x, horizonY + 10, 0, false, { category: 'cardinal', priority: 95 });
      }
    }
    // A small reticle makes narrow-field aiming tangible without obscuring conjunctions.
    c.strokeStyle = p.muted; c.globalAlpha = 0.5; c.lineWidth = 1;
    for (const sign of [-1, 1]) {
      c.beginPath(); c.moveTo(basis.x + sign * 14, basis.y); c.lineTo(basis.x + sign * 22, basis.y); c.stroke();
      c.beginPath(); c.moveTo(basis.x, basis.y + sign * 14); c.lineTo(basis.x, basis.y + sign * 22); c.stroke();
    }
    c.globalAlpha = 1;
  }

  clipViewport(polygon) {
    for (const [axis, edge, keepGreater] of [['x', 0, true], ['x', this.width, false], ['y', 0, true], ['y', this.height, false]]) {
      const output = [];
      for (let index = 0; index < polygon.length; index++) {
        const a = polygon[index], b = polygon[(index + 1) % polygon.length];
        const insideA = keepGreater ? a[axis] >= edge : a[axis] <= edge, insideB = keepGreater ? b[axis] >= edge : b[axis] <= edge;
        if (insideA) output.push(a);
        if (insideA !== insideB) {
          const t = (edge - a[axis]) / (b[axis] - a[axis]);
          output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      polygon = output;
    }
    return polygon;
  }

  angularDisk(body) {
    const azimuth = finite(body.azimuth), altitude = finite(body.altitude);
    const center = direction(azimuth, altitude), east = direction(azimuth + 90, 0);
    const north = cross(east, center);
    const alpha = clamp(finite(body.angularRadius), 0, 89) * RAD, cosine = Math.cos(alpha), sine = Math.sin(alpha);
    // The limb is a cone of constant angular radius, not a screen-space circle.
    // Project its rays before viewport clipping so off-axis conics and limbs that
    // cross the camera's 90-degree plane retain their correct visible extent.
    const vectorAt = (x, y) => center.map((value, axis) => value * cosine + sine * (east[axis] * x + north[axis] * y));
    const vectors = Array.from({ length: 256 }, (_, index) => vectorAt(Math.cos(index / 256 * TAU), Math.sin(index / 256 * TAU)));
    const limb = this.clipSkyPolygon(vectors, 1e-7), polygon = this.clipViewport(limb);
    const xs = polygon.map(point => point.x), ys = polygon.map(point => point.y);
    return { center, east, north, vectorAt, limb, polygon, point: this.skyVectorProject(center),
      bounds: polygon.length ? { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } : null };
  }

  fillSkyPolygon(polygon, color) {
    if (polygon.length < 3) return;
    const c = this.ctx;
    c.fillStyle = color; c.beginPath(); polygon.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.closePath(); c.fill();
  }

  drawAngularBody(body, sun, disk) {
    this.fillSkyPolygon(disk.polygon, body.id === 'Moon' ? '#252b29' : body.id === 'Sun' ? '#e5ac38' : body.color || this.palette.text);
    if (body.id !== 'Moon' || !sun) return;
    const moonToSun = direction(sun.azimuth, sun.altitude).map((value, axis) => value * finite(sun.distanceAU, 1) - disk.center[axis] * finite(body.distanceAU, .00257));
    const remotePhase = (1 - dot(moonToSun, disk.center) / length(moonToSun)) / 2;
    const illumination = Number.isFinite(body.phaseFraction) ? clamp(body.phaseFraction, 0, 1) : body.illustrative ? clamp(remotePhase, 0, 1) : Illumination('Moon', modelDate(this.state.date)).phase_fraction;
    if (illumination < 0.0001) return;
    const sv = direction(sun.azimuth, sun.altitude);
    let bx = dot(sv, disk.east), by = dot(sv, disk.north), magnitude = Math.hypot(bx, by);
    if (magnitude < 1e-12) { bx = 1; by = 0; magnitude = 1; }
    bx /= magnitude; by /= magnitude;
    // The phase terminator and bright limb share the same projective disk plane.
    // Bright +x points toward the Sun even when its direction is behind the camera.
    const ray = (x, y) => disk.vectorAt(bx * x - by * y, by * x + bx * y);
    const vectors = [];
    for (let index = 0; index <= 128; index++) {
      const angle = -Math.PI / 2 + index / 128 * Math.PI;
      vectors.push(ray(Math.cos(angle), Math.sin(angle)));
    }
    for (let index = 0; index <= 128; index++) {
      const angle = Math.PI / 2 - index / 128 * Math.PI;
      vectors.push(ray((1 - illumination * 2) * Math.cos(angle), Math.sin(angle)));
    }
    disk.illuminated = this.clipViewport(this.clipSkyPolygon(vectors, 1e-7));
    this.fillSkyPolygon(disk.illuminated, '#d1d1c4');
  }

  drawSurfaceGround() {
    const { state, ctx: c, palette: p, groundMask: ground } = this;
    const cosine = ground.visualRadiusM / (ground.visualRadiusM + ground.eyeHeightM);
    const sine = Math.sqrt(1 - cosine * cosine);
    const vectors = Array.from({ length: 361 }, (_, index) => {
      const angle = index / 360 * TAU;
      return [cosine * Math.cos(angle), cosine * Math.sin(angle), -sine];
    });
    // Viewport clipping also covers a complete ground view when the limb is offscreen.
    const polygon = this.clipViewport(this.clipSkyPolygon(vectors, 1e-7));
    ground.polygon = polygon;
    c.save();
    if (polygon.length > 2 && ground.opacity > 0) {
      c.beginPath(); polygon.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.closePath();
      c.fillStyle = p.ground; c.globalAlpha = ground.opacity; c.fill();
    }
    c.globalAlpha = 0.65*ground.opacity; c.strokeStyle = p.muted; c.lineWidth = 1; c.beginPath();
    let previous = null;
    for (const vector of vectors) {
      const point = this.skyVectorProject(vector);
      if (!point || Math.abs(point.x) > this.width * 4 || Math.abs(point.y) > this.height * 4) { previous = null; continue; }
      if (previous) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y);
      previous = point;
    }
    c.stroke();
    if (state.showSurfaceMap !== false || state.showCities !== false) {
      const lat = this.globe?.latitude ?? finite(state.latitude), lon = this.globe?.longitude ?? finite(state.longitude);
      const detail = ground.eyeHeightM > EARTH_RADIUS_M ? 2 : ground.eyeHeightM > 100000 ? .75 : .1;
      const key = `${lat}|${lon}|${ground.visualRadiusM}|${ground.eyeHeightM}|${detail}`;
      if (this.surfaceMapCache?.key !== key || this.surfaceMapCache.land !== state.land || this.surfaceMapCache.cities !== state.cities) {
        this.surfaceMapCache = { key, land: state.land, cities: state.cities, map: buildSurfaceMap({ latitude: lat, longitude: lon, land: state.land, cities: state.cities, visualRadiusM: ground.visualRadiusM, eyeHeightM: ground.eyeHeightM, maxStepDegrees: detail }) };
      }
      this.surfaceMap = this.surfaceMapCache.map;
      const relative = position => [position[0], position[1], position[2] - ground.eyeHeightM];
      if (state.showSurfaceMap !== false) {
        c.strokeStyle = p.muted; c.globalAlpha = 0.8*ground.opacity; c.lineWidth = 0.9; c.beginPath();
        for (const segment of this.surfaceMap.segments) {
          let [a, b] = segment.map(relative), da = dot(a, this.forward), db = dot(b, this.forward);
          const near = 0.01;
          if (da < near && db < near) continue;
          if (da < near || db < near) {
            const t = (near - da) / (db - da), at = a.map((value, axis) => value + (b[axis] - value) * t);
            if (da < near) a = at; else b = at;
          }
          const first = this.skyVectorProject(a), last = this.skyVectorProject(b);
          const clipped = first && last ? clipScreenSegment(first, last, this.width, this.height) : null;
          if (clipped) { c.moveTo(clipped[0].x, clipped[0].y); c.lineTo(clipped[1].x, clipped[1].y); }
        }
        c.stroke();
      }
      if (state.showCities !== false) {
        c.globalAlpha = ground.opacity; c.fillStyle = p.text;
        for (const city of this.surfaceMap.cities) {
          if (ground.eyeHeightM > EARTH_RADIUS_M && finite(city.labelRank, 10) > 2) continue;
          const point = this.skyVectorProject(relative(city.position));
          if (!point || point.x < 8 || point.x > this.width - 8 || point.y < 8 || point.y > this.height - 8) continue;
          c.beginPath(); c.arc(point.x, point.y, 1.8, 0, TAU); c.fill();
          if (state.labels !== false) this.drawLabel(city.name, point.x, point.y, 2, false, { category: 'city', priority: 60 - finite(city.labelRank), size: 11,opacity:ground.opacity });
        }
      }
    }
    c.restore();
  }

  drawMoon(moon, sun, point, radius) {
    const c = this.ctx;
    c.save();c.globalAlpha=this.surfaceOpacity('Moon');
    // The unlit disk is opaque, so a projected new Moon correctly covers the Sun.
    c.fillStyle = '#252b29'; c.beginPath(); c.arc(point.x, point.y, radius, 0, TAU); c.fill();
    if (!sun) {c.restore();return;}
    const illumination = Number.isFinite(moon.phaseFraction) ? clamp(moon.phaseFraction, 0, 1) : Illumination('Moon', modelDate(this.state.date)).phase_fraction;
    if (illumination < 0.0001) {c.restore();return;}
    // Project the Sun direction onto the Moon's tangent plane. This remains defined
    // when the Sun is behind the camera and cannot itself be projected onto the image.
    const sv = direction(sun.azimuth, sun.altitude), mv = direction(moon.azimuth, moon.altitude);
    const md = dot(mv, this.forward), sd = dot(sv, this.forward);
    const brightAngle = Math.atan2(-(dot(sv, this.up) * md - dot(mv, this.up) * sd), dot(sv, this.right) * md - dot(mv, this.right) * sd);
    c.save(); c.translate(point.x, point.y); c.rotate(brightAngle);
    c.beginPath(); c.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
    // Follow the projected terminator back from the lower to the upper limb.
    for (let i = 0; i <= 64; i++) {
      const t = Math.PI / 2 - i / 64 * Math.PI;
      c.lineTo(Math.cos(t) * radius * (1 - illumination * 2), Math.sin(t) * radius);
    }
    c.closePath(); c.fillStyle = '#d1d1c4'; c.fill(); c.restore();c.restore();
  }

  pointerDown(event) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    this.cancelNavigation();
    this.cancelZoomAnimation();
    this.canvas.focus({ preventScroll: true });
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pan: !!event.shiftKey, orbit: !!event.altKey });
    if (this.pointers.size === 1) this.dragDistance = 0;
    else this.dragDistance=Math.max(6,this.dragDistance);
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  pointerMove(event) {
    if(this.inputDocument?.querySelector?.('dialog[open]')) {this.stopMovement();return;}
    if(this.state?.unifiedFlight && this.inputDocument?.pointerLockElement===this.canvas) { this.markInteraction();const dx=finite(event.movementX),dy=finite(event.movementY); if(event.altKey)this.orbitBy(dx,dy);else if(event.shiftKey)this.panBy(dx,dy);else this.changeDirection(dx,dy); return; }
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      const point = this.localPoint(event);
      const hover=this.hitAt(point)?.id??null;this.hoverPoint=point;this.updateAstrologyPick(point);
      this.canvas.style.cursor = hover ? 'pointer' : 'grab';
      if(this.state?.unifiedFlight&&hover!==this.hoveredBody){this.hoveredBody=hover;this.redraw();}
      return;
    }
    const current = { x: event.clientX, y: event.clientY, pan: !!event.shiftKey, orbit: !!event.altKey };
    const dx = current.x - previous.x, dy = current.y - previous.y;
    this.dragDistance += Math.hypot(dx, dy);
    if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
        const newDistance = Math.hypot(current.x - other.x, current.y - other.y);
        // The midpoint translates while the span controls travel. Each pointer
        // contributes half the midpoint change, including simultaneous pans.
        if(dx||dy)this.panBy(dx/2,dy/2);
        if (newDistance > 2 && oldDistance > 2) this.changeZoom(oldDistance / newDistance, false, { x: (current.x + other.x) / 2 - this.canvas.getBoundingClientRect().left, y: (current.y + other.y) / 2 - this.canvas.getBoundingClientRect().top });
      }
    } else if (current.orbit && this.state?.unifiedFlight) this.orbitBy(dx,dy);
    else if (current.pan) this.panBy(dx, dy);
    else this.changeDirection(dx, dy);
    this.pointers.set(event.pointerId, current);
  }

  pointerUp(event,{cancelled=false}={}) {
    const wasTracked = this.pointers.has(event.pointerId);
    if(!wasTracked)return;
    this.pointers.delete(event.pointerId);
    if(cancelled)this.dragDistance=Math.max(6,this.dragDistance);
    if(!this.pointers.size)this.endInteraction();
    this.canvas.style.cursor = this.pointers.size?'grabbing':'grab';
    if (!cancelled && this.dragDistance < 6) {
      const point=this.localPoint(event),hit=this.hitAt(point,{selectedFirst:true});
      if(hit){this.onSelect(hit.id);return;}
      const astro=this.updateAstrologyPick(point,true);if(astro)this.redraw();
    }
  }

  cancelPointerInput() {
    const ids=[...this.pointers.keys()];this.pointers.clear();this.dragDistance=10;
    this.canvas.style.cursor='grab';
    for(const id of ids)if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture?.(id);
  }

  localPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  hitAt(point,{selectedFirst=false}={}) {
    // A repeated click on the selected disk reaches its deselection handler;
    // other picking follows foreground paint order during overlaps.
    const hits=[...this.hits].reverse();if(selectedFirst&&this.state?.selected){const index=hits.findIndex(hit=>hit.id===this.state.selected);if(index>0)hits.unshift(...hits.splice(index,1));}
    return hits.find(hit => {
      if(hit.contains)return hit.contains(point);
      if (Math.hypot(point.x - hit.x, point.y - hit.y) <= hit.radius) return true;
      let inside = false;
      const polygon = hit.polygon || [];
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    });
  }

  changeDirection(dx, dy) {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) { Flight.turnFlight(this.flight,-dx*this.fov*RAD/Math.max(200,this.height),dy*this.fov*RAD/Math.max(200,this.height),this.flight.tether?Flight.bodyFrame(this.flight.tether.bodyId,this.state.date):null); this.syncTether(); this.notify({manualAim:true},{drawPending:true}); this.redraw(); return; }
    this.cancelZoomAnimation();
    if (this.globe && this.state?.mode === 'space') {
      const center = { x: this.width / 2, y: this.height / 2 }, picked = globeLocationAt(center, this.globe, this.globeCamera());
      if (picked) {
        const anchored = anchorGlobe(picked, { x: center.x + dx, y: center.y + dy }, this.globe, this.globeCamera());
        this.globe = anchored.globe; this.pan = anchored.pan;
        const observer = { latitude: this.globe.latitude, longitude: this.globe.longitude };
        this.state = { ...this.state, ...observer };
        this.notify({ observer, manualAim: true },{drawPending:true}); this.redraw(); return;
      }
    }
    if (this.state?.mode === 'surface') {
      const sensitivity = this.fov / Math.max(200, this.height || 540);
      this.azimuth = wrap(this.azimuth - dx * sensitivity / Math.max(0.15, Math.cos(this.elevation * RAD)));
      this.elevation = clamp(this.elevation + dy * sensitivity, -89.9999, 89.9999);
    } else {
      this.yaw += dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.004, -1.48, 1.48);
    }
    this.notify({ manualAim: true },{drawPending:true}); this.redraw();
  }

  globeCamera() {
    return { azimuth: this.azimuth, elevation: this.elevation, fov: this.fov, width: this.width || 800, height: this.height || 540, pan: this.pan };
  }

  earthEntry() {
    const focal = (this.height || 540) / (2 * Math.tan(this.fov * RAD / 2));
    const radius = this.state?.markerMode === 'physical' ? 7 : 7 * clamp(finite(this.state?.markerSize, 1), .25, 4);
    const unit = Math.min(this.width || 800, this.height || 540) * .42 / 30;
    const multiplier = this.state?.markerMode === 'physical' ? clamp(finite(this.state.bodyScale, 1), 1, MAX_BODY_SCALE) : 1;
    return { altitudeM: Math.min(1e12, altitudeForLimb(radius, focal)), zoom: radius / (EARTH_RADIUS_M / (AU_KM * 1000) * unit * multiplier), focal, radius };
  }

  changeZoom(factor, fromAnimation = false, at = null) {
    this.cancelNavigation();
    if (this.state?.unifiedFlight) {
      if (!(factor>0 && Number.isFinite(factor))) return;
      if(this.flight.tether?.bodyId==='ISS')return;
      if (this.flight.tether&&this.flight.tether.controlMode!=='free') { this.flight.tether.altitudeM=clamp(this.flight.tether.altitudeM*factor,Flight.FLIGHT_MIN_ALTITUDE_M,Flight.FLIGHT_MAX_ALTITUDE_M); this.syncTether(); }
      else {
        const start=[...this.flight.position],distance=this.flightDistance(),basis=Flight.lookBasis(this.flight.forward,this.flight.up),focal=(this.height||540)/(2*Math.tan(this.fov*RAD/2));
        const x=at&&Number.isFinite(at.x)?(at.x-(this.width||800)/2)/focal:0,y=at&&Number.isFinite(at.y)?((this.height||540)/2-at.y)/focal:0;
        const ray=Flight.unit(Flight.add(basis.forward,Flight.add(Flight.scale(basis.right,x),Flight.scale(basis.up,y))));
        this.flight.position=Flight.add(start,Flight.scale(ray,clamp(distance*(1-factor),-1e16,1e16)));this.constrainFlight(start);this.retainSpinPosition();
      }
      this.notify({},{drawPending:true}); this.redraw(); return;
    }
    if (!(Number.isFinite(factor) && factor > 0) || !this.state) return;
    if (!fromAnimation) this.cancelZoomAnimation();
    const cursor = at && Number.isFinite(at.x) && Number.isFinite(at.y) ? at : { x: this.width / 2, y: this.height / 2 };
    const previousMode = this.state.mode;
    let observer;
    if (this.globe || previousMode === 'surface') {
      if (!this.globe) this.globe = { latitude: finite(this.state.latitude), longitude: finite(this.state.longitude), altitudeM: GROUND_HEIGHT_M };
      const old = { ...this.globe }, picked = globeLocationAt(cursor, old, this.globeCamera());
      const desiredAltitude = old.altitudeM * factor;
      this.globe.altitudeM = stepAltitude(old.altitudeM, factor);
      if (picked && at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
        const anchored = anchorGlobe(picked, cursor, this.globe, this.globeCamera());
        this.globe = anchored.globe; this.pan = anchored.pan;
      }
      const entry = this.earthEntry();
      this.zoom = clamp(entry.zoom * entry.altitudeM / this.globe.altitudeM, 1e-10, 1e8);
      if (old.latitude !== this.globe.latitude || old.longitude !== this.globe.longitude) observer = { latitude: this.globe.latitude, longitude: this.globe.longitude };
      if (desiredAltitude >= entry.altitudeM && factor > 1) {
        this.globe = null;
        this.zoom = clamp(entry.zoom * entry.altitudeM / desiredAltitude, 1e-10, 1e8);
      }
    } else {
      // Retarget the actual Earth under the cursor while preserving its screen point.
      const nearestHit = () => this.hits.filter(hit => Math.hypot(cursor.x - hit.x, cursor.y - hit.y) <= hit.radius)
        .sort((a, b) => Math.hypot(cursor.x - a.x, cursor.y - a.y) - Math.hypot(cursor.x - b.x, cursor.y - b.y))[0];
      const hit = factor < 1 ? nearestHit() : null;
      if (hit?.id === 'Earth' && this.state.selected !== 'Earth') {
        this.pan = { x: hit.x - this.width / 2, y: hit.y - this.height / 2 };
        this.state = { ...this.state, selected: 'Earth' };
        this.notify({ selected: 'Earth' });
      }
      const beforeZoom = this.zoom, beforeFactor = this.solarDistanceFactor();
      const anchor = nearestHit(), anchoredBody = anchor && (anchor.id === 'Sagittarius A*' || this.bodies().some(body => body.id === anchor.id)) ? anchor.id : null;
      const anchorBody = this.bodies().find(body => body.id === anchoredBody);
      const oldPoint = anchoredBody ? anchorBody ? this.projectSpaceBody(anchorBody) : this.worldProject(this.spacePosition(anchoredBody)) : null;
      const desiredZoom = this.zoom / factor;
      this.zoom = clamp(desiredZoom, 1e-10, this.state.mode === 'galactic' ? 1e10 : 1e8);
      const ratio = this.zoom * this.solarDistanceFactor() / (beforeZoom * beforeFactor);
      this.pan.x = cursor.x - this.width / 2 - (cursor.x - this.width / 2 - this.pan.x) * ratio;
      this.pan.y = cursor.y - this.height / 2 - (cursor.y - this.height / 2 - this.pan.y) * ratio;
      if (oldPoint && this.state.mode === 'space') {
        this.updateSpaceProjection();
        const nextPoint = anchorBody ? this.projectSpaceBody(anchorBody) : this.worldProject(this.spacePosition(anchoredBody));
        this.pan.x += oldPoint.x - nextPoint.x; this.pan.y += oldPoint.y - nextPoint.y;
      }
      const entry = this.earthEntry();
      if (this.state.mode === 'space' && this.state.selected === 'Earth' && this.zoom >= entry.zoom && factor < 1) {
        this.globe = { latitude: finite(this.state.latitude), longitude: finite(this.state.longitude), altitudeM: stepAltitude(entry.altitudeM, entry.zoom / desiredZoom) };
        if (!this.trackedBody()) this.elevation = -10;
      }
    }
    const mode = this.globe?.altitudeM <= GROUND_HEIGHT_M ? 'surface' : 'space';
    const navigationMode = ['space', 'surface'].includes(previousMode) ? mode : previousMode;
    const selected = navigationMode === 'space' && (this.globe || previousMode === 'surface') ? 'Earth' : this.state.selected;
    this.state = { ...this.state, ...(observer || {}), mode: navigationMode, selected, fov: this.fov };
    if (navigationMode !== 'surface') this.stopMovement();
    this.syncSurfaceAim();
    this.notify({ ...(navigationMode !== previousMode ? { mode: navigationMode, selected } : {}), ...(observer ? { observer } : {}) },{drawPending:true});
    this.redraw();
  }

  cancelZoomAnimation() {
    if (this.zoomFrame !== null) globalThis.cancelAnimationFrame?.(this.zoomFrame);
    this.zoomFrame = null; this.zoomAnimation = null;
  }

  navigationLevel() {
    const entry = this.earthEntry();
    return this.globe ? Math.log(entry.zoom) + Math.log(entry.altitudeM / this.globe.altitudeM) : Math.log(this.zoom);
  }

  animateNavigation(target, { animate = true } = {}) {
    this.cancelZoomAnimation();
    const start = this.navigationLevel();
    if (!animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || typeof globalThis.requestAnimationFrame !== 'function') {
      this.changeZoom(Math.exp(start - target)); return;
    }
    const animation = { start: null, from: start, target, previous: start };
    this.zoomAnimation = animation;
    const step = now => {
      this.zoomFrame = null;
      if (this.disposed || this.zoomAnimation !== animation) return;
      if (animation.start === null) animation.start = now;
      const progress = clamp((now - animation.start) / 600, 0, 1), eased = progress * progress * (3 - 2 * progress);
      const level = animation.from + (target - animation.from) * eased;
      this.changeZoom(Math.exp(animation.previous - level), true);
      animation.previous = level;
      if (progress < 1 && this.zoomAnimation === animation) this.zoomFrame = globalThis.requestAnimationFrame(step);
      else {this.zoomAnimation = null;this.redraw();}
    };
    this.zoomFrame = globalThis.requestAnimationFrame(step);
  }

  enterGlobe({ altitudeM = 2 * EARTH_RADIUS_M, animate = true } = {}) {
    if (!this.state || this.disposed) return false;
    this.cancelZoomAnimation(); this.stopMovement();
    if (this.state.selected !== 'Earth' || !this.globe) this.pan = { x: 0, y: 0 };
    this.state = { ...this.state, selected: 'Earth' };
    this.notify({ selected: 'Earth' });
    if (!this.trackedBody() && !this.globe) this.elevation = -10;
    const entry = this.earthEntry(), altitude = clamp(altitudeM, GROUND_HEIGHT_M, entry.altitudeM);
    this.animateNavigation(Math.log(entry.zoom) + Math.log(entry.altitudeM / altitude), { animate });
    return true;
  }

  fitEarth(options = {}) {
    if (this.state?.unifiedFlight) return this.flyTo('Earth',options);
    const radius = Math.min(this.width || 800, this.height || 540) * .32;
    const focal = (this.height || 540) / (2 * Math.tan(this.fov * RAD / 2));
    return this.enterGlobe({ altitudeM: altitudeForLimb(radius, focal), ...options });
  }
  enterSurface(options = {}) { if(this.state?.unifiedFlight) return this.flyTo('Earth',{surface:true,...options}); return this.enterGlobe({ altitudeM: GROUND_HEIGHT_M, ...options }); }
  leaveSurface(options = {}) {
    if(this.state?.unifiedFlight) return this.releaseSurface();
    if (!this.state || this.disposed || !this.globe && !this.zoomAnimation) return false;
    this.stopMovement(); this.animateNavigation(0, options); return true;
  }

  startMovement() {
    if (this.moveFrame !== null || typeof globalThis.requestAnimationFrame !== 'function') return;
    const step = time => {
      this.moveFrame = null;
      if (this.disposed || (!this.state?.unifiedFlight && this.state?.mode !== 'surface') || !this.heldKeys.size) { this.stopMovement(); return; }
      const seconds = this.moveLast === null ? 0 : clamp((time - this.moveLast) / 1000, 0, 0.05);
      this.moveLast = time;
      let forward = Number(this.heldKeys.has('w')) - Number(this.heldKeys.has('s'));
      let right = Number(this.heldKeys.has('d')) - Number(this.heldKeys.has('a'));
      const vertical = Number(this.heldKeys.has('e')) - Number(this.heldKeys.has('q'));
      if (this.state?.unifiedFlight) {
        const yaw=this.yawControl(),roll=Number(this.heldKeys.has('arrowright'))-Number(this.heldKeys.has('arrowleft')),pitch=Number(this.heldKeys.has('arrowup'))-Number(this.heldKeys.has('arrowdown')),moving=forward||right||vertical;
        if(!moving)this.lastFlightSpeedMps=0;
        if(seconds&&yaw)this.yawFlight(yaw*seconds*YAW_RATE,{notify:!moving&&!roll&&!pitch});
        if(seconds&&(roll||pitch))this.rotateFlight({roll:roll*seconds*.9,pitch:pitch*seconds*.9},{notify:!moving});
        if(seconds&&moving)this.moveFlight({forward,right,up:vertical,seconds,slow:this.slowMovement});
        if(this.heldKeys.size)this.moveFrame=globalThis.requestAnimationFrame(step);return;
      }
      const magnitude = Math.hypot(forward, right);
      if (magnitude && seconds) this.onMove({ forward: forward / magnitude, right: right / magnitude, seconds, slow: this.slowMovement, heading: wrap(this.azimuth) });
      if (!this.disposed && this.state?.mode === 'surface' && this.heldKeys.size) this.moveFrame = globalThis.requestAnimationFrame(step);
    };
    this.moveFrame = globalThis.requestAnimationFrame(step);
  }

  stopMovement() {
    if (this.moveFrame !== null) globalThis.cancelAnimationFrame?.(this.moveFrame);
    this.moveFrame = null; this.moveLast = null; this.movementInputs.clear();this.heldKeys.clear(); this.lastFlightSpeedMps=0;
  }

  setMovementInput(source,key,active) {
    const wasHeld=this.heldKeys.has(key);let keys=this.movementInputs.get(source);
    if(active){if(!keys){keys=new Set();this.movementInputs.set(source,keys);}keys.add(key);this.heldKeys.add(key);}
    else {
      keys?.delete(key);if(keys&&!keys.size)this.movementInputs.delete(source);
      // Keyboard release and touch release each retain the other's input.
      // An unowned held key can still be released by legacy callers/tests.
      if(![...this.movementInputs.values()].some(values=>values.has(key)))this.heldKeys.delete(key);
    }
    return wasHeld!==this.heldKeys.has(key);
  }

  keyDown(event) {
    if(this.inputDocument?.querySelector?.('dialog[open]')) {this.stopMovement();return;}
    const arrows = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    const key = movementKey(event);
    this.slowMovement = !!event.shiftKey;
    if(this.state?.unifiedFlight) {
      if(event.ctrlKey||event.metaKey)return;
      if(['w','a','s','d','q','e','arrowleft','arrowright','arrowup','arrowdown',',','.'].includes(key)) {
        this.cancelNavigation();
        event.preventDefault();event.stopPropagation?.();
        if(!this.heldKeys.has(key)&&key.startsWith('arrow'))this.rotateFlight({roll:key==='arrowright'?.04:key==='arrowleft'?-.04:0,pitch:key==='arrowup'?.04:key==='arrowdown'?-.04:0});
        this.setMovementInput('keyboard',key,true);this.startMovement();if(key===','||key==='.'){this.notify({},{drawPending:true});this.redraw();}
      }
      return;
    }
    if (this.state?.mode === 'surface' && ['w','a','s','d'].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopPropagation?.();
      this.setMovementInput('keyboard',key,true); this.startMovement();
    }
    else if (arrows[event.key]) { event.preventDefault(); if (event.shiftKey) this.panBy(...arrows[event.key]); else this.changeDirection(...arrows[event.key]); }
    else if (key === 'c' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); this.recenter(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); this.changeZoom(0.86); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); this.changeZoom(1.16); }
    else if (event.key === 'Home') { event.preventDefault(); this.reset(); }
  }

  renderFlight(state,{paint=true}={}) {
    const previous=this.state;
    if(this.navigationAnimation&&(state.animateNavigation===false&&previous?.animateNavigation!==false||Number.isFinite(state.fov)&&state.fov!==this.fov||state.selected!==this.navigationAnimation.id))this.cancelNavigation();
    if(!this.flight) this.flight=Flight.restoreFlight(state.flight)||Flight.createFlight();
    if(previous?.unifiedFlight && !this.flight.tether) {
      if(this.flight.followBody) {
        const positionAt=(id,view)=>{
          if(id==='Sagittarius A*')return galacticCenterAt(view.date,finite(view.galacticYears));
          const rows=Array.isArray(view.bodies)?view.bodies:Object.values(view.bodies||{}),body=rows.find(row=>row.id===id);
          return body?.position?eclipticToGalactic(body.position):null;
        };
        const next=positionAt(this.flight.followBody,state),prior=positionAt(this.flight.followBody,previous);if(next&&prior)this.flight.position=Flight.add(this.flight.position,Flight.sub(next,prior));else if(!next)this.flight.followBody=null;
      }else {
        if(timeKey(previous.date)!==timeKey(state.date))this.flight.position=Flight.sub(this.flight.position,solarDisplacementBetween(state.date,previous.date,finite(state.galacticYears)));
        if(finite(previous.galacticYears)!==finite(state.galacticYears)) { const before=galacticCenterAt(state.date,finite(previous.galacticYears)),after=galacticCenterAt(state.date,finite(state.galacticYears)); this.flight.position=Flight.add(this.flight.position,Flight.sub(after,before)); }
      }
    }
    this.flight.position=this.flight.position.map(value=>clamp(value,-Flight.FLIGHT_MAX_POSITION_AU,Flight.FLIGHT_MAX_POSITION_AU));
    this.state={...state,mode:'space'};this.globe=null;
    if(Number.isFinite(state.fov) && state.fov!==this.lastInputFov) { this.fov=clamp(state.fov,.12,MAX_FOV);this.lastInputFov=state.fov; }
    if(this.flight.tether?.bodyId==='Earth' && previous && (state.latitude!==previous.latitude||state.longitude!==previous.longitude)) {
      this.flight.tether.latitude=clamp(finite(state.latitude),-90,90);this.flight.tether.longitude=finite(state.longitude);
    }
    this.syncTether();
    // Modular normalization in the app can move an echoed heading by one ULP.
    // That is not a camera command and must never reset a released camera's roll.
    if(Number.isFinite(state.heading)&&!sameHeading(state.heading,this.lastInputHeading)&&(!previous||!sameHeading(state.heading,previous.heading))) { if(previous?.unifiedFlight||this.flight.tether)this.setHeading(state.heading); else this.lastInputHeading=state.heading; }
    const tracked=this.trackedBody(state);if(tracked)this.aimFlight(tracked);
    if(paint)this.redraw();
  }

  flightCamera() {
    const t=this.flight.tether,basis=Flight.lookBasis(this.flight.forward,this.flight.up);
    const heading=t?.heading??wrap(Math.atan2(basis.forward[0],basis.forward[1])/RAD);
    const elevation=t?.elevation??Math.asin(clamp(basis.forward[2],-1,1))/RAD;
    return {heading,azimuth:heading,elevation,yaw:heading*RAD,pitch:elevation*RAD,zoom:1,pan:{x:0,y:0},globe:null,effectiveSolarScale:1,curvature:1,flight:Flight.serializeFlight(this.flight),
      ...(t?{observer:{latitude:t.latitude,longitude:t.longitude,altitudeM:t.altitudeM,bodyId:t.bodyId}}:{})};
  }

  restoreFlight(data) {
    const flight=Flight.restoreFlight(data);if(!flight)return false;
    this.cancelNavigation();
    this.flight=flight;if(this.state?.unifiedFlight) {
      if(flight.tether){
        const center=this.spacePosition(flight.tether.bodyId),expected=Flight.restoreFlight(Flight.serializeFlight(flight));Flight.updateTether(expected,center,Flight.bodyFrame(flight.tether.bodyId,this.state.date));
        const tolerance=Math.max(.001/Flight.AU_M,Math.max(Flight.norm(center),Flight.norm(flight.position))*Number.EPSILON*16);
        const consistent=Flight.norm(Flight.sub(flight.position,expected.position))<=tolerance&&Flight.norm(Flight.sub(flight.forward,expected.forward))<=1e-10&&Flight.norm(Flight.sub(flight.up,expected.up))<=1e-10;
        // A current-epoch body-frame serialization is redundant by design.
        // Preserve its already-valid camera vectors, including their exact bits.
        if(consistent)this.retainTetherPose();else this.syncTether();
      }
      this.notify({},{drawPending:true});this.redraw();
    }return true;
  }

  restoreLegacyCamera(camera={},state={}) {
    if(!this.state?.unifiedFlight)return false;
    const oldGlobe=camera.globe;
    if(oldGlobe||state.mode==='surface') {
      const t={bodyId:'Earth',controlMode:'surface',latitude:finite(oldGlobe?.latitude,finite(state.latitude)),longitude:finite(oldGlobe?.longitude,finite(state.longitude)),altitudeM:Math.max(2,finite(oldGlobe?.altitudeM,30)),heading:finite(camera.azimuth,finite(state.heading,180)),elevation:finite(camera.elevation,0),roll:0};
      this.flight=Flight.createFlight();this.flight.followBody='Earth';this.flight.tether=t;this.syncTether();
      if(state.mode!=='surface'&&t.altitudeM>30){this.flight.tether=null;this.flight.followBody='Earth';}
      this.notify({},{drawPending:true});this.redraw();return true;
    }
    return this.flyTo(state.selected||'Sun');
  }

  elapsedFlightTrails() {
    const state=this.state,years=clamp(finite(state.trailYears,2),.25,100000),distance=this.flightDistance();
    const cell=Math.max(.05,distance*.15),positionKey=this.flight.position.map(v=>Math.round(v/cell)).join('|');
    const dateKey=timeKey(state.date),key=`${dateKey}|${getPositionProviderRevision()}|${years}|${positionKey}|${Math.round(Math.log10(cell)*10)}|${finite(state.galacticYears)}`;
    if(this.elapsedTrailCache?.key!==key) this.elapsedTrailCache={key,data:getElapsedTrails(state.date,years,{cameraPosition:this.flight.position,focalPixels:this.focal,maxPoints:384,galacticYearsOffset:finite(state.galacticYears)})};
    return this.elapsedTrailCache.data;
  }

  syncTether() {
    if(!this.flight?.tether||!this.state)return;
    const key=this.tetherPoseKey();
    if(this.tetherSyncedFlight===this.flight&&this.tetherSyncKey===key)return;
    Flight.updateTether(this.flight,this.spacePosition(this.flight.tether.bodyId),Flight.bodyFrame(this.flight.tether.bodyId,this.state.date));
    this.tetherSyncedFlight=this.flight;this.tetherSyncKey=key;
  }

  tetherPoseKey() {
    const t=this.flight?.tether;
    return t?`${timeKey(this.state.date)}|${JSON.stringify(t)}|${this.spacePosition(t.bodyId).join('|')}`:null;
  }

  retainTetherPose() {
    this.tetherSyncedFlight=this.flight;this.tetherSyncKey=this.tetherPoseKey();
  }

  setObserver({latitude,longitude,altitudeM}={}) {
    this.cancelNavigation();
    const t=this.flight?.tether;if(!t)return false;
    if(Number.isFinite(latitude))t.latitude=clamp(latitude,-90,90);
    if(Number.isFinite(longitude))t.longitude=longitude>=-180&&longitude<=180?longitude:((longitude+180)%360+360)%360-180;
    if(Number.isFinite(altitudeM))t.altitudeM=clamp(altitudeM,Flight.FLIGHT_MIN_ALTITUDE_M,Flight.FLIGHT_MAX_ALTITUDE_M);
    this.syncTether();this.notify({},{drawPending:true});this.redraw();return true;
  }

  cancelNavigation() {
    if(this.navigationFrame!==null)globalThis.cancelAnimationFrame?.(this.navigationFrame);
    const active=!!this.navigationAnimation;this.navigationAnimation=null;this.navigationFrame=null;return active;
  }

  navigationReference() {
    const id=this.flight.tether?.bodyId??this.flight.followBody??this.resolveLockTarget(),frame=id==='Sagittarius A*'?{x:[1,0,0],y:[0,1,0],z:[0,0,1]}:Flight.bodyFrame(id,this.state.date),radius=id==='Sagittarius A*'?1000:Flight.bodyRadiusAU(id);
    return {bodyId:id,position:Flight.scale(Flight.toBody(Flight.sub(this.flight.position,this.spacePosition(id)),frame),1/radius),forward:Flight.toBody(this.flight.forward,frame),up:Flight.toBody(this.flight.up,frame),heading:this.flightCamera().heading,tether:this.flight.tether?{...this.flight.tether}:null};
  }

  navigationTarget(id,preset,reference,surfaceLocation,altitudeM) {
    const center=this.spacePosition(id),radius=id==='Sagittarius A*'?1000:Flight.bodyRadiusAU(id),frame=id==='Sagittarius A*'?{x:[1,0,0],y:[0,1,0],z:[0,0,1]}:Flight.bodyFrame(id,this.state.date);
    const target={...Flight.createFlight(),tether:null,followBody:id,speedAU:this.flight.speedAU};
    if(id==='ISS'&&(preset==='surface'||preset==='pin'||preset==='relative'&&reference.tether)) {
      Flight.attachTether(target,id,center,frame,{latitude:0,longitude:0,altitudeM:2});target.tether.controlMode='surface';if(preset==='pin'){target.tether.heading=reference.tether.heading;Flight.updateTether(target,center,frame);}return target;
    }
    if(preset==='pin'){target.tether={...reference.tether,bodyId:id,controlMode:'surface',altitudeM:2,elevation:0,roll:0};Flight.updateTether(target,center,frame);return target;}
    if(preset==='surface'||preset==='relative'&&reference.tether&&this.canPin(id)) {
      const t=preset==='surface'?{bodyId:id,controlMode:'free',...surfaceLocation,altitudeM:clamp(finite(altitudeM,2),2,Flight.FLIGHT_MAX_ALTITUDE_M),heading:reference.tether?.heading??reference.heading,elevation:0,roll:0}:{...reference.tether,bodyId:id,altitudeM:clamp((Flight.norm(reference.position)-1)*radius*Flight.AU_M,2,Flight.FLIGHT_MAX_ALTITUDE_M)};
      target.tether=t;Flight.updateTether(target,center,frame);return target;
    }
    if(preset==='relative') {
      const range=Math.max(Flight.norm(reference.position)*radius,radius+2/Flight.AU_M);
      target.position=Flight.add(center,Flight.scale(Flight.unit(Flight.fromBody(reference.position,frame)),range));
      Object.assign(target,Flight.lookBasis(Flight.fromBody(reference.forward,frame),Flight.fromBody(reference.up,frame)));
    }else if(preset==='solar'&&id!=='Sagittarius A*') {
      const normal=eclipticToGalactic([0,0,1]),midpoint=Flight.scale(center,.5),range=Math.max(radius*4,Flight.norm(center)*.75/Math.tan(this.fov*RAD/2),id==='Sun'?40:0);
      target.position=Flight.add(midpoint,Flight.scale(normal,range));Object.assign(target,Flight.lookBasis(Flight.scale(normal,-1),Flight.norm(center)>1e-8?center:eclipticToGalactic([0,1,0])));
    }else {
      const range=Number.isFinite(altitudeM)?radius+clamp(altitudeM,2,Flight.FLIGHT_MAX_ALTITUDE_M)/Flight.AU_M:radius/Math.sin(Math.max(.0001,this.fov*.28*RAD));
      const bearing=Flight.unit(Flight.fromBody([.55,-1,.35],frame));target.position=Flight.add(center,Flight.scale(bearing,range));Object.assign(target,Flight.lookBasis(Flight.scale(bearing,-1),frame.z));
    }
    target.position=target.position.map(v=>clamp(v,-Flight.FLIGHT_MAX_POSITION_AU,Flight.FLIGHT_MAX_POSITION_AU));return target;
  }

  jumpToBody(id,{preset='relative',animate=this.state?.animateNavigation!==false,altitudeM,latitude,longitude,aimTarget,fov}={}) {
    if(!this.state?.unifiedFlight||!this.flight||!['relative','default','solar','surface','pin'].includes(preset)||id!=='Sagittarius A*'&&!this.bodies().some(body=>body.id===id)||preset==='surface'&&!this.canPin(id)||preset==='pin'&&(!this.canPin(id)||this.flight.tether?.bodyId!==id))return false;
    this.cancelNavigation();this.stopMovement();
    const startFov=this.fov,endFov=Number.isFinite(fov)?clamp(fov,.12,MAX_FOV):this.fov,start=Flight.serializeFlight(this.flight),reference=this.navigationReference(),startDate=this.state.date,startOffset=finite(this.state.galacticYears),startCenter=reference.bodyId?this.spacePosition(reference.bodyId):null;
    const surfaceLocation=Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude:clamp(latitude,-90,90),longitude:clamp(longitude,-180,180)}:id==='Earth'&&Flight.norm(Flight.sub(start.position,this.spacePosition(id)))>Flight.bodyRadiusAU(id)*20?{latitude:finite(this.state.latitude),longitude:finite(this.state.longitude)}:id==='Sagittarius A*'?null:Flight.surfaceLocation(start.position,this.spacePosition(id),Flight.bodyFrame(id,this.state.date),Flight.bodyRadiusAU(id));
    const destination=()=>{
      const target=this.navigationTarget(id,preset,reference,surfaceLocation,altitudeM);
      if(aimTarget&&id==='Earth'&&target.tether){const t=target.tether,h=horizontal(aimTarget,this.state.date,t.latitude,t.longitude,{height:t.altitudeM,refraction:this.state.refraction||'none'});t.heading=h.azimuth;t.elevation=h.altitude;t.roll=0;Flight.updateTether(target,this.spacePosition(id),Flight.bodyFrame(id,this.state.date));}
      return target;
    };
    const finish=()=>{this.flight=destination();this.fov=endFov;this.lastInputFov=endFov;this.cancelNavigation();if(this.flight.tether)this.retainTetherPose();this.state={...this.state,selected:id,trackSun:false,trackBody:null};this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();};
    if(!animate||typeof globalThis.requestAnimationFrame!=='function'){finish();return true;}
    const animation={id,preset,start,reference,startDate,startOffset,startCenter,started:null,duration:800,destination};this.navigationAnimation=animation;
    if(preset!=='pin'){this.flight.tether=null;this.flight.followBody=null;}this.state={...this.state,selected:id,trackSun:false,trackBody:null};this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();
    const step=now=>{
      this.navigationFrame=null;if(this.disposed||this.navigationAnimation!==animation)return;
      if(animation.started===null)animation.started=now;
      const progress=clamp((now-animation.started)/animation.duration,0,1);if(progress>=1){finish();return;}
      const t=progress*progress*(3-2*progress),end=destination();this.fov=startFov*Math.exp(Math.log(endFov/startFov)*t);this.lastInputFov=this.fov;
      let origin;
      if(start.followBody||start.tether)origin=Flight.add(start.position,Flight.sub(this.spacePosition(reference.bodyId),startCenter));
      else {origin=Flight.sub(start.position,solarDisplacementBetween(this.state.date,startDate,finite(this.state.galacticYears)));if(startOffset!==finite(this.state.galacticYears))origin=Flight.add(origin,Flight.sub(galacticCenterAt(startDate,finite(this.state.galacticYears)),galacticCenterAt(startDate,startOffset)));}
      if(preset==='pin'){
        this.flight.tether={...reference.tether,controlMode:'surface',roll:reference.tether.roll+(end.tether.roll-reference.tether.roll)*t,elevation:reference.tether.elevation+(end.tether.elevation-reference.tether.elevation)*t,altitudeM:Math.exp(Math.log(start.tether.altitudeM)*(1-t)+Math.log(end.tether.altitudeM)*t)};this.flight.followBody=id;
        Flight.updateTether(this.flight,this.spacePosition(id),Flight.bodyFrame(id,this.state.date));this.retainTetherPose();
      }else{
      const center=this.spacePosition(id),a=Flight.sub(origin,center),b=Flight.sub(end.position,center),rangeA=Flight.norm(a),rangeB=Flight.norm(b);
      const bearing=Flight.unit(Flight.add(Flight.scale(Flight.unit(a),1-t),Flight.scale(Flight.unit(b),t)),Flight.unit(b));
      this.flight.position=Flight.add(center,Flight.scale(bearing,Math.exp(Math.log(Math.max(1e-16,rangeA))*(1-t)+Math.log(Math.max(1e-16,rangeB))*t)));Object.assign(this.flight,Flight.interpolateBasis(start,end,t));this.constrainFlight();}
      this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();
      if(this.navigationAnimation===animation)this.navigationFrame=globalThis.requestAnimationFrame(step);
    };
    this.navigationFrame=globalThis.requestAnimationFrame(step);return true;
  }

  landAndAim({body='Earth',latitude,longitude,altitudeM=30,target='Sun',fov=1.5,animate=this.state?.animateNavigation!==false}={}) {
    if(body!=='Earth'||!['Sun','Moon'].includes(target))return false;
    return this.jumpToBody(body,{preset:'surface',latitude,longitude,altitudeM,aimTarget:target,fov,animate});
  }

  flyTo(id,options={}) {
    const {surface=false,altitudeM,animate=false}=options;
    if(surface&&!this.canPin(id))return false;
    if(Object.hasOwn(options,'animate'))return this.jumpToBody(id,{preset:surface?'surface':'default',animate,altitudeM});
    this.cancelNavigation();
    if(!this.state?.unifiedFlight)return this.fitBody(id);
    if(id!=='Sagittarius A*'&&!this.bodies().some(body=>body.id===id))return false;
    this.stopMovement();this.flight.tether=null;this.flight.followBody=id;
    const center=this.spacePosition(id);
    if(surface&&id!=='Sagittarius A*') {
      const location={latitude:id==='Earth'?finite(this.state.latitude):0,longitude:id==='Earth'?finite(this.state.longitude):0,altitudeM:clamp(finite(altitudeM,Flight.FLIGHT_MIN_ALTITUDE_M),Flight.FLIGHT_MIN_ALTITUDE_M,Flight.FLIGHT_MAX_ALTITUDE_M)};
      Flight.attachTether(this.flight,id,center,Flight.bodyFrame(id,this.state.date),location);
      if(id==='ISS')this.flight.tether.controlMode='surface';else {this.flight.tether.heading=finite(this.state.heading,180);this.flight.tether.elevation=0;this.flight.tether.roll=0;}this.syncTether();
      if(this.trackedBody())this.aimFlight(this.trackedBody());
    } else {
      const radius=id==='Sagittarius A*'?1000:Flight.bodyRadiusAU(id),range=Number.isFinite(altitudeM)?radius+clamp(altitudeM,2,Flight.FLIGHT_MAX_ALTITUDE_M)/Flight.AU_M:radius/Math.sin(Math.max(.0001,this.fov*.28*RAD));
      const approach=Flight.unit(Flight.sub(this.flight.position,center),[0,-1,.35]);
      this.flight.position=Flight.add(center,Flight.scale(approach,range));this.constrainFlight();this.aimFlight(id);
    }
    this.state={...this.state,selected:id,mode:'space'};this.notify({selected:id,manualAim:!this.trackedBody()},{drawPending:true});this.redraw();return true;
  }

  tetherSurface(id=this.state?.selected) {
    if(!this.canPin(id))return false;
    this.cancelNavigation();
    if(!this.state?.unifiedFlight||!this.bodies().some(b=>b.id===id))return false;
    if(!Flight.attachTether(this.flight,id,this.spacePosition(id),Flight.bodyFrame(id,this.state.date)))return false;
    this.retainTetherPose();
    this.state={...this.state,selected:id,trackSun:false,trackBody:null};this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();return true;
  }

  isPinMode() { return this.flight?.tether?.controlMode==='surface'; }

  togglePinMode({bodyId,force=false,low=false,animate=this.state?.animateNavigation!==false}={}) {
    if(!this.state?.unifiedFlight||!this.flight)return false;
    if(this.isPinMode()&&!force&&!low)return this.setSurfaceControlMode('free');
    const id=bodyId??this.state.selected??this.flight.tether?.bodyId??this.resolveLockTarget({surface:true});
    if(!this.canPin(id))return false;
    this.cancelNavigation();this.stopMovement();this.syncTether();
    if(this.flight.tether?.bodyId!==id&&!Flight.attachTether(this.flight,id,this.spacePosition(id),Flight.bodyFrame(id,this.state.date)))return false;
    Flight.setTetherOrientation(this.flight,this.flight.forward,this.flight.up,Flight.bodyFrame(id,this.state.date),{captureHeading:true});
    this.flight.tether.controlMode='surface';this.retainTetherPose();this.state={...this.state,selected:id,trackSun:false,trackBody:null};
    if(low)return this.jumpToBody(id,{preset:'pin',animate});
    this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();return true;
  }

  pinMovementSpeed(bodyId=this.flight?.tether?.bodyId) {
    return bodyId&&bodyId!=='ISS'?Flight.bodyRadiusAU(bodyId)*Flight.AU_M*.01*clamp(finite(this.state?.pinSpeedMultiplier,10),.01,100):0;
  }

  getCameraInfo() {
    const info=this.getFlightStats();if(!info)return null;
    const pinMode=this.isPinMode(),t=this.flight.tether,pinSpeedMps=t?this.pinMovementSpeed(t.bodyId):0;
    return {...info,mode:pinMode?'pin':info.mode,pinMode,pinSpeedMultiplier:clamp(finite(this.state.pinSpeedMultiplier,10),.01,100),pinSpeedMps,pinAngularSpeedDegS:t?pinSpeedMps/(Flight.bodyRadiusAU(t.bodyId)*Flight.AU_M+t.altitudeM)/RAD:0,orbitBody:this.flight.followBody??null,spinBody:t?.bodyId??null};
  }

  setSurfaceControlMode(mode) {
    if(!['free','surface'].includes(mode)||!this.flight?.tether||!this.canPin(this.flight.tether.bodyId))return false;
    this.cancelNavigation();this.syncTether();if(mode==='surface')Flight.setTetherOrientation(this.flight,this.flight.forward,this.flight.up,Flight.bodyFrame(this.flight.tether.bodyId,this.state.date),{captureHeading:true});this.flight.tether.controlMode=mode;this.retainTetherPose();
    this.state={...this.state,trackSun:false,trackBody:null};this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  retainSpinPosition() {
    const t=this.flight?.tether;if(!t||t.controlMode!=='free')return;
    const frame=Flight.bodyFrame(t.bodyId,this.state.date),center=this.spacePosition(t.bodyId),range=Flight.bodyRadiusAU(t.bodyId)+Flight.FLIGHT_MAX_ALTITUDE_M/Flight.AU_M,offset=Flight.sub(this.flight.position,center);
    if(Flight.norm(offset)>range)this.flight.position=Flight.add(center,Flight.scale(Flight.unit(offset),range));
    Flight.retainBodyPose(this.flight,center,frame);this.retainTetherPose();
  }

  getPointedBody() {
    const point=this.inputDocument?.pointerLockElement===this.canvas?{x:this.width/2,y:this.height/2}:this.hoverPoint;
    return point?this.hitAt(point)?.id??null:null;
  }

  resolveLockTarget({surface=false}={}) {
    const allowed=id=>(surface?this.canPin(id):this.bodies().some(body=>body.id===id))||(!surface&&id==='Sagittarius A*');
    const pointed=this.getPointedBody();if(allowed(pointed))return pointed;
    if(allowed(this.state?.selected))return this.state.selected;
    let nearest=null,distance=Infinity;
    for(const body of this.bodies()) {if(surface&&!this.canPin(body.id))continue;const d=Flight.norm(Flight.sub(this.flight.position,this.spacePosition(body.id)))-Flight.bodyRadiusAU(body.id);if(d<distance){nearest=body.id;distance=d;}}
    return nearest;
  }

  toggleOrbitLock(id) {
    if(!this.flight||!this.state?.unifiedFlight)return false;
    this.cancelNavigation();
    const locked=this.flight.tether?.bodyId??this.flight.followBody;
    if(locked&&(id===undefined||id===locked))return this.releaseAllLocks();
    const target=id??this.resolveLockTarget();
    if(target!=='Sagittarius A*'&&!this.bodies().some(body=>body.id===target))return false;
    this.syncTether();Flight.releaseTether(this.flight);this.flight.followBody=target;
    this.state={...this.state,selected:target,trackSun:false,trackBody:null};this.notify({selected:target,manualAim:true},{drawPending:true});this.redraw();return true;
  }

  toggleSurfaceLock(id) {
    if(this.flight?.tether)return this.releaseSurface();
    return this.tetherSurface(id??this.resolveLockTarget({surface:true}));
  }

  bodySurfaceLocation(id) {
    if(!this.flight||!this.state?.unifiedFlight||!this.hasSurface(id))return null;
    if(this.flight.tether?.bodyId===id)return {...this.flight.tether,tethered:true};
    const frame=Flight.bodyFrame(id,this.state.date),location=Flight.surfaceLocation(this.flight.position,this.spacePosition(id),frame,Flight.bodyRadiusAU(id));
    const probe={...this.flight,tether:{bodyId:id,...location,heading:0,elevation:0,roll:0}};
    Flight.setTetherOrientation(probe,probe.forward,probe.up,frame);
    return {...probe.tether,tethered:false};
  }

  landOnSurface(id=this.state?.selected,options={}) {
    if(!this.canPin(id))return false;
    const {animate=false}=options;
    if(Object.hasOwn(options,'animate'))return this.jumpToBody(id,{preset:'surface',animate});
    this.cancelNavigation();
    if(!this.state?.unifiedFlight||!this.bodies().some(body=>body.id===id))return false;
    this.stopMovement();
    const center=this.spacePosition(id),frame=Flight.bodyFrame(id,this.state.date),radius=Flight.bodyRadiusAU(id);
    let location=Flight.surfaceLocation(this.flight.position,center,frame,radius);
    if(id==='Earth'&&this.flight.followBody!==id&&this.flight.tether?.bodyId!==id&&Flight.norm(Flight.sub(this.flight.position,center))>radius*20)location={latitude:finite(this.state.latitude),longitude:finite(this.state.longitude)};
    if(!Flight.attachTether(this.flight,id,center,frame,{...location,altitudeM:Flight.FLIGHT_MIN_ALTITUDE_M}))return false;
    if(id==='ISS')this.flight.tether.controlMode='surface';else {this.flight.tether.elevation=0;this.flight.tether.roll=0;}this.syncTether();
    this.state={...this.state,selected:id};this.notify({selected:id,manualAim:true},{drawPending:true});this.redraw();return true;
  }

  resetSurfacePlane() {
    this.cancelNavigation();this.clearYawInput();
    if(!this.flight?.tether)return false;
    this.flight.tether.elevation=0;this.flight.tether.roll=0;this.syncTether();this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  resetReferencePlane() {
    this.cancelNavigation();this.clearYawInput();if(!this.flight||!this.state?.unifiedFlight)return false;
    if(this.flight.tether)return this.resetSurfacePlane();
    Object.assign(this.flight,Flight.lookBasis(Flight.unit([this.flight.forward[0],this.flight.forward[1],0],[0,1,0]),[0,0,1]));
    this.state={...this.state,trackSun:false,trackBody:null};this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  yawControl() { return Number(this.heldKeys.has('.'))-Number(this.heldKeys.has(',')); }

  clearYawInput() {
    for(const [source,keys]of this.movementInputs){keys.delete(',');keys.delete('.');if(!keys.size)this.movementInputs.delete(source);}
    this.heldKeys.delete(',');this.heldKeys.delete('.');if(!this.heldKeys.size)this.stopMovement();
  }

  yawFlight(angle,{notify=true}={}) {
    if(!this.state?.unifiedFlight||!this.flight||!Number.isFinite(angle))return false;
    this.cancelNavigation();const t=this.flight.tether;
    if(t?.controlMode==='surface')t.heading=wrap(t.heading+angle/RAD);
    else Flight.turnFlight(this.flight,angle,0,t?Flight.bodyFrame(t.bodyId,this.state.date):null);this.syncTether();
    this.state={...this.state,trackSun:false,trackBody:null};if(notify){this.notify({manualAim:true},{drawPending:true});this.redraw();}return true;
  }

  freeMovementSpeedAU() {
    // The visible free-flight speed is a floor, including after a close view.
    // Distance adaptation only accelerates travel through larger-scale space.
    return clamp(Math.max(Math.max(1,finite(this.state?.moveSpeed,3000000))/Flight.AU_M,this.flightDistance()*.6),1/Flight.AU_M,1e12);
  }

  rotateFlight({roll=0,pitch=0}={}, {notify=true}={}) {
    this.cancelNavigation();
    if(!this.state?.unifiedFlight||!this.flight||!Number.isFinite(roll)||!Number.isFinite(pitch))return false;
    const t=this.flight.tether,frame=t?Flight.bodyFrame(t.bodyId,this.state.date):null;
    Flight.rotateFlight(this.flight,{roll,pitch},frame);this.syncTether();
    if(notify){this.notify({manualAim:true},{drawPending:true});this.redraw();}return true;
  }

  getFlightStats() {
    if(!this.state?.unifiedFlight||!this.flight)return null;
    const t=this.flight.tether,selected=this.state.selected??null,targetId=selected??t?.bodyId??this.flight.followBody??this.resolveLockTarget()??'Sun',target=this.spacePosition(targetId),distanceAU=Flight.norm(Flight.sub(this.flight.position,target));
    let {nearestBody,heightM}=this.flightBodyMetrics();
    if(t&&t.bodyId!=='ISS'){nearestBody=t.bodyId;heightM=t.altitudeM;}
    const navigationSpeedMps=t?(t.controlMode==='surface'?this.pinMovementSpeed(t.bodyId):Math.max(1,finite(this.state.moveSpeed,100))):this.freeMovementSpeedAU()*Flight.AU_M;
    const focal=(this.height||540)/(2*Math.tan(this.fov*RAD/2));
    const basis=Flight.lookBasis(this.flight.forward,this.flight.up),level=Flight.lookBasis(basis.forward,[0,0,1]).up;
    const roll=t?.roll??Math.atan2(dot(cross(level,basis.up),basis.forward),dot(level,basis.up))/RAD;
    const motion=this.referenceMotion();
    return {mode:t?(t.controlMode==='free'?'spin':'surface'):this.flight.followBody?'orbit':'free',controlMode:t?.controlMode??null,selected,positionAU:[...this.flight.position],speedMps:this.lastFlightSpeedMps,navigationSpeedMps,distanceAU,heightM:Math.max(0,heightM),nearestBody,targetBody:targetId,
      scaleAUPerPixel:distanceAU/focal,fovDegrees:this.fov,headingDegrees:this.flightCamera().heading,pitchDegrees:this.flightCamera().elevation,rollDegrees:roll,
      compassCardinal:t?.bodyId==='ISS'?issBearing(this.flightCamera().heading):cardinal(this.flightCamera().heading),compassReference:t?.bodyId==='ISS'?'Illustrative ISS orbital frame':t?`${t.bodyId} true north`:'Galactic +Y',yawControl:this.yawControl(),yawRateDegreesS:this.yawControl()*YAW_RATE/RAD,
      ...motion,transitioning:!!this.navigationAnimation,referenceBody:t?.bodyId??this.flight.followBody??null,frame:t?'body-fixed':this.flight.followBody?'body-translation':'galactocentric-inertial',positionFrame:'current-Sun-relative Galactic AU'};
  }

  referenceMotion() {
    const t=this.flight.tether,id=t?.bodyId??this.flight.followBody,key=`${timeKey(this.state.date)}|${id}|${t?`${t.latitude}|${t.longitude}|${t.altitudeM}`:''}`;
    if(this.referenceMotionCache?.key===key)return this.referenceMotionCache.data;
    let orbital=[0,0,0],spin=[0,0,0];
    if(id==='ISS'){
      const before=helioPositionsAt(addTime(this.state.date,-30000),['Earth'])[0].position,after=helioPositionsAt(addTime(this.state.date,30000),['Earth'])[0].position,relative=issStateAt(this.state.date).velocityAUPerDay;
      orbital=Flight.scale(eclipticToGalactic(Flight.add(Flight.scale(Flight.sub(after,before),1440),relative)),AU_KM/86400);
    }else if(id&&id!=='Sun'&&id!=='Sagittarius A*') {
      const before=helioPositionsAt(addTime(this.state.date,-30000),[id])[0].position,after=helioPositionsAt(addTime(this.state.date,30000),[id])[0].position;
      orbital=Flight.scale(eclipticToGalactic(Flight.sub(after,before)),AU_KM/60);
    }else if(id==='Sagittarius A*')orbital=[0,-GALACTIC_MODEL.speedKmS,0];
    if(t&&t.bodyId!=='ISS') {
      const a=Flight.surfaceFrame(t.latitude,t.longitude,Flight.bodyFrame(t.bodyId,addTime(this.state.date,-500))).normal,b=Flight.surfaceFrame(t.latitude,t.longitude,Flight.bodyFrame(t.bodyId,addTime(this.state.date,500))).normal;
      spin=Flight.scale(Flight.sub(b,a),(Flight.bodyRadiusAU(t.bodyId)*Flight.AU_M+t.altitudeM)/1000);
    }
    const data={orbitalSpeedKmS:Flight.norm(orbital),surfaceSpinSpeedKmS:Flight.norm(spin),relativeSpeedKmS:Flight.norm(Flight.add(orbital,spin)),motionReference:id?'Sun':'none',motionSource:'Model-time finite differences; playback multiplier excluded'};
    this.referenceMotionCache={key,data};return data;
  }

  releaseSurface() {
    this.cancelNavigation();
    if(!this.flight?.tether)return false;
    this.syncTether();Flight.releaseTether(this.flight);this.state={...this.state,trackSun:false,trackBody:null};this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  releaseAllLocks() {
    this.cancelNavigation();
    if(!this.flight?.tether&&!this.flight?.followBody)return false;
    this.syncTether();this.flight.tether=null;this.flight.followBody=null;this.state={...this.state,trackSun:false,trackBody:null};this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  setFollowBody(id=null) {
    if(!this.state?.unifiedFlight||!this.flight)return false;
    if(id===null)return this.releaseAllLocks();
    if(id!==null&&(this.flight.tether||id!=='Sagittarius A*'&&!this.bodies().some(body=>body.id===id)))return false;
    this.flight.followBody=id;this.state={...this.state,trackSun:false,trackBody:null};this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  aimFlight(id) {
    if(!this.flight||id!=='Sagittarius A*'&&!this.bodies().some(body=>body.id===id))return;
    let vector=this.flightBodyVector(id);
    if(Flight.norm(vector)<1e-15)return;
    if(this.flight.tether) {
      const t=this.flight.tether,local=Flight.surfaceFrame(t.latitude,t.longitude,Flight.bodyFrame(t.bodyId,this.state.date)),v=Flight.unit(vector);
      t.heading=wrap(Math.atan2(Flight.dot(v,local.east),Flight.dot(v,local.north))/RAD);t.elevation=Math.asin(clamp(Flight.dot(v,local.normal),-1,1))/RAD;this.syncTether();
    }else Object.assign(this.flight,Flight.lookBasis(vector,this.flight.up));
  }

  flightDistance() {
    if(!this.flight)return 1;
    const nearest=this.flightBodyMetrics().nearest;
    return Math.max(2/Flight.AU_M,Number.isFinite(nearest)?nearest:1);
  }

  flightBodyDistances() {
    // Rotation, annotation and display changes share these exact physical
    // ranges. A translated eye or replaced body snapshot starts a fresh cache.
    this.bodies();const eye=this.flight.position,cache=this.bodyDistances;
    if(cache?.source===this.bodyCache&&cache.x===eye[0]&&cache.y===eye[1]&&cache.z===eye[2])return cache;
    return this.bodyDistances={source:this.bodyCache,x:eye[0],y:eye[1],z:eye[2],values:new Map()};
  }

  flightBodyDistance(id) {
    const cache=this.flightBodyDistances();if(cache.values.has(id))return cache.values.get(id);
    const eye=this.flight.position,center=this.bodyCache.positions.get(id)??this.spacePosition(id),distance=Math.hypot(eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]);
    // The galactic center changes independently of the body's source snapshot.
    if(this.bodyCache.byId.has(id))cache.values.set(id,distance);return distance;
  }

  flightBodyMetrics() {
    const cache=this.flightBodyDistances();if(cache.metrics)return cache.metrics;
    let nearest=Infinity,nearestBody=null,heightM=Infinity;
    for(const body of this.bodyCache.rows){const heightAU=this.flightBodyDistance(body.id)-Flight.bodyRadiusAU(body.id);nearest=Math.min(nearest,heightAU);if(!body.artificial){const height=heightAU*Flight.AU_M;if(height<heightM){heightM=height;nearestBody=body.id;}}}
    return cache.metrics={nearest,nearestBody,heightM};
  }

  constrainFlight(start=null) {
    this.flight.position=this.flight.position.map(v=>Number.isNaN(v)?0:clamp(v,-Flight.FLIGHT_MAX_POSITION_AU,Flight.FLIGHT_MAX_POSITION_AU));
    this.flight.speedAU=clamp(finite(this.flight.speedAU,1),1/Flight.AU_M,1e12);
    const bodies=this.bodies().filter(body=>!body.artificial&&body.surfaceAvailable!==false).map(body=>({position:this.spacePosition(body.id),radiusAU:Flight.bodyRadiusAU(body.id)}));
    if(start)this.flight.position=Flight.collideFlight(start,this.flight.position,bodies);
    for(const body of bodies) {
      const offset=Flight.sub(this.flight.position,body.position),radius=body.radiusAU+Flight.FLIGHT_MIN_ALTITUDE_M/Flight.AU_M;
      if(Flight.norm(offset)<radius)this.flight.position=Flight.add(body.position,Flight.scale(Flight.unit(offset),radius));
    }
  }

  moveFlight({forward=0,right=0,up=0,seconds=0,slow=false}={}) {
    if(!this.state?.unifiedFlight||!this.flight||!Number.isFinite(seconds)||seconds<=0)return false;
    this.cancelNavigation();
    const magnitude=Math.hypot(forward,right,up);if(!magnitude)return false;
    forward/=magnitude;right/=magnitude;up/=magnitude;
    const multiplier=slow?.01:1,t=this.flight.tether;
    if(t?.bodyId==='ISS'){this.lastFlightSpeedMps=0;this.syncTether();return false;}
    if(t) {
      const speed=t.controlMode==='surface'?this.pinMovementSpeed(t.bodyId):Math.max(1,finite(this.state.moveSpeed,100));this.flight.speedAU=speed/Flight.AU_M;
      const frame=Flight.bodyFrame(t.bodyId,this.state.date),oldHeight=t.altitudeM,distanceM=speed*seconds*multiplier;
      if(t.controlMode==='free'){const start=[...this.flight.position];Flight.moveSpinCamera(this.flight,{forward,right,up,distanceM},this.spacePosition(t.bodyId),frame);this.constrainFlight(start);this.retainSpinPosition();this.lastFlightSpeedMps=Flight.norm(Flight.sub(this.flight.position,start))*Flight.AU_M/seconds;}
      else {Flight.moveTether(this.flight,{forward,right,up,distanceM},this.spacePosition(t.bodyId),frame);this.lastFlightSpeedMps=Math.hypot(distanceM*Math.hypot(forward,right),t.altitudeM-oldHeight)/seconds;}
    }else {
      const speed=this.freeMovementSpeedAU();this.flight.speedAU=speed;
      const basis=Flight.lookBasis(this.flight.forward,this.flight.up),start=[...this.flight.position];
      const vector=Flight.add(Flight.add(Flight.scale(basis.forward,forward),Flight.scale(basis.right,right)),Flight.scale(basis.up,up));
      this.flight.position=Flight.add(start,Flight.scale(vector,speed*seconds*multiplier));this.constrainFlight(start);
      this.lastFlightSpeedMps=Flight.norm(Flight.sub(this.flight.position,start))*Flight.AU_M/seconds;
    }
    this.notify({manualAim:true},{drawPending:true});this.redraw();return true;
  }

  orbitBy(dx,dy) {
    if(!this.flight||!Number.isFinite(dx)||!Number.isFinite(dy))return;
    this.cancelNavigation();
    const focal=Math.max(100,(this.height||540)/(2*Math.tan(this.fov*RAD/2))),t=this.flight.tether;
    dx=clamp(dx,-200,200);dy=clamp(dy,-200,200);
    if(t?.bodyId==='ISS'){Flight.turnFlight(this.flight,-dx/focal,dy/focal,Flight.bodyFrame('ISS',this.state.date));this.syncTether();this.notify({manualAim:true},{drawPending:true});this.redraw();return;}
    if(t) {
      const radiusM=Flight.bodyRadiusAU(t.bodyId)*Flight.AU_M+t.altitudeM,gain=t.altitudeM/radiusM/focal;
      if(t.controlMode==='free'){const start=[...this.flight.position];Flight.orbitFlight(this.flight,this.spacePosition(t.bodyId),dx*gain,-dy*gain);this.flight.tether=t;this.constrainFlight(start);this.retainSpinPosition();}
      else Flight.orbitTether(this.flight,dx*gain,dy*gain,this.spacePosition(t.bodyId),Flight.bodyFrame(t.bodyId,this.state.date));
    }else {
      const target=this.state.selected||this.resolveLockTarget(),center=this.spacePosition(target),range=Flight.norm(Flight.sub(this.flight.position,center));
      // A stale Galactic destination must not amplify a local pixel into an
      // enormous translation. Recompute sensitivity from local geometry.
      const gain=Math.min(1,this.flightDistance()/Math.max(1e-15,range))/focal,start=[...this.flight.position];
      Flight.orbitFlight(this.flight,center,dx*gain,-dy*gain);this.constrainFlight(start);
    }
    this.notify({manualAim:true},{drawPending:true});this.redraw();
  }

  earthFlightLocation() {
    if(this.frameEarthLocation!==undefined)return this.frameEarthLocation;
    const earth=this.bodies().find(body=>body.id==='Earth');if(!earth)return null;
    const frame=Flight.bodyFrame('Earth',this.state.date),center=this.spacePosition('Earth');
    const location=this.flight.tether?.bodyId==='Earth'?{latitude:this.flight.tether.latitude,longitude:this.flight.tether.longitude,altitudeM:this.flight.tether.altitudeM}:Flight.surfaceLocation(this.flight.position,center,frame,Flight.bodyRadiusAU('Earth'));
    const result={...location,frame,center,local:Flight.surfaceFrame(location.latitude,location.longitude,frame)};
    if(this.frameVectors)this.frameEarthLocation=result;return result;
  }

  flightBodyVector(id) {
    if(!this.frameVectors)return this.computeFlightBodyVector(id);
    if(!this.frameVectors.has(id))this.frameVectors.set(id,this.computeFlightBodyVector(id));
    return this.frameVectors.get(id);
  }

  computeFlightBodyVector(id) {
    const geometric=Flight.sub(this.spacePosition(id),this.flight.position);
    // Retain the same apparent topocentric geometry used by the eclipse finder.
    // It is embedded as a physical vector in this camera, not a separate sky view.
    if(ASTROLOGY_BODY_IDS.includes(id)) {
      const earth=this.earthFlightLocation();
      if(earth&&earth.altitudeM<=100000) {
        const observer=this.state.skyObserver,provided=(this.state.sky||[]).find(row=>row.id===id);
        const matching=observer&&Math.abs(observer.latitude-earth.latitude)<1e-6&&Math.abs(observer.longitude-earth.longitude)<1e-6&&Math.abs(observer.height-earth.altitudeM)<.1;
        const h=matching&&provided&&Number.isFinite(provided.distanceAU)?provided:horizontal(id,this.state.date,earth.latitude,earth.longitude,{height:earth.altitudeM,refraction:this.state.refraction||'none'}),v=direction(h.azimuth,h.altitude),local=earth.local;
        if(!this.flightApparent)this.flightApparent=new Map();this.flightApparent.set(id,h);
        return Flight.scale(Flight.add(Flight.add(Flight.scale(local.east,v[0]),Flight.scale(local.north,v[1])),Flight.scale(local.normal,v[2])),h.distanceAU);
      }
    }
    this.flightApparent?.delete(id);return geometric;
  }

  flightPolygon(vectors) {
    const near=1e-9;
    let polygon=vectors.map(v=>[dot(v,this.right),dot(v,this.up),dot(v,this.forward)]);
    // Clip before dividing. A world-space intersection at AU distances cannot
    // retain a tiny near depth when it is later recovered by a dot product.
    for(const plane of this.flightFrustumPlanes(near)){
      let inside=0;for(const p of polygon)if(plane.distance(p)>=0)inside++;
      if(!inside)return [];if(inside===polygon.length)continue;
      const clipped=[];for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distance(a),db=plane.distance(b);
        if(da>=0)clipped.push(a);if((da>=0)!==(db>=0)){const sum=Math.abs(da)+Math.abs(db),wa=Math.abs(db)/sum,wb=Math.abs(da)/sum,point=a.map((v,j)=>v*wa+b[j]*wb);plane.fix(point);clipped.push(point);}
      }polygon=clipped;
    }
    return polygon.map(v=>this.flightScreenPoint(v,near));
  }

  flightFrustumPlanes(near=1e-9) {
    if(this.frustumCache?.width!==this.width||this.frustumCache?.height!==this.height||this.frustumCache?.focal!==this.focal)this.frustumCache={width:this.width,height:this.height,focal:this.focal,planes:new Map()};
    if(this.frustumCache.planes.has(near))return this.frustumCache.planes.get(near);
    const hx=this.width/(2*this.focal),hy=this.height/(2*this.focal);
    const planes=[
      {distance:p=>p[2]-near,fix:p=>{p[2]=near;}},
      {distance:p=>p[0]+hx*p[2],fix:p=>{p[0]=-hx*p[2];}},
      {distance:p=>hx*p[2]-p[0],fix:p=>{p[0]=hx*p[2];}},
      {distance:p=>p[1]+hy*p[2],fix:p=>{p[1]=-hy*p[2];}},
      {distance:p=>hy*p[2]-p[1],fix:p=>{p[1]=hy*p[2];}},
    ];
    this.frustumCache.planes.set(near,planes);if(this.frustumCache.planes.size>4)this.frustumCache.planes.delete(this.frustumCache.planes.keys().next().value);return planes;
  }

  flightScreenPoint(v,near=1e-9) {
    return {x:clamp(this.width/2+this.focal*v[0]/Math.max(near,v[2]),0,this.width),y:clamp(this.height/2-this.focal*v[1]/Math.max(near,v[2]),0,this.height)};
  }

  flightDisk(vector,radiusAU) {
    const distance=Flight.norm(vector),center=Flight.unit(vector),basis=Flight.lookBasis(center),sine=clamp(radiusAU/distance,0,1),cosine=Math.sqrt(Math.max(0,1-sine*sine));
    const vectorAt=(x,y)=>Flight.add(Flight.scale(center,cosine),Flight.scale(Flight.add(Flight.scale(basis.right,x),Flight.scale(basis.up,y)),sine));
    const cameraVector=[dot(vector,this.right),dot(vector,this.up),dot(vector,this.forward)],margin=radiusAU*(1+this.width/(2*this.focal)+this.height/(2*this.focal));
    const outside=this.flightFrustumPlanes(0).some(plane=>plane.distance(cameraVector)<-margin);
    // A subpixel disk needs only a few limb vertices. Bound the projected
    // tangent-cone chord error conservatively; retain the old maximum for
    // close/off-axis bodies, near-plane crossings and viewport-filling disks.
    const depth=cameraVector[2],extent=depth>radiusAU?this.focal*radiusAU/(depth-radiusAU)*(1+Math.hypot(cameraVector[0],cameraVector[1])/depth):Infinity;
    const steps=clamp(Math.ceil(Math.PI*Math.sqrt(extent/.5)),12,160);
    const inside=radiusAU>=distance,polygon=inside?[{x:0,y:0},{x:this.width,y:0},{x:this.width,y:this.height},{x:0,y:this.height}]:outside?[]:this.flightPolygon(Array.from({length:steps},(_,i)=>vectorAt(Math.cos(i/steps*TAU),Math.sin(i/steps*TAU))));
    return {center,east:basis.right,north:basis.up,vectorAt,polygon,distance,radiusAU,inside,limbSamples:inside||outside?0:steps,angularRadius:Math.asin(sine)/RAD,point:this.skyVectorProject(center)};
  }

  drawFlightBody(body,vector) {
    if(body.artificial)return this.drawFlightArtificial(body,vector);
    const visibility=this.flightBodyVisibility(body);if(visibility.dot<=0)return;
    const c=this.ctx,apparent=this.flightApparent?.get(body.id),radiusAU=Number.isFinite(apparent?.angularRadius)?Flight.norm(vector)*Math.sin(apparent.angularRadius*RAD):Flight.bodyRadiusAU(body.id);
    const disk=this.flightDisk(vector,radiusAU*this.displayBodyScale());
    this.surfaceDisks.set(body.id,disk);if(disk.polygon.length<3){if(body.id==='Saturn')this.drawSaturnRings(body,vector,visibility);return;}
    c.save();c.globalAlpha=this.surfaceOpacity(body.id)*visibility.dot;
    const point=disk.point,radius=this.focal*Math.tan(disk.angularRadius*RAD),imageMoon=body.id==='Moon'&&this.state.moonSurfaceDetail!=='schematic'&&radius>8&&!disk.inside,moonRaster=imageMoon?this.moonRasterForBody(body):null;
    if(radius<1.3&&point&&body.id!==this.flight.tether?.bodyId) {
      const marker=this.state.markerMode==='physical'?Math.max(.8,radius):Math.max(2,finite(this.state.markerSize,1)*3);
      c.fillStyle=body.color;c.beginPath();c.arc(point.x,point.y,marker,0,TAU);
      if(this.state.markerMode==='physical')c.fill();
      else {c.strokeStyle=body.color;c.lineWidth=.85;c.stroke();c.fillRect(point.x-.5,point.y-.5,1,1);}
    }else if(!moonRaster) {
      this.fillSkyPolygon(disk.polygon,body.id==='Sun'?'#edbd62':body.id==='Earth'&&this.state.showEarthTerrain!==false?'#102330':this.state.theme==='dark'?'#141b21':'#717974');
      if(body.id!=='Sun'&&!disk.inside) {
        const light=Flight.unit(Flight.scale(this.spacePosition(body.id),-1));
        const lit=clamp((1-dot(light,disk.center))/2,0,1);
        let bx=dot(light,disk.east),by=dot(light,disk.north),m=Math.hypot(bx,by);if(m<1e-12){bx=1;by=0;m=1;}bx/=m;by/=m;
        const ray=(x,y)=>disk.vectorAt(bx*x-by*y,by*x+bx*y),vectors=[],phaseSteps=this.motionDetail?clamp(Math.ceil(disk.limbSamples/2),12,80):80;
        for(let i=0;i<=phaseSteps;i++){const a=-Math.PI/2+i/phaseSteps*Math.PI;vectors.push(ray(Math.cos(a),Math.sin(a)));}
        for(let i=0;i<=phaseSteps;i++){const a=Math.PI/2-i/phaseSteps*Math.PI;vectors.push(ray((1-2*lit)*Math.cos(a),Math.sin(a)));}
        this.fillSkyPolygon(this.flightPolygon(vectors),body.id==='Earth'&&this.state.showEarthTerrain!==false?earthSurfaceGeometry(this.state.land,{detail:this.state.earthTerrainDetail||'medium'}).oceanColor:body.color||'#879d94');
      }
    }
    if(radius>8&&!disk.inside) {
      const imageEarth=body.id==='Earth'&&this.state.showEarthTerrain!==false;
      if(imageEarth)this.drawFlightEarthImagery(body);
      if(imageMoon)this.drawFlightMoonDetail(body,moonRaster);
      if(this.state.showSurfaceTexture!==false&&!imageEarth&&!imageMoon)this.drawFlightSurfaceTexture(body);
      if(this.state.showSurfaceGrid!==false)this.drawFlightSurfaceGrid(body);
      if(body.id==='Earth'&&this.state.showISSFootprint===true)this.drawISSFootprint(body);
    }
    if(this.state.showSurfaceMarkings!==false&&!disk.inside) {
      if(body.id!=='Earth'&&radius>8)this.drawFlightReferenceGrid(body);
      if(body.id==='Earth'&&radius>8&&(this.state.showSurfaceMap!==false||this.state.showCities!==false))this.drawFlightEarthMap();
    }
    if(body.id==='Moon'&&radius>1&&this.displayBodyScale()===1)this.drawFlightLunarShadow(vector,disk);
    const parentId=moonParent(body);
    if(this.state.showPhysicalShadows!==false&&parentId&&body.id!=='Moon'){
      const fraction=solarVisibilityAt(this.spacePosition(body.id),{sunRadius:Flight.bodyRadiusAU('Sun'),occluders:[{position:this.spacePosition(parentId),radius:Flight.bodyRadiusAU(parentId)}]});
      if(fraction<1){c.save();c.globalAlpha=.92*(1-fraction)*visibility.dot*this.surfaceOpacity(body.id);this.fillSkyPolygon(disk.polygon,'#030507');c.restore();}
    }
    c.restore();
    if(body.id==='Saturn')this.drawSaturnRings(body,vector,visibility);
    const visiblePoint=point&&point.x>=0&&point.x<=this.width&&point.y>=0&&point.y<=this.height;
    if(visiblePoint) {
      this.hits.push({id:body.id,parentId:moonParent(body),x:point.x,y:point.y,radius:Math.max(10,Math.min(radius,24)),polygon:disk.polygon});
      if(this.state.selected===body.id)this.drawFlightSelection(disk);
      if(this.state.labels!==false&&radius<this.height&&visibility.label>0)this.drawLabel(body.id,point.x,point.y,Math.max(3,radius),this.state.selected===body.id,{bodyId:body.id,priority:visibility.priority,opacity:visibility.label});
    }else if(disk.polygon.length){this.hits.push({id:body.id,x:-100,y:-100,radius:0,polygon:disk.polygon});if(this.state.selected===body.id)this.drawFlightSelection(disk);}
  }

  drawSaturnRings(body,vector,visibility) {
    const scale=this.displayBodyScale(),distance=Flight.norm(vector),opacity=this.surfaceOpacity('Saturn'),radius=Flight.bodyRadiusAU('Saturn');
    if(opacity<=0||distance<radius*scale&&opacity>=1||SATURN_RINGS.outerKm/AU_KM*scale*this.focal/Math.max(1e-15,distance)<1)return;
    const light=this.state.showPhysicalShadows===false?null:Flight.unit(Flight.scale(this.spacePosition('Saturn'),-1));
    const frame=Flight.bodyFrame('Saturn',this.state.date),options={width:Math.max(1,Math.round(this.width)),height:Math.max(1,Math.round(this.height)),focal:this.focal,forward:this.forward,right:this.right,up:this.up,eye:Flight.scale(vector,-Flight.AU_M),frame,planetRadiusM:radius*Flight.AU_M,bodyScale:scale,planetOpacity:opacity,light,maxPixels:this.motionDetail?40000:160000};
    let shadowOptions=null;
    if(light){const points=this.surfaceDisks.get('Saturn')?.polygon??[];if(points.length){const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y));shadowOptions={...options,maxPixels:this.motionDetail?10000:40000,bounds:{x:left,y:top,width:right-left,height:bottom-top}};}}
    const result=this.geometryRasterFor('saturn',{options,shadowOptions}),{raster,shadow}=result;
    const factory=typeof globalThis.OffscreenCanvas==='function'?()=>new OffscreenCanvas(1,1):()=>this.canvas.ownerDocument?.createElement?.('canvas')??globalThis.document?.createElement?.('canvas');
    if(shadow){this.saturnRingShadow=shadow;const c=this.ctx;c.save();c.globalAlpha=visibility.dot*opacity;drawEarthImagery(c,shadow,{canvasFactory:factory,layer:'saturn-shadow'});c.restore();}
    if(!raster)return;
    const upload=this.rasterUpload(raster),c=this.ctx;
    c.save();c.globalAlpha=visibility.dot*opacity;const painted=drawEarthImagery(c,upload,{canvasFactory:factory,layer:'saturn-rings'});c.restore();this.renderedSaturnRings={raster,frame,painted,bodyScale:scale,planetRadiusM:radius*Flight.AU_M,coarse:result.coarse};
    this.hits.push({id:'Saturn',x:-100,y:-100,radius:0,contains:point=>saturnRingRasterContains(raster,point.x,point.y),polygon:this.surfaceDisks.get('Saturn')?.polygon});
  }

  moonRasterForBody(body) {
    const view=this.surfaceGeometryView(body),disk=this.surfaceDisks.get('Moon');if(!disk?.polygon?.length)return;
    const local=vector=>[dot(vector,view.frame.x),dot(vector,view.frame.y),dot(vector,view.frame.z)],vector=this.flightBodyVector('Moon'),exaggeration=clamp(finite(this.state.moonTerrainExaggeration,1),1,20);
    // Bound the highest displaced terrain with its own perspective limb; use
    // the displayed apparent center when an Earth observer supplies one.
    const factor=this.state.moonSurfaceDetail==='terrain'?1+MOON_DETAIL_METADATA.maxHeightM*exaggeration/MOON_DETAIL_METADATA.referenceRadiusM:1,points=this.flightDisk(vector,view.radius*factor).polygon;
    if(!points.length)return;const left=Math.min(...points.map(p=>p.x))-2,top=Math.min(...points.map(p=>p.y))-2,right=Math.max(...points.map(p=>p.x))+2,bottom=Math.max(...points.map(p=>p.y))+2;
    this.moonRequested=true;
    const raster=this.moonRasterClient.request({maxPixels:this.motionDetail?(this.state.moonSurfaceDetail==='terrain'?4096:16000):60000,width:Math.max(1,Math.round(this.width)),height:Math.max(1,Math.round(this.height)),camera:local(Flight.scale(vector,-1/view.radius)),forward:local(this.forward),right:local(this.right),up:local(this.up),focal:this.focal,light:local(Flight.unit(Flight.scale(view.center,-1))),mode:this.state.moonSurfaceDetail==='terrain'?'terrain':'imagery',exaggeration,bounds:{x:left,y:top,width:right-left,height:bottom-top}});
    this.moonRasterStatus={state:this.moonRasterClient.status,pending:!raster,error:this.moonRasterClient.error??null};return raster;
  }

  drawFlightMoonDetail(body,raster) {
    const factory=typeof globalThis.OffscreenCanvas==='function'?()=>new OffscreenCanvas(1,1):()=>this.canvas.ownerDocument?.createElement?.('canvas')??globalThis.document?.createElement?.('canvas');
    this.moonDetailRaster=raster;this.moonDetailPainted=drawEarthImagery(this.ctx,raster,{canvasFactory:factory,layer:'moon'});
  }

  drawISSFootprint(body) {
    let footprint;try{footprint=issFootprintAt(this.state.date,{steps:96});}catch(error){if(!(error instanceof RangeError))throw error;this.renderedISSFootprint={unavailable:true,reason:'Footprint requires a supported finite calendar date'};return;}
    const vectors=footprint.points.map(point=>{const lat=point.latitude*RAD,lon=point.longitude*RAD;return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];});
    if(vectors.length)vectors.push([...vectors[0]]);this.renderedISSFootprint={...footprint,vectors};
    const c=this.ctx,view=this.surfaceGeometryView(body);c.save();c.strokeStyle='#64d9f5';c.lineWidth=1;c.globalAlpha=.7*this.surfaceOpacity('Earth');c.beginPath();
    for(let i=1;i<vectors.length;i++){const segment=this.visibleSurfaceSegment(vectors[i-1],vectors[i],view);if(segment)this.strokeFlightVectorSegment(this.surfaceVector(segment[0],view),this.surfaceVector(segment[1],view));}c.stroke();c.restore();
  }

  drawArtificialSymbol(x,y,color,distanceScale=1) {
    const c=this.ctx,size=clamp(finite(this.state.markerSize,1),.5,4)*distanceScale;c.save();c.translate(x,y);c.scale(size,size);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1;
    // A screen symbol, not a physical spacecraft globe or attitude model.
    c.fillRect(-2,-2,4,4);c.strokeRect(-9,-4,5,8);c.strokeRect(4,-4,5,8);c.beginPath();c.moveTo(-9,0);c.lineTo(9,0);c.moveTo(0,-5);c.lineTo(0,5);c.stroke();c.restore();
  }

  drawFlightArtificial(body,vector) {
    const visibility=this.flightBodyVisibility(body);if(visibility.dot<=0||this.flight.tether?.bodyId===body.id)return;
    if(body.id==='ISS'&&ISS_GEOMETRY.radiusM*this.focal/Math.max(.001,Flight.norm(vector)*Flight.AU_M)>10)return this.drawISSModel(body,vector,visibility);
    const point=this.skyVectorProject(Flight.unit(vector));if(!point||point.x<0||point.x>this.width||point.y<0||point.y>this.height)return;
    const occlusion=this.flightPointTransmission(this.spacePosition(body.id));if(occlusion<=0)return;
    this.artificialMarkers??=new Map();this.artificialMarkers.set(body.id,{...point,occlusion});
    const markerScale=visibility.markerScale??1,c=this.ctx;c.save();c.globalAlpha=visibility.dot*occlusion;this.drawArtificialSymbol(point.x,point.y,body.color||this.palette.text,markerScale);
    if(this.state.selected===body.id)this.drawSelection(point.x,point.y,15*markerScale);c.restore();
    this.hits.push({id:body.id,parentId:body.parentId,x:point.x,y:point.y,radius:12*markerScale});
    if(this.state.labels!==false&&visibility.label>0)this.drawLabel(body.id,point.x,point.y,10*markerScale,this.state.selected===body.id,{bodyId:body.id,priority:visibility.priority,opacity:visibility.label*occlusion});
  }

  drawISSModel(body,vector,visibility) {
    const frame=Flight.bodyFrame('ISS',this.state.date),center=this.spacePosition('ISS'),occlusion=this.flightPointTransmission(center);if(occlusion<=0)return;
    // Keep metre offsets camera-relative until projection, avoiding an AU near
    // plane that would clip away the whole station during a close inspection.
    const eye=Flight.scale(vector,Flight.AU_M);
    const sunVisibility=this.state.showPhysicalShadows===false?1:solarVisibilityAt(center,{sunRadius:Flight.bodyRadiusAU('Sun'),occluders:[{position:this.spacePosition('Earth'),radius:Flight.bodyRadiusAU('Earth')}]});
    const options={maxPixels:this.motionDetail?40000:160000,width:Math.max(1,Math.round(this.width)),height:Math.max(1,Math.round(this.height)),forward:this.forward,right:this.right,up:this.up,focal:this.focal,light:Flight.unit(Flight.scale(center,-1)),sunVisibility};
    const result=this.geometryRasterFor('iss',{options,eye,frame}),raster=result.raster;if(!raster?.visibleCount)return;
    raster.sunVisibility=sunVisibility;
    const b=raster.bounds,bounds={...b,left:b.x,right:b.x+b.width,top:b.y,bottom:b.y+b.height},c=this.ctx;
    const upload=this.rasterUpload(raster);
    c.save();c.globalAlpha=visibility.dot*occlusion;
    const factory=typeof globalThis.OffscreenCanvas==='function'?()=>new OffscreenCanvas(1,1):()=>this.canvas.ownerDocument?.createElement?.('canvas')??globalThis.document?.createElement?.('canvas');
    const painted=drawEarthImagery(c,upload,{canvasFactory:factory,layer:'iss'});
    if(this.state.selected==='ISS'){c.strokeStyle=this.palette.signal;c.lineWidth=1;for(const [x,dx]of [[bounds.left,1],[bounds.right,-1]])for(const [y,dy]of [[bounds.top,1],[bounds.bottom,-1]]){c.beginPath();c.moveTo(x+dx*9,y);c.lineTo(x,y);c.lineTo(x,y+dy*9);c.stroke();}}
    c.restore();this.renderedISSModel={faces:raster.projectedFaces,bounds,frame,raster,painted,schematic:true,coarse:result.coarse};
    this.hits.push({id:'ISS',parentId:'Earth',x:-100,y:-100,radius:0,contains:point=>issRasterContains(raster,point.x,point.y),polygon:[{x:bounds.left,y:bounds.top},{x:bounds.right,y:bounds.top},{x:bounds.right,y:bounds.bottom},{x:bounds.left,y:bounds.bottom}]});
    const point=this.skyVectorProject(Flight.unit(vector));if(point&&visibility.label>0&&this.state.labels!==false)this.drawLabel('ISS',point.x,point.y,Math.min(40,Math.max(b.width,b.height)/2),this.state.selected==='ISS',{bodyId:'ISS',priority:visibility.priority,opacity:visibility.label*occlusion});
  }

  drawISSOrbit(afterBodies) {
    if(afterBodies&&this.issOrbitGuide)this.renderedISSOrbit=this.drawDedicatedOrbit(this.issOrbitGuide,'iss',{opacity:.85,color:'#64d9f5'});
  }

  cachedRaster(layer,inputs,create) {
    this.physicalRasters??=new Map();const key=JSON.stringify(inputs),cached=this.physicalRasters.get(layer);
    if(cached?.key===key)return cached.raster;
    const raster=create();this.physicalRasters.set(layer,{key,raster});return raster;
  }

  geometryRasterFor(kind,inputs) {
    this.geometryRequested.add(kind);const request={kind,...inputs},client=this.geometryRasterClients[kind],result=client.request(request);
    this.geometryRasterStatus[kind]={state:client.status,pending:!result,error:client.error??null};
    return result??this.cachedRaster(kind+'-coarse',request,()=>renderGeometry({...request,coarse:true}));
  }

  rasterUpload(raster) {
    this.rasterUploads??=new WeakMap();if(this.rasterUploads.has(raster))return this.rasterUploads.get(raster);
    const b=raster.bounds,upload={...raster,data:raster.pixels,hitCount:raster.visibleCount,x:b.x,y:b.y,displayWidth:b.width,displayHeight:b.height,style:'satellite'};this.rasterUploads.set(raster,upload);return upload;
  }

  drawMoonOrbit(afterBodies) {
    if(afterBodies&&this.moonOrbitGuide)this.renderedMoonOrbit=this.drawDedicatedOrbit(this.moonOrbitGuide,'moon',{opacity:.6,color:'#bcc7d6'});
  }

  drawDedicatedOrbit(guide,prefix,defaults) {
    const c=this.ctx,opacity=clamp(finite(this.state[prefix+'OrbitOpacity'],defaults.opacity),0,1),width=clamp(finite(this.state[prefix+'OrbitWidth'],1),.25,8),color=/^#[0-9a-f]{6}$/i.test(this.state[prefix+'OrbitColor']||'')?this.state[prefix+'OrbitColor']:defaults.color,dashed=this.state[prefix+'OrbitStyle']==='dashed',throughEarth=this.state[prefix+'OrbitThroughEarth']===true,segments=[],points=guide.displayPoints??guide.points;
    if(this.flightPathOutsideView(points,width/2+2))return {...guide,opacity,width,color,style:dashed?'dashed':'solid',throughEarth,segments,offscreen:true};
    // The complete sampled polyline projects inside the extrema of its vertices
    // while every vertex is in front of the near plane. Keep selected guides
    // and all near-plane cases; only omit an unresolved quarter-pixel outline.
    if(width<=1&&this.state.selected!==guide.id&&this.orbitBelowPixelSize(points,.25))return {...guide,opacity,width,color,style:dashed?'dashed':'solid',throughEarth,segments,subpixel:true};
    c.save();c.globalAlpha=opacity;c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dashed?[6,4]:[]);
    if(throughEarth){c.beginPath();this.strokeWorldPath(points);c.stroke();}
    else {
      // A line cannot be eclipsed by a sphere farther away than all of its
      // vertices. This exact broad phase removes distant moon systems before
      // the tangent-cone tests; it does not change their rendered visibility.
      const occluders=this.flightPathOccluders(points);
      let transmission=null;
      for(let index=1;index<points.length;index++)for(const segment of this.flightVisibleSegments(points[index-1],points[index],occluders)){
        if(transmission!==segment.transmission){if(transmission!==null)c.stroke();transmission=segment.transmission;c.globalAlpha=opacity*transmission;c.beginPath();}
        this.strokeWorldPath([segment.from,segment.to]);segments.push(segment);
      }
      if(transmission!==null)c.stroke();
    }
    c.restore();return {...guide,opacity,width,color,style:dashed?'dashed':'solid',throughEarth,segments};
  }

  orbitBelowPixelSize(points,threshold) {
    if(!points?.length)return false;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;const eye=this.flight.position,f=this.forward,r=this.right,u=this.up;
    for(const p of points){const x=p[0]-eye[0],y=p[1]-eye[1],z=p[2]-eye[2],depth=x*f[0]+y*f[1]+z*f[2];if(!(depth>1e-9))return false;
      const sx=this.focal*(x*r[0]+y*r[1]+z*r[2])/depth,sy=this.focal*(x*u[0]+y*u[1]+z*u[2])/depth;
      if(!Number.isFinite(sx)||!Number.isFinite(sy))return false;left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);
      if(Math.hypot(right-left,bottom-top)>=threshold)return false;
    }return true;
  }

  flightPathOutsideView(points,padding=2) {
    if(!points?.length)return false;
    const eye=this.flight.position,r=this.right,u=this.up,f=this.forward,hx=(this.width/2+padding)/this.focal,hy=(this.height/2+padding)/this.focal;let inside=0;
    for(const point of points){const x=point[0]-eye[0],y=point[1]-eye[1],z=point[2]-eye[2],a=x*r[0]+y*r[1]+z*r[2],b=x*u[0]+y*u[1]+z*u[2],c=x*f[0]+y*f[1]+z*f[2];
      if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(c))return false;
      if(c>=1e-9)inside|=1;if(a+hx*c>=0)inside|=2;if(hx*c-a>=0)inside|=4;if(b+hy*c>=0)inside|=8;if(hy*c-b>=0)inside|=16;if(inside===31)return false;
    }return true;
  }

  flightPathOccluders(points,rows=this.flightOccluders()) {
    if(!points.length)return rows;
    const eye=this.flight.position,first=points[0],vx=first[0]-eye[0],vy=first[1]-eye[1],vz=first[2]-eye[2],distance=Math.hypot(vx,vy,vz);
    if(!(distance>1e-15))return rows;
    const ax=vx/distance,ay=vy/distance,az=vz/distance;let cosine=1,range=0;
    for(const point of points){const x=point[0]-eye[0],y=point[1]-eye[1],z=point[2]-eye[2],d=Math.hypot(x,y,z);if(!(d>1e-15))return rows;range=Math.max(range,d);cosine=Math.min(cosine,(ax*x+ay*y+az*z)/d);}
    // A cone with half-angle <90 degrees is convex, so it contains every
    // straight segment between these vertices. A sphere can occult the path
    // only if its angular disk intersects that cone. Expand for roundoff;
    // unknown radii and observers inside a sphere always retain the old tests.
    cosine-=64*Number.EPSILON;const sine=Math.sqrt(Math.max(0,1-cosine*cosine)),result=[];
    for(const row of rows){
      if((row.nearest??0)>range)continue;
      const radius=row.radius,d=row.distance;
      if(cosine<=0||!Number.isFinite(radius)||!Number.isFinite(d)||d<=radius){result.push(row);continue;}
      const sb=radius/d,cb=Math.sqrt(Math.max(0,1-sb*sb)),alignment=-(ax*row.eye[0]+ay*row.eye[1]+az*row.eye[2])/d;
      if(alignment+64*Number.EPSILON>=cosine*cb-sine*sb)result.push(row);
    }return result;
  }

  flightVisibleSegments(from,to,occluders=this.flightOccluders()) {
    if(!occluders.length)return [{from,to,transmission:1}];
    const d=Flight.sub(from,this.flight.position),v=Flight.sub(to,from),dd=dot(d,d),dv=dot(d,v),vv=dot(v,v),cuts=[0,1];
    const range=Math.max(Math.sqrt(dd),Math.hypot(d[0]+v[0],d[1]+v[1],d[2]+v[2]));
    for(const {eye,c,nearest} of occluders){
      if((nearest??0)>range)continue;
      const b0=dot(eye,d),bv=dot(eye,v);
      // Split at the sightline's tangent cone and at actual sphere crossings.
      // Midpoint transmission is constant between these geometric boundaries.
      for(const t of segmentRoots(bv*bv-c*vv,2*(b0*bv-c*dv),b0*b0-c*dd))if(t>0&&t<1)cuts.push(t);
      for(const t of segmentRoots(vv,2*(bv+dv),c+2*b0+dd))if(t>0&&t<1)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);const at=t=>Flight.add(from,Flight.scale(v,t)),segments=[];
    for(let index=1;index<cuts.length;index++){if(cuts[index]-cuts[index-1]<1e-12)continue;const transmission=this.flightPointTransmission(at((cuts[index]+cuts[index-1])/2),occluders);if(transmission>0)segments.push({from:at(cuts[index-1]),to:at(cuts[index]),transmission});}
    return segments;
  }

  flightOccluders() {
    const key=this.flight.position.join('|')+'|'+this.focal;if(this.flightOccluderCache?.state===this.state&&this.flightOccluderCache.key===key)return this.flightOccluderCache.rows;
    const rows=[];for(const body of this.bodies()){
      if(body.artificial||body.surfaceAvailable===false)continue;
      const opacity=this.surfaceOpacity(body.id)*this.flightBodyVisibility(body).dot;if(opacity<=0)continue;
      const eye=Flight.sub(this.flight.position,this.spacePosition(body.id)),radius=Flight.bodyRadiusAU(body.id)*this.displayBodyScale(),distance=Flight.norm(eye);rows.push({eye,c:(distance-radius)*(distance+radius),nearest:Math.max(0,distance-radius-distance*Number.EPSILON*8),radius,distance,opacity});
    }
    this.flightOccluderCache={state:this.state,key,rows};return rows;
  }

  flightPointTransmission(position,occluders=this.flightOccluders()) {
    const delta=Flight.sub(position,this.flight.position),a=dot(delta,delta);if(a<1e-30)return 0;
    let transmission=1;
    const range=Math.sqrt(a);
    for(const {eye,c,opacity,nearest} of occluders) {
      if(nearest>range)continue;
      const b=dot(eye,delta),disc=b*b-a*c;
      if(c>=0&&(b>=0||disc<0))continue;
      const entry=c<0?0:c/(-b+Math.sqrt(disc));if(entry>=0&&entry<1-1e-8)transmission*=1-opacity;
      if(transmission<=0)return 0;
    }
    return transmission;
  }

  drawFlightSelection(disk) {
    if(disk.inside)return;
    const radius=this.focal*Math.tan(disk.angularRadius*RAD);
    if(radius<5&&disk.point)return this.drawSelection(disk.point.x,disk.point.y,10);
    const c=this.ctx;c.save();c.strokeStyle=this.palette.signal;c.lineWidth=1;
    // A sphere away from the optical axis projects to an ellipse. Sample the
    // very same tangent-cone limb as its disk, including near/frustum clipping.
    for(let quadrant=0;quadrant<4;quadrant++){
      c.beginPath();let previous=null;
      for(let i=0;i<=16;i++){const a=quadrant*Math.PI/2+.13+i/16*.49,v=disk.vectorAt(Math.cos(a),Math.sin(a));if(previous)this.strokeFlightVectorSegment(previous,v);previous=v;}
      c.stroke();
    }
    c.restore();
  }

  drawFlightLunarShadow(vector,disk) {
    this.lunarShadow=null;if(this.state.showPhysicalShadows===false)return;
    const shadow=lunarShadowAt(this.state.date);if(!shadow||disk.polygon.length<3)return;this.lunarShadow=shadow;
    const c=this.ctx,basis=Flight.lookBasis(shadow.axisGalactic),center=Flight.add(vector,shadow.offsetGalacticAU);
    const circle=radius=>this.flightPolygon(Array.from({length:128},(_,i)=>Flight.add(center,Flight.scale(Flight.add(Flight.scale(basis.right,Math.cos(i/128*TAU)),Flight.scale(basis.up,Math.sin(i/128*TAU))),radius))));
    c.save();c.beginPath();disk.polygon.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();
    // Geometry is physical; atmospheric color and smooth penumbral tint are illustrative.
    const opacity=this.surfaceOpacity('Moon');
    for(let i=0;i<8;i++){c.globalAlpha=.05*opacity;this.fillSkyPolygon(circle(shadow.penumbraRadiusAU-(shadow.penumbraRadiusAU-shadow.umbraRadiusAU)*i/8),'#342e31');}
    if(shadow.umbraRadiusAU>0){c.globalAlpha=.82*opacity;this.fillSkyPolygon(circle(shadow.umbraRadiusAU),'#702e20');}c.restore();
  }

  drawFlightReferenceGrid(body) {
    this.drawFlightSurfacePaths(body,surfaceMarkings(body.id),.7,1.3);
  }

  surfaceGeometryView(body) {
    const cached=this.surfaceViews?.get(body.id);if(cached)return cached;
    const frame=Flight.bodyFrame(body.id,this.state.date),center=this.spacePosition(body.id),radius=Flight.bodyRadiusAU(body.id)*this.displayBodyScale(),eye=Flight.sub(this.flight.position,center),distance=Flight.norm(eye),location={...this.bodySurfaceLocation(body.id),altitudeM:Math.max(2,(distance-radius)*Flight.AU_M)};
    const view={frame,center,radius,eye,distance,location,towardEye:Flight.unit(Flight.toBody(eye,frame)),minimum:radius/distance};
    this.surfaceViews?.set(body.id,view);return view;
  }

  visibleSurfaceSegment(a,b,view) {
    const da=dot(a,view.towardEye)-view.minimum,db=dot(b,view.towardEye)-view.minimum;
    if(da<-1e-12&&db<-1e-12)return null;
    if((da<0)!==(db<0)) {
      let lo=0,hi=1;for(let i=0;i<24;i++){const t=(lo+hi)/2,n=Flight.unit(a.map((v,j)=>v+(b[j]-v)*t));if((dot(n,view.towardEye)-view.minimum>=0)===(da>=0))lo=t;else hi=t;}
      const t=(lo+hi)/2,n=Flight.unit(a.map((v,j)=>v+(b[j]-v)*t));if(da<0)a=n;else b=n;
    }
    return [a,b];
  }

  surfaceVector(normal,view) {
    const {frame:f,radius:r,eye:e}=view,x=normal[0],y=normal[1],z=normal[2];
    // Preserve the exact operation order of fromBody→scale→sub→scale while
    // avoiding its seven intermediate vectors for every surface-grid endpoint.
    return [(((f.x[0]*x+f.y[0]*y)+f.z[0]*z)*r-e[0])*Flight.AU_M,(((f.x[1]*x+f.y[1]*y)+f.z[1]*z)*r-e[1])*Flight.AU_M,(((f.x[2]*x+f.y[2]*y)+f.z[2]*z)*r-e[2])*Flight.AU_M];
  }

  drawFlightSurfacePaths(body,paths,opacity,width=1) {
    const view=this.surfaceGeometryView(body),c=this.ctx;c.save();c.globalAlpha=opacity*this.surfaceOpacity(body.id);c.strokeStyle=this.palette.text;c.lineWidth=width;c.beginPath();
    for(const path of paths)for(let i=1;i<path.vectors.length;i++){const segment=this.visibleSurfaceSegment(path.vectors[i-1],path.vectors[i],view);if(segment)this.strokeFlightVectorSegment(this.surfaceVector(segment[0],view),this.surfaceVector(segment[1],view));}
    c.stroke();c.restore();
  }

  drawFlightSurfaceGrid(body) {
    const view=this.surfaceGeometryView(body),geometry=surfaceGridGeometry({spacing:finite(this.state.surfaceGridSpacing,10),viewLatitude:view.location.latitude,viewLongitude:view.location.longitude,capDegrees:Math.max(.000001,Math.acos(clamp(view.minimum,0,1))/RAD)});
    if(!this.renderedSurfaceGrids)this.renderedSurfaceGrids=new Map();this.renderedSurfaceGrids.set(body.id,geometry);
    this.drawFlightSurfacePaths(body,geometry.paths,clamp(finite(this.state.surfaceGridOpacity,.4),0,1),.7);
  }

  clipSurfacePatch(vectors,view) {
    if(view.minimum<=.8) {
      const visible=[];for(let i=0;i<vectors.length;i++){const a=vectors[i],b=vectors[(i+1)%vectors.length],da=dot(a,view.towardEye)-view.minimum,db=dot(b,view.towardEye)-view.minimum;if(da>=0)visible.push(a);if((da<0)!==(db<0)){const pair=this.visibleSurfaceSegment(a,b,view);if(pair)visible.push(da<0?pair[0]:pair[1]);}}return visible;
    }
    // A ground-level visible cap may sit entirely inside a texture polygon.
    // Gnomonic projection makes its great-circle edges straight; clipping the
    // polygon against a bounded cap approximation also retains containment.
    const basis=Flight.lookBasis(view.towardEye),radius=Math.sqrt(Math.max(0,1-view.minimum**2))/view.minimum;
    let front=[];for(let i=0;i<vectors.length;i++){const a=vectors[i],b=vectors[(i+1)%vectors.length],da=dot(a,view.towardEye)-1e-8,db=dot(b,view.towardEye)-1e-8;if(da>=0)front.push(a);if((da>=0)!==(db>=0)){const sum=Math.abs(da)+Math.abs(db);front.push(a.map((v,j)=>(v*Math.abs(db)+b[j]*Math.abs(da))/sum));}}
    let polygon=front.map(v=>{const z=dot(v,view.towardEye);return [dot(v,basis.right)/z,dot(v,basis.up)/z];});
    const count=96,apothem=radius*Math.cos(Math.PI/count);
    for(let i=0;i<count&&polygon.length;i++){const angle=(i+.5)*TAU/count,x=Math.cos(angle),y=Math.sin(angle),out=[];for(let j=0;j<polygon.length;j++){const a=polygon[j],b=polygon[(j+1)%polygon.length],da=apothem-a[0]*x-a[1]*y,db=apothem-b[0]*x-b[1]*y;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const sum=Math.abs(da)+Math.abs(db);out.push(a.map((v,k)=>(v*Math.abs(db)+b[k]*Math.abs(da))/sum));}}polygon=out;}
    return polygon.map(([x,y])=>Flight.unit(Flight.add(view.towardEye,Flight.add(Flight.scale(basis.right,x),Flight.scale(basis.up,y)))));
  }

  drawFlightEarthImagery(body) {
    const view=this.surfaceGeometryView(body),disk=this.surfaceDisks.get(body.id),points=disk?.polygon;if(!points?.length)return;
    const x=Math.max(0,Math.min(...points.map(p=>p.x))-2),y=Math.max(0,Math.min(...points.map(p=>p.y))-2),right=Math.min(this.width,Math.max(...points.map(p=>p.x))+2),bottom=Math.min(this.height,Math.max(...points.map(p=>p.y))+2);
    if(right<=x||bottom<=y)return;
    const raster=renderEarthImagery({width:this.width,height:this.height,camera:Flight.scale(Flight.toBody(view.eye,view.frame),1/view.radius),forward:Flight.toBody(this.forward,view.frame),right:Flight.toBody(this.right,view.frame),up:Flight.toBody(this.up,view.frame),focal:this.focal,style:this.state.earthMapStyle||'satellite',detail:Math.round(clamp(finite(this.state.earthImageDetail,75),0,this.motionDetail?35:100)),schematicDetail:this.state.earthTerrainDetail||'medium',light:Flight.toBody(Flight.unit(Flight.scale(view.center,-1)),view.frame),bounds:{x,y,width:right-x,height:bottom-y}});
    this.earthImageRaster=raster;const c=this.ctx;c.save();c.globalAlpha=this.surfaceOpacity('Earth');this.earthImagePainted=drawEarthImagery(c,raster);c.restore();
  }

  drawFlightEarthTerrain(body) {
    const view=this.surfaceGeometryView(body),geometry=earthSurfaceGeometry(this.state.land,{detail:this.state.earthTerrainDetail||'medium'}),c=this.ctx,light=Flight.unit(Flight.scale(view.center,-1));this.earthTerrainGeometry=geometry;
    c.save();c.globalAlpha=this.surfaceOpacity('Earth');
    for(const patch of geometry.patches){const visible=this.clipSurfacePatch(patch.vectors,view);if(visible.length<3)continue;
      const normal=Flight.unit(visible.reduce((sum,v)=>Flight.add(sum,v),[0,0,0])),illumination=.25+.75*Math.sqrt(Math.max(0,dot(Flight.fromBody(normal,view.frame),light))),rgb=patch.color.match(/[0-9a-f]{2}/gi)?.map(value=>Math.round(parseInt(value,16)*illumination));
      const color=rgb?.length===3?`rgb(${rgb.join(',')})`:patch.color;this.fillSkyPolygon(this.flightPolygon(visible.map(n=>this.surfaceVector(n,view))),color);
    }
    c.restore();
  }

  drawFlightSurfaceTexture(body) {
    const view=this.surfaceGeometryView(body),c=this.ctx;c.save();c.globalAlpha=clamp(finite(this.state.surfaceTextureOpacity,.55),0,1)*this.surfaceOpacity(body.id);
    for(const patch of surfaceTexture(body.id)) {
      c.globalAlpha=clamp(finite(this.state.surfaceTextureOpacity,.55),0,1)*this.surfaceOpacity(body.id)*clamp(finite(patch.opacity,1),0,1);
      const visible=this.clipSurfacePatch(patch.vectors,view);
      if(visible.length>2)this.fillSkyPolygon(this.flightPolygon(visible.map(n=>this.surfaceVector(n,view))),patch.tone==='light'?'#cbd4bf':'#384848');
    }
    c.restore();
  }

  drawFlightPin() {
    this.renderedSurfacePin=null;if(!this.isPinMode()||this.state.showSurfacePin===false||!this.state.surfacePin)return;
    const pin=this.state.surfacePin,body=this.bodies().find(body=>body.id===pin.bodyId);if(!body||!this.hasSurface(body.id))return;
    const view=this.surfaceGeometryView(body),geometry=surfacePinGeometry(pin,{frame:view.frame,center:view.center,radiusAU:view.radius});this.renderedSurfacePin=geometry;
    const rawHead=Flight.sub(Flight.scale(geometry.normal,view.radius+geometry.heightAU),view.eye),coincident=Flight.norm(rawHead)<=Math.max(.001/Flight.AU_M,view.distance*Number.EPSILON*16);
    const deltaTo=point=>point===geometry.head&&coincident?[0,0,0]:Flight.sub(Flight.scale(geometry.normal,view.radius+(point===geometry.head?geometry.heightAU:0)),view.eye);
    const visible=point=>{
      const delta=deltaTo(point),a=dot(delta,delta);if(a<1e-30)return false;
      for(const other of this.bodies()) {
        if(other.artificial||other.surfaceAvailable===false)continue;
        const offset=other.id===pin.bodyId?view.eye:Flight.sub(this.flight.position,this.spacePosition(other.id)),r=Flight.bodyRadiusAU(other.id),distance=Flight.norm(offset),b=dot(offset,delta),c=(distance-r)*(distance+r),disc=b*b-a*c;
        if(c<0||b>=0||disc<0)continue;const entry=c/(-b+Math.sqrt(disc));if(entry>0&&entry<1-1e-7)return false;
      }
      return true;
    };
    const relative=point=>Flight.scale(deltaTo(point),Flight.AU_M),baseVisible=visible(geometry.base),base=baseVisible?this.skyVectorProject(relative(geometry.base)):null,head=visible(geometry.head)?this.skyVectorProject(relative(geometry.head)):null;
    const onScreen=p=>p&&p.x>=0&&p.x<=this.width&&p.y>=0&&p.y<=this.height;
    if(!onScreen(base)&&!onScreen(head)&&!baseVisible)return;
    const c=this.ctx,stemColor=this.state.pinStemColor||'#ffcc74',pointColor=this.state.pinPointColor||'#ffdf9c';
    c.save();c.strokeStyle=stemColor;c.lineWidth=clamp(finite(this.state.pinStemWidth,2),.5,8);c.globalAlpha=clamp(finite(this.state.pinStemOpacity,.8),0,1);c.beginPath();
    if(baseVisible)this.strokeFlightVectorSegment(relative(geometry.base),relative(geometry.head));
    if(onScreen(base)) {
      // The physical pin ends at the eye and collapses to a point when viewed
      // straight down. This screen cue illustrates that attachment while its
      // far end remains the true perspective-projected surface footprint.
      const from={x:this.width/2,y:this.height},to={x:base.x,y:base.y};
      c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);geometry.screenStem={from,to,kind:'camera-anchored illustration'};
    }
    c.stroke();c.fillStyle=pointColor;c.strokeStyle=pointColor;c.globalAlpha=clamp(finite(this.state.pinPointOpacity,1),0,1);
    if(onScreen(base)){c.beginPath();c.arc(base.x,base.y,clamp(finite(this.state.pinPointSize,5),2,16),0,TAU);c.fill();geometry.projectedBase={x:base.x,y:base.y};}
    if(onScreen(head)){c.beginPath();c.arc(head.x,head.y,6,0,TAU);c.fill();geometry.projectedHead={x:head.x,y:head.y};}
    c.restore();
  }

  drawFlightCompass() {
    this.renderedCompass=null;if(!this.isPinMode())return;
    const t=this.flight.tether,local=Flight.surfaceFrame(t.latitude,t.longitude,Flight.bodyFrame(t.bodyId,this.state.date));
    const onboard=t.bodyId==='ISS',bearingName=onboard?issBearing:cardinal,directions=[[onboard?'Along-track':'N',local.north],[onboard?'Starboard':'E',local.east],[onboard?'Against-track':'S',Flight.scale(local.north,-1)],[onboard?'Port':'W',Flight.scale(local.east,-1)]];
    const c=this.ctx;c.save();c.fillStyle=this.palette.text;c.strokeStyle=this.palette.muted;c.globalAlpha=.9;c.textAlign='center';c.font='12px system-ui';
    const topInset=clamp(finite(this.state.compassTopInset),0,Math.max(0,this.height-75)),y=38+topInset,center=this.width/2,span=Math.min(360,this.width*.6),heading=wrap(t.heading),ticks=[];
    // A heading ribbon remains readable even when the true horizon is offscreen.
    // Its bearings are body-local geographic directions, never Galactic axes.
    for(let bearing=0;bearing<360;bearing+=onboard?90:45){const delta=((bearing-heading+540)%360)-180;if(Math.abs(delta)>75)continue;const x=center+delta*span/150;c.beginPath();c.moveTo(x,y-5);c.lineTo(x,y);c.stroke();c.fillText(bearingName(bearing),x,y+15);ticks.push({bearing,label:bearingName(bearing),x,y});}
    c.fillText(`${heading.toFixed(1)}° ${bearingName(heading)}`,center,y-13);
    this.renderedCompass={topInset,bodyId:t.bodyId,headingDegrees:heading,cardinal:bearingName(heading),reference:onboard?'illustrative ISS orbital frame':'true body-local north',directions:directions.map(([label,vector])=>({label,vector})),ticks};c.restore();
  }

  astrologyContextActive() {
    return this.state?.astrologyActive??((this.flight.tether?.bodyId??this.flight.followBody??this.state.selected)==='Earth');
  }

  astrologyEnabled() { return (this.state?.showAstrology===true||this.state?.showAstrology===undefined&&this.state?.astrologyActive===true)&&this.astrologyContextActive(); }

  astrologyObjectSettings(id) {
    return {point:this.state.showCelestialPoints!==false,stats:this.state.showPointStats!==false,longitude:this.state.showEclipticLongitudes===true};
  }

  astrologyGeometry() {
    if(!this.astrologyEnabled())return null;
    const observer=this.flight.tether?.bodyId==='Earth'?this.flight.tether:this.state.astrologyObserver??this.state.skyObserver??this.state;
    return getAstrologyGeometry(this.state.date,{latitude:finite(observer.latitude),longitude:finite(observer.longitude)},{bodies:this.bodies(),wedgeRadiusEarth:finite(this.state.zodiacRadiusEarth,5),eclipticRadiusEarth:finite(this.state.eclipticRadiusEarth,5),longitudeStepDegrees:finite(this.state.zodiacGridStep,10)});
  }

  earthRelativeVector(point) {
    return Flight.scale(Flight.sub(point,Flight.sub(this.flight.position,this.spacePosition('Earth'))),Flight.AU_M);
  }

  astrologyPointVisible(point,{opaqueEarth=false}={}) {
    if(!opaqueEarth&&this.surfaceOpacity('Earth')<1)return true;
    const eye=Flight.sub(this.flight.position,this.spacePosition('Earth')),delta=Flight.sub(point,eye),r=Flight.bodyRadiusAU('Earth'),distance=Flight.norm(eye),a=dot(delta,delta),b=dot(eye,delta),c=(distance-r)*(distance+r),disc=b*b-a*c;
    if(a<1e-30)return false;if(c<0||b>=0||disc<0)return true;
    const entry=c/(-b+Math.sqrt(disc));return entry<=0||entry>=1-1e-8;
  }

  astrologyPointOpacity(point) { return this.astrologyPointVisible(point,{opaqueEarth:true}) ? 1 : 1-this.surfaceOpacity('Earth'); }

  strokeAstrologyPath(points,{surface=false,behind=false}={}) {
    const eye=Flight.sub(this.flight.position,this.spacePosition('Earth')),range=Flight.norm(eye),radius=Flight.bodyRadiusAU('Earth'),towardEye=Flight.unit(eye),minimum=radius/range;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      if(surface) {
        // Solve the small visible cap analytically. At a two-metre altitude,
        // both sampled endpoints can be hidden while their arc crosses overhead.
        const u=Flight.unit(a),v=Flight.unit(b),angle=Math.acos(clamp(dot(u,v),-1,1));if(angle<1e-12)continue;
        const q=Flight.unit(Flight.sub(v,Flight.scale(u,Math.cos(angle)))),A=dot(u,towardEye),B=dot(q,towardEye),amplitude=Math.hypot(A,B);if(amplitude<minimum){if(behind)this.strokeFlightVectorSegment(this.earthRelativeVector(a),this.earthRelativeVector(b));continue;}
        const phase=Math.atan2(B,A),half=Math.acos(clamp(minimum/amplitude,-1,1)),cuts=[0,angle];
        for(let k=-1;k<=1;k++)for(const value of [phase-half+k*TAU,phase+half+k*TAU])if(value>0&&value<angle)cuts.push(value);
        cuts.sort((x,y)=>x-y);const at=t=>Flight.scale(Flight.add(Flight.scale(u,Math.cos(t)),Flight.scale(q,Math.sin(t))),radius);
        for(let j=1;j<cuts.length;j++){const middle=(cuts[j-1]+cuts[j])/2;if((A*Math.cos(middle)+B*Math.sin(middle)>=minimum-1e-14)!==behind)this.strokeFlightVectorSegment(this.earthRelativeVector(at(cuts[j-1])),this.earthRelativeVector(at(cuts[j])));}
      } else {
        const visible=p=>this.astrologyPointVisible(p,{opaqueEarth:true})!==behind;
        let first=a,last=b,va=visible(a),vb=visible(b);if(!va&&!vb)continue;
        if(va!==vb){let lo=0,hi=1;for(let j=0;j<30;j++){const t=(lo+hi)/2,p=a.map((n,k)=>n+(b[k]-n)*t);if(visible(p)===va)lo=t;else hi=t;}const p=a.map((n,k)=>n+(b[k]-n)*(lo+hi)/2);if(va)last=p;else first=p;}
        this.strokeFlightVectorSegment(this.earthRelativeVector(first),this.earthRelativeVector(last));
      }
    }
  }

  updateAstrologyPick(point,selected=false,{redraw=true}={}) {
    if(redraw)this.hoverPoint=point?{x:point.x,y:point.y}:null;
    let pick=null;
    if(point&&this.astrologyEnabled()) {
      const hit=[...this.astrologyHits].reverse().find(hit=>Math.hypot(point.x-hit.x,point.y-hit.y)<10);
      if(hit)pick={...hit.data,kind:'point',selected};
      else if(this.state.showZodiacGrid!==false&&this.astrologyVolume){const direction=Flight.unit(Flight.add(this.forward,Flight.add(Flight.scale(this.right,(point.x-this.width/2)/this.focal),Flight.scale(this.up,(this.height/2-point.y)/this.focal)))),origin=Flight.sub(this.flight.position,this.spacePosition('Earth'));
        const coordinate=pickAstrologyCoordinate(this.state.date,origin,direction,this.astrologyVolume.radiusAU);if(coordinate&&this.astrologyPointVisible(coordinate.position))pick={...coordinate,kind:'coordinate',selected};}
    }
    if(selected)this.selectedAstrologyPoint=pick?.kind==='point'?pick.id:null;
    if(!pick&&this.astrologyEnabled()&&this.selectedAstrologyPoint){const data=this.astrologyVolume?.points.find(p=>p.id===this.selectedAstrologyPoint);if(data)pick={...data,kind:'point',selected:true};}
    const changed=this.astrologyPick?.id!==pick?.id;this.astrologyPick=pick;
    const signature=pick?`${timeKey(this.state.date)}|${pick.kind}|${pick.id??''}|${pick.longitudeDeg}|${pick.latitudeDeg}|${pick.altitude??''}|${pick.azimuth??''}|${pick.selected}`:'none';
    if(signature!==this.astrologyPickSignature){this.astrologyPickSignature=signature;this.onAstrologyPick(pick);}
    if(changed&&point&&redraw)this.redraw();return pick;
  }

  drawFlightZodiac(layer='all') {
    const geometry=this.astrologyGeometry();this.astrologyVolume=geometry;this.astrologyHits=[];
    if(!geometry){this.zodiacVolume=null;this.updateAstrologyPick(null,false,{redraw:false});return;}
    const {volume}=geometry,c=this.ctx,opacity=clamp(finite(this.state.zodiacOpacity,.16),0,1),color=this.state.zodiacColor||'#dcad65';
    this.zodiacVolume=volume;this.zodiacData=zodiacAt(this.state.date,finite(this.state.latitude),finite(this.state.longitude));
    const relative=p=>this.earthRelativeVector(p);
    if(layer==='fill')return;
    const lines=(paths,stroke,alpha,width=1)=>{c.save();c.strokeStyle=stroke;c.lineWidth=width;for(const behind of [true,false]){c.globalAlpha=alpha*(behind?1-this.surfaceOpacity('Earth'):1);if(c.globalAlpha<=0)continue;c.beginPath();for(const path of paths)this.strokeAstrologyPath(path.points??path,{surface:path.kind==='surface',behind});c.stroke();}c.restore();};
    if(this.state.showZodiacOutline!==false)lines(geometry.outlines,color,Math.max(.35,opacity),1.2);
    if(this.state.showZodiacGrid===true)lines(geometry.longitudeGrid,this.state.zodiacGridColor||color,clamp(finite(this.state.zodiacGridOpacity,.5),0,1),clamp(finite(this.state.zodiacGridWidth,1),.1,8));
    if(this.state.showEclipticRing!==false)lines([geometry.eclipticRing],this.state.eclipticColor||'#e5c56c',clamp(finite(this.state.eclipticOpacity,.5),0,1),1.5);
    const objectColor=id=>this.bodies().find(body=>body.id===id)?.color||color;
    for(const longitude of geometry.longitudes)if(this.astrologyObjectSettings(longitude.id).longitude)lines([longitude.points],objectColor(longitude.id),clamp(finite(this.state.zodiacGridOpacity,.5),0,1),clamp(finite(this.state.zodiacGridWidth,1),.1,8));
    if(this.state.showEclipticLongitudes===true&&this.state.showLongitudePoints!==false)for(const data of geometry.longitudePoints){
      if(!this.astrologyPointVisible(data.position))continue;const point=this.skyVectorProject(relative(data.position));if(!point||point.x<0||point.x>this.width||point.y<0||point.y>this.height)continue;
      c.save();c.globalAlpha=this.astrologyPointOpacity(data.position);c.fillStyle=objectColor(data.id);c.beginPath();c.arc(point.x,point.y,3,0,TAU);c.fill();c.restore();
      this.astrologyHits.push({x:point.x,y:point.y,data:{...data,longitudePoint:true}});
    }
    if(this.state.showZodiacLabels!==false)for(const sector of volume.sectors){const point=this.skyVectorProject(relative(sector.labelPosition));if(point&&point.depth>0&&this.astrologyPointVisible(sector.labelPosition))this.drawLabel(sector.sign,point.x,point.y,0,false,{category:'zodiac',priority:55,size:11,color,opacity:this.astrologyPointOpacity(sector.labelPosition)});}
    if(this.state.showCelestialPoints!==false||this.state.showPointStats!==false)for(const data of geometry.points){if(!this.astrologyPointVisible(data.position))continue;const point=this.skyVectorProject(relative(data.position));if(!point||point.x<0||point.x>this.width||point.y<0||point.y>this.height)continue;
      const pointColor=objectColor(data.id),pointOpacity=this.astrologyPointOpacity(data.position);
      if(this.state.showCelestialPoints!==false&&this.astrologyObjectSettings(data.id).point){this.astrologyHits.push({x:point.x,y:point.y,data});c.save();c.globalAlpha=pointOpacity;c.fillStyle=pointColor;c.beginPath();c.arc(point.x,point.y,4,0,TAU);c.fill();c.restore();}
      if(this.state.showPointStats!==false&&this.astrologyObjectSettings(data.id).stats){const expanded=data.id===this.astrologyPick?.id||data.id===this.selectedAstrologyPoint,text=`${data.label}: ${data.sign} ${data.degree.toFixed(expanded?5:2)}°${expanded?` · λ ${data.longitudeDeg.toFixed(5)}° · β ${data.latitudeDeg.toFixed(5)}°`:''}`;this.drawLabel(text,point.x,point.y,5,expanded,{category:'astrology-point',key:`astrology-point:${data.id}`,required:true,priority:120,size:11,color:pointColor,opacity:pointOpacity});}
    }
    // Playback and camera motion refresh hover/selection coordinates without
    // issuing a camera command or recursively scheduling another draw.
    this.updateAstrologyPick(this.hoverPoint,false,{redraw:false});
  }

  surfaceOpacity(id) {
    return bodySurfaceOpacity(this.state,id);
  }

  cityVisibility(city,globeRadiusPixels) {
    const rank=clamp(finite(city.labelRank,finite(city.rank,6)),0,10),dot=smoothstep(28+rank*7,100+rank*28,globeRadiusPixels),label=smoothstep(55+rank*18,170+rank*45,globeRadiusPixels);
    return {dot,label,radius:.5+dot};
  }

  drawFlightEarthMap() {
    const physical=this.earthFlightLocation();if(!physical)return;const body=this.bodyCache.byId.get('Earth'),view=this.surfaceGeometryView(body),earth={...physical,altitudeM:Math.max(2,(view.distance-view.radius)*Flight.AU_M)};if(earth.altitudeM>1e12||view.radius>=view.distance)return;
    const displayScale=this.displayBodyScale(),mapHeight=earth.altitudeM/displayScale;
    const key=`${view.radius}|`+`${earth.latitude.toFixed(7)}|${earth.longitude.toFixed(7)}|${earth.altitudeM.toPrecision(7)}`;
    if(this.flightMapCache?.key!==key||this.flightMapCache.land!==this.state.land||this.flightMapCache.cities!==this.state.cities) {
      this.flightMapCache={key,land:this.state.land,cities:this.state.cities,map:buildSurfaceMap({latitude:earth.latitude,longitude:earth.longitude,land:this.state.land,cities:this.state.cities,visualRadiusM:Flight.bodyRadiusAU('Earth')*Flight.AU_M,eyeHeightM:mapHeight,maxStepDegrees:mapHeight>1e7?2:.5})};
    }
    const {local}=earth,toVector=p=>{const x=p[0]*displayScale,y=p[1]*displayScale,z=p[2]*displayScale-earth.altitudeM;return [local.east[0]*x+local.north[0]*y+local.normal[0]*z,local.east[1]*x+local.north[1]*y+local.normal[1]*z,local.east[2]*x+local.north[2]*y+local.normal[2]*z];};
    const c=this.ctx,opacity=this.surfaceOpacity('Earth');c.save();c.strokeStyle=this.palette.text;c.globalAlpha=.5*opacity;c.lineWidth=.8;c.beginPath();
    if(this.state.showSurfaceMap!==false) for(const [a,b] of this.flightMapCache.map.segments) this.strokeFlightVectorSegment(toVector(a),toVector(b));
    c.stroke();c.globalAlpha=opacity;
    const globeRadiusPixels=this.focal*view.radius/Math.max(view.radius,view.distance);this.renderedCities=[];this.cityLod={globeRadiusPixels};
    if(this.state.showCities!==false)for(const city of this.flightMapCache.map.cities) {
      const visibility=this.cityVisibility(city,globeRadiusPixels);if(visibility.dot<=0)continue;
      const point=this.skyVectorProject(toVector(city.position));if(!point||point.x<8||point.y<8||point.x>this.width-8||point.y>this.height-8)continue;
      c.globalAlpha=opacity*visibility.dot;c.fillStyle=this.palette.text;c.beginPath();c.arc(point.x,point.y,visibility.radius,0,TAU);c.fill();this.renderedCities.push({id:city.id,...point,...visibility});
      if(this.state.labels!==false&&visibility.label>0)this.drawLabel(city.name,point.x,point.y,visibility.radius,false,{category:'city',priority:50-finite(city.labelRank),size:10,opacity:opacity*visibility.label});
    }
    c.restore();
  }

  strokeFlightVectorSegment(a,b) {
    this.strokeCameraSegment(dot(a,this.right),dot(a,this.up),dot(a,this.forward),dot(b,this.right),dot(b,this.up),dot(b,this.forward));
  }

  strokeCameraSegment(ax,ay,az,bx,by,bz) {
    const near=1e-9,hx=this.width/(2*this.focal),hy=this.height/(2*this.focal);
    for(let plane=0;plane<5;plane++){
      const da=plane===0?az-near:plane===1?ax+hx*az:plane===2?hx*az-ax:plane===3?ay+hy*az:hy*az-ay,db=plane===0?bz-near:plane===1?bx+hx*bz:plane===2?hx*bz-bx:plane===3?by+hy*bz:hy*bz-by;
      if(da<0&&db<0)return;
      if((da>=0)!==(db>=0)){
        const sum=Math.abs(da)+Math.abs(db),wa=Math.abs(db)/sum,wb=Math.abs(da)/sum;let x=ax*wa+bx*wb,y=ay*wa+by*wb,z=az*wa+bz*wb;
        if(plane===0)z=near;else if(plane===1)x=-hx*z;else if(plane===2)x=hx*z;else if(plane===3)y=-hy*z;else y=hy*z;
        if(da<0){ax=x;ay=y;az=z;}else{bx=x;by=y;bz=z;}
      }
    }
    this.ctx.moveTo(clamp(this.width/2+this.focal*ax/Math.max(near,az),0,this.width),clamp(this.height/2-this.focal*ay/Math.max(near,az),0,this.height));this.ctx.lineTo(clamp(this.width/2+this.focal*bx/Math.max(near,bz),0,this.width),clamp(this.height/2-this.focal*by/Math.max(near,bz),0,this.height));
  }

  orbitMayBeVisible(body) {
    if(body.provider!=='mean-elements'||!body.relativePosition||!(body.orbitAU>0)||!Number.isFinite(body.eccentricity))return true;
    this.meanOrbitShapes??=new Map();let shape=this.meanOrbitShapes.get(body.id);
    if(!shape){const source=meanOrbitShape(body.id);shape={center:eclipticToGalactic(source.centerRelative),a:eclipticToGalactic(source.axisA),b:eclipticToGalactic(source.axisB)};this.meanOrbitShapes.set(body.id,shape);}
    // Translate by the same live/model offset as the orbital guide. Only this
    // frozen provider has a guaranteed conic; cached/dynamic curves bypass it.
    const origin=eclipticToGalactic(body.position.map((v,i)=>v-body.relativePosition[i])),eye=this.flight.position,center=[origin[0]+shape.center[0]-eye[0],origin[1]+shape.center[1]-eye[1],origin[2]+shape.center[2]-eye[2]],camera=v=>[dot(v,this.right),dot(v,this.up),dot(v,this.forward)];
    return ellipseMayEnterView(camera(center),camera(shape.a),camera(shape.b),(this.width/2+2)/this.focal,(this.height/2+2)/this.focal,{margin:Math.max(1e-12,body.orbitAU*1e-10)});
  }

  drawFlightMilkyWay() {
    this.renderedMilkyWay=null;if(this.state.showMilkyWay===false)return;
    const opacity=clamp(finite(this.state.milkyWayOpacity,.55),0,1);if(opacity===0)return;
    const model=milkyWayModel(this.state.milkyWayDetail||'medium'),key=timeKey(this.state.date)+'|'+finite(this.state.galacticYears)+'|'+model.detail,c=this.ctx;
    if(this.milkyBuffer?.model!==model)this.milkyBuffer={model,buffer:createMilkyWayPositionBuffer(model)};
    if(this.milkyWorld?.key!==key){const frame=createMilkyWayFrame(this.state.date,finite(this.state.galacticYears));this.milkyWorld={key,frame,...updateMilkyWayPositionBuffer(this.milkyBuffer.buffer,frame)};}
    const world=this.milkyWorld,frame=world.frame;
    const project=position=>{const v=Flight.sub(position,this.flight.position),depth=dot(v,this.forward);if(depth<=0)return null;const point={x:this.width/2+this.focal*dot(v,this.right)/depth,y:this.height/2-this.focal*dot(v,this.up)/depth,distancePc:Flight.norm(v)/GALACTIC_MODEL.pcInAU};return point.x>=0&&point.x<=this.width&&point.y>=0&&point.y<=this.height?point:null;};
    let visiblePoints=0,visibleClusters=0,annotationCircles=0;const labels=[];
    c.save();c.lineWidth=.8;c.strokeStyle='#91a7c4';c.globalAlpha=opacity*.07;c.beginPath();
    for(const arm of world.arms)this.strokeWorldPath(arm);c.stroke();
    for(let index=0;index<model.points.length;index++){
      const sample=model.points[index],point=project(world.points[index]);if(!point)continue;
      const limit=sample.component==='cluster'?MILKY_WAY_METADATA.clusterFadePc:MILKY_WAY_METADATA.fieldFadePc,fade=clamp((point.distancePc-limit)/limit,0,1);if(!fade)continue;
      const radius=sample.component==='cluster'?1.8:sample.component==='bulge'?1.1:.8;
      c.fillStyle=sample.color;c.globalAlpha=opacity*sample.weight*fade*(sample.component==='cluster'?.95:.32);c.fillRect(point.x-radius/2,point.y-radius/2,radius,radius);visiblePoints++;
    }
    for(let index=0;index<model.clusters.length;index++){
      const cluster=model.clusters[index],point=project(world.clusters[index]);if(!point||point.distancePc<MILKY_WAY_METADATA.clusterFadePc)continue;
      const radius=clamp(this.focal*(cluster.radiusPc||1)/Math.max(.01,point.distancePc),1.2,5);
      const color=cluster.type==='globular'?'#ffe0ae':'#b9deff',size=cluster.labelPriority>=50?2.2:1.6;c.globalAlpha=opacity*(cluster.labelPriority>=50?1:.7);c.fillStyle=color;c.fillRect(point.x-size/2,point.y-size/2,size,size);visibleClusters++;
      if(this.state.showClusterLabels===true){c.globalAlpha=opacity*(cluster.labelPriority>=50?.85:.3);c.strokeStyle=color;c.beginPath();c.arc(point.x,point.y,radius,0,TAU);c.stroke();annotationCircles++;labels.push({cluster,point,radius});}
    }
    labels.sort((a,b)=>b.cluster.labelPriority-a.cluster.labelPriority||a.point.distancePc-b.point.distancePc);
    const displayed=labels.slice(0,32);
    for(const {cluster,point,radius} of displayed)this.drawLabel(cluster.label,point.x,point.y,radius,false,{category:'cluster',priority:cluster.labelPriority>=50?45:15,size:10,color:cluster.type==='globular'?'#ffe0ae':'#b9deff'});
    c.restore();this.renderedMilkyWay={detail:model.detail,pointCount:model.pointCount,clusterCount:model.clusters.length,visiblePoints,visibleClusters,annotationCircles,labelCandidates:displayed.map(({cluster})=>cluster.id),frame,metadata:MILKY_WAY_METADATA};
  }

  drawFlightAsteroidBelt() {
    this.renderedAsteroidBelt=null;if(this.state.showAsteroidBelt===false)return;
    const extent=ASTEROID_BELT_METADATA.outerAU*this.focal/Math.max(ASTEROID_BELT_METADATA.outerAU,Flight.norm(this.flight.position)),opacity=.35*smoothstep(3,18,extent);
    if(opacity===0)return;
    const c=this.ctx,key=timeKey(this.state.date);if(this.beltWorld?.key!==key)this.beltWorld={key,points:asteroidBeltAt(this.state.date).map(sample=>({...sample,position:eclipticToGalactic(sample.position)}))};const points=this.beltWorld.points;let visible=0;
    c.save();c.fillStyle=this.palette.muted;
    for(const sample of points){
      const v=Flight.sub(sample.position,this.flight.position),depth=dot(v,this.forward);if(depth<=0)continue;
      const x=this.width/2+this.focal*dot(v,this.right)/depth,y=this.height/2-this.focal*dot(v,this.up)/depth;if(x<0||x>this.width||y<0||y>this.height)continue;
      c.globalAlpha=opacity*sample.brightness;c.fillRect(x-.5,y-.5,1,1);visible++;
    }
    c.restore();this.renderedAsteroidBelt={...ASTEROID_BELT_METADATA,visible};
  }

  drawFlightStars() {
    const {state,ctx:c}=this;if(!state.showStars&&!state.showConstellations&&!state.showConstellationNames)return;
    if(this.flightStars?.source!==state.stars){const stars=expandedStarCatalogue({stars:state.stars||[]});this.flightStars={source:state.stars,stars,buffer:createStellarPositionBuffer(stars)};}
    const stars=this.flightStars.stars,key=timeKey(state.date)+'|'+finite(state.galacticYears)+'|'+(state.showStellarMotion!==false);
    if(this.flightStars.key!==key){const frame=createStellarFrame(state.date,finite(state.galacticYears),state.showStellarMotion!==false);this.flightStars.key=key;this.flightStars.frame=frame;this.flightStars.positions=updateStellarPositionBuffer(this.flightStars.buffer,frame);}
    const positions=state.showConstellations||state.showConstellationNames?new Map():null,frame=this.flightStars.frame;
    this.stellarFrame=frame;c.save();c.fillStyle=this.palette.text;
    // The camera basis is already orthonormal for this draw; do not rebuild it for every star.
    const eye=this.flight.position,f=this.forward,r=this.right,u=this.up;
    const project=(position,clip=true)=>{const x=position[0]-eye[0],y=position[1]-eye[1],z=position[2]-eye[2],depth=x*f[0]+y*f[1]+z*f[2];if(depth<=0)return null;const sx=this.width/2+this.focal*(x*r[0]+y*r[1]+z*r[2])/depth,sy=this.height/2-this.focal*(x*u[0]+y*u[1]+z*u[2])/depth;if(clip&&(sx<0||sx>this.width||sy<0||sy>this.height))return null;return {x:sx,y:sy,depth,distance:Math.hypot(x,y,z)};};
    for(let index=0;index<stars.length;index++) {
      const star=stars[index],position=this.flightStars.positions[index];
      if(!position) { // Conventional line vertices have directions, not measured stellar locations or dots.
        positions?.set(String(star.id),Flight.add(this.flight.position,Flight.scale(star.direction,1000*GALACTIC_MODEL.pcInAU)));continue;
      }
      positions?.set(String(star.id),position);
      if(!state.showStars||star.render===false)continue;
      const point=project(position);if(!point)continue;
      const magnitude=finite(spatialStarMagnitude(star,point.distance),4);if(magnitude>7.5)continue;
      const radius=clamp(1.65-magnitude*.22,.45,2.8);c.globalAlpha=clamp(.9-(magnitude+1.5)*.08,.2,.95);c.beginPath();c.arc(point.x,point.y,radius,0,TAU);c.fill();
      if(state.labels!==false&&star.name&&magnitude<1.5)this.drawLabel(star.name,point.x,point.y,radius,false,{category:'star',priority:30,size:10});
    }
    if(state.showConstellations) {
      c.globalAlpha=.2;c.strokeStyle=this.palette.muted;c.lineWidth=.7;c.beginPath();
      for(const constellation of state.constellations||[])for(const line of constellation.lines||[])for(let i=1;i<line.length;i++){const a=positions.get(String(line[i-1])),b=positions.get(String(line[i]));if(a&&b)this.strokeWorldPath([a,b]);}
      c.stroke();
    }
    this.constellationAnchors=state.showConstellationNames?constellationLabelAnchors(state.constellations,positions):[];
    for(const anchor of this.constellationAnchors) {
      const point=project(anchor.position,false);if(point)this.drawLabel(anchor.name,point.x,point.y,0,false,{category:'constellation',priority:35,size:11});
    }
    c.restore();
  }

  drawFlight() {
    const {ctx:c,state,palette:p}=this,basis=Flight.lookBasis(this.flight.forward,this.flight.up);
    this.forward=basis.forward;this.right=basis.right;this.up=basis.up;this.focal=this.height/(2*Math.tan(this.fov*RAD/2));this.surfaceCenter=null;
    this.frameVisibility=new Map();this.frameVectors=new Map();this.frameEarthLocation=undefined;
    this.motionDetail=this.interactiveDetail();
    this.moonRequested=false;
    this.geometryRequested=new Set();this.geometryRasterStatus={};
    this.moonDetailRaster=null;this.moonDetailPainted=false;this.saturnRingShadow=null;this.renderedISSFootprint=null;this.surfaceViews=new Map();this.surfaceDisks=new Map();this.artificialMarkers=new Map();this.renderedISSModel=null;this.renderedSaturnRings=null;this.issOrbitGuide=null;this.renderedISSOrbit=null;this.moonOrbitGuide=null;this.renderedMoonOrbit=null;this.currentOrbitGuide=null;this.renderedCities=[];this.cityLod=null;this.renderedSurfaceGrids=new Map();this.earthTerrainGeometry=null;this.earthImageRaster=null;this.earthImagePainted=false;this.drawFlightMilkyWay();this.drawFlightStars();
    c.save();
    if(state.showSolarOrbit!==false) { c.globalAlpha=.25;c.strokeStyle=p.muted;c.lineWidth=.8;c.beginPath();this.strokeWorldPath(solarOrbitReference(state.date,361,finite(state.galacticYears)));c.stroke(); }
    if(state.showGalacticTrails!==false) {
      const data=this.elapsedFlightTrails();
      const renderedData={...data,tracks:data.tracks.map(track=>({...track,points:track.points.map((point,index)=>index===track.points.length-1?{...point,position:this.spacePosition(track.id)}:point)}))};
      this.recentSpaceTrails=renderedData;this.trailLOD={fullOrbit:true,elapsed:true,tracks:data.tracks.map(track=>({id:track.id,points:track.points.length}))};
      const selection=new Set(Array.isArray(state.trailBodies)?state.trailBodies:TRAIL_PLANETS);selection.add('Sun');
      for(const track of renderedData.tracks){if(!selection.has(track.id))continue;const body=this.bodies().find(b=>b.id===track.id);c.strokeStyle=body?.color||p.muted;c.globalAlpha=track.id===state.selected?.65:.3;c.lineWidth=track.id===state.selected?1.4:.8;c.beginPath();this.strokeWorldPath(track.points.map(point=>point.position));c.stroke();}
    }
    if((state.orbits!==false||state.showISSOrbit!==false||state.showMoonOrbit!==false)&&this.flightDistance()<1e5) {
      c.globalAlpha=.2;c.strokeStyle=p.muted;c.lineWidth=.8;
      const bodies=this.bodies(),core=state.orbits!==false?bodies.filter(body=>body.id!=='Sun'&&!moonParent(body)&&!body.artificial&&(!body.minorBody||state.showMinorBodies!==false)):[];
      // Keep every resolved guide that can enter the viewport. A guaranteed
      // frozen-ellipse bound rejects wholly offscreen curves before sampling.
      const moons=state.orbits!==false?bodies.filter(body=>body.id!=='Moon'&&moonParent(body)&&this.flightBodyVisibility(body).dot>0&&this.orbitMayBeVisible(body)).sort((a,b)=>Number(b.id===state.selected)-Number(a.id===state.selected)||finite(b.radiusKm)-finite(a.radiusKm)||a.id.localeCompare(b.id)):[];
      const artificial=state.showISSOrbit!==false?bodies.filter(body=>body.id==='ISS'):[];
      const earthMoon=state.showMoonOrbit!==false?bodies.filter(body=>body.id==='Moon'):[];
      const ids=[...core,...moons,...earthMoon,...artificial].map(body=>body.id);
      const guides=currentOrbitPaths(state.date,bodies,{cameraPosition:this.flight.position,focalPixels:this.focal,maxPoints:this.motionDetail?128:384,ids});this.currentOrbitGuide=guides;
      for(const guide of guides.tracks){
        if(guide.id==='ISS'){this.issOrbitGuide=guide;continue;}
        const body=this.bodyCache.byId.get(guide.id),vector=this.flightBodyVector(guide.id);
        if(this.flightApparent?.has(guide.id)){const displayCenter=Flight.add(this.flight.position,vector),delta=Flight.sub(displayCenter,this.spacePosition(guide.id));guide.displayPoints=guide.points.map(point=>Flight.add(point,delta));}
        else guide.displayPoints=guide.points;
        if(guide.id==='Moon'){this.moonOrbitGuide=guide;continue;}
        c.strokeStyle=body?.color||p.muted;c.globalAlpha=.2*(body?this.flightBodyVisibility(body).dot:1);c.beginPath();this.strokeWorldPath(guide.displayPoints);c.stroke();
      }
    }
    this.drawISSOrbit(false);
    this.drawFlightAsteroidBelt();
    const center=this.worldProject(this.spacePosition('Sagittarius A*'));c.globalAlpha=1;
    if(center.depth>0&&center.x>=0&&center.y>=0&&center.x<=this.width&&center.y<=this.height){c.strokeStyle=p.signal;c.beginPath();c.moveTo(center.x-5,center.y);c.lineTo(center.x+5,center.y);c.moveTo(center.x,center.y-5);c.lineTo(center.x,center.y+5);c.stroke();this.hits.push({id:'Sagittarius A*',...center,radius:12});if(state.labels!==false)this.drawLabel('Sagittarius A*',center.x,center.y,6,state.selected==='Sagittarius A*');}
    const placed=this.bodies().filter(body=>this.flightBodyVisibility(body).dot>0).map(body=>{const vector=this.flightBodyVector(body.id);return {body,vector,distance:Flight.norm(vector)};}).sort((a,b)=>b.distance-a.distance);
    for(const {body,vector} of placed)if(!body.artificial)this.drawFlightBody(body,vector);
    this.drawISSOrbit(true);
    this.drawMoonOrbit(true);
    // Spacecraft markers use explicit segment/sphere transmission. Draw them
    // after solid bodies so a near-limb center ordering cannot double-fade or
    // accidentally reveal a marker through an opaque horizon.
    for(const {body,vector} of placed)if(body.artificial)this.drawFlightArtificial(body,vector);
    this.drawFlightZodiac('overlays');
    this.drawFlightPin();this.drawFlightCompass();
    this.hoveredBody=this.getPointedBody();
    const hovered=this.hits.find(hit=>hit.id===this.hoveredBody);
    if(hovered&&hovered.id!==state.selected) {
      c.save();c.strokeStyle=p.signal;c.globalAlpha=.85;c.lineWidth=1.5;c.setLineDash?.([3,4]);c.beginPath();
      if(hovered.polygon?.length){hovered.polygon.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();}
      else c.arc(hovered.x,hovered.y,Math.max(10,hovered.radius)+5,0,TAU);
      c.stroke();c.restore();
    }
    c.restore();
    const camera=this.flightCamera();this.azimuth=camera.heading;this.elevation=camera.elevation;
    if(!this.moonRequested&&this.moonRasterClient.desired){this.moonRasterClient.invalidate();this.moonRasterStatus=null;}
    for(const [kind,client]of Object.entries(this.geometryRasterClients))if(!this.geometryRequested.has(kind)&&client.desired)client.invalidate();
    this.frameVisibility=null;this.frameVectors=null;this.frameEarthLocation=undefined;
  }

  destroy() {
    this.disposed = true;
    this.moonRasterClient.destroy();
    for(const client of Object.values(this.geometryRasterClients))client.destroy();
    this.cancelInputPaint();
    clearTimeout(this.refineTimer);this.refineTimer=null;
    this.cancelNavigation();
    this.cancelZoomAnimation();
    this.stopMovement();
    globalThis.removeEventListener?.('pagehide', this.pageHide);
    this.inputDocument?.removeEventListener?.('pointerlockchange',this.pointerLockChange);
    this.observer?.disconnect();
    for (const [name, handler, options] of this.listeners) this.canvas.removeEventListener(name, handler, options);
    this.listeners.length = 0;
    this.cancelPointerInput();this.bodyDistances=null;
  }
}
