// Machine-authored by Codex/OpenAI, 2026-09-08, claim 260907-230105-001/solar-system-0.4.
// Original spherical map geometry. Natural Earth source bytes/license are retained separately.
// Display curvature changes this sphere's radius only; observer GPS and movement are independent.
// Codex/OpenAI, 2026-09-30: exact arc bounds cull hidden blocks for the finer 1:50m map.
import { EARTH_MEAN_RADIUS_M, validateObserver } from './observer.mjs';

const RAD = Math.PI / 180;
const TAU = 2 * Math.PI;
const EPS = 1e-12;
const MAX_SEGMENTS = 100000;
const clamp = x => Math.max(-1, Math.min(1, x));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = p => Math.hypot(...p);
const landCache = new WeakMap();
const citiesCache = new WeakMap();
const EMPTY_LAND = Object.freeze({ blocks: [], edgeCount: 0 });

export const SURFACE_MAP_FRAME = 'Local east/north/up meters relative to the observer ground point; visual sphere, not terrain or a WGS84 ellipsoid.';

function validVector(point) {
  return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite) && Math.abs(norm(point) - 1) < 1e-8;
}

function radiusValue(radius) {
  if (!Number.isFinite(radius) || radius < 0.001 || radius > EARTH_MEAN_RADIUS_M) throw new RangeError('Visual Earth radius must be 0.001…6371008.8 meters.');
  return radius;
}

function geographicVector(latitude, longitude) {
  const p = latitude * RAD, l = longitude * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

function localFrame(observer) {
  validateObserver({ latitude: observer?.latitude, longitude: observer?.longitude });
  const p = observer.latitude * RAD, l = observer.longitude * RAD;
  const east = [-Math.sin(l), Math.cos(l), 0];
  const north = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  const up = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  return vector => [dot(vector, east), dot(vector, north), clamp(dot(vector, up))];
}

const positionFor = (normal, radius) => [normal[0] * radius, normal[1] * radius, (normal[2] - 1) * radius];
const distanceFor = normal => EARTH_MEAN_RADIUS_M * Math.atan2(Math.hypot(normal[0], normal[1]), normal[2]);

/** A geographical point on the display sphere, with a separately computed real ground distance. */
export function surfaceMapPoint(latitude, longitude, observer, { visualRadiusM = EARTH_MEAN_RADIUS_M } = {}) {
  validateObserver({ latitude, longitude }); radiusValue(visualRadiusM);
  const normal = localFrame(observer)(geographicVector(latitude, longitude));
  return { latitude, longitude, normal, position: positionFor(normal, visualRadiusM), distanceM: distanceFor(normal) };
}

function arcBasis(a, b) {
  const cosine = clamp(dot(a, b));
  const tangent = b.map((value, i) => value - cosine * a[i]);
  const sine = norm(tangent), angle = Math.atan2(sine, cosine);
  if (angle < EPS) return null;
  if (sine < EPS) throw new RangeError('An exactly antipodal coastline edge has no unique great-circle arc.');
  return { a, tangent: tangent.map(value => value / sine), angle };
}

function clipArc(basis, minimumUp, maxStep) {
  if (!basis) return [];
  const { a, tangent, angle } = basis;
  const amplitude = Math.hypot(a[2], tangent[2]);
  if (amplitude < minimumUp - EPS) return [];
  const breaks = [0, angle];
  if (amplitude > EPS && minimumUp <= amplitude) {
    const phase = Math.atan2(tangent[2], a[2]);
    const offset = Math.acos(clamp(minimumUp / amplitude));
    for (const sign of [-1, 1]) for (const turn of [-1, 0, 1]) {
      const time = phase + sign * offset + turn * TAU;
      if (time > EPS && time < angle - EPS) breaks.push(time);
    }
  }
  breaks.sort((x, y) => x - y);
  const at = t => a.map((value, i) => value * Math.cos(t) + tangent[i] * Math.sin(t));
  const segments = [];
  for (let i = 1; i < breaks.length; i++) {
    const from = breaks[i - 1], to = breaks[i];
    if (to - from < EPS || at((from + to) / 2)[2] < minimumUp - EPS) continue;
    const steps = Math.max(1, Math.ceil((to - from) / maxStep));
    let previous = at(from);
    for (let step = 1; step <= steps; step++) {
      const point = at(from + (to - from) * step / steps);
      segments.push([previous, point]); previous = point;
    }
  }
  return segments;
}

/** Clip a short great-circle edge to a visible spherical cap, including outside→inside→outside arcs.
 * Inputs/outputs are ENU unit surface normals, not camera directions or ground positions.
 */
export function clipSurfaceArc(a, b, minimumUp, maxStepDegrees = 0.75) {
  if (!validVector(a) || !validVector(b) || !Number.isFinite(minimumUp) || minimumUp < 0 || minimumUp > 1
      || !Number.isFinite(maxStepDegrees) || maxStepDegrees < 0.01 || maxStepDegrees > 5) throw new RangeError('Invalid spherical map clipping input.');
  return clipArc(arcBasis(a, b), minimumUp, maxStepDegrees * RAD);
}

function preparedLand(land) {
  if (!land) return EMPTY_LAND;
  if (landCache.has(land)) return landCache.get(land);
  if (!Array.isArray(land.rings) || land.rings.length > 2000) throw new RangeError('Coastlines require bounded longitude/latitude rings.');
  const output = { blocks: [], edgeCount: 0 }; let count = 0;
  for (const ring of land.rings) {
    if (!Array.isArray(ring) || ring.length < 4 || (count += ring.length) > MAX_SEGMENTS) throw new RangeError('Coastline coordinate count is not valid.');
    const vectors = ring.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180.000001 || Math.abs(point[1]) > 90) throw new RangeError('Coastline coordinates are not valid.');
      return geographicVector(point[1], Math.max(-180, Math.min(180, point[0])));
    });
    let block;
    for (let i = 1; i < vectors.length; i++) {
      const basis = arcBasis(vectors[i - 1], vectors[i]); if (!basis) continue;
      if (!block || block.arcs.length === 64) {
        block = { arcs: [], min: [1, 1, 1], max: [-1, -1, -1] };
        output.blocks.push(block);
      }
      block.arcs.push(basis); output.edgeCount++;
      // Include the full arc extrema, not just vertices: an edge can cross the
      // visible cap even when both of its endpoints are beyond the horizon.
      for (let axis = 0; axis < 3; axis++) {
        const a = basis.a[axis], b = basis.tangent[axis];
        let minimum = Math.min(a, vectors[i][axis]), maximum = Math.max(a, vectors[i][axis]);
        const phase = Math.atan2(b, a), amplitude = Math.hypot(a, b);
        for (let turn = -1; turn <= 2; turn++) {
          const t = phase + turn * Math.PI;
          if (t > 0 && t < basis.angle) {
            const value = turn % 2 === 0 ? amplitude : -amplitude;
            minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
          }
        }
        block.min[axis] = Math.min(block.min[axis], minimum);
        block.max[axis] = Math.max(block.max[axis], maximum);
      }
    }
  }
  landCache.set(land, output); return output;
}

function cityRows(data) {
  if (!data) return [];
  if (citiesCache.has(data)) return citiesCache.get(data);
  const rows = Array.isArray(data) ? data : data.cities;
  if (!Array.isArray(rows) || rows.length > 2000) throw new RangeError('City data requires at most 2000 geographic points.');
  const ids = new Set();
  const result = rows.map(city => {
    if (!city || typeof city.id !== 'string' || !city.id || city.id.length > 100 || ids.has(city.id)
        || typeof city.name !== 'string' || !city.name.trim() || city.name.length > 160) throw new RangeError('City names and unique identities are required.');
    validateObserver({ latitude: city.latitude, longitude: city.longitude });
    for (const key of ['rank', 'labelRank']) if (city[key] !== undefined && (!Number.isFinite(city[key]) || city[key] < 0 || city[key] > 20)) throw new RangeError('City rank is not valid.');
    ids.add(city.id); return { ...city, vector: geographicVector(city.latitude, city.longitude) };
  });
  citiesCache.set(data, result); return result;
}

/** Load the bounded local cartographic catalogue; no location data or implicit remote endpoint. */
export async function loadCities(url = new URL('./data/cities.json', import.meta.url), { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('City map data could not be loaded.');
  const data = await response.json();
  if (!data || (!Array.isArray(data) && !Array.isArray(data.cities))) throw new Error('City map data is not valid.');
  cityRows(data); return data;
}

/** Coastlines and cities visible from [0,0,eyeHeightM] above the displayed sphere.
 * Camera near-plane/frustum clipping remains the renderer's responsibility.
 * Curvature preserves geographic angles but compresses visual ground distances; maxDistanceM
 * and city distanceM always use the unchanged mean Earth radius. Inputs are never mutated.
 */
export function buildSurfaceMap({ latitude, longitude, land = null, cities = null, visualRadiusM = EARTH_MEAN_RADIUS_M, eyeHeightM = 30, maxDistanceM = Infinity, maxStepDegrees = 0.75 } = {}) {
  const local = localFrame({ latitude, longitude }), radius = radiusValue(visualRadiusM);
  if (!Number.isFinite(eyeHeightM) || eyeHeightM < 0 || eyeHeightM > 1e12 || typeof maxDistanceM !== 'number' || Number.isNaN(maxDistanceM) || maxDistanceM < 0
      || !Number.isFinite(maxStepDegrees) || maxStepDegrees < 0.01 || maxStepDegrees > 5) throw new RangeError('Invalid surface-map height, distance or sampling input.');
  const horizonCos = radius / (radius + eyeHeightM);
  const minimumUp = Math.max(horizonCos, Math.cos(Math.min(Math.PI, maxDistanceM / EARTH_MEAN_RADIUS_M)));
  const segments = [], prepared = preparedLand(land), up = geographicVector(latitude, longitude);
  let examinedEdgeCount = 0;
  // Static bounded blocks make the finer offline coastline inexpensive near
  // the ground; clipping below still keeps every visible original edge.
  for (const block of prepared.blocks) {
    const maximumUp = up.reduce((sum, value, axis) => sum + value * (value >= 0 ? block.max[axis] : block.min[axis]), 0);
    if (maximumUp < minimumUp - EPS) continue;
    for (const basis of block.arcs) {
      examinedEdgeCount++;
      const transformed = { a: local(basis.a), tangent: local(basis.tangent), angle: basis.angle };
      for (const pair of clipArc(transformed, minimumUp, maxStepDegrees * RAD)) {
        if (segments.length >= MAX_SEGMENTS) throw new RangeError('Projected coastline segment limit exceeded.');
        segments.push(pair.map(normal => positionFor(normal, radius)));
      }
    }
  }
  const visibleCities = [];
  for (const { vector, ...city } of cityRows(cities)) {
    const normal = local(vector);
    if (normal[2] >= minimumUp - EPS) visibleCities.push({ ...city, position: positionFor(normal, radius), normal, distanceM: distanceFor(normal) });
  }
  return { frame: SURFACE_MAP_FRAME, segments, cities: visibleCities, center: [0, 0, -radius], radiusM: radius, eyeHeightM, horizonCos, maxDistanceM, examinedEdgeCount, sourceEdgeCount: prepared.edgeCount };
}

/** Machine-authored Codex/OpenAI, claim260923-181609-001.
 * Filled land masks derived from the retained Natural Earth coastline rings.
 * Latitude-based ice/vegetation/sand tones are schematic, not land-cover data.
 * Inland water and sub-catalogue coastline detail are not supplied by this mask.
 */
const terrainCache=new WeakMap();
export const EARTH_TERRAIN_PALETTE=Object.freeze({ocean:'#173e59',ice:'#d5e5df',forest:'#365c40',grass:'#617d4c',sand:'#b9a574'});
// The vector fallback retains the complete 50m outlines plus cell intersections.
// Bound generated geometry as well as its input; three cached details stay finite.
export const EARTH_TERRAIN_LIMITS=Object.freeze({maxPatches:4096,maxPoints:100000});
const terrainDetails=Object.freeze({low:30,medium:15,high:5});
const terrainColor=(latitude,longitude)=>Math.abs(latitude)>67?EARTH_TERRAIN_PALETTE.ice:Math.abs(latitude)>15&&Math.abs(latitude)<35?EARTH_TERRAIN_PALETTE.sand:Math.abs(latitude)<16?EARTH_TERRAIN_PALETTE.forest:EARTH_TERRAIN_PALETTE.grass;
function clipGeographicPolygon(points,axis,bound,greater){
 const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=(a[axis]-bound)*(greater?1:-1),db=(b[axis]-bound)*(greater?1:-1);if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];p[axis]=bound;out.push(p);}}return out;
}
export function earthSurfaceGeometry(land,{detail='medium'}={}){
 if(!Object.hasOwn(terrainDetails,detail))throw new RangeError('Earth detail must be low, medium or high.');
 if(!land)return {oceanColor:EARTH_TERRAIN_PALETTE.ocean,patches:[],detail,description:'Land mask unavailable'};
 preparedLand(land);let cache=terrainCache.get(land);if(cache?.has(detail))return cache.get(detail);if(!cache){cache=new Map();terrainCache.set(land,cache);}
 const step=terrainDetails[detail],patches=[];let pointCount=0;
 for(const ring of land.rings){
  const minLon=Math.max(-180,Math.min(...ring.map(p=>p[0]))),maxLon=Math.min(180,Math.max(...ring.map(p=>p[0]))),minLat=Math.max(-90,Math.min(...ring.map(p=>p[1]))),maxLat=Math.min(90,Math.max(...ring.map(p=>p[1])));
  for(let west=Math.floor((minLon+180)/step)*step-180;west<maxLon;west+=step)for(let south=Math.floor((minLat+90)/step)*step-90;south<maxLat;south+=step){
   let points=ring;for(const [axis,bound,greater] of [[0,west,true],[0,west+step,false],[1,south,true],[1,south+step,false]]){points=clipGeographicPolygon(points,axis,bound,greater);if(points.length<3)break;}
   if(points.length<3)continue;let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}if(Math.abs(area)<1e-10)continue;
   if(patches.length>=EARTH_TERRAIN_LIMITS.maxPatches||pointCount+points.length>EARTH_TERRAIN_LIMITS.maxPoints)throw new RangeError('Earth terrain geometry limit exceeded.');
   pointCount+=points.length;
   patches.push({kind:'coastline-land',points,vectors:points.map(([lon,lat])=>geographicVector(lat,lon)),color:terrainColor(south+step/2,west+step/2)});
  }
 }
 const result={oceanColor:EARTH_TERRAIN_PALETTE.ocean,patches,detail,cellDegrees:step,pointCount,frame:'Body-fixed unit normals; longitude east, latitude north',description:'Natural Earth coastline-derived land mask; schematic latitude-based ice, green and sand colors; inland water omitted.'};cache.set(detail,result);return result;
}

/** Point classification in the same retained longitude/latitude coastline mask. */
export function earthSurfaceColorAt(land,latitude,longitude){
 validateObserver({latitude,longitude});preparedLand(land);let isLand=false;
 for(const ring of land?.rings??[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>latitude)!==(b[1]>latitude)&&longitude<(b[0]-a[0])*(latitude-a[1])/(b[1]-a[1])+a[0])inside=!inside;}if(inside){isLand=true;break;}}
 return {isLand,color:isLand?terrainColor(latitude,longitude):EARTH_TERRAIN_PALETTE.ocean};
}
