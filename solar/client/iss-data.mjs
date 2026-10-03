// NASA OEM and CelesTrak GP parsing. No network or mutable application state.
export const ISS_DATA_URLS=Object.freeze({oem:'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt',gp:'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON',supgp:'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?CATNR=25544&FORMAT=JSON'});
export const ISS_REFRESH_INTERVAL_MS=7200000;
const finite=Number.isFinite;
export function utcEpoch(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z?$/.test(value))throw new RangeError('Invalid UTC source epoch');
  const date=Date.parse(value.endsWith('Z')?value:value+'Z');if(!finite(date)||new Date(date).toISOString().slice(0,19)!==value.slice(0,19))throw new RangeError('Invalid UTC source epoch');return date;
}
export function epochMicroseconds(value){const ms=utcEpoch(value),fraction=(value.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0').slice(0,6);return BigInt(Math.floor(ms/1000))*1000000n+BigInt(fraction);}
export function parseOEM(text,{retrievedAt=null,sourceURL=ISS_DATA_URLS.oem}={}){
  if(typeof text!=='string'||text.length>6000000)throw new RangeError('OEM exceeds supported size');
  const metadata={},states=[],comments=[];let inMeta=false,segments=0;
  for(const line of text.split(/\r?\n/)){const s=line.trim();if(!s)continue;
    if(s==='META_START'){inMeta=true;segments++;continue;}if(s==='META_STOP'){inMeta=false;continue;}
    if(s.startsWith('COMMENT')){comments.push(s.slice(7).trim());continue;}
    const pair=s.match(/^(\w+)\s*=\s*(.*)$/);if(pair){metadata[pair[1]]=pair[2];continue;}
    if(inMeta)throw new RangeError('Malformed OEM metadata');
    const columns=s.split(/\s+/);if(columns.length!==7)throw new RangeError('Unsupported OEM row');
    const row=[utcEpoch(columns[0]),...columns.slice(1).map(Number)];if(!row.every(finite))throw new RangeError('Nonfinite OEM state');states.push(row);
  }
  if(segments!==1||metadata.CCSDS_OEM_VERS!=='2.0'||metadata.CENTER_NAME?.toUpperCase()!=='EARTH'||metadata.REF_FRAME!=='EME2000'||metadata.TIME_SYSTEM!=='UTC'||!/^1998-067-?A$/.test(metadata.OBJECT_ID??''))throw new RangeError('OEM must be ISS, Earth-centered EME2000 UTC');
  return validateOEM({metadata,states,comments,sourceURL,retrievedAt});
}
export function validateOEM(oem){
  if(!oem||oem.metadata?.REF_FRAME!=='EME2000'||oem.metadata?.TIME_SYSTEM!=='UTC'||oem.metadata?.CENTER_NAME?.toUpperCase()!=='EARTH'||!/^1998-067-?A$/.test(oem.metadata?.OBJECT_ID??''))throw new RangeError('Unsupported OEM reference frame');
  utcEpoch(oem.metadata.CREATION_DATE);
  const rows=oem.states;if(!Array.isArray(rows)||rows.length<4||rows.length>120000)throw new RangeError('Invalid OEM sample count');
  for(let i=0;i<rows.length;i++){const r=rows[i];if(!Array.isArray(r)||r.length!==7||!r.every(finite)||(i&&r[0]<=rows[i-1][0])||Math.hypot(...r.slice(1,4))<6300||Math.hypot(...r.slice(1,4))>10000||Math.hypot(...r.slice(4))>12)throw new RangeError('Invalid OEM state or ordering');}
  const start=utcEpoch(oem.metadata.USEABLE_START_TIME??oem.metadata.START_TIME),stop=utcEpoch(oem.metadata.USEABLE_STOP_TIME??oem.metadata.STOP_TIME);
  if(start<rows[0][0]||stop>rows.at(-1)[0]||stop<=start||stop-start>32*86400000)throw new RangeError('Invalid OEM usable coverage');
  return {...oem,start,stop,interpolation:'Local degree-7 Hermite (four position/velocity nodes); no extrapolation'};
}
export function parseGP(value,{supplemental=false,retrievedAt=null,sourceURL=ISS_DATA_URLS[supplemental?'supgp':'gp']}={}){
  const records=typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(records)||!records.length||records.length>256)throw new RangeError('Invalid GP count');
  const fields=['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
  const sorted=records.map(r=>{if(String(r.NORAD_CAT_ID)!=='25544'||(r.CENTER_NAME&&r.CENTER_NAME!=='EARTH')||(r.REF_FRAME&&r.REF_FRAME!=='TEME')||(r.TIME_SYSTEM&&r.TIME_SYSTEM!=='UTC')||(r.MEAN_ELEMENT_THEORY&&r.MEAN_ELEMENT_THEORY!=='SGP4')||!fields.every(k=>finite(Number(r[k]))))throw new RangeError('GP must contain finite ISS TEME/UTC SGP4 elements');utcEpoch(r.EPOCH);if(!(r.MEAN_MOTION>10&&r.MEAN_MOTION<18&&r.ECCENTRICITY>=0&&r.ECCENTRICITY<.1&&r.INCLINATION>=0&&r.INCLINATION<=180))throw new RangeError('Implausible ISS elements');return {...r};}).sort((a,b)=>utcEpoch(a.EPOCH)-utcEpoch(b.EPOCH));
  if(sorted.some((r,i)=>i&&utcEpoch(r.EPOCH)<=utcEpoch(sorted[i-1].EPOCH)))throw new RangeError('Duplicate GP epochs');
  return {records:sorted,supplemental,retrievedAt,sourceURL};
}
// A playback frame normally reuses the same four source nodes. Keep their
// exact divided differences, rather than rebuilding 3 x 8 x 8 tables. Weak keys
// do not retain replaced data packages; the per-package window budget is fixed.
const coefficientWindows=new WeakMap(),MAX_COEFFICIENT_WINDOWS=64;
function hermiteWindow(oem,start,selected,origin){
 let windows=coefficientWindows.get(oem);if(!windows){windows=new Map();coefficientWindows.set(oem,windows);}
 const cached=windows.get(start);
 // interpolateOEM also accepts caller-owned tables. Detect in-place row edits,
 // not merely replacement of the outer array, before reusing coefficients.
 if(cached&&selected.every((r,i)=>r.every((v,k)=>v===cached.rows[i][k])))return cached;
 const z=selected.flatMap(r=>[(r[0]-origin)/1000,(r[0]-origin)/1000]),coefficients=[];
 for(let axis=0;axis<3;axis++){
  const q=Array.from({length:8},()=>Array(8).fill(0));
  for(let i=0;i<4;i++){q[2*i][0]=q[2*i+1][0]=selected[i][axis+1];q[2*i+1][1]=selected[i][axis+4];if(i)q[2*i][1]=(q[2*i][0]-q[2*i-1][0])/(z[2*i]-z[2*i-1]);}
  for(let j=2;j<8;j++)for(let i=j;i<8;i++)q[i][j]=(q[i][j-1]-q[i-1][j-1])/(z[i]-z[i-j]);
  coefficients.push(q.map((row,i)=>row[i]));
 }
 const result={z,coefficients,rows:selected.map(r=>[...r])};windows.set(start,result);
 if(windows.size>MAX_COEFFICIENT_WINDOWS)windows.delete(windows.keys().next().value);
 return result;
}
/** Four nodes, each with a value and derivative; Newton confluent differences.
 * Local seconds and a bounded window avoid epoch cancellation. Exact source nodes
 * are returned verbatim; no curve crosses a gap longer than eight minutes. */
export function interpolateOEM(oem,time){
  const ms=typeof time==='number'?time:Number(time);if(!finite(ms)||ms<oem.start||ms>oem.stop)return null;
  const rows=oem.states;let lo=0,hi=rows.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid][0]<ms)lo=mid+1;else hi=mid;}
  if(rows[lo][0]===ms)return {positionKm:rows[lo].slice(1,4),velocityKmS:rows[lo].slice(4),exactNode:true};
  if(lo===0||rows[lo][0]-rows[lo-1][0]>480000)return null;
  const start=Math.max(0,Math.min(rows.length-4,lo-2)),selected=rows.slice(start,start+4),origin=selected[0][0];
  if(selected.some((r,i)=>i&&r[0]-selected[i-1][0]>480000))return null;
  const gaps=selected.slice(1).map((r,i)=>r[0]-selected[i][0]);
  // Dense maneuver sampling must not borrow a distant 4-minute node. At a
  // sampling-rate transition use only the enclosing position/velocity pair.
  if(Math.max(...gaps)>4*Math.min(...gaps)){
    const a=rows[lo-1],b=rows[lo],h=(b[0]-a[0])/1000,t=(ms-a[0])/1000/h,t2=t*t,t3=t2*t;
    return {positionKm:[1,2,3].map(k=>(2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*h*a[k+3]+(-2*t3+3*t2)*b[k]+(t3-t2)*h*b[k+3]),velocityKmS:[1,2,3].map(k=>((6*t2-6*t)*a[k]+(3*t2-4*t+1)*h*a[k+3]+(-6*t2+6*t)*b[k]+(3*t2-2*t)*h*b[k+3])/h),exactNode:false,interpolation:'Cubic Hermite at sampling-rate transition'};
  }
  const {z,coefficients}=hermiteWindow(oem,start,selected,origin),at=(ms-origin)/1000,positionKm=[],velocityKmS=[];
  for(let axis=0;axis<3;axis++){
    const q=coefficients[axis];let p=q[7],v=0;
    for(let i=6;i>=0;i--){v=v*(at-z[i])+p;p=p*(at-z[i])+q[i];}
    positionKm.push(p);velocityKmS.push(v);
  }
  return {positionKm,velocityKmS,exactNode:false};
}
export function validateISSBundle(bundle){
  if(!bundle||bundle.version!==1)throw new RangeError('Unsupported ISS data bundle');
  return {version:1,oem:bundle.oem?validateOEM(structuredClone(bundle.oem)):null,gp:bundle.gp?{...structuredClone(bundle.gp),...parseGP(bundle.gp.records,bundle.gp)}:null,supgp:bundle.supgp?{...structuredClone(bundle.supgp),...parseGP(bundle.supgp.records,{...bundle.supgp,supplemental:true})}:null};
}
