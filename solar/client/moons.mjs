// Machine-authored Codex/OpenAI, 2026-09-30. Source bytes, extraction and limits:
// data-sources/moons/. JPL mean elements describe an orbit, not an ephemeris.
import catalogue from './data/moons.json' with { type: 'json' };
import { validatedDate, addTime, epochMilliseconds, positiveModulo } from './time.mjs';
import { Rotation_EQJ_ECL, RotationAxis, JupiterMoons } from './vendor/astronomy-engine-2.1.19.mjs';
import { cachedStateAt, getEphemerisMode } from './ephemeris-cache.mjs';
export const GALILEAN_IDS=Object.freeze(['Io','Europa','Ganymede','Callisto']);
export const GALILEAN_MODEL='Astronomy Engine 2.1.19 Galilean analytical model (L1.2-derived)';
const AU_KM = 149597870.7, RAD = Math.PI / 180, TAU = Math.PI * 2, DAY = 86400000;
const rotate = (m,v) => [0,1,2].map(j => m[0][j]*v[0]+m[1][j]*v[1]+m[2][j]*v[2]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = v => { const d=Math.hypot(...v); return v.map(x => x/d); };
const eclRotation = Rotation_EQJ_ECL().rot;
const colors = { Earth:'#dbdce4', Mars:'#b4a095', Jupiter:'#c9baa3', Saturn:'#d4c9ad', Uranus:'#b1cbd0', Neptune:'#acb8df', Pluto:'#bdb7ae' };
const epochDate = epoch => { const [day,fraction] = epoch.split('.'); return new Date(Date.parse(day+'T00:00:00.000Z')+Number('0.'+fraction)*DAY); };
export const MOON_COVERAGE = Object.freeze(catalogue.coverage);
export const MOON_MODEL = 'Illustrative frozen JPL mean-element ellipse; not a predicted satellite ephemeris';
export const MOONS = Object.freeze(catalogue.moons.map(m => Object.freeze({
  ...m, color:colors[m.parentId], orbitAU:m.aKm/AU_KM, semimajorAxisAU:m.aKm/AU_KM,
  measuredRadiusKm:m.radiusKm, radiusKm:m.radiusKm ?? 1, radiusEstimated:m.radiusKm === null,
  ...(m.radiusKm === null ? {displayRadiusKm:1} : {}),
  approximate:m.id !== 'Moon' && !GALILEAN_IDS.includes(m.id), sourceModel:m.id === 'Moon' ? 'Astronomy Engine lunar model' : GALILEAN_IDS.includes(m.id) ? GALILEAN_MODEL : MOON_MODEL,
})));
export const MOON_IDS = Object.freeze(MOONS.map(m => m.id));
export const EXTRA_MOONS = Object.freeze(MOONS.filter(m => m.id !== 'Moon'));
const byId = new Map(MOONS.map(m => [m.id,m]));
export function moonMetadata(id) { return byId.get(id) ?? null; }

// Plane x-axis is its ascending node on the ICRF equator, per JPL's legend.
// Equatorial rows omit a pole. Use the bundled IAU pole at J2000 for Pluto;
// Uranus uses the opposite IAU north pole, matching the prograde regular-moon
// plane explicitly tabulated for its adjacent Laplace rows (77.3°, +15.2°).
function referenceBasis(m) {
  if (m.referenceFrame === 'ecliptic') return [[1,0,0],[0,1,0],[0,0,1]];
  let ra=m.poleRaDeg, dec=m.poleDecDeg;
  if (m.referenceFrame === 'equatorial') {
    const axis=RotationAxis(m.parentId,new Date('2000-01-01T12:00:00Z'));
    ra=axis.ra*15; dec=axis.dec;
    if (m.parentId === 'Uranus') { ra=(ra+180)%360; dec=-dec; }
  }
  const a=ra*RAD,d=dec*RAD,z=[Math.cos(a)*Math.cos(d),Math.sin(a)*Math.cos(d),Math.sin(d)];
  const x=[-Math.sin(a),Math.cos(a),0],y=cross(z,x);
  return [x,y,z].map(v=>rotate(eclRotation,v));
}
const orbits = new Map(MOONS.map(m => {
  const reference=referenceBasis(m), n=m.nodeDeg*RAD,i=m.inclinationDeg*RAD,w=m.periapsisDeg*RAD;
  const transform = v => reference[0].map((x,k)=>x*v[0]+reference[1][k]*v[1]+reference[2][k]*v[2]);
  const x=transform([Math.cos(n),Math.sin(n),0]);
  const y=transform([-Math.sin(n)*Math.cos(i),Math.cos(n)*Math.cos(i),Math.sin(i)]);
  return [m.id,{m,epoch:BigInt(epochDate(m.epochTDB).getTime()),period:BigInt(Math.round(m.periodDays*DAY)),eccentricityRoot:Math.sqrt(1-m.eccentricity*m.eccentricity),
    u:x.map((v,k)=>v*Math.cos(w)+y[k]*Math.sin(w)),v:y.map((v,k)=>v*Math.cos(w)-x[k]*Math.sin(w)),normal:unit(cross(x,y))}];
}));
function orbitFor(id) { const orbit=orbits.get(id); if(!orbit)throw new RangeError('Unknown moon: '+id); return orbit; }
function eccentricAnomaly(mean,e) {
  let low=0,high=TAU,E=mean;
  // Bracketed Newton avoids instability for the most eccentric irregulars.
  for(let n=0;n<32;n++) { const f=E-e*Math.sin(E)-mean;if(Math.abs(f)<1e-13)break;if(f>0)high=E;else low=E;const next=E-f/(1-e*Math.cos(E));E=next>low&&next<high?next:(low+high)/2; }
  return E;
}
const pointAtE = (orbit,E) => { const {m,u,v}=orbit,x=m.orbitAU*(Math.cos(E)-m.eccentricity),y=m.orbitAU*orbit.eccentricityRoot*Math.sin(E); return u.map((a,k)=>a*x+v[k]*y); };
/** Parent-relative, mean ecliptic/equinox J2000 AU. UTC approximates table TDB;
 * phases, axes and scale are illustrations, with no claimed positional bound.
 * Exact-calendar modulo keeps remote-date geometry finite. */
export function meanSatellitePositionAt(id,value) {
 return meanPosition(orbitFor(id),epochMilliseconds(value));
}
function meanPosition(orbit,epoch){
 const phase=Number(positiveModulo(epoch-orbit.epoch,orbit.period))/Number(orbit.period);
 const mean=((orbit.m.meanAnomalyDeg*RAD+phase*TAU)%TAU+TAU)%TAU;
 return pointAtE(orbit,eccentricAnomaly(mean,orbit.m.eccentricity));
}
let galileanTime=null,galileanStates=null;
const GALILEAN_START=BigInt(Date.parse('1800-01-01T00:00:00Z')),GALILEAN_END=BigInt(Date.parse('2201-01-01T00:00:00Z'));
function satelliteState(id,date,epoch,mode){
 const cached=mode==='cached'?cachedStateAt(id,epoch):null;
 if(cached&&cached.parentId)return cached;
 if(GALILEAN_IDS.includes(id)&&epoch>=GALILEAN_START&&epoch<GALILEAN_END){
  if(galileanTime!==Number(date)){galileanTime=Number(date);galileanStates=JupiterMoons(date);}
  const v=galileanStates[id.toLowerCase()];return {position:rotate(eclRotation,[v.x,v.y,v.z]),velocityAUPerDay:rotate(eclRotation,[v.vx,v.vy,v.vz]),parentId:'Jupiter',provider:'galilean',cacheKey:'ae-2.1.19-galileans',coverage:null,sourceModel:GALILEAN_MODEL,illustrative:false};
 }
 const orbit=orbitFor(id);return {position:meanPosition(orbit,epoch),parentId:orbit.m.parentId,provider:'mean-elements',cacheKey:'jpl-mean-elements-2026',coverage:null,sourceModel:MOON_MODEL,illustrative:true};
}
export function satelliteStateAt(id,value){const date=validatedDate(value);return satelliteState(id,date,epochMilliseconds(date),getEphemerisMode());}
/** Batch identical-date moons so calendar validation and exact epoch conversion
 * happen once. Every body retains its original model and full precision. */
export function satelliteStatesAt(ids,value){
 if(!Array.isArray(ids))throw new TypeError('Moon IDs must be an array');
 const date=validatedDate(value),epoch=epochMilliseconds(date),mode=getEphemerisMode();
 return ids.map(id=>satelliteState(id,date,epoch,mode));
}
export function satellitePositionAt(id,value){return satelliteStateAt(id,value).position;}
/** Frozen ellipse, parent-relative ecliptic AU, includes its repeated endpoint. */
export function satelliteOrbitPath(id,value,{steps=128}={}) {
  const date=validatedDate(value), orbit=orbitFor(id);
  if(!Number.isInteger(steps)||steps<16||steps>1024)throw new RangeError('Moon orbit steps must be 16…1024');
  if(satelliteStateAt(id,date).provider!=='mean-elements')return Array.from({length:steps+1},(_,k)=>satellitePositionAt(id,addTime(date,(k/steps-.5)*orbit.m.periodDays*DAY)));
  return Array.from({length:steps+1},(_,k)=>pointAtE(orbit,TAU*k/steps));
}
/** Generic synchronous drawing frame. This does not claim a measured satellite
 * spin or cartographic longitude, especially for irregular/tumbling moons. */
export function satelliteFrameAt(id,value) {
  const orbit=orbitFor(id),state=satelliteStateAt(id,value),x=unit(state.position).map(v=>-v),normal=state.velocityAUPerDay?unit(cross(state.position,state.velocityAUPerDay)):orbit.normal,y=unit(cross(normal,x)),z=unit(cross(x,y));
  return {x,y,z,illustrative:true,description:'Illustrative synchronous orientation; no cartographic accuracy'};
}
