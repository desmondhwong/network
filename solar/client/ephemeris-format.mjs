// Shared bounded package format; geometric ICRF ecliptic J2000, AU and AU/day.
export const EPHEMERIS_TARGETS=Object.freeze([
 ['Mercury','199',null,720],['Venus','299',null,720],['Earth','399',null,720],['Mars','499',null,720],
 ['Jupiter','599',null,720],['Saturn','699',null,720],['Uranus','799',null,720],['Neptune','899',null,720],['Pluto','999',null,720],
 ['Moon','301','Earth',180],['Io','501','Jupiter',30],['Europa','502','Jupiter',30],['Ganymede','503','Jupiter',30],['Callisto','504','Jupiter',30],
 ['Titan','606','Saturn',180],['Triton','801','Neptune',60],['Charon','901','Pluto',60],
 ['Ceres','1;',null,720],['Vesta','4;',null,720],['Halley','DES=1P;CAP;',null,720],['67P','DES=67P;CAP;',null,720],
].map(([id,command,parentId,stepMinutes])=>Object.freeze({id,command,parentId,stepMinutes})));
export const CACHE_FRAME='ICRF ecliptic J2000 geometric';
export const CACHE_LIMITS=Object.freeze({maxBytes:5*1024*1024,maxDays:35,maxRows:30000,maxBodyRows:4000});
export function interpolateState(rows,ms) {
 if(ms<rows[0][0]||ms>rows.at(-1)[0])return null;
 let lo=0,hi=rows.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(rows[m][0]<=ms)lo=m;else hi=m;}
 const a=rows[lo],b=rows[hi],h=(b[0]-a[0])/86400000,u=(ms-a[0])/(b[0]-a[0]),u2=u*u,u3=u2*u;
 const position=[0,1,2].map(k=>(2*u3-3*u2+1)*a[k+1]+(u3-2*u2+u)*h*a[k+4]+(-2*u3+3*u2)*b[k+1]+(u3-u2)*h*b[k+4]);
 const velocityAUPerDay=[0,1,2].map(k=>((6*u2-6*u)*a[k+1]+(-6*u2+6*u)*b[k+1])/h+(3*u2-4*u+1)*a[k+4]+(3*u2-2*u)*b[k+4]);
 return {position,velocityAUPerDay};
}
export function validateEphemerisPackage(input) {
 if(!input||typeof input!=='object'||input.schema!==1||input.frame!==CACHE_FRAME||input.units!=='AU,AU/day'||input.timeScale!=='UT'||typeof input.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.id)||input.source!=='NASA/JPL Horizons'||!Number.isFinite(Date.parse(input.retrievedAt)))throw new RangeError('Unsupported ephemeris package identity, frame, units, time scale or schema');
 const encoded=JSON.stringify(input);
 if(encoded.length>CACHE_LIMITS.maxBytes)throw new RangeError('Ephemeris package exceeds 5 MiB');
 const start=Date.parse(input.start),end=Date.parse(input.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>CACHE_LIMITS.maxDays*86400000||start<Date.parse('1800-01-01')||end>Date.parse('2201-01-01'))throw new RangeError('Ephemeris coverage must be within 1800–2200 and at most 35 days');
 if(!Array.isArray(input.bodies)||input.bodies.length<1||input.bodies.length>EPHEMERIS_TARGETS.length)throw new RangeError('Invalid ephemeris targets');
 let count=0;const ids=new Set();
 for(const body of input.bodies){const target=EPHEMERIS_TARGETS.find(t=>t.id===body.id);
  if(!target||ids.has(body.id)||body.parentId!==target.parentId||body.command!==target.command)throw new RangeError('Invalid or duplicate ephemeris target/origin');ids.add(body.id);
  if(!Array.isArray(body.rows)||body.rows.length<2||body.rows.length>CACHE_LIMITS.maxBodyRows)throw new RangeError('Invalid ephemeris row count');
  let prior=null;for(const row of body.rows){if(!Array.isArray(row)||row.length!==7||!row.every(Number.isFinite)||!Number.isSafeInteger(row[0])||row.slice(1,4).some(x=>Math.abs(x)>1000)||row.slice(4).some(x=>Math.abs(x)>1)||row[0]<start||row[0]>end||(prior!==null&&(row[0]<=prior||row[0]-prior>target.stepMinutes*60000)))throw new RangeError('Invalid ephemeris state or cadence');prior=row[0];}
  if(body.rows[0][0]!==start||body.rows.at(-1)[0]!==end)throw new RangeError('Every target must span the stated coverage');count+=body.rows.length;
 }
 for(const body of input.bodies){if(body.parentId&&!ids.has(body.parentId))throw new RangeError('Cached satellite requires its parent trajectory in the same package');const v=body.validation;if(!v||v.samples!==body.rows.length-1||!Number.isFinite(v.maxKm)||v.maxKm<0||v.maxKm>1||!Number.isFinite(v.rmsKm)||v.rmsKm<0||v.rmsKm>v.maxKm)throw new RangeError('Missing or invalid interpolation validation summary');}
 if(count>CACHE_LIMITS.maxRows)throw new RangeError('Too many ephemeris samples');
 return JSON.parse(encoded);
}
