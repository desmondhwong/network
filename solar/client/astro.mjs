// Machine-authored by Codex (OpenAI), 2026-09-05, under 260905-115339-001/solar-system-0.2.
// Astronomy Engine 2.1.19 wrapper. Imported dependency and full MIT license are
// recorded in vendor/astronomy-engine-README.md. No runtime network is required.
// Its upstream accuracy target is about 1 arcminute; remote dates are unvalidated.
// Planetary GeoVector uses light-time and aberration; its Moon path uses GeoMoon
// directly. UTC approximates UT1; TT uses the vendor's modeled Espenak/Meeus ΔT.
import * as Astronomy from './vendor/astronomy-engine-2.1.19.mjs';
import { validatedDate, accuracyAt, eclipseAvailableAt, JPL_MAX_TIME, engineAvailableAt, modelDate, addTime, differenceMillis } from './time.mjs';
import { illustrativeHelioAt, illustrativeGeoAt, ILLUSTRATIVE_FRAME } from './remote-model.mjs';
import { EXTRA_MOONS, moonMetadata, satelliteStateAt, satelliteStatesAt } from './moons.mjs';
import {cachedStateAt,getEphemerisMode} from './ephemeris-cache.mjs';
import {MINOR_BODIES,minorBodyMetadata,minorBodyStateAt} from './minor-bodies.mjs';
export {MINOR_BODIES,MINOR_BODY_IDS} from './minor-bodies.mjs';
export {setEphemerisMode,getEphemerisMode,getPositionProviderRevision} from './ephemeris-cache.mjs';
export { MOONS, MOON_IDS, MOON_COVERAGE } from './moons.mjs';
export { validatedDate, MIN_YEAR, MAX_YEAR, MIN_DATE, MAX_DATE } from './time.mjs';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86400000;
const AU_KM = Astronomy.KM_PER_AU;
const clamp = n => Math.max(-1, Math.min(1, n));
const norm = n => ((n % 360) + 360) % 360;
const signed = n => norm(n + 180) - 180;
const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
const xyz = v => [v.x, v.y, v.z];
const eclipticJ2000 = v => xyz(Astronomy.RotateVector(EQJ_TO_ECL, v));

export const EPHEMERIS = Object.freeze({
  name: 'Astronomy Engine', version: '2.1.19',
  accuracy: 'Upstream target about 1 arcminute near the modern epoch; remote dates are unvalidated analytical extrapolations. No guaranteed error bound.',
  positionFrame: 'Heliocentric mean ecliptic/equinox J2000, AU; geometric',
  geoPositionFrame: 'Geocentric mean ecliptic/equinox J2000, AU; vendor apparent vector',
  longitudeFrame: 'Geocentric true ecliptic/equinox of date (tropical), degrees',
  horizontalFrame: 'Topocentric true equator/equinox of date to local horizon; north=0°, east=90°',
  timeBasis: 'UTC approximates UT1; TT from Espenak/Meeus modeled ΔT; no live Earth-orientation parameters',
  source: 'https://github.com/cosinekitty/astronomy/releases/tag/v2.1.19',
});

export const SIGNS = Object.freeze(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
export const BODIES = Object.freeze([
  { id: 'sun', name: 'Sun', color: '#ffd58a', radiusKm: 695700, orbitAU: 0 },
  { id: 'mercury', name: 'Mercury', color: '#bdb7ad', radiusKm: 2439.7, orbitAU: 0.387098 },
  { id: 'venus', name: 'Venus', color: '#dfba78', radiusKm: 6051.8, orbitAU: 0.72333 },
  { id: 'earth', name: 'Earth', color: '#6aaee8', radiusKm: 6371, orbitAU: 1 },
  { id: 'moon', name: 'Moon', color: '#dbdce4', radiusKm: 1737.4, orbitAU: 0.00257, semimajorAxisAU: 384400 / AU_KM, parentId:'Earth' },
  { id: 'mars', name: 'Mars', color: '#e18567', radiusKm: 3389.5, orbitAU: 1.523688 },
  { id: 'jupiter', name: 'Jupiter', color: '#d3b298', radiusKm: 69911, orbitAU: 5.20256 },
  { id: 'saturn', name: 'Saturn', color: '#d9c697', radiusKm: 58232, orbitAU: 9.55475 },
  { id: 'uranus', name: 'Uranus', color: '#8bcbd2', radiusKm: 25362, orbitAU: 19.18171 },
  { id: 'neptune', name: 'Neptune', color: '#748cec', radiusKm: 24622, orbitAU: 30.05826 },
  // Mean radius: https://ssd.jpl.nasa.gov/planets/phys_par.html (1188.3 km).
  // The orbit radius is a nominal display scale; positions use the ephemeris.
  { id: 'pluto', name: 'Pluto', color: '#c8b3a4', radiusKm: 1188.3, orbitAU: 39.48 },
].map(body => Object.freeze({ ...body, id: body.name })));
// Core ephemeris / astrology bodies remain stable; satellites are an explicit
// visual catalogue so neither Horizons requests nor aspects grow quadratically.
export const ALL_BODIES = Object.freeze([...BODIES, ...EXTRA_MOONS, ...MINOR_BODIES]);
const bodiesById = new Map(ALL_BODIES.map(body => [body.id.toLowerCase(), body]));

function bodyFor(value) {
  const body = bodiesById.get(String(value).toLowerCase());
  if (!body) throw new RangeError(`Unknown body: ${value}`);
  return body;
}

export function bodyEngineAvailableAt(id, value) {
  id = bodyFor(id).id;
  const date = validatedDate(value);
  if ((id !== 'Moon' && moonMetadata(id)) || minorBodyMetadata(id)) return false;
  if (!engineAvailableAt(date)) return false;
  // The vendor caches Pluto within TT ±730000 days from J2000. Beyond that
  // it integrates from the nearest endpoint on every call. Bound interactive
  // work and keep a day of margin for apparent light-time/retrograde samples.
  return id !== 'Pluto' || Math.abs(Astronomy.MakeTime(date).tt) <= 729999;
}

function illustrativeBodyGeoAt(id, date) {
  if (!engineAvailableAt(date)) {const p=positionProviderAt(id,date).position,e=positionProviderAt('Earth',date).position;return p.map((x,i)=>x-e[i]);}
  const earth = positionProviderAt('Earth',date).position;
  return helioPositionsAt(date,[id])[0].position.map((x, i) => x - earth[i]);
}

/** Fast trail samples: [{id, position:[x,y,z]}], geometric heliocentric J2000 ecliptic AU. */
export function helioPositionsAt(value, ids = BODIES.map(body => body.id)) {
  const date=validatedDate(value);if(!Array.isArray(ids))throw new TypeError('Body IDs must be an array.');
  const cache=new Map();return ids.map(id=>({id:bodyFor(id).id,...providerFor(bodyFor(id),date,cache)}));
}
/** The geometric display provider; astrology and apparent sky retain their
 * separately labeled local engine. Cached samples never extrapolate. */
export function positionProviderAt(id,value){return {id:bodyFor(id).id,...providerFor(bodyFor(id),validatedDate(value),new Map())};}
function providerFor(body,date,memo){
 if(memo.has(body.id))return memo.get(body.id);
 const mode=getEphemerisMode(),cached=mode==='cached'?cachedStateAt(body.id,date):null;
 let result;
 if(cached){result={...cached};if(cached.parentId){const parent=providerFor(bodyFor(cached.parentId),date,memo);result.relativePosition=[...cached.position];result.position=cached.position.map((x,i)=>x+parent.position[i]);result.parentProvider=parent.provider;}}
 else if(body.minorBody)result=minorBodyStateAt(body.id,date);
 else if(body.parentId&&body.id!=='Moon'){const state=satelliteStateAt(body.id,date),parent=providerFor(bodyFor(body.parentId),date,memo);result={...state,relativePosition:[...state.position],position:state.position.map((x,i)=>x+parent.position[i]),parentProvider:parent.provider};}
 else {const available=bodyEngineAvailableAt(body.id,date);result={position:available?eclipticJ2000(Astronomy.HelioVector(body.id,Astronomy.MakeTime(date))):illustrativeHelioAt(body.id,date),provider:available?'local':'illustrative',cacheKey:available?'ae-2.1.19':'remote-illustration',coverage:null,sourceModel:available?'Astronomy Engine 2.1.19':'Remote-date orbital illustration',illustrative:!available};
  if(body.id==='Moon'){const earth=providerFor(bodyFor('Earth'),date,memo);result.parentId='Earth';result.relativePosition=available?eclipticJ2000(Astronomy.GeoMoon(date)):illustrativeGeoAt('Moon',date);result.position=result.relativePosition.map((x,i)=>x+earth.position[i]);}}
 result={...result,cacheStatus:mode==='cached'?(cached?'covered':'fallback; no cached target at this date'):'local mode'};
 memo.set(body.id,result);return result;
}
function applyPositionProvider(bodies,date,memo=new Map()){
 return bodies.map(body=>{const p=providerFor(body,date,memo);return {...body,...p,skySourceModel:'Astronomy Engine apparent sky; independent of geometric cache',corrections:body.corrections+(p.provider==='cached'?'; cached geometry is geometric, without light-time or aberration':'')};});
}

function apparentAt(body, time) {
  const vector = Astronomy.GeoVector(body.id, time, true);
  const ecl = body.id === 'Earth' ? null : Astronomy.Ecliptic(vector);
  return { vector, longitude: ecl ? norm(ecl.elon) : null, latitude: ecl ? ecl.elat : null };
}

/** Geometry in fixed J2000 ecliptic axes; separate tropical-of-date angles for alignments. */
export function stateAt(value,{includeMoons=false}={}) {
  const date = validatedDate(value);
  if (!engineAvailableAt(date)) { const core=applyPositionProvider(illustrativeStateAt(date),date); return includeMoons?appendMoons(core,date):core; }
  const time = Astronomy.MakeTime(date);
  const { extrapolated } = accuracyAt(date);
  const before = time.AddDays(-0.5), after = time.AddDays(0.5), providerMemo=new Map();
  const core = BODIES.map(body => {
    if (!bodyEngineAvailableAt(body.id, date)) return illustrativeBodyAt(body, date);
    const { vector, longitude, latitude } = apparentAt(body, time);
    const retrograde = body.id === 'Earth' ? null
      : signed(apparentAt(body, after).longitude-apparentAt(body, before).longitude) < 0;
    return { ...body, extrapolated, position: providerFor(body,date,providerMemo).position,
      geoPosition: eclipticJ2000(vector), longitude, latitude, distanceAU: vector.Length(),
      sign: longitude === null ? null : SIGNS[Math.floor(longitude/30)],
      degree: longitude === null ? null : longitude%30, retrograde,
      positionFrame: EPHEMERIS.positionFrame, longitudeFrame: EPHEMERIS.longitudeFrame,
      corrections: body.id === 'Earth' ? 'Not applicable'
        : body.id === 'Moon' ? 'Lunar series; precession/nutation for angles; vendor omits lunar light-time/aberration'
        : 'Light-time and aberration; precession/nutation for angles',
    };
  });
  const displayed=applyPositionProvider(core,date,providerMemo);return includeMoons ? appendMoons(displayed,date) : displayed;
}

/** Add inexpensive geometric satellite illustrations to an existing core
 * snapshot (including fetched provider snapshots). Parent positions come from
 * that exact snapshot. Satellites intentionally have no astrology angles. */
export function appendMoons(coreBodies,value) {
  const date=validatedDate(value), byId=new Map(coreBodies.map(body=>[body.id,body])),earth=byId.get('Earth');
  if(!earth || !Array.isArray(earth.position)) throw new RangeError('Moon snapshot needs Earth and all parent positions');
  const missing=EXTRA_MOONS.filter(m=>!byId.has(m.id)),states=satelliteStatesAt(missing.map(body=>body.id),date);
  const extras=missing.map((body,k)=>{
    const parent=byId.get(body.parentId); if(!parent)throw new RangeError('Missing moon parent: '+body.parentId);
    const state=states[k],relativePosition=state.position,position=relativePosition.map((x,i)=>x+parent.position[i]);
    const geoPosition=position.map((x,i)=>x-earth.position[i]);
    return {...body,...state,position,relativePosition,geoPosition,distanceAU:Math.hypot(...geoPosition),longitude:null,latitude:null,sign:null,degree:null,retrograde:null,
      approximate:state.illustrative,illustrative:state.illustrative,extrapolated:state.illustrative,cacheStatus:getEphemerisMode()==='cached'?(state.provider==='cached'?'covered':'fallback; no cached target at this date'):'local mode',positionFrame:EPHEMERIS.positionFrame,longitudeFrame:'Not supplied for added satellites',
      corrections:state.sourceModel+'; geometric vectors without light-time or aberration'};
  });
  return [...coreBodies,...extras];
}

export function appendMinorBodies(bodies,value){const date=validatedDate(value),earth=bodies.find(b=>b.id==='Earth');if(!earth)throw new RangeError('Minor body snapshot requires Earth');const ids=new Set(bodies.map(b=>b.id));return [...bodies,...MINOR_BODIES.filter(b=>!ids.has(b.id)).map(body=>{const p=positionProviderAt(body.id,date),geoPosition=p.position.map((x,i)=>x-earth.position[i]);return {...body,...p,geoPosition,distanceAU:Math.hypot(...geoPosition),longitude:null,latitude:null,sign:null,degree:null,retrograde:null,extrapolated:p.illustrative,positionFrame:EPHEMERIS.positionFrame,corrections:p.sourceModel+'; geometric; no light-time or aberration'};})];}

function illustrativeBodyAt(body, date) {
  const angleAt = (id, time) => { const p = illustrativeBodyGeoAt(id, time); return norm(Math.atan2(p[1], p[0]) * DEG); };
  const geoPosition = illustrativeBodyGeoAt(body.id, date), distanceAU = Math.hypot(...geoPosition), earth = body.id === 'Earth';
  const longitude = earth ? null : angleAt(body.id, date);
  return { ...body, extrapolated: true, illustrative: true, position: illustrativeHelioAt(body.id, date), geoPosition,
    distanceAU, longitude, latitude: earth ? null : Math.asin(clamp(geoPosition[2] / distanceAU)) * DEG,
    sign: earth ? null : SIGNS[Math.floor(longitude / 30)], degree: earth ? null : longitude % 30,
    retrograde: earth ? null : signed(angleAt(body.id, addTime(date, DAY_MS / 2)) - angleAt(body.id, addTime(date, -DAY_MS / 2))) < 0,
    positionFrame: ILLUSTRATIVE_FRAME, longitudeFrame: 'Illustrative fixed J2000 ecliptic angles; not tropical of date',
    corrections: 'Illustration only: no light-time, aberration, long-term orbital evolution or predictive accuracy'
      + (body.id === 'Pluto' ? '; Pluto uses the bounded vendor integration near years 1–3998 and a circular illustration outside it' : ''),
  };
}

function illustrativeStateAt(date) { return BODIES.map(body => illustrativeBodyAt(body, date)); }

function observerOptions(latitude, longitude, options = {}) {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('Latitude must be −90…90 and longitude −180…180 degrees.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Observer options must be an object.');
  const height = options.height ?? 0, refraction = options.refraction ?? 'none';
  if (typeof height !== 'number' || !Number.isFinite(height) || height < -12000 || height > 100000) {
    throw new RangeError('Observer height must be −12000…100000 meters.');
  }
  if (!['none', 'normal'].includes(refraction)) throw new RangeError('Refraction must be none or normal.');
  return { observer: new Astronomy.Observer(latitude, longitude, height), refraction };
}

/** Apparent topocentric direction; optional {height: meters, refraction: 'none'|'normal'}. */
export function horizontal(bodyId, value, latitude, longitude, options = {}) {
  const date = validatedDate(value), body = bodyFor(bodyId);
  if (body.id === 'Earth') throw new RangeError('Earth has no observing direction from its own surface.');
  const { observer, refraction } = observerOptions(latitude, longitude, options);
  if (!bodyEngineAvailableAt(body.id, date)) {
    // The exact calendar controls the circular phase. Earth orientation repeats
    // a safe 400-year calendar representative, matching remote zodiac/sky layers.
    const representative = modelDate(date), p = illustrativeBodyGeoAt(body.id, date);
    const eqj = Astronomy.RotateVector(Astronomy.Rotation_ECL_EQJ(), new Astronomy.Vector(...p, representative));
    const eqd = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(representative), eqj);
    const location = Astronomy.ObserverVector(representative, observer, true);
    const vector = new Astronomy.Vector(eqd.x - location.x, eqd.y - location.y, eqd.z - location.z, representative);
    const eq = Astronomy.EquatorFromVector(vector);
    const h = Astronomy.Horizon(representative, observer, eq.ra, eq.dec, refraction === 'none' ? undefined : refraction);
    return { altitude: h.altitude, azimuth: norm(h.azimuth), angularRadius: Math.asin(clamp(body.radiusKm / (eq.dist * AU_KM))) * DEG,
      distanceAU: eq.dist, rightAscension: eq.ra * 15, declination: eq.dec, refraction, height: observer.height, illustrative: true };
  }
  const eq = Astronomy.Equator(body.id, date, observer, true, true);
  const h = Astronomy.Horizon(date, observer, eq.ra, eq.dec, refraction === 'none' ? undefined : refraction);
  return { altitude: h.altitude, azimuth: norm(h.azimuth),
    angularRadius: Math.asin(clamp(body.radiusKm/(eq.dist*AU_KM)))*DEG,
    distanceAU: eq.dist, rightAscension: eq.ra*15, declination: eq.dec,
    refraction, height: observer.height,
  };
}

/** Fixed J2000 star direction to horizon, including precession and nutation.
 * Catalog RA is hours; Dec is degrees. Proper motion, parallax, and aberration
 * are not added here: catalog overlay accuracy is distinct from planet positions.
 */
export function starHorizontal(raHours, decDeg, value, latitude, longitude, options = {}) {
  const input = validatedDate(value), date = modelDate(input);
  if (!Number.isFinite(raHours) || raHours < 0 || raHours >= 24 || !Number.isFinite(decDeg) || Math.abs(decDeg) > 90) {
    throw new RangeError('Star J2000 RA must be 0…24 hours and declination −90…90 degrees.');
  }
  const { observer, refraction } = observerOptions(latitude, longitude, options);
  const vector = Astronomy.VectorFromSphere(new Astronomy.Spherical(decDeg, raHours*15, 1), date);
  const eq = Astronomy.EquatorFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(date), vector));
  const h = Astronomy.Horizon(date, observer, eq.ra, eq.dec, refraction === 'none' ? undefined : refraction);
  return { altitude: h.altitude, azimuth: norm(h.azimuth), rightAscension: eq.ra*15, declination: eq.dec,
    ...(!engineAvailableAt(input) ? { illustrative: true } : {}) };
}

export const ASPECTS = Object.freeze([
  { name: 'Conjunction', angle: 0 }, { name: 'Sextile', angle: 60 },
  { name: 'Square', angle: 90 }, { name: 'Trine', angle: 120 }, { name: 'Opposition', angle: 180 },
].map(Object.freeze));

/** Conventional astrology geometry; a six-degree orb for all five aspects. */
export function aspectsAt(value) {
  const bodies = stateAt(value).filter(b => b.id !== 'Earth'), result = [];
  for (let i = 0; i < bodies.length; i++) for (let j = i+1; j < bodies.length; j++) {
    const separation = Math.abs(signed(bodies[i].longitude-bodies[j].longitude));
    for (const aspect of ASPECTS) {
      const orb = Math.abs(separation-aspect.angle);
      if (orb <= 6) result.push({ a: bodies[i].id, b: bodies[j].id, ...aspect, orb });
    }
  }
  return result.sort((a, b) => a.orb-b.orb);
}

function separation(a, b) {
  return Math.acos(clamp(Math.sin(a.altitude*RAD)*Math.sin(b.altitude*RAD)
    + Math.cos(a.altitude*RAD)*Math.cos(b.altitude*RAD)*Math.cos((a.azimuth-b.azimuth)*RAD)))*DEG;
}

function contactRecord(local) {
  return Object.fromEntries(['partial_begin', 'total_begin', 'peak', 'total_end', 'partial_end'].map(key =>
    [key, local[key] ? { date: local[key].time.date.toISOString(), sunAltitude: local[key].altitude } : null]));
}

function localFor(global, latitude, longitude) {
  const local = Astronomy.SearchLocalSolarEclipse(global.peak.AddDays(-1), new Astronomy.Observer(latitude, longitude, 0));
  return Math.abs(local.peak.time.ut-global.peak.ut) < 1 ? local : null;
}

// Global partial eclipses have no shadow-axis surface intersection. Select a
// sampled daylight observer from actual topocentric separation, then calculate
// that observer's local maximum. This is an explicitly noncentral example.
function partialObserver(global) {
  const time = global.peak, rot = Astronomy.Rotation_EQJ_EQD(time);
  const sun = Astronomy.RotateVector(rot, Astronomy.GeoVector('Sun', time, true));
  const moon = Astronomy.RotateVector(rot, Astronomy.GeoVector('Moon', time, true));
  let best = null;
  function sample(latitude, longitude) {
    if (latitude < -90 || latitude > 90) return;
    longitude = signed(longitude);
    const observer = new Astronomy.Observer(latitude, longitude, 0);
    const pos = Astronomy.ObserverVector(time, observer, true);
    const sv = new Astronomy.Vector(sun.x-pos.x, sun.y-pos.y, sun.z-pos.z, time);
    const mv = new Astronomy.Vector(moon.x-pos.x, moon.y-pos.y, moon.z-pos.z, time);
    const seq = Astronomy.EquatorFromVector(sv);
    const h = Astronomy.Horizon(time, observer, seq.ra, seq.dec);
    if (h.altitude < 0.5) return;
    const gap = Astronomy.AngleBetween(sv, mv);
    const overlap = Math.asin(695700/(sv.Length()*AU_KM))*DEG
      + Math.asin(1737.4/(mv.Length()*AU_KM))*DEG-gap;
    if (!best || overlap > best.overlap) best = { latitude, longitude, overlap };
  }
  for (let latitude = -90; latitude <= 90; latitude += 10) {
    for (let longitude = -180; longitude < 180; longitude += 10) sample(latitude, longitude);
  }
  for (const step of [2, 0.4, 0.08]) {
    const center = best;
    if (!center) break;
    for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
      sample(center.latitude+a*step, center.longitude+b*step);
    }
  }
  if (!best || best.overlap <= 0) return null;
  const local = localFor(global, best.latitude, best.longitude);
  if (!local || local.peak.altitude <= 0) return null;
  return { ...best, local };
}

function globalRecord(global) {
  const central = Number.isFinite(global.latitude) && Number.isFinite(global.longitude);
  const observer = central ? { latitude: global.latitude, longitude: global.longitude,
    local: localFor(global, global.latitude, global.longitude) } : partialObserver(global);
  const globalDate = global.peak.date.toISOString();
  const latitude = observer?.latitude ?? null, longitude = observer?.longitude ?? null;
  const local = observer?.local;
  const localPeakDate = local?.peak.time.date.toISOString() ?? null;
  const date = globalDate;
  const sun = observer && horizontal('Sun', date, latitude, longitude);
  const moon = observer && horizontal('Moon', date, latitude, longitude);
  return { id: `engine-${globalDate.slice(0, 10)}`, date, globalPeakDate: globalDate, localPeakDate,
    visitDate: localPeakDate ?? date,
    name: 'Solar eclipse', type: global.kind, latitude, longitude, lat: latitude, lon: longitude,
    location: central ? 'Central shadow at global maximum' : observer ? 'Sampled daylight observer (partial)' : 'Global event; observer unavailable',
    observerBasis: central ? 'Library shadow-axis intersection with Earth geoid' : 'Sampled visible observer, then library local maximum; not a global maximum location',
    hasObserver: !!observer, central, approximate: true, source: 'astronomy-engine-search',
    timeBasis: 'Astronomy Engine computed global and local maxima; modeled ΔT, no lunar limb profile; not exact contact predictions.',
    obscuration: local?.obscuration ?? global.obscuration ?? null,
    localType: local?.kind ?? null, contacts: local ? contactRecord(local) : null,
    angularSeparation: observer ? separation(sun, moon) : null, sunAltitude: sun?.altitude ?? null,
  };
}

/** Next global solar eclipse strictly after the instant, within 400 days and the checked 1800–2200 search window.
 * date/globalPeakDate identify the global maximum; visitDate/localPeakDate give
 * the selected observer's local maximum for an Earth-surface jump.
 */
export function findNextEclipse(value) {
  const date = validatedDate(value);
  if (!eclipseAvailableAt(date)) throw new RangeError('Eclipse search is available for 1800–2200; remote-date ephemerides are extrapolated.');
  const start = date.getTime();
  const end = Math.min(start+400*DAY_MS, JPL_MAX_TIME);
  if (start >= end) return null;
  // A new Moon can precede the greatest eclipse. Begin one day early, then
  // explicitly reject past peaks to avoid missing an imminent event.
  let global = Astronomy.SearchGlobalSolarEclipse(new Date(start-DAY_MS));
  if (global.peak.date.getTime() <= start) global = Astronomy.NextGlobalSolarEclipse(global.peak);
  if (global.peak.date.getTime() > end) return null;
  return globalRecord(global);
}

function preset(spec) {
  const global = Astronomy.SearchGlobalSolarEclipse(new Date(`${spec.day}T00:00:00Z`));
  if (global.peak.date.toISOString().slice(0, 10) !== spec.day) throw new Error(`Eclipse preset has no event on ${spec.day}.`);
  let record = globalRecord(global);
  if (Number.isFinite(spec.latitude)) {
    const local = localFor(global, spec.latitude, spec.longitude);
    if (!local) throw new Error(`No local eclipse for ${spec.id} on ${spec.day}.`);
    const date = local.peak.time.date.toISOString();
    record = { ...record, date, localPeakDate: date, visitDate: date, type: local.kind, globalType: global.kind,
      latitude: spec.latitude, longitude: spec.longitude, lat: spec.latitude, lon: spec.longitude,
      obscuration: local.obscuration, contacts: contactRecord(local), localType: local.kind,
      location: spec.location, observerBasis: 'Named geographic observer; library local maximum', central: false,
      angularSeparation: separation(horizontal('Sun', date, spec.latitude, spec.longitude), horizontal('Moon', date, spec.latitude, spec.longitude)),
      sunAltitude: horizontal('Sun', date, spec.latitude, spec.longitude).altitude,
    };
  }
  return Object.freeze({ ...record, id: spec.id, name: spec.name, source: 'astronomy-engine-preset' });
}

// Only calendar dates and named locations are presets. Every viewing time and
// local eclipse type is calculated on import, never visually calibrated.
export const ECLIPSES = Object.freeze([
  { id: '2024-dallas', day: '2024-04-08', name: 'Dallas · 2024', latitude: 32.7767, longitude: -96.7970, location: 'Dallas, Texas, USA' },
  { id: '2026-antarctica', day: '2026-02-17', name: 'Antarctica · 2026' },
  { id: '2026-spain', day: '2026-08-12', name: 'Burgos · 2026', latitude: 42.3439, longitude: -3.6969, location: 'Burgos, Spain' },
  { id: '2027-south-america', day: '2027-02-06', name: 'South Atlantic · 2027' },
  { id: '2027-egypt', day: '2027-08-02', name: 'Luxor · 2027', latitude: 25.6872, longitude: 32.6396, location: 'Luxor, Egypt' },
  { id: '2028-australia', day: '2028-07-22', name: 'Sydney · 2028', latitude: -33.8688, longitude: 151.2093, location: 'Sydney, Australia' },
  { id: '2030-greece', day: '2030-06-01', name: 'Athens · 2030', latitude: 37.9838, longitude: 23.7275, location: 'Athens, Greece' },
].map(preset));

/** Named presets strictly after the instant; an empty array beyond the last. */
export function nextEclipses(value, limit = 3) {
  const date = validatedDate(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new RangeError('Limit must be an integer from 0 to 100.');
  return ECLIPSES.filter(event => differenceMillis(event.date, date) > 0).slice(0, limit);
}
