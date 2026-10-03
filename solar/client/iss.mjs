// Machine-authored Codex/OpenAI, 2026-10-01. Retained elements, MIT library,
// exact provenance and accuracy limits: data-sources/iss/.
import elements from './data/iss-elements.json' with { type: 'json' };
import retainedBundle from './data/iss-bundle.json' with { type: 'json' };
import {validateISSBundle,interpolateOEM,epochMicroseconds,utcEpoch,ISS_REFRESH_INTERVAL_MS} from './iss-data.mjs';
import {json2satrec,sgp4init} from './vendor/satellite-omm-7.1.0.mjs';
import {twoline2satrec,sgp4,gstime} from './vendor/satellite-js-7.1.0.mjs';
import {Rotation_EQD_EQJ,Rotation_EQJ_ECL,SiderealTime} from './vendor/astronomy-engine-2.1.19.mjs';
import {validatedDate,epochMilliseconds,positiveModulo,addTime} from './time.mjs';

const AU_KM=149597870.7,DAY_MS=86400000,TAU=2*Math.PI;
const epochUs=BigInt(elements.epochUnixMicroseconds),windowUs=BigInt(elements.nearEpochDays*DAY_MS)*1000n;
const satrec=twoline2satrec(elements.line1,elements.line2);
const periodDays=1/elements.meanMotionRevolutionsPerDay,periodUs=BigInt(Math.round(periodDays*DAY_MS*1000));
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const components=v=>[v.x,v.y,v.z];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const r=Math.hypot(...v);return v.map(x=>x/r);};
const rotate=(m,v)=>[0,1,2].map(j=>m[0][j]*v[0]+m[1][j]*v[1]+m[2][j]*v[2]);
const ecliptic=Rotation_EQJ_ECL().rot;

export const ISS_ELEMENTS_EPOCH=elements.epoch;
export const ISS_MODEL=Object.freeze({
  epoch:ISS_ELEMENTS_EPOCH,epochExact:elements.epochExact,sourceURL:elements.source.url,
  retrievedAt:elements.source.downloadCompletedUTC,nearEpochDays:elements.nearEpochDays,
  library:'satellite.js 7.1.0 (SGP4/WGS72)',frame:'Geocentric mean ecliptic/equinox J2000, AU',
  warning:'Saved elements; no guaranteed position accuracy or operational pass prediction',
  fallback:'Frozen circular illustration outside ±7 days; not a predicted ISS position',
});

// SGP4 supplies TEME (true equator, mean equinox). Rotate through the equation
// of equinoxes into EQD, then undo precession/nutation to J2000. UTC≈UT1;
// polar motion and Earth-orientation measurements are deliberately omitted.
function temeFrame(date){
 const jd=2440587.5+Number(epochMilliseconds(date))/DAY_MS;
 const a=SiderealTime(date)*Math.PI/12-gstime(jd);
 return {c:Math.cos(a),s:Math.sin(a),rotation:Rotation_EQD_EQJ(date).rot};
}
function temeToEcliptic(vector,date,frame=temeFrame(date)) {
  const {c,s,rotation}=frame;
  const tod=[c*vector[0]-s*vector[1],s*vector[0]+c*vector[1],vector[2]];
  return rotate(ecliptic,rotate(rotation,tod));
}
function propagated(date,deltaUs) {
  // A fresh record makes results independent of query order or orbit sampling.
  const result=sgp4({...satrec},Number(deltaUs)/60000000);
  if(!result||!result.position||!result.velocity)return null;
  const frame=temeFrame(date);
  const position=temeToEcliptic(components(result.position),date,frame).map(x=>x/AU_KM);
  // Instantaneous inertial velocity rotated into the same axes. The small
  // time derivative of the TEME→J2000 frame rotation is not included.
  const velocityAUPerDay=temeToEcliptic(components(result.velocity),date,frame).map(x=>x*86400/AU_KM);
  return finite(position)&&finite(velocityAUPerDay)?{position,velocityAUPerDay}:null;
}
const seed=propagated(new Date(Number(epochUs/1000n)),0n);
if(!seed)throw new Error('Retained ISS elements could not initialize SGP4.');
const radiusAU=Math.hypot(...seed.position),u=unit(seed.position),normal=unit(cross(seed.position,seed.velocityAUPerDay)),v=unit(cross(normal,u));

export const ISS_METADATA=Object.freeze({
  id:'ISS',name:'International Space Station',parentId:'Earth',artificial:true,surfaceAvailable:false,
  color:'#6ee7ef',radiusKm:0.0545,displayRadiusKm:0.0545,
  radiusDescription:'Camera framing only: half NASA’s 109 m station span; not a solid sphere',
  orbitAU:radiusAU,semimajorAxisAU:radiusAU,periodDays,catalogueId:'25544',epoch:ISS_ELEMENTS_EPOCH,
});

function illustrated(deltaUs) {
  // Exact calendar reduction before conversion to Number supports arbitrary
  // signed years. The circular period is rounded only to one microsecond.
  const angle=TAU*Number(positiveModulo(deltaUs,periodUs))/Number(periodUs),c=Math.cos(angle),s=Math.sin(angle);
  return {position:u.map((x,k)=>radiusAU*(x*c+v[k]*s)),
    velocityAUPerDay:u.map((x,k)=>radiusAU*TAU/periodDays*(-x*s+v[k]*c))};
}
function legacyState(date,forcedIllustration=false) {
  const deltaUs=epochMilliseconds(date)*1000n-epochUs,nearEpoch=deltaUs>=-windowUs&&deltaUs<=windowUs;
  const propagatedState=nearEpoch&&!forcedIllustration?propagated(date,deltaUs):null;
  const illustrative=!propagatedState,geometry=propagatedState??illustrated(deltaUs);
  // A signed age that cannot fit a finite Number is retained exactly as days
  // in a separate string. Null avoids Infinity leaking into status/state JSON.
  const numericAge=Number(deltaUs)/86400000000,modelAgeDays=Number.isFinite(numericAge)?numericAge:null;
  const age=modelAgeDays===null?'remote date':Math.abs(modelAgeDays).toFixed(1)+' days '+(modelAgeDays<0?'before':'after')+' elements';
  const sourceModel=illustrative?'Illustrative frozen ISS circle':'SGP4 · satellite.js 7.1.0 · saved CelesTrak ISS TLE';
  const status=illustrative?'Illustrative orbit · '+age+' · no predicted ISS position':'Saved ISS elements · '+age+' · pass accuracy unvalidated';
  return {...ISS_METADATA,...geometry,relativePosition:[...geometry.position],geoPosition:[...geometry.position],
    distanceAU:Math.hypot(...geometry.position),available:true,nearEpoch,illustrative,approximate:true,
    stale:!nearEpoch,modelAgeDays,modelAgeMicroseconds:deltaUs.toString(),
    provider:illustrative?'illustration':'legacy',epoch:ISS_ELEMENTS_EPOCH,sourceModel,status,longitude:null,latitude:null,sign:null,degree:null,retrograde:null};
}

// Runtime source installation is atomic; validation cannot partly replace a good cache.
let bundle=validateISSBundle(retainedBundle),revision=1,configuration={provider:'auto',telemetryEnabled:false};
let gpRecords=new WeakMap(),gpEpochs=new WeakMap(),sourceStates=new Map();
export function installISSData(value){const checked=validateISSBundle(value);bundle=checked;gpRecords=new WeakMap();gpEpochs=new WeakMap();sourceStates.clear();revision++;return issDataStatus();}
export function exportISSData(){return structuredClone(bundle);}
export function configureISS(options={}){if(options.provider!==undefined&&!['auto','oem','gp','supgp'].includes(options.provider))throw new RangeError('Unknown ISS provider');configuration={...configuration,...options};revision++;return {...configuration};}
export function getISSDataRevision(){return revision;}
function ommRecord(record){
  if(gpRecords.has(record))return gpRecords.get(record);
  const sat=json2satrec(record),exact=epochMicroseconds(record.EPOCH),jd=2440587.5+Number(exact)/86400000000;
  // json2satrec truncates Date to milliseconds. Reinitialize with its full source
  // epoch (Julian double precision ~20us) while propagation offsets retain microseconds.
  sat.jdsatepoch=jd;
  sgp4init(sat,{opsmode:'i',satn:sat.satnum,epoch:jd-2433281.5,xbstar:Number(record.BSTAR),xecco:Number(record.ECCENTRICITY),xargpo:Number(record.ARG_OF_PERICENTER)*Math.PI/180,xinclo:Number(record.INCLINATION)*Math.PI/180,xmo:Number(record.MEAN_ANOMALY)*Math.PI/180,xno:Number(record.MEAN_MOTION)*Math.PI/720,xnodeo:Number(record.RA_OF_ASC_NODE)*Math.PI/180});
  const result={sat,exact};gpRecords.set(record,result);return result;
}
function selectedGP(data,ms,supplemental){
  if(!data)return null;
  let epochs=gpEpochs.get(data);if(!epochs){epochs=data.records.map(r=>utcEpoch(r.EPOCH));gpEpochs.set(data,epochs);}
  let lo=0,hi=epochs.length;while(lo<hi){const mid=(lo+hi)>>1;if(epochs[mid]<=ms)lo=mid+1;else hi=mid;}
  if(supplemental){const i=lo-1;if(i<0)return null;const end=lo<epochs.length?epochs[lo]:epochs[i]+21600000;return ms<end?data.records[i]:null;}
  const i=lo===0?0:lo===epochs.length?lo-1:ms-epochs[lo-1]<=epochs[lo]-ms?lo-1:lo;
  return data.records[i];
}
function copySourceState(value){return value?{...value,position:[...value.position],relativePosition:[...value.relativePosition],geoPosition:[...value.geoPosition],velocityAUPerDay:[...value.velocityAUPerDay],coverage:value.coverage?{...value.coverage}:null}:null;}
function sourceState(date,provider){
 const key=provider+':'+epochMilliseconds(date);
 if(sourceStates.has(key))return copySourceState(sourceStates.get(key));
 const result=calculateSourceState(date,provider);sourceStates.set(key,result);
 if(sourceStates.size>64)sourceStates.delete(sourceStates.keys().next().value);
 return copySourceState(result);
}
function calculateSourceState(date,provider){
  const ms=Number(epochMilliseconds(date));if(!Number.isFinite(ms))return null;
  let geometry,epoch,sourceModel,retrievedAt,coverage=null;
  if(provider==='oem'){
    if(!bundle.oem)return null;const sample=interpolateOEM(bundle.oem,ms);if(!sample)return null;
    geometry={position:rotate(ecliptic,sample.positionKm).map(x=>x/AU_KM),velocityAUPerDay:rotate(ecliptic,sample.velocityKmS).map(x=>x*86400/AU_KM)};
    epoch=bundle.oem.metadata.CREATION_DATE;sourceModel='NASA TOPO OEM · EME2000 · degree-7 Hermite';retrievedAt=bundle.oem.retrievedAt;coverage={start:new Date(bundle.oem.start).toISOString(),stop:new Date(bundle.oem.stop).toISOString()};
  }else{
    const data=bundle[provider],record=selectedGP(data,ms,provider==='supgp');if(!record)return null;
    const {sat,exact}=ommRecord(record),delta=epochMilliseconds(date)*1000n-exact;if(provider==='gp'&&(delta< -windowUs||delta>windowUs))return null;
    const raw=sgp4({...sat},Number(delta)/60000000);if(!raw?.position||!raw?.velocity)return null;
    const frame=temeFrame(date);
    geometry={position:temeToEcliptic(components(raw.position),date,frame).map(x=>x/AU_KM),velocityAUPerDay:temeToEcliptic(components(raw.velocity),date,frame).map(x=>x*86400/AU_KM)};
    epoch=record.EPOCH;retrievedAt=data.retrievedAt;sourceModel=provider==='gp'?'CelesTrak GP · SGP4/WGS72':'CelesTrak SupGP · NASA OEM fit · SGP4/WGS72';
  }
  if(!finite(geometry.position)||!finite(geometry.velocityAUPerDay))return null;
  const modelAgeDays=(ms-utcEpoch(epoch))/DAY_MS;
  return {...ISS_METADATA,...geometry,relativePosition:[...geometry.position],geoPosition:[...geometry.position],distanceAU:Math.hypot(...geometry.position),available:true,nearEpoch:true,illustrative:false,approximate:true,stale:false,provider,epoch:epoch.endsWith('Z')?epoch:epoch+'Z',retrievedAt,coverage,modelAgeDays,modelAgeMicroseconds:(epochMilliseconds(date)*1000n-epochMicroseconds(epoch)).toString(),sourceModel,status:sourceModel+' · prediction, not measured position · pass accuracy unvalidated',longitude:null,latitude:null,sign:null,degree:null,retrograde:null};
}
function state(date,forcedIllustration=false){
  if(forcedIllustration)return legacyState(date,true);
  const choices=configuration.provider==='auto'?['oem','gp']:[configuration.provider,...(configuration.provider==='gp'?[]:['gp'])];
  for(const provider of choices){const s=sourceState(date,provider);if(s)return {...s,requestedProvider:configuration.provider,fallback:configuration.provider!=='auto'&&provider!==configuration.provider};}
  return {...legacyState(date,true),requestedProvider:configuration.provider,fallback:true};
}
export function issDataStatus({date=new Date(),now=new Date()}={}){
  const current=state(validatedDate(date)),actual=Number(new Date(now));
  const sources=Object.fromEntries(['oem','gp','supgp'].map(id=>{const d=bundle[id],retrieved=d?.retrievedAt?Date.parse(d.retrievedAt):NaN;return [id,{available:!!d,retrievedAt:d?.retrievedAt??null,ageHours:Number.isFinite(retrieved)?(actual-retrieved)/3600000:null,nextRefreshAt:Number.isFinite(retrieved)?new Date(retrieved+ISS_REFRESH_INTERVAL_MS).toISOString():null,coverage:id==='oem'&&d?{start:new Date(d.start).toISOString(),stop:new Date(d.stop).toISOString()}:null}];}));
  return {revision,provider:configuration.provider,activeProvider:current.provider,simulationTime:validatedDate(date).toISOString(),actualTime:new Date(actual).toISOString(),epoch:current.epoch,sourceModel:current.sourceModel,status:current.status,illustrative:current.illustrative,fallback:current.fallback,coverage:current.coverage??null,sources,limitations:'Predicted trajectory; no guaranteed accuracy. UTC approximates UT1; measured polar motion is not applied. Remote dates use a frozen illustration.'};
}
/** Compare independent providers at the same simulation instant; residual is not truth error. */
export function compareISSProviders(value){const date=validatedDate(value),states=Object.fromEntries(['oem','gp','supgp'].map(p=>[p,sourceState(date,p)]));const reference=states.oem;return {date:date.toISOString(),reference:reference?'oem':null,states,residualKm:Object.fromEntries(['gp','supgp'].map(p=>[p,reference&&states[p]?Math.hypot(...reference.position.map((x,k)=>(x-states[p].position[k])*AU_KM)):null])),meaning:'Model-to-model separation; not measured position error'};}

/** Archived 0.19 TLE baseline, retained for reproducible source comparisons. */
export function issRetainedTLEStateAt(value){return legacyState(validatedDate(value));}

/** Earth-relative geometric state, fixed J2000 ecliptic AU; see ISS_MODEL. */
export function issStateAt(value) { return state(validatedDate(value)); }

/** Preserve supplied rows and translate ISS using that snapshot's Earth. */
export function appendISS(bodies,value) {
  if(!Array.isArray(bodies))throw new TypeError('ISS requires a body snapshot.');
  const earth=bodies.find(b=>b.id==='Earth');
  if(!earth||!finite(earth.position))throw new RangeError('ISS requires a finite Earth position.');
  const station=issStateAt(value);
  station.position=station.relativePosition.map((x,k)=>x+earth.position[k]);
  const previous=bodies.findIndex(b=>b.id==='ISS');
  return previous<0?[...bodies,station]:bodies.map((b,i)=>i===previous?station:b);
}

/** One period around the selected instant; center sample equals the live
 * Earth-relative state. Open path: SGP4 precession prevents exact closure. */
export function issOrbitPath(value,{steps=128}={}) {
  if(!Number.isInteger(steps)||steps<16||steps>1024||steps%2)throw new RangeError('ISS orbit steps must be even, 16…1024.');
  const date=validatedDate(value),live=issStateAt(date),currentIndex=steps/2;
  const times=Array.from({length:steps+1},(_,k)=>addTime(date,(k-currentIndex)*periodDays*DAY_MS/steps));
  // At a freshness boundary each sample respects its own ±7 day envelope.
  // Do not connect two different models across that boundary: a live SGP4
  // path is clipped to available same-model samples with its center retained.
  let samples=times.map(time=>state(time,live.illustrative)),start=0,end=samples.length;
  if(!live.illustrative){const same=s=>!s.illustrative&&s.provider===live.provider&&s.epoch===live.epoch;while(start<currentIndex&&!same(samples[start]))start++;while(end>currentIndex+1&&!same(samples[end-1]))end--;}
  samples=samples.slice(start,end);const selectedTimes=times.slice(start,end);
  samples[currentIndex-start]=live;
  return {id:'ISS',center:'Earth',points:samples.map(s=>s.relativePosition),times:selectedTimes,
    currentIndex:currentIndex-start,closed:false,illustrative:live.illustrative,epoch:live.epoch,sourceModel:live.sourceModel,provider:live.provider};
}
