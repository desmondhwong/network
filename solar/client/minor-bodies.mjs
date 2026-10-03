// Real Horizons osculating state anchors, with explicitly illustrative two-body propagation.
import catalogue from './data/minor-bodies.json' with {type:'json'};
import {periodicPhase,validatedDate} from './time.mjs';
import {cachedStateAt,getEphemerisMode} from './ephemeris-cache.mjs';
const AU=149597870.7,DAY=86400000,TAU=2*Math.PI;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=v=>Math.hypot(...v),scale=(v,s)=>v.map(x=>x*s);
function elements(b){const r=b.position,v=b.velocityAUPerDay,mu=b.solarGMKm3S2*86400**2/AU**3,h=cross(r,v),ev=cross(v,h).map((x,i)=>x/mu-r[i]/norm(r)),e=norm(ev),a=1/(2/norm(r)-dot(v,v)/mu),u=scale(ev,1/e),normal=scale(h,1/norm(h)),w=cross(normal,u),cosE=dot(r,u)/a+e,sinE=dot(r,w)/(a*Math.sqrt(1-e*e)),E=Math.atan2(sinE,cosE);return {a,e,u,w,normal,M:E-e*Math.sin(E),periodDays:TAU*Math.sqrt(a**3/mu)};}
const orbits=new Map(catalogue.bodies.map(b=>[b.id,{...elements(b),epoch:BigInt(Date.parse(b.epoch))}]));
export const MINOR_BODIES=Object.freeze(catalogue.bodies.map(b=>Object.freeze({...b,minorBody:true,centralBodyId:'Sun',orbitAU:orbits.get(b.id).a,semimajorAxisAU:orbits.get(b.id).a,periodDays:orbits.get(b.id).periodDays,surfaceAvailable:false,sourceModel:'Dated JPL Horizons osculating state; illustrative two-body orbit',shapeDescription:'Schematic sphere; irregular shape and attitude are not modeled'})));
export const MINOR_BODY_IDS=Object.freeze(MINOR_BODIES.map(b=>b.id));
export function minorBodyMetadata(id){return MINOR_BODIES.find(b=>b.id===id)??null;}
export function minorBodyStateAt(id,value){const date=validatedDate(value),body=minorBodyMetadata(id);if(!body)throw new RangeError('Unknown minor body');const cached=getEphemerisMode()==='cached'?cachedStateAt(id,date):null;if(cached)return cached;
 const o=orbits.get(id),M=((o.M+periodicPhase(date,o.periodDays*DAY,o.epoch)*TAU)%TAU+TAU)%TAU;let low=0,high=TAU,E=M;
 for(let k=0;k<48;k++){const f=E-o.e*Math.sin(E)-M;if(Math.abs(f)<1e-14)break;if(f>0)high=E;else low=E;const n=E-f/(1-o.e*Math.cos(E));E=n>low&&n<high?n:(low+high)/2;}
 const x=o.a*(Math.cos(E)-o.e),y=o.a*Math.sqrt(1-o.e**2)*Math.sin(E),rate=TAU/o.periodDays/(1-o.e*Math.cos(E));
 return {position:o.u.map((v,k)=>v*x+o.w[k]*y),velocityAUPerDay:o.u.map((v,k)=>-v*o.a*Math.sin(E)*rate+o.w[k]*o.a*Math.sqrt(1-o.e**2)*Math.cos(E)*rate),provider:'minor-elements',cacheKey:'minor-state-2026-10-01',coverage:null,sourceModel:body.sourceModel,epoch:body.epoch,illustrative:true,status:'Illustrative two-body propagation from '+body.epoch+'; perturbations and comet outgassing omitted'};
}
