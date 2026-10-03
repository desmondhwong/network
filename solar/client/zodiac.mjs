/* Machine-authored by Codex / OpenAI, 2026-09-07, claim 260907-202059-001.
 * Tropical longitude belongs to the true ecliptic/equinox of the selected date.
 * Angles are geometric intersections, not interpretations or fixed star sectors.
 * Equatorial vectors use true equator/equinox of date; horizon=[east,north,up].
 * Earth-fixed vectors have Greenwich +x, east +y, north +z. These are direction
 * projections on a spherical globe, not assigned terrestrial zodiac territories.
 * GAST approximates Earth rotation using the vendor's UTC≈UT1 and modeled ΔT.
 * No atmospheric refraction or polar motion. Sources: galactic-provenance.md. */
import { validatedDate, SIGNS, stateAt } from './astro.mjs';
import { modelDate, timeKey, accuracyAt } from './time.mjs';
import { Rotation_ECT_EQD, Rotation_EQD_EQJ, Rotation_EQJ_ECL, SiderealTime } from './vendor/astronomy-engine-2.1.19.mjs';
import {eclipticToGalactic} from './trails.mjs';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const norm = x => ((x % 360) + 360) % 360;
const clamp = x => Math.max(-1, Math.min(1, x));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const d = Math.hypot(...v); return d < 1e-12 ? null : v.map(n => n / d); };
const rotate = (matrix, vector) => [0, 1, 2].map(j => matrix[0][j] * vector[0] + matrix[1][j] * vector[1] + matrix[2][j] * vector[2]);
const inverseRotate = (matrix, vector) => matrix.map(row => dot(row, vector));
const eqjEcl = Rotation_EQJ_ECL().rot;
let cachedFrame = null, cachedEarth = null, cachedZodiac = null;
let cachedVolume = null;

function frameAt(value) {
  const date = validatedDate(value), key = timeKey(date), orientationDate=modelDate(date);
  if (cachedFrame?.key === key) return cachedFrame;
  const rotation = Rotation_ECT_EQD(orientationDate).rot;
  return cachedFrame = { key, date, rotation, toEqj: Rotation_EQD_EQJ(orientationDate).rot,
    gast: SiderealTime(orientationDate) * 15 * RAD,
    eclipticPole: rotate(rotation, [0, 0, 1]),
    eclipticX: rotate(rotation, [1, 0, 0]), eclipticY: rotate(rotation, [0, 1, 0]) };
}

function directionAt(longitudeDeg, frame, latitudeDeg = 0) {
  const longitude = norm(longitudeDeg), l = longitude * RAD, b = latitudeDeg * RAD;
  const equatorial = rotate(frame.rotation, [Math.cos(l) * Math.cos(b), Math.sin(l) * Math.cos(b), Math.sin(b)]);
  const c = Math.cos(frame.gast), s = Math.sin(frame.gast);
  return { longitudeDeg: longitude, latitudeDeg, sign: SIGNS[Math.floor(longitude / 30)], degree: longitude % 30,
    equatorial, eclipticJ2000: rotate(eqjEcl, rotate(frame.toEqj, equatorial)),
    earthFixed: [c * equatorial[0] + s * equatorial[1], -s * equatorial[0] + c * equatorial[1], equatorial[2]],
    rightAscension: norm(Math.atan2(equatorial[1], equatorial[0]) * DEG),
    declination: Math.asin(clamp(equatorial[2])) * DEG };
}

function observerAt(latitude, longitude, frame) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError('Latitude must be −90…90 and longitude −180…180 degrees.');
  const phi = latitude * RAD, theta = frame.gast + longitude * RAD;
  return { latitude, longitude, theta,
    east: [-Math.sin(theta), Math.cos(theta), 0],
    north: [-Math.sin(phi) * Math.cos(theta), -Math.sin(phi) * Math.sin(theta), Math.cos(phi)],
    up: [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)] };
}

function inHorizon(point, observer) {
  const v = point.equatorial;
  const horizon = [dot(v, observer.east), dot(v, observer.north), dot(v, observer.up)];
  return { ...point, horizon, azimuth: norm(Math.atan2(horizon[0], horizon[1]) * DEG), altitude: Math.asin(clamp(horizon[2])) * DEG };
}

/** Unit J2000-ecliptic direction for a true tropical longitude at this UTC. */
export function eclipticOfDateToJ2000(longitudeDeg, date) {
  if (!Number.isFinite(longitudeDeg)) throw new RangeError('Tropical longitude must be finite.');
  return directionAt(longitudeDeg, frameAt(date)).eclipticJ2000;
}

export function zodiacDirection(longitudeDeg, date, latitude = 0, longitude = 0) {
  if (!Number.isFinite(longitudeDeg)) throw new RangeError('Tropical longitude must be finite.');
  const frame = frameAt(date);
  return inHorizon(directionAt(longitudeDeg, frame), observerAt(latitude, longitude, frame));
}

/** Twelve 30° sectors with sampled ecliptic arcs and full longitude meridians.
 * Points are dimensionless directions. A sector's polygon is a display band
 * between ecliptic latitudes ±8°, not a boundary of the zodiac coordinate system. */
export function getZodiacEarthLines(value) {
  const frame = frameAt(value);
  if (cachedEarth?.key === frame.key) return cachedEarth.value;
  const boundaries = Array.from({ length: 12 }, (_, i) => directionAt(i * 30, frame));
  const sectors = SIGNS.map((sign, index) => {
    const startDeg = index * 30, endDeg = startDeg + 30;
    const points = Array.from({ length: 16 }, (_, i) => directionAt(startDeg + i * 2, frame));
    const polygon = [...Array.from({ length: 16 }, (_, i) => directionAt(startDeg + i * 2, frame, 8)), ...Array.from({ length: 16 }, (_, i) => directionAt(endDeg - i * 2, frame, -8))];
    return { sign, name: sign, startDeg, endDeg, center: directionAt(startDeg + 15, frame), points, polygon,
      boundaries: [boundaries[index], boundaries[(index + 1) % 12]],
      boundaryMeridian: Array.from({ length: 37 }, (_, i) => directionAt(startDeg, frame, -90 + i * 5)) };
  });
  const valueOut = { date: frame.date.toISOString(), gastHours: frame.gast * 12 / Math.PI, sectors, boundaries,
    ecliptic: Array.from({ length: 181 }, (_, i) => directionAt(i * 2, frame)),
    frame: 'True tropical ecliptic/equinox of date; EQD equatorial; Earth-fixed Greenwich+x/east+y/north+z; unit directions' };
  cachedEarth = { key: frame.key, value: valueOut };
  return valueOut;
}

/** Machine-authored Codex/OpenAI, claim 260922-161953-001.
 * Twelve finite 30-degree outline sectors from Earth's reference surface to
 * a declared display radius. Galactic AU vectors are Earth-relative. The legacy
 * function name is retained; no filled wedge faces are generated. */
export function getZodiacVolume(value,{innerRadiusAU=6371/149597870.7,outerRadiusAU=2}={}){
 if(!Number.isFinite(innerRadiusAU)||!Number.isFinite(outerRadiusAU)||innerRadiusAU<=0||outerRadiusAU<=innerRadiusAU||outerRadiusAU>10000)throw new RangeError('Choose finite positive zodiac display radii.');
 const frame=frameAt(value),key=[frame.key,innerRadiusAU,outerRadiusAU].join('|');if(cachedVolume?.key===key)return cachedVolume.value;
 const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>eclipticToGalactic(rotate(eqjEcl,rotate(frame.toEqj,rotate(frame.rotation,v))))),points=new Map();
 const point=(lon,lat,radius)=>{
  lon=norm(lon);const key=[lon,lat,radius].join('|');if(points.has(key))return points.get(key);
  const l=lon*RAD,b=lat*RAD,v=[Math.cos(l)*Math.cos(b),Math.sin(l)*Math.cos(b),Math.sin(b)],out=[0,1,2].map(i=>radius*(basis[0][i]*v[0]+basis[1][i]*v[1]+basis[2][i]*v[2]));points.set(key,out);return out;
 };
 const sectors=SIGNS.map((sign,index)=>{
  const start=index*30,end=start+30;
  return {sign,name:sign,index,startDeg:start,endDeg:end,labelPosition:point(start+15,0,outerRadiusAU*.72),radialEdges:[start,end].map(lon=>[point(lon,0,innerRadiusAU),point(lon,0,outerRadiusAU)])};
 });
 const output={date:frame.date,sectors,innerRadiusAU,outerRadiusAU,frame:'Earth-relative Galactic AU; tropical ecliptic/equinox of selected model date',description:'Schematic coordinate outlines and names; 30-degree longitude sectors, with no filled wedges.'};cachedVolume={key,value:output};return output;
}

/** Exact eastern horizon and upper-meridian intersections of the ecliptic.
 * At a geographic pole no unique local east/meridian exists, so angles are null.
 * If the ecliptic coincides with the horizon, no single ascendant exists. */
export function zodiacAt(value, latitude, longitude) {
  const frame = frameAt(value), observer = observerAt(latitude, longitude, frame);
  const key = `${frame.key}|${latitude}|${longitude}`;
  if (cachedZodiac?.key === key) return cachedZodiac.value;
  const base = getZodiacEarthLines(frame.date), project = point => inHorizon(point, observer);
  const fromVector = v => project(directionAt(norm(Math.atan2(dot(v, frame.eclipticY), dot(v, frame.eclipticX)) * DEG), frame));
  const issues = [];
  let ascendant = null, midheaven = null;
  if (Math.abs(latitude) >= 90 - 1e-10) issues.push('At a geographic pole the local eastern horizon and meridian are not uniquely defined.');
  else {
    let rising = unit(cross(frame.eclipticPole, observer.up));
    if (!rising || Math.abs(dot(rising, observer.east)) < 1e-10) issues.push('The ecliptic and horizon are degenerate; no unique rising intersection.');
    else {
      if (dot(rising, observer.east) < 0) rising = rising.map(v => -v);
      ascendant = fromVector(rising);
    }
    let upper = unit(cross(frame.eclipticPole, observer.east));
    if (upper) {
      // Select RA=LST, including where that point is below the polar horizon.
      if (upper[0] * Math.cos(observer.theta) + upper[1] * Math.sin(observer.theta) < 0) upper = upper.map(v => -v);
      midheaven = fromVector(upper);
    } else issues.push('The ecliptic and meridian have no unique intersection.');
  }
  const opposite = point => point && project(directionAt(point.longitudeDeg + 180, frame));
  const valueOut = { ...base, latitude, longitude, siderealHours: norm(observer.theta * DEG) / 15,
    ascendant, midheaven, descendant: opposite(ascendant), imumCoeli: opposite(midheaven), issues,
    anglesAvailable: !!ascendant && !!midheaven,
    boundaries: base.boundaries.map(project), ecliptic: base.ecliptic.map(project),
    sectors: base.sectors.map(sector => ({ ...sector, center: project(sector.center), points: sector.points.map(project), polygon: sector.polygon.map(project), boundaries: sector.boundaries.map(project), boundaryMeridian: sector.boundaryMeridian.map(project) })) };
  cachedZodiac = { key, value: valueOut };
  return valueOut;
}

/** Machine-authored Codex/OpenAI, claim 260923-152144-001.
 * Earth astrology is coordinate geometry only. Live geocentric J2000-ecliptic
 * body vectors are rotated into the same true ecliptic of date as ASC/MC.
 * Remote dates retain the application's explicitly illustrative model date.
 */
const EARTH_RADIUS_AU=6371/149597870.7;
const MERIDIAN_LATITUDES=Array.from({length:91},(_,i)=>{const b=(-90+i*2)*RAD;return [Math.cos(b),Math.sin(b)];});
let cachedAstrology=null,cachedAstrologyGeometry=null;
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function tropicalVector(vector,frame){return inverseRotate(frame.rotation,inverseRotate(frame.toEqj,inverseRotate(eqjEcl,vector)));}
export const ASTROLOGY_BODY_IDS=Object.freeze(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto']);
export const ASTROLOGY_OBJECT_IDS=Object.freeze([...ASTROLOGY_BODY_IDS,'ASC','MC','DSC','IC']);
function bodySignature(bodies){return ASTROLOGY_BODY_IDS.map(id=>{const b=bodies.find(x=>x.id===id);return [id,...(b?.geoPosition||[]),b?.corrections||''].join(',');}).join('|');}
export function astrologyAt(value,latitude,longitude,{bodies}={}){
 const frame=frameAt(value),observer=observerAt(latitude,longitude,frame);bodies??=stateAt(frame.date);
 const key=[frame.key,latitude,longitude,bodySignature(bodies)].join('|');if(cachedAstrology?.key===key)return cachedAstrology.value;
 const angles=zodiacAt(frame.date,latitude,longitude),accuracy=accuracyAt(frame.date),issues=[...angles.issues];
 const named=(id,label,p)=>p?{...p,id,label,galacticDirection:eclipticToGalactic(p.eclipticJ2000)}:null;
 const bodyPoint=id=>{
  const body=bodies.find(b=>b.id===id),v=body?.geoPosition;
  if(!finiteVector(v)||Math.hypot(...v)===0){issues.push(`${id} geocentric coordinates are unavailable.`);return null;}
  const ect=tropicalVector(v,frame),length=Math.hypot(...ect),lon=norm(Math.atan2(ect[1],ect[0])*DEG),lat=Math.asin(clamp(ect[2]/length))*DEG;
  return {...named(id,id,inHorizon(directionAt(lon,frame,lat),observer)),distanceAU:length,corrections:body.corrections||'Geocentric vector supplied by the current model'};
 };
 const bodyPoints=Object.fromEntries(ASTROLOGY_BODY_IDS.map(id=>[id,bodyPoint(id)])),sun=bodyPoints.Sun,moon=bodyPoints.Moon,ascendant=named('ASC','Ascendant',angles.ascendant),midheaven=named('MC','Midheaven',angles.midheaven),descendant=named('DSC','Descendant',angles.descendant),imumCoeli=named('IC','Imum coeli',angles.imumCoeli);
 if(accuracy.illustrative)issues.push('Remote date: tropical orientation uses the calendar proxy date with periodic body positions; this is illustrative, not predictive.');
 const result={date:frame.date,latitude,longitude,sun,moon,ascendant,midheaven,descendant,imumCoeli,bodies:bodyPoints,planets:Object.fromEntries(ASTROLOGY_BODY_IDS.slice(2).map(id=>[id,bodyPoints[id]])),points:[...Object.values(bodyPoints),ascendant,midheaven,descendant,imumCoeli].filter(Boolean),issues,siderealHours:angles.siderealHours,accuracy,frame:accuracy.illustrative?'Illustrative proxy-date tropical ecliptic; periodic geocentric positions':'True tropical ecliptic/equinox of date; geocentric Sun, Moon and planets; geometric local horizon',horizonModel:'Geometric geocentric directions; no topocentric parallax, atmospheric refraction or polar motion. UTC approximates UT1.'};
 cachedAstrology={key,value:result};return result;
}

/** Finite Earth-relative Galactic AU guides. Radius settings are Earth radii.
 * Surface outlines really touch the reference sphere; other paths are display
 * coordinate guides and do not claim physical structures in space. */
export function getAstrologyGeometry(value,{latitude=0,longitude=0}={}, {bodies,wedgeRadiusEarth=5,eclipticRadiusEarth=5,longitudeStepDegrees=10}={}){
 for(const radius of [wedgeRadiusEarth,eclipticRadiusEarth])if(!Number.isFinite(radius)||radius<1.01||radius>500)throw new RangeError('Astrology guide radii must be 1.01–500 Earth radii.');
 if(!Number.isFinite(longitudeStepDegrees)||longitudeStepDegrees<1||longitudeStepDegrees>90)throw new RangeError('Longitude divisions must be1–90 degrees.');
 const frame=frameAt(value),calculations=astrologyAt(frame.date,latitude,longitude,{bodies});
 const key=[cachedAstrology.key,wedgeRadiusEarth,eclipticRadiusEarth,longitudeStepDegrees].join('|');if(cachedAstrologyGeometry?.key===key)return cachedAstrologyGeometry.value;
 const radiusAU=EARTH_RADIUS_AU*wedgeRadiusEarth,eclipticRadiusAU=EARTH_RADIUS_AU*eclipticRadiusEarth;
 const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>eclipticToGalactic(rotate(eqjEcl,rotate(frame.toEqj,rotate(frame.rotation,v)))));
 const vector=(x,y,z,r)=>[r*(basis[0][0]*x+basis[1][0]*y+basis[2][0]*z),r*(basis[0][1]*x+basis[1][1]*y+basis[2][1]*z),r*(basis[0][2]*x+basis[1][2]*y+basis[2][2]*z)];
 const point=(lon,lat,r)=>{const l=lon*RAD,b=lat*RAD,c=Math.cos(b);return vector(Math.cos(l)*c,Math.sin(l)*c,Math.sin(b),r);};
 const meridian=(lon,r)=>{const c=Math.cos(lon*RAD),s=Math.sin(lon*RAD);return MERIDIAN_LATITUDES.map(([cb,sb])=>vector(c*cb,s*cb,sb,r));};
 const ring=r=>Array.from({length:181},(_,i)=>point(i*2,0,r));
 const volume=getZodiacVolume(frame.date,{innerRadiusAU:EARTH_RADIUS_AU,outerRadiusAU:radiusAU}),outlines=[{kind:'surface',points:ring(EARTH_RADIUS_AU)},{kind:'outer',points:ring(radiusAU)}],longitudeGrid=[];
 for(let lon=0;lon<360;lon+=30){
  outlines.push({kind:'surface',longitudeDeg:lon,points:meridian(lon,EARTH_RADIUS_AU)},{kind:'outer',longitudeDeg:lon,points:meridian(lon,radiusAU)},{kind:'radial',longitudeDeg:lon,points:[point(lon,0,EARTH_RADIUS_AU),point(lon,0,radiusAU)]});

 }
 for(let i=0;i<Math.ceil(360/longitudeStepDegrees);i++){const lon=i*longitudeStepDegrees;if(lon>=360)break;longitudeGrid.push({longitudeDeg:lon,points:meridian(lon,radiusAU)});}
 // Display markers encode longitude on the ecliptic ring. Keep the original
 // latitude in the calculation/readout instead of displacing the marker.
 const points=calculations.points.map(p=>({...p,position:point(p.longitudeDeg,0,eclipticRadiusAU),displayLatitudeDeg:0}));
 const longitudePoints=calculations.points.filter(p=>ASTROLOGY_BODY_IDS.includes(p.id)).map(p=>({...p,position:point(p.longitudeDeg,p.latitudeDeg,eclipticRadiusAU),displayLatitudeDeg:p.latitudeDeg}));
 const longitudes=calculations.points.map(p=>({id:p.id,longitudeDeg:p.longitudeDeg,points:meridian(p.longitudeDeg,eclipticRadiusAU),radiusAU:eclipticRadiusAU}));
 const moonLongitude=longitudes.find(p=>p.id==='Moon')??null;
 const result={calculations,volume,outlines,longitudeGrid,eclipticRing:ring(eclipticRadiusAU),longitudes,moonLongitude,points,longitudePoints,radiusAU,eclipticRadiusAU,longitudeStepDegrees,frame:'Earth-relative Galactic AU'};
 cachedAstrologyGeometry={key,value:result};return result;
}

/** Nearest forward ray intersection with a finite coordinate sphere. Returns
 * true tropical longitude/latitude, independent of screen projection or camera. */
export function pickAstrologyCoordinate(value,origin,direction,radiusAU){
 if(!finiteVector(origin)||!finiteVector(direction)||!Number.isFinite(radiusAU)||radiusAU<=0)throw new RangeError('Finite ray and positive coordinate radius required.');
 const length=Math.hypot(...direction);if(length===0)return null;
 const d=direction.map(x=>x/length),projection=dot(origin,d),closest=origin.map((x,i)=>x-projection*d[i]),miss2=dot(closest,closest),radius2=radiusAU*radiusAU;
 if(miss2>radius2*(1+1e-12))return null;
 const half=Math.sqrt(Math.max(0,radius2-miss2)),near=-projection-half,far=-projection+half,distanceAU=near>=0?near:far;
 if(distanceAU<0)return null;
 // Build the surface point from closest approach; avoids far-origin cancellation.
 const position=closest.map((x,i)=>x+(near>=0?-half:half)*d[i]),frame=frameAt(value);
 const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>eclipticToGalactic(rotate(eqjEcl,rotate(frame.toEqj,rotate(frame.rotation,v))))),v=basis.map(axis=>dot(position,axis)),longitudeDeg=norm(Math.atan2(v[1],v[0])*DEG),latitudeDeg=Math.asin(clamp(v[2]/Math.hypot(...v)))*DEG;
 return {position,distanceAU,longitudeDeg,latitudeDeg,sign:SIGNS[Math.floor(longitudeDeg/30)],degree:longitudeDeg%30};
}
