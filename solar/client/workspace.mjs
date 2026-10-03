// Machine-authored by Codex / OpenAI, claim 260921-102739-001/solar-system-zss-static.
// Portable, inspectable user settings. No DOM, storage, playback, provider or mutation effects.
// Excludes computed catalogues/events and JPL results/requests.
import { validatedDate } from './time.mjs';
import { GALACTIC_MODEL } from './galactic.mjs';
import { TIME_SPANS } from './timeline.mjs';
import { validTimeZone } from './time-zones.mjs';
import { MOON_IDS, MINOR_BODY_IDS } from './astro.mjs';
import { BODY_SURFACE_IDS } from './body-surfaces.mjs';

export const WORKSPACE_VERSION = 18;
export const MAX_WORKSPACE_LENGTH = 65536;
const PANELS = ['source', 'heading', 'inspector', 'observer', 'map', 'tools', 'timeline'];
const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const INNER_PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars'];
const fail = (path, detail) => { throw new TypeError(`${path}: ${detail}.`); };
const bool = (value, path) => typeof value === 'boolean' ? value : fail(path, 'expected true or false');
const choice = values => (value, path) => values.includes(value) ? value : fail(path, `expected ${values.join(', ')}`);
const numeric = (min, max, integer = false) => (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(path, `expected ${integer ? 'an integer' : 'a finite number'} from ${min} to ${max}`);
  return value;
};
const bearing = (value, path) => {
  numeric(0, 360)(value, path);
  if (value === 360) fail(path, 'expected a bearing below 360');
  return value;
};
const wrap = value => ((value % 360) + 360) % 360;

/** Exact own data properties only: imported keys never become a prototype or accessor. */
function record(value, required, path, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(path, 'expected a plain object');
  const allowed = [...required, ...optional];
  for (const key of Reflect.ownKeys(value)) {
    if (!allowed.includes(key)) fail(path, 'unknown field');
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail(path, 'accessor fields are not supported');
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required field is missing');
  return value;
}

function validateSettings(value, version = WORKSPACE_VERSION) {
  const path = 'workspace';
  record(value, ['density', 'theme', 'panelVisibility', 'timelineCollapsed', 'magneticSnap', ...(version >= 2 ? ['panelsHidden'] : []), ...(version >= 4 ? ['topbarHidden'] : [])], path);
  record(value.panelVisibility, PANELS, `${path}.panelVisibility`);
  return {
    density: choice(['normal', 'reduced', 'zen'])(value.density, `${path}.density`),
    theme: choice(['light', 'dark'])(value.theme, `${path}.theme`),
    panelVisibility: Object.fromEntries(PANELS.map(key => [key, bool(value.panelVisibility[key], `${path}.panelVisibility.${key}`)])),
    timelineCollapsed: bool(value.timelineCollapsed, `${path}.timelineCollapsed`),
    magneticSnap: bool(value.magneticSnap, `${path}.magneticSnap`),
    panelsHidden: version >= 2 ? bool(value.panelsHidden, `${path}.panelsHidden`) : false,
    topbarHidden: version >= 4 ? bool(value.topbarHidden, `${path}.topbarHidden`) : false,
  };
}

function utc(value, path) {
  if (typeof value !== 'string') fail(path, 'expected a canonical UTC timestamp');
  const date = validatedDate(value);
  if (date.toISOString() !== value) fail(path, 'use canonical ISO UTC with milliseconds');
  return value;
}

function trailBodies(value, path) {
  if (value === null) return null; // The live renderer uses an absent/null list for all planets.
  if (!Array.isArray(value) || value.length < 1 || value.length > PLANETS.length || Object.getPrototypeOf(value) !== Array.prototype) fail(path, 'expected null or a planet list');
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(path, 'expected a dense unadorned planet list');
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index), 'value')) fail(path, 'expected ordinary planet entries');
  const result = Array.from(value, item => choice(PLANETS)(item, path));
  if (result.length !== INNER_PLANETS.length || result.some((item, index) => item !== INNER_PLANETS[index])) fail(path, 'expected null for all planets or the four inner planets in orbital order');
  return result;
}

const SCENE_FIELDS = {
  date: utc,
  selected: choice([null, 'Sun', ...PLANETS, ...MOON_IDS, ...MINOR_BODY_IDS, 'ISS', 'Sagittarius A*']),
  mode: choice(['space', 'surface']),
  latitude: numeric(-90, 90), longitude: numeric(-180, 180), height: numeric(-500, 10000),
  heading: bearing, moveSpeed: choice([1, 100, 10000, 100000, 3000000]),
  orbits: bool, labels: bool, scale: choice(['true']),
  fov: numeric(.12, 175), trackSun: bool, speed: numeric(-3155760000000000, 3155760000000000),
  panel: choice(['bodies', 'events', 'alignments']), span: choice(Object.keys(TIME_SPANS)), refraction: choice(['none']),
  trailYears: choice([.25, 1, 2, 10, 100, 1000, 10000, 100000]), trailFrame: choice(['galactic', 'heliocentric']), trailBodies,
  showStars: bool, showConstellations: bool, showZodiac: bool,
  bodyScale: numeric(1, 1e12), markerMode: choice(['schematic', 'physical']), markerSize: numeric(.25, 4),
  keepSolarVisible: bool, solarDistanceScale: numeric(1, 1e8), showGalacticTrails: bool, galacticCoils: numeric(1, 64, true),
  earthOpacity: numeric(0, 1), showSurfaceMap: bool, showCities: bool, curvature: numeric(1, 1e5),
  galacticYears: numeric(0, GALACTIC_MODEL.periodYears), galacticSpeed: choice([1, 1000, 100000, 1000000, 10000000, 100000000]),
};

export const SCENE_V6_DEFAULTS = Object.freeze({animateNavigation:true,showSurfaceGrid:true,surfaceGridSpacing:10,surfaceGridOpacity:.4,showSurfaceTexture:true,surfaceTextureOpacity:.55,showSurfacePin:true,surfacePinHeight:1,surfacePin:null,showZodiacLabels:true,zodiacOpacity:.16});
function validateSurfacePin(value,path){
  if(value===null)return null;
  record(value,['bodyId','latitude','longitude','heightM'],path);
  return {bodyId:choice(['Sun',...PLANETS,...MOON_IDS])(value.bodyId,`${path}.bodyId`),latitude:numeric(-90,90)(value.latitude,`${path}.latitude`),longitude:numeric(-180,180)(value.longitude,`${path}.longitude`),heightM:numeric(0,1e28)(value.heightM,`${path}.heightM`)};
}
export const SCENE_V7_DEFAULTS=Object.freeze({showZodiacOutline:true,showZodiacGrid:true,zodiacRadiusEarth:5,zodiacColor:'#dcad65',showEclipticRing:true,eclipticRadiusEarth:6,eclipticColor:'#e5c56c',eclipticOpacity:.7,showMoonLongitude:true,showCelestialPoints:true,showPointStats:true,eclipseKind:'solar'});
const color=(value,path)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fail(path,'expected a six-digit hexadecimal color');
const V7_FIELDS={showZodiacOutline:bool,showZodiacGrid:bool,zodiacRadiusEarth:numeric(1.01,500),zodiacColor:color,showEclipticRing:bool,eclipticRadiusEarth:numeric(1.01,500),eclipticColor:color,eclipticOpacity:numeric(0,1),showMoonLongitude:bool,showCelestialPoints:bool,showPointStats:bool,eclipseKind:choice(['solar','lunar'])};
export const SCENE_V8_DEFAULTS=Object.freeze({pinSpeedMultiplier:1,showEarthTerrain:true,earthTerrainDetail:'medium',zodiacGridStep:10,zodiacGridColor:'#bdcca5',zodiacGridOpacity:.55,zodiacGridWidth:1,playbackUnit:'days'});
const V8_FIELDS={pinSpeedMultiplier:numeric(.01,100),showEarthTerrain:bool,earthTerrainDetail:choice(['low','medium','high']),zodiacGridStep:numeric(1,90),zodiacGridColor:color,zodiacGridOpacity:numeric(0,1),zodiacGridWidth:numeric(.25,5),playbackUnit:choice(['seconds','minutes','hours','days','weeks','years'])};
export const SCENE_V9_DEFAULTS=Object.freeze({pinStemColor:'#ffcc74',pinStemWidth:2,pinStemOpacity:.8,pinPointColor:'#ffdf9c',pinPointSize:5,pinPointOpacity:1,showMilkyWay:true,milkyWayOpacity:.55,milkyWayDetail:'medium',showClusterLabels:true});
const V9_FIELDS={pinStemColor:color,pinStemWidth:numeric(.5,8),pinStemOpacity:numeric(0,1),pinPointColor:color,pinPointSize:numeric(2,16),pinPointOpacity:numeric(0,1),showMilkyWay:bool,milkyWayOpacity:numeric(0,1),milkyWayDetail:choice(['low','medium','high']),showClusterLabels:bool};
export const ASTROLOGY_OBJECT_IDS=Object.freeze(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC','DSC','IC']);
const astrologyObjectDefaults=Object.freeze(Object.fromEntries(ASTROLOGY_OBJECT_IDS.map((id,index)=>[id,Object.freeze({point:true,stats:true,longitude:true})])));
export const SCENE_V10_DEFAULTS=Object.freeze({showAstrology:true,astrologyObjects:astrologyObjectDefaults,earthMapStyle:'satellite',earthImageDetail:75});
function validateAstrologyObjects(value,path,legacy=false){
  const ids=legacy?ASTROLOGY_OBJECT_IDS.filter(id=>id!=='Pluto'):ASTROLOGY_OBJECT_IDS;
  record(value,ids,path);
  return Object.fromEntries(ids.map(id=>{const entry=value[id];record(entry,['point','stats','longitude'],`${path}.${id}`);return [id,Object.fromEntries(['point','stats','longitude'].map(key=>[key,bool(entry[key],`${path}.${id}.${key}`)]))];}));
}
const V10_FIELDS={showAstrology:bool,astrologyObjects:validateAstrologyObjects,earthMapStyle:choice(['satellite','pixels','dots','schematic']),earthImageDetail:numeric(0,100,true)};
export const SCENE_V11_DEFAULTS=Object.freeze({showEclipticLongitudes:true,trackBody:null,timeZone:'America/New_York',pinTimeZone:'auto'});
const zone=(value,path)=>validTimeZone(value)?value:fail(path,'expected a supported IANA time zone');
const V11_FIELDS={showEclipticLongitudes:bool,trackBody:choice([null,'Sun',...PLANETS,...MOON_IDS,...MINOR_BODY_IDS,'ISS']),timeZone:zone,pinTimeZone:(value,path)=>value==='auto'?'auto':zone(value,path)};
export const SCENE_V12_DEFAULTS=Object.freeze({showMoons:true,moonVisibility:Object.freeze(Object.fromEntries(MOON_IDS.map(id=>[id,true]))),showAsteroidBelt:true});
function validateMoonVisibility(value,path){
  record(value,MOON_IDS,path);
  return Object.fromEntries(MOON_IDS.map(id=>[id,bool(value[id],`${path}.${id}`)]));
}
const V12_FIELDS={showMoons:bool,moonVisibility:validateMoonVisibility,showAsteroidBelt:bool};
export const SCENE_V13_DEFAULTS=Object.freeze({showLongitudePoints:true});
const V13_FIELDS={showLongitudePoints:bool};
export const SCENE_V15_DEFAULTS=Object.freeze({showISS:true,showISSOrbit:true,issOrbitOpacity:.85,issOrbitWidth:1,issOrbitColor:'#64d9f5',issOrbitStyle:'solid',issOrbitThroughEarth:false,showNonEarthMoons:true});
const V15_FIELDS={showISS:bool,showISSOrbit:bool,issOrbitOpacity:numeric(0,1),issOrbitWidth:numeric(.25,8),issOrbitColor:color,issOrbitStyle:choice(['solid','dashed']),issOrbitThroughEarth:bool,showNonEarthMoons:bool};
export const SCENE_V16_DEFAULTS=Object.freeze({showMoonOrbit:true,moonOrbitOpacity:.6,moonOrbitWidth:1,moonOrbitColor:'#bcc7d6',moonOrbitStyle:'solid',moonOrbitThroughEarth:false,timelineTimeZoneMode:'utc'});
const V16_FIELDS={showMoonOrbit:bool,moonOrbitOpacity:numeric(0,1),moonOrbitWidth:numeric(.25,8),moonOrbitColor:color,moonOrbitStyle:choice(['solid','dashed']),moonOrbitThroughEarth:bool,timelineTimeZoneMode:choice(['utc','display'])};
export const SCENE_V17_DEFAULTS=Object.freeze({issProvider:'auto',issAutoRefresh:true,showISSFootprint:false,issVisiblePassesOnly:true,ephemerisMode:'local',showMinorBodies:true,moonSurfaceDetail:'imagery',moonTerrainExaggeration:1,showPhysicalShadows:true});
const V17_FIELDS={issProvider:choice(['auto','oem','gp','supgp']),issAutoRefresh:bool,showISSFootprint:bool,issVisiblePassesOnly:bool,ephemerisMode:choice(['local','cached']),showMinorBodies:bool,moonSurfaceDetail:choice(['schematic','imagery','terrain']),moonTerrainExaggeration:numeric(1,20),showPhysicalShadows:bool};
export const SCENE_V18_DEFAULTS=Object.freeze({surfaceOpacities:Object.freeze({})});
function validateSurfaceOpacities(value,path){
  record(value,[],path,BODY_SURFACE_IDS);
  return Object.fromEntries(Reflect.ownKeys(value).map(id=>[id,numeric(0,1)(value[id],`${path}.${id}`)]));
}
const V18_FIELDS={surfaceOpacities:validateSurfaceOpacities};
const V6_FIELDS={animateNavigation:bool,showSurfaceGrid:bool,surfaceGridSpacing:choice([1,5,10,15,30]),surfaceGridOpacity:numeric(0,1),showSurfaceTexture:bool,surfaceTextureOpacity:numeric(0,1),showSurfacePin:bool,surfacePinHeight:numeric(0,1e28),surfacePin:validateSurfacePin,showZodiacLabels:bool,zodiacOpacity:numeric(0,1)};

function validatePan(value, path) {
  record(value, ['x', 'y'], path);
  // Pan has no UI clamp. This portable bound exceeds a complete zoom traversal's
  // screen offsets while keeping imported values away from floating-point overflow.
  return { x: numeric(-1e24, 1e24)(value.x, `${path}.x`), y: numeric(-1e24, 1e24)(value.y, `${path}.y`) };
}

function validateGlobe(value, path) {
  if (value === null) return null;
  record(value, ['latitude', 'longitude', 'altitudeM'], path);
  return { latitude: numeric(-90, 90)(value.latitude, `${path}.latitude`), longitude: numeric(-180, 180)(value.longitude, `${path}.longitude`), altitudeM: numeric(30, 1e12)(value.altitudeM, `${path}.altitudeM`) };
}

function vector3(value,path,unit=false){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length!==3||Reflect.ownKeys(value).length!==4)fail(path,'expected three ordinary coordinates');
  for(let i=0;i<3;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))??{},'value'))fail(path,'expected ordinary coordinates');
  const result=value.map((n,i)=>numeric(-1e17,1e17)(n,`${path}.${i}`));
  if(unit&&Math.abs(Math.hypot(...result)-1)>1e-6)fail(path,'expected a unit direction');
  return result;
}
function validateFlight(value,path,version=WORKSPACE_VERSION){
  if(value===null)return null;
  record(value,['position','forward','up','tether','speedAU','followBody'],path);
  const result={followBody:value.followBody===null?null:choice(['Sun',...PLANETS,...MOON_IDS,...MINOR_BODY_IDS,'ISS','Sagittarius A*'])(value.followBody,`${path}.followBody`),position:vector3(value.position,`${path}.position`),forward:vector3(value.forward,`${path}.forward`,true),up:vector3(value.up,`${path}.up`,true),tether:null,speedAU:numeric(1/149597870700,1e12)(value.speedAU,`${path}.speedAU`)};
  if(version<17&&MINOR_BODY_IDS.includes(result.followBody))fail(`${path}.followBody`,'minor bodies require workspace version17');
  if(version<14&&result.followBody==='ISS')fail(`${path}.followBody`,'ISS requires workspace version14');
  if(Math.abs(result.forward.reduce((n,v,i)=>n+v*result.up[i],0))>1e-6)fail(path,'forward and up must be perpendicular');
  if(value.tether!==null){
    const t=value.tether;record(t,['bodyId','latitude','longitude','altitudeM','heading','elevation','roll',...(version>=7?['controlMode']:[])],`${path}.tether`);
    result.tether={controlMode:version>=7?choice(['free','surface'])(t.controlMode,`${path}.tether.controlMode`):'surface',bodyId:choice(['Sun',...PLANETS,...MOON_IDS,...(version>=15?['ISS']:[])])(t.bodyId,`${path}.tether.bodyId`),latitude:numeric(-90,90)(t.latitude,`${path}.tether.latitude`),longitude:numeric(-180,180)(t.longitude,`${path}.tether.longitude`),altitudeM:numeric(2,1e28)(t.altitudeM,`${path}.tether.altitudeM`),heading:bearing(t.heading,`${path}.tether.heading`),elevation:numeric(-90,90)(t.elevation,`${path}.tether.elevation`),roll:numeric(-180,180)(t.roll,`${path}.tether.roll`)};
  }
  if(result.tether?.bodyId==='ISS'&&(result.tether.latitude!==0||result.tether.longitude!==0||result.tether.altitudeM!==2))fail(`${path}.tether`,'ISS onboard anchor requires latitude 0, longitude 0 and altitudeM 2');
  if(result.tether){if(version<6){if(result.followBody!==null)fail(path,'legacy surface tether must have null orbit following');result.followBody=result.tether.bodyId;}else if(result.followBody!==result.tether.bodyId)fail(path,'surface tether must retain orbit following for the same body');}
  return result;
}

function validateCamera(value, path, surfaceAim = true, version = WORKSPACE_VERSION) {
  record(value, ['yaw', 'pitch', 'zoom', 'pan', ...(surfaceAim ? ['azimuth', 'elevation'] : []), ...(version >= 2 ? ['globe'] : []),...(version>=3&&surfaceAim?['flight']:[])], path);
  const camera = {
    yaw: numeric(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)(value.yaw, `${path}.yaw`),
    pitch: numeric(value.flight?-Math.PI/2:-1.48, value.flight?Math.PI/2:1.48)(value.pitch, `${path}.pitch`),
    zoom: numeric(1e-10, 1e8)(value.zoom, `${path}.zoom`),
    pan: validatePan(value.pan, `${path}.pan`),
  };
  if (surfaceAim) {
    camera.azimuth = bearing(value.azimuth, `${path}.azimuth`);
    camera.elevation = numeric(value.flight?-90:-89.9999, value.flight?90:89.9999)(value.elevation, `${path}.elevation`);
  }
  camera.globe = version >= 2 ? validateGlobe(value.globe, `${path}.globe`) : null;
  if(surfaceAim)camera.flight=version>=3?validateFlight(value.flight,`${path}.flight`,version):null;
  return camera;
}

function validateMiniGlobe(value) {
  if (value === null) return null;
  const path = 'scene.miniGlobe';
  record(value, ['view', 'zoom', 'pan'], path);
  record(value.view, ['latitude', 'longitude'], `${path}.view`);
  return {
    view: { latitude: numeric(-90, 90)(value.view.latitude, `${path}.view.latitude`), longitude: numeric(-180, 180)(value.view.longitude, `${path}.view.longitude`) },
    zoom: numeric(.65, 3)(value.zoom, `${path}.zoom`),
    // Live pan is clamped to the current viewport; an imported file has no fixed
    // viewport dimensions, so preserve its finite offset under the portable bound.
    pan: validatePan(value.pan, `${path}.pan`),
  };
}

function validateScene(value, version) {
  record(value, [...Object.keys(SCENE_FIELDS), 'camera', 'savedViews', 'miniGlobe',...(version>=3?['unifiedFlight','showSolarOrbit']:[]),...(version>=4?['autoTimelineSpan','showFlightStats','showConstellationNames','showStellarMotion']:[]),...(version>=5?['showSurfaceMarkings','surfaceOpacity']:[]),...(version>=6?Object.keys(V6_FIELDS):[]),...(version>=7?Object.keys(V7_FIELDS):[]),...(version>=8?Object.keys(V8_FIELDS):[]),...(version>=9?Object.keys(V9_FIELDS):[]),...(version>=10?Object.keys(V10_FIELDS):[]),...(version>=11?Object.keys(V11_FIELDS):[]),...(version>=12?Object.keys(V12_FIELDS):[]),...(version>=13?Object.keys(V13_FIELDS):[]),...(version>=15?Object.keys(V15_FIELDS):[]),...(version>=16?Object.keys(V16_FIELDS):[]),...(version>=17?Object.keys(V17_FIELDS):[]),...(version>=18?Object.keys(V18_FIELDS):[])], 'scene');
  const result = Object.fromEntries(Object.entries(SCENE_FIELDS).map(([key, validate]) => [key, validate(value[key], `scene.${key}`)]));
  if(version<8&&result.selected===null)fail('scene.selected','legacy versions require a selected body');
  result.unifiedFlight=version>=3?bool(value.unifiedFlight,'scene.unifiedFlight'):false;
  result.showSolarOrbit=version>=3?bool(value.showSolarOrbit,'scene.showSolarOrbit'):true;
  for (const key of ['autoTimelineSpan','showFlightStats','showConstellationNames','showStellarMotion']) result[key] = version >= 4 ? bool(value[key], `scene.${key}`) : false;
  result.showSurfaceMarkings=version>=5?bool(value.showSurfaceMarkings,'scene.showSurfaceMarkings'):true;
  result.surfaceOpacity=version>=5?numeric(0,1)(value.surfaceOpacity,'scene.surfaceOpacity'):result.earthOpacity;
  for(const [key,validate] of Object.entries(V6_FIELDS))result[key]=version>=6?validate(value[key],`scene.${key}`):SCENE_V6_DEFAULTS[key];
  for(const [key,validate] of Object.entries(V7_FIELDS))result[key]=version>=7?validate(value[key],`scene.${key}`):SCENE_V7_DEFAULTS[key];
  for(const [key,validate] of Object.entries(V8_FIELDS))result[key]=version>=8?validate(value[key],`scene.${key}`):key==='playbackUnit'?'seconds':SCENE_V8_DEFAULTS[key];
  for(const [key,validate] of Object.entries(V9_FIELDS))result[key]=version>=9?validate(value[key],`scene.${key}`):SCENE_V9_DEFAULTS[key];
  for(const [key,validate] of Object.entries(V10_FIELDS))result[key]=key==='astrologyObjects'&&version===10?validateAstrologyObjects(value[key],`scene.${key}`,true):validate(version>=10?value[key]:SCENE_V10_DEFAULTS[key],`scene.${key}`);
  if(!result.astrologyObjects.Pluto)result.astrologyObjects.Pluto={point:true,stats:true,longitude:true};
  for(const [key,validate] of Object.entries(V11_FIELDS))result[key]=version>=11?validate(value[key],`scene.${key}`):SCENE_V11_DEFAULTS[key];
  for(const [key,validate] of Object.entries(V12_FIELDS))result[key]=validate(version>=12?value[key]:SCENE_V12_DEFAULTS[key],`scene.${key}`);
  for(const [key,validate] of Object.entries(V13_FIELDS))result[key]=validate(version>=13?value[key]:SCENE_V13_DEFAULTS[key],`scene.${key}`);
  for(const [key,validate] of Object.entries(V15_FIELDS))result[key]=validate(version>=15?value[key]:SCENE_V15_DEFAULTS[key],`scene.${key}`);
  for(const [key,validate] of Object.entries(V16_FIELDS))result[key]=validate(version>=16?value[key]:SCENE_V16_DEFAULTS[key],`scene.${key}`);
  for(const [key,validate] of Object.entries(V17_FIELDS))result[key]=validate(version>=17?value[key]:SCENE_V17_DEFAULTS[key],`scene.${key}`);
  for(const [key,validate] of Object.entries(V18_FIELDS))result[key]=validate(version>=18?value[key]:SCENE_V18_DEFAULTS[key],`scene.${key}`);
  if(version<17&&(MINOR_BODY_IDS.includes(result.selected)||MINOR_BODY_IDS.includes(result.trackBody)))fail('scene','minor bodies require workspace version17');
  if(version<14&&(result.selected==='ISS'||result.trackBody==='ISS'))fail('scene','ISS requires workspace version14');
  if(version<11)result.trackBody=result.trackSun?'Sun':null;
  if(version>=11&&result.trackSun!==(result.trackBody==='Sun'))fail('scene.trackSun','must agree with the tracking target');
  if(version<10)result.astrologyObjects.Moon.longitude=result.showMoonLongitude;
  if(result.astrologyObjects.Moon.longitude!==result.showMoonLongitude)fail('scene.showMoonLongitude','must agree with the Moon longitude setting');
  if(result.surfacePin&&result.surfacePin.heightM!==result.surfacePinHeight)fail('scene.surfacePin.heightM','must agree with the marker height control');
  result.curvature = 1; // Retained schema field; the globe now always has physical mean radius.
  if (version === 1) result.fov = Math.min(90, result.fov);
  else numeric(.12, 90)(result.fov, 'scene.fov');
  result.camera = validateCamera(value.camera, 'scene.camera', true, version);
  if (Math.abs(result.heading - result.camera.azimuth) > 1e-9) fail('scene.heading', 'must agree with camera azimuth');
  // The active globe and astronomical observer describe one physical location.
  // Saved cameras below are independent bookmarks and need not share that pose.
  if (result.camera.globe && !result.camera.flight) {
    const globe = result.camera.globe;
    if (result.mode === 'space' && result.selected !== 'Earth') fail('scene.selected', 'an active globe camera in Space requires Earth');
    if (globe.latitude !== result.latitude || globe.longitude !== result.longitude) fail('scene.camera.globe', 'active latitude and longitude must agree with the observer');
    if (result.mode === 'surface' && globe.altitudeM !== 30) fail('scene.camera.globe.altitudeM', 'Surface mode requires the 30 m ground camera');
    if (result.mode === 'space' && globe.altitudeM <= 30) fail('scene.camera.globe.altitudeM', 'Space mode requires altitude above the ground camera');
  }
  record(value.savedViews, [], 'scene.savedViews', ['space', 'surface']);
  result.savedViews = Object.fromEntries(['space', 'surface'].filter(key => Object.hasOwn(value.savedViews, key)).map(key => [key, validateCamera(value.savedViews[key], `scene.savedViews.${key}`, false, version)]));
  result.miniGlobe = validateMiniGlobe(value.miniGlobe);
  return result;
}

function wrapper(value, schema, scene = false) {
  record(value, ['schema', 'version', ...(scene ? ['scene'] : []), 'workspace'], 'document');
  if (value.schema !== schema) fail('schema', `expected ${schema}`);
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, WORKSPACE_VERSION].includes(value.version)) fail('version', `supported versions are 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 and ${WORKSPACE_VERSION}`);
}

export function validateWorkspace(value) {
  wrapper(value, 'solar-system-workspace', true);
  return { schema: 'solar-system-workspace', version: WORKSPACE_VERSION, scene: validateScene(value.scene, value.version), workspace: validateSettings(value.workspace, value.version) };
}

export function validateArrangement(value) {
  wrapper(value, 'solar-system-arrangement');
  return { schema: 'solar-system-arrangement', version: WORKSPACE_VERSION, workspace: validateSettings(value.workspace, value.version) };
}

function parse(text, validate) {
  if (typeof text !== 'string') fail('document', 'expected JSON text');
  let value;
  try { value = JSON.parse(text); } catch { fail('document', 'invalid JSON'); }
  // The resource limit applies to settings overhead, not the exact year text:
  // an exported arbitrarily long calendar year must remain importable.
  const dateLength = validate === validateWorkspace && typeof value?.scene?.date === 'string' ? value.scene.date.length : 0;
  if (text.length - dateLength > MAX_WORKSPACE_LENGTH) fail('document', 'settings excluding the calendar date must fit in 64 KiB');
  return validate(value);
}

/** Parse the entire input before the caller applies any setting. No partial recovery. */
export const parseWorkspace = text => parse(text, validateWorkspace);
export const parseArrangement = text => parse(text, validateArrangement);

export function captureArrangement({ state, panelVisibility, timelineCollapsed, magneticSnap, density, panelsHidden = false, topbarHidden = false }) {
  return validateArrangement({ schema: 'solar-system-arrangement', version: WORKSPACE_VERSION, workspace: { density, theme: state.theme, panelVisibility, timelineCollapsed, magneticSnap, panelsHidden, topbarHidden } });
}

function cameraData(value, surfaceAim = true) {
  if (surfaceAim && (typeof value.azimuth !== 'number' || !Number.isFinite(value.azimuth))) fail('scene.camera.azimuth', 'expected a finite numeric bearing');
  return { yaw: value.yaw, pitch: value.pitch, zoom: value.zoom, pan: { x: value.pan.x, y: value.pan.y }, ...(surfaceAim ? { azimuth: wrap(value.azimuth), elevation: value.elevation } : {}), ...(surfaceAim?{flight:value.flight==null?null:validateFlight(value.flight,'scene.camera.flight')}:{}), globe: value.globe == null ? null : { latitude: value.globe.latitude, longitude: value.globe.longitude, altitudeM: value.globe.altitudeM } };
}

/** Capture only user inputs. Imports deliberately never resume either playback clock.
 * Restore state and render once before applying camera/savedViews to avoid the
 * renderer's mode-entry camera reset; then redraw and synchronize the controls.
 * Restore the mini-globe pose after any observer-centering step. */
export function captureWorkspace(config) {
  const { state, scene, globe } = config;
  if (!scene) fail('scene', 'renderer is unavailable');
  const values = Object.fromEntries(Object.keys(SCENE_FIELDS).map(key => [key, state[key]]));
  values.unifiedFlight=state.unifiedFlight??false;values.showSolarOrbit=state.showSolarOrbit??true;
  for (const key of ['autoTimelineSpan','showFlightStats','showConstellationNames','showStellarMotion']) values[key] = state[key] ?? false;
  values.showSurfaceMarkings=state.showSurfaceMarkings??true;values.surfaceOpacity=state.surfaceOpacity??state.earthOpacity;
  for(const key of Object.keys(V6_FIELDS))values[key]=state[key]??SCENE_V6_DEFAULTS[key];
  for(const key of Object.keys(V7_FIELDS))values[key]=state[key]??SCENE_V7_DEFAULTS[key];
  for(const key of Object.keys(V8_FIELDS))values[key]=state[key]??SCENE_V8_DEFAULTS[key];
  for(const key of Object.keys(V9_FIELDS))values[key]=state[key]??SCENE_V9_DEFAULTS[key];
  for(const key of Object.keys(V10_FIELDS))values[key]=state[key]??SCENE_V10_DEFAULTS[key];
  for(const key of Object.keys(V11_FIELDS))values[key]=state[key]??SCENE_V11_DEFAULTS[key];
  for(const key of Object.keys(V12_FIELDS))values[key]=state[key]??SCENE_V12_DEFAULTS[key];
  for(const key of Object.keys(V13_FIELDS))values[key]=state[key]??SCENE_V13_DEFAULTS[key];
  for(const key of Object.keys(V15_FIELDS))values[key]=state[key]??SCENE_V15_DEFAULTS[key];
  for(const key of Object.keys(V16_FIELDS))values[key]=state[key]??SCENE_V16_DEFAULTS[key];
  for(const key of Object.keys(V17_FIELDS))values[key]=state[key]??SCENE_V17_DEFAULTS[key];
  for(const key of Object.keys(V18_FIELDS))values[key]=state[key]??SCENE_V18_DEFAULTS[key];
  values.trackBody=state.trackBody??(state.trackSun?'Sun':null);values.trackSun=values.trackBody==='Sun';
  values.astrologyObjects=validateAstrologyObjects(values.astrologyObjects,'scene.astrologyObjects');
  values.astrologyObjects.Moon.longitude=values.showMoonLongitude;
  values.date = validatedDate(state.date).toISOString();
  values.trailBodies = state.trailBodies === undefined ? null : state.trailBodies;
  values.showZodiac = state.showZodiac === undefined ? false : state.showZodiac;
  values.fov = scene.fov;
  values.camera = cameraData(state.unifiedFlight?scene.camera:scene);
  if(values.unifiedFlight)values.camera.globe=null;
  values.heading = values.camera.azimuth;
  if (!(scene.savedViews instanceof Map)) fail('scene.savedViews', 'renderer saved views are unavailable');
  values.savedViews = Object.fromEntries([...scene.savedViews].map(([key, view]) => [key, cameraData(view, false)]));
  // Before its first visible render the globe stores a null view. Preserve the
  // effective next-render default without initializing or mutating the renderer.
  const pinActive=scene.camera?.flight?.tether?.controlMode==='surface'||state.pinMode===true;
  const footprint=state.surfacePin??state;
  const view = globe?.view ?? (pinActive?{ latitude: Math.max(-85, Math.min(85, footprint.latitude + 12)), longitude: wrap(footprint.longitude - 18 + 180) - 180 }:{latitude:15,longitude:-20});
  values.miniGlobe = globe == null ? null : { view: { latitude: view.latitude, longitude: view.longitude }, zoom: globe.zoom, pan: { x: globe.pan.x, y: globe.pan.y } };
  return validateWorkspace({ schema: 'solar-system-workspace', version: WORKSPACE_VERSION, scene: values, workspace: captureArrangement(config).workspace });
}
