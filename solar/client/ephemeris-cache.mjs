// Offline bounded geometric ephemeris. Import/refresh is explicit; no network here.
import bundled from './data/ephemeris.json' with {type:'json'};
import {validateEphemerisPackage,interpolateState} from './ephemeris-format.mjs';
import {epochMilliseconds} from './time.mjs';
export {validateEphemerisPackage} from './ephemeris-format.mjs';
let active=validateEphemerisPackage(bundled),revision=0,mode='local';
let index=new Map(active.bodies.map(b=>[b.id,b]));
export function setEphemerisMode(value){if(!['local','cached'].includes(value))throw new RangeError('Ephemeris mode must be local or cached');mode=value;return mode;}
export function getEphemerisMode(){return mode;}
/** Cheap invalidation token for exact-date model/guide caches. */
export function getPositionProviderRevision(){return mode+':'+revision;}
export function installEphemerisPackage(value){const next=validateEphemerisPackage(value);active=next;index=new Map(next.bodies.map(b=>[b.id,b]));revision++;return getEphemerisCacheInfo();}
export function exportEphemerisPackage(){return JSON.parse(JSON.stringify(active));}
export function getEphemerisCacheInfo(){return {id:active.id,revision,cacheKey:active.id+':'+revision,source:active.source,retrievedAt:active.retrievedAt,start:active.start,end:active.end,bodyIds:[...index.keys()],frame:active.frame,mode,validation:active.bodies.map(b=>({id:b.id,...b.validation}))};}
export function cachedStateAt(id,value){const ms=Number(epochMilliseconds(value)),body=index.get(id);if(!body||!Number.isFinite(ms))return null;const state=interpolateState(body.rows,ms);if(!state)return null;return {...state,id,parentId:body.parentId,provider:'cached',cacheKey:active.id+':'+revision,coverage:{start:active.start,end:active.end},sourceModel:'JPL Horizons cached geometric trajectory; cubic Hermite interpolation',illustrative:false,validation:{...body.validation}};}
