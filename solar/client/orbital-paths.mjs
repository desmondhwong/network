// Machine-authored Codex/OpenAI, claim 260922-161953-001.
// Present-epoch ephemeris guides, adaptively sampled and incident to live bodies.
import * as Astro from './astro.mjs';
const {helioPositionsAt,bodyEngineAvailableAt}=Astro;
import {addTime,epochMilliseconds,validatedDate,accuracyAt} from './time.mjs';
import {eclipticToGalactic,translatedEclipticToGalactic,fixedTimeOffsets} from './trails.mjs';
import {issOrbitPath,getISSDataRevision} from './iss.mjs';
import {EXTRA_MOONS,moonMetadata,satelliteStateAt,satellitePositionAt,satelliteOrbitPath} from './moons.mjs';
const periods={Mercury:87.969,Venus:224.701,Earth:365.256,Moon:27.322,Mars:686.98,Jupiter:4332.59,Saturn:10759.22,Uranus:30688.5,Neptune:60182,Pluto:90560};
const defaultIds=Object.keys(periods);
for(const moon of EXTRA_MOONS)periods[moon.id]=moon.periodDays;
for(const body of Astro.ALL_BODIES??[])if(body.periodDays>0)periods[body.id]=body.periodDays;
const DAY=86400000,sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),norm=v=>Math.hypot(...v),finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const samples=new Map(),sampleOrder=new Array(12000),satelliteEllipses=new Map();let last=null,sampleRevision=null,sampleCursor=0,sampleCount=0;
function refreshSamples(){
 const revision=Astro.getPositionProviderRevision();
 if(revision!==sampleRevision){samples.clear();sampleOrder.fill(undefined);sampleCursor=0;sampleCount=0;sampleRevision=revision;}
}
const exactSampleKey=epoch=>typeof epoch==='bigint'&&epoch>=-9007199254740991n&&epoch<=9007199254740991n?Number(epoch):epoch;
const sampleEpoch=time=>time instanceof Date?time.getTime():exactSampleKey(epochMilliseconds(time));
function retainSample(id,key,provider){
 let entries=samples.get(id);if(!entries){entries=new Map();samples.set(id,entries);}
 if(sampleCount===sampleOrder.length){const previous=sampleOrder[sampleCursor];samples.get(previous.id).delete(previous.key);}else sampleCount++;
 sampleOrder[sampleCursor]={id,key};sampleCursor=(sampleCursor+1)%sampleOrder.length;entries.set(key,provider);return provider;
}
function sourceState(id,time){return sourceStateAt(id,sampleEpoch(time),time);}
function sourceStateAt(id,epoch,time=null){
 const key=exactSampleKey(epoch),retained=samples.get(id)?.get(key);if(retained)return retained;
 // A retained absolute sample needs neither a fresh Date nor a string key.
 // Number keys are used only for exactly representable integer milliseconds.
 time??=validatedDate(key);
 // Satellite guides need the relative state only. Asking the heliocentric
 // provider also recalculates the same parent's position for every moon.
 const moon=id!=='Moon'&&moonMetadata(id),relative=moon?satelliteStateAt(id,time):null;
 const provider=relative?{...relative,relativePosition:relative.position}:Astro.positionProviderAt?.(id,time);
 // Frozen-ellipse states are cheap and their sliding live dates would evict
 // the expensive fixed-date planetary samples before those can be reused.
 if(provider?.provider==='mean-elements')return provider;
 if(provider)return retainSample(id,key,provider);
 if(id!=='Moon'&&moonMetadata(id))return {position:satellitePositionAt(id,time)};
 const rows=helioPositionsAt(time,id==='Moon'?['Moon','Earth']:[id]);
 const p=id==='Moon'?sub(rows[0].position,rows[1].position):rows[0].position;
 return retainSample(id,key,{position:p});
}
function sourcePosition(id,time){const provider=sourceState(id,time);return provider.relativePosition??provider.position;}
function sampleGalactic(provider){return provider.guideGalactic??=(eclipticToGalactic((provider.relativePosition??provider.position).map(x=>x+0)));}

/** A closed instantaneous two-body Moon guide, not a predicted lunar month.
 * The perturbed lunar ephemeris does not repeat after one sidereal period;
 * joining those endpoints would create a spurious straight segment. Instead
 * derive the osculating conic from position/velocity and Earth+Moon GM.
 * DE430 GM: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de430_moon_coord.pdf */
export function osculatingMoonPath(position,velocity,{steps=192}={}) {
 if(!finite(position)||!finite(velocity)||!Number.isInteger(steps)||steps<32||steps>1024)throw new RangeError('Invalid lunar osculating state.');
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],scale=(v,n)=>v.map(x=>x*n),unit=v=>scale(v,1/norm(v));
 const mu=403503.2355*86400**2/149597870.7**3,r=norm(position),h=cross(position,velocity),eVector=sub(scale(cross(velocity,h),1/mu),scale(position,1/r)),eccentricity=norm(eVector),p=dot(h,h)/mu;
 if(!(r>0&&norm(h)>0&&eccentricity<1&&p>0))throw new RangeError('Lunar state must define a bound nondegenerate orbit.');
 const u=eccentricity>1e-10?unit(eVector):unit(position),v=unit(cross(unit(h),u)),angle=Math.atan2(dot(position,v),dot(position,u));
 const points=Array.from({length:steps+1},(_,i)=>{if(i===0||i===steps)return [...position];const a=angle+i*Math.PI*2/steps,d=p/(1+eccentricity*Math.cos(a));return add(scale(u,d*Math.cos(a)),scale(v,d*Math.sin(a)));});
 return {points,closed:true,currentIndex:0,eccentricity,semimajorAxisAU:p/(1-eccentricity**2),model:'Instantaneous osculating Earth–Moon ellipse; not a future trajectory',gmKm3S2:403503.2355};
}
function frozenEllipse(id) {
 const moon=moonMetadata(id);let ellipse=satelliteEllipses.get(id);
 if(!ellipse){
  if(!moon)throw new RangeError('Unknown moon: '+id);
  // Outside every cached/Galilean interval, this API exposes the fixed mean
  // element ellipse. The shape is independent of the chosen calendar date.
  const path=satelliteOrbitPath(id,'1600-01-01',{steps:16}),a=moon.orbitAU,b=a*Math.sqrt(1-moon.eccentricity**2),u=sub(path[0],path[8]).map(x=>x/(2*a)),v=add(path[4],u.map(x=>x*a*moon.eccentricity)).map(x=>x/b);
  const shape=Object.freeze({centerRelative:Object.freeze(u.map(x=>-a*moon.eccentricity*x)),axisA:Object.freeze(u.map(x=>a*x)),axisB:Object.freeze(v.map(x=>b*x)),frame:'parent-relative ecliptic J2000 AU'});
  ellipse={a,b,u,v,e:moon.eccentricity,grids:new Map(),shape};satelliteEllipses.set(id,ellipse);
 }
 return ellipse;
}
/** A frozen mean-element conic for conservative rendering bounds only.
 * Applicable when a body's active provider is `mean-elements`. It does not
 * bound the separate Galilean or cached providers. Returned arrays are frozen. */
export function meanOrbitShape(id){return frozenEllipse(id).shape;}
// Added satellites use frozen ellipses. Recover their orthogonal axes once,
// then sample eccentric anomaly directly instead of solving and dating every
// adaptive midpoint. The live point is always an exact vertex of the path.
function satelliteGuide(id,date,live,parent,shift,base,{parentDistance,focalPixels,maxPoints,pixelTolerance}) {
 const moon=moonMetadata(id),ellipse=frozenEllipse(id);
 const {a,b,u,v,e}=ellipse,dot=(x,y)=>x.reduce((n,value,i)=>n+value*y[i],0),E0=Math.atan2(dot(base,v)/b,dot(base,u)/a+e),M0=E0-e*Math.sin(E0);
 const range=Math.max(a*.01,parentDistance-a*(1+e)),extent=a*(1+e)*focalPixels/range;
 // Keep the ellipse vertices fixed as time advances. Three spare slots allow
 // the moving endpoints and exact live vertex without exceeding the budget.
 let steps=Math.max(32,Math.ceil(Math.PI*2*Math.sqrt(extent/(8*pixelTolerance))));steps=Math.min(maxPoints-3,steps);steps-=steps%2;
 const tau=Math.PI*2,step=tau/steps;
 let grid=ellipse.grids.get(steps);
 if(!grid){grid=Array.from({length:steps},(_,k)=>{const E=k*step,s=Math.sin(E),x=a*(Math.cos(E)-e),y=b*s;return {point:u.map((value,i)=>value*x+v[i]*y),sin:s};});ellipse.grids.set(steps,grid);if(ellipse.grids.size>4)ellipse.grids.delete(ellipse.grids.keys().next().value);}
 const first=E0-Math.PI,last=E0+Math.PI,nodes=[],angles=[];
 const moving=E=>{const s=Math.sin(E),x=a*(Math.cos(E)-e),y=b*s;return {E,sin:s,point:u.map((value,i)=>value*x+v[i]*y)};};
 nodes.push(moving(first));angles.push(first);
 for(let k=Math.floor(first/step)+1;k*step<last;k++){nodes.push(grid[(k%steps+steps)%steps]);angles.push(k*step);}
 nodes.push(moving(last));angles.push(last);
 const currentIndex=angles.findIndex(E=>E>E0);nodes.splice(currentIndex,0,{sin:Math.sin(E0),point:base,live:true});angles.splice(currentIndex,0,E0);
 const points=nodes.map(node=>node.live?eclipticToGalactic(live):translatedEclipticToGalactic(node.point,parent,shift));
 let times;
 return {id,points,get times(){return times??=nodes.map((node,k)=>node.live?date:addTime(date,Math.round((angles[k]-e*node.sin-M0)/tau*moon.periodDays*DAY)));},currentIndex,closed:false,illustrative:true,center:'current '+moon.parentId,providerAlignmentAU:norm(shift),modelEvaluations:1,budgetReached:steps>=maxPoints-4,sampling:'Frozen ellipse; fixed eccentric-anomaly samples with exact live center'};
}

/** Curves use the selected-date bundled model; the exact supplied live point is
 * mandatory. A supplied provider snapshot translates its surrounding guide by
 * the model-vs-snapshot offset, without claiming a fetched provider trajectory.
 * Moon-relative samples are embedded at the live Earth's current center.
 * Local Moon guides are explicitly osculating; cached guides are open within
 * coverage. All coordinates are current-Sun-relative Galactic AU. */
export function currentOrbitPaths(value,bodies,{cameraPosition=[0,-40,25],focalPixels=600,maxPoints=384,pixelTolerance=.5,ids=defaultIds}={}){
 const date=validatedDate(value),rows=Array.isArray(bodies)?bodies:Object.values(bodies||{}),byId=new Map();for(const body of rows)byId.set(body.id,body);
 if(!finite(cameraPosition)||!Number.isFinite(focalPixels)||focalPixels<=0||!Number.isInteger(maxPoints)||maxPoints<33||maxPoints>1025||!Number.isFinite(pixelTolerance)||pixelTolerance<=0||!Array.isArray(ids)||ids.some(id=>id!=='ISS'&&!periods[id]))throw new RangeError('Invalid orbital guide parameters.');
 refreshSamples();const epoch=sampleEpoch(date);
 // Camera orientation does not affect this geometry. Check the cheap source
 // generation and only the participating live positions before asking a model
 // for samples. A replacement provider invalidates both levels immediately.
 const relevant=new Set(ids);for(const id of ids){const parent=id==='ISS'?'Earth':moonMetadata(id)?.parentId;if(parent)relevant.add(parent);}
 const key=epochMilliseconds(date)+'|'+JSON.stringify([ids,[...relevant].map(id=>[id,byId.get(id)?.position]),cameraPosition,focalPixels,maxPoints,pixelTolerance,Astro.getPositionProviderRevision(),getISSDataRevision()]);if(last?.key===key)return last.value;
 const providers=new Map(ids.filter(id=>id!=='ISS').map(id=>[id,sourceState(id,date)]));
 const tracks=[],parentDistances=new Map();
 for(const id of ids){
  if(id==='ISS'){
   const live=byId.get(id)?.position,parent=byId.get('Earth')?.position;if(!finite(live)||!finite(parent))continue;
   const raw=issOrbitPath(date,{steps:2*Math.floor(Math.min(128,maxPoints-1)/2)}),shift=sub(sub(live,parent),raw.points[raw.currentIndex]);
   const points=raw.points.map((point,index)=>index===raw.currentIndex?eclipticToGalactic(live):eclipticToGalactic(add(parent,add(point,shift))));
   tracks.push({...raw,id,points,center:'current Earth',artificial:true,providerAlignmentAU:norm(shift),modelEvaluations:raw.points.length,budgetReached:false});continue;
  }
  const parentId=moonMetadata(id)?.parentId,parent=parentId?byId.get(parentId)?.position:null;
  const live=byId.get(id)?.position;if(!finite(live)||(parentId&&!finite(parent)))continue;
  const provider=providers.get(id),base=provider?(provider.relativePosition??provider.position):sourcePosition(id,date),liveRelative=parentId?sub(live,parent):live,shift=sub(liveRelative,base),span=periods[id]*DAY;
  if(id==='Moon'&&provider?.provider!=='cached'){
   const before=addTime(date,-60000),after=addTime(date,60000),beforeProvider=sourceState(id,before),afterProvider=sourceState(id,after),sameBefore=beforeProvider?.cacheKey===provider?.cacheKey,sameAfter=afterProvider?.cacheKey===provider?.cacheKey;
   const prior=beforeProvider?(beforeProvider.relativePosition??beforeProvider.position):sourcePosition(id,before),next=afterProvider?(afterProvider.relativePosition??afterProvider.position):sourcePosition(id,after);
   // Never differentiate across the physical/remote-model boundary.
   const velocity=sameBefore&&sameAfter?sub(next,prior).map(x=>x*720):sameAfter?sub(next,base).map(x=>x*1440):sub(base,prior).map(x=>x*1440);
   let raw;
   try{raw=osculatingMoonPath(base,velocity,{steps:Math.min(256,maxPoints-1)});}catch(error){
    if(!(error instanceof RangeError))throw error;
    // Extreme extrapolated dates can lack a bound two-body osculating fit.
    // Preserve a finite closed display guide and explicitly mark that fallback.
    const r=norm(base),u=base.map(x=>x/r),radial=velocity.reduce((s,x,k)=>s+x*u[k],0),tangent=velocity.map((x,k)=>x-radial*u[k]),v=norm(tangent)>1e-30?tangent.map(x=>x/norm(tangent)):[u[1],-u[0],0],steps=Math.min(256,maxPoints-1);
    raw={points:Array.from({length:steps+1},(_,i)=>i===0||i===steps?[...base]:u.map((x,k)=>r*(x*Math.cos(i*Math.PI*2/steps)+v[k]*Math.sin(i*Math.PI*2/steps)))),closed:true,currentIndex:0,illustrative:true,model:'Instantaneous circular display guide; bound osculating fit unavailable'};
   }
   const points=raw.points.map((point,index)=>index===0||index===raw.points.length-1?eclipticToGalactic(live):eclipticToGalactic(add(parent,add(point,shift))));
   tracks.push({...raw,id,points,times:points.map(()=>date),center:'current Earth',provider:provider?.provider??'local',providerAlignmentAU:norm(shift),illustrative:raw.illustrative||!bodyEngineAvailableAt(id,date),modelEvaluations:3,budgetReached:false,sampling:raw.model});continue;
  }
  if(parentId&&id!=='Moon'&&provider?.provider!=='cached'&&!['Io','Europa','Ganymede','Callisto'].includes(id)){
   if(!parentDistances.has(parentId))parentDistances.set(parentId,norm(sub(cameraPosition,eclipticToGalactic(parent))));
   tracks.push(satelliteGuide(id,date,live,parent,shift,base,{parentDistance:parentDistances.get(parentId),focalPixels,maxPoints:Math.min(maxPoints,129),pixelTolerance}));continue;
  }
  const numericEpoch=typeof epoch==='number'&&Number.isSafeInteger(epoch+Math.ceil(span/2))&&Number.isSafeInteger(epoch-Math.ceil(span/2)),trackEpoch=numericEpoch?epoch:epochMilliseconds(date),liveGalactic=eclipticToGalactic(live),aligned=shift.every(x=>x===0);
  const at=offset=>{
   const time=numericEpoch?trackEpoch+offset:trackEpoch+BigInt(offset);let position;
   if(offset===0)position=liveGalactic;
   else{
    const source=sourceStateAt(id,time),local=source.relativePosition??source.position;
    position=parentId?translatedEclipticToGalactic(local,parent,shift):aligned?[...sampleGalactic(source)]:eclipticToGalactic(add(local,shift));
   }
   const distance=Math.hypot(cameraPosition[0]-position[0],cameraPosition[1]-position[1],cameraPosition[2]-position[2]);
   return {offset,epoch:time,position,distance};
  };
  let start=-span/2,end=span/2,sampleSpan=span;
  if(provider?.provider==='cached'&&provider.coverage){const now=Number(epochMilliseconds(date)),from=Date.parse(provider.coverage.start),to=Date.parse(provider.coverage.end);start=Math.max(start,from-now);end=Math.min(end,to-now);sampleSpan=Math.min(span,to-from);}
  // Interior absolute dates survive playback. The selected date and both
  // moving/coverage endpoints remain exact; adaptation still uses this camera.
  const offsets=[...new Set([...fixedTimeOffsets(date,start,end,sampleSpan/16),0])].sort((a,b)=>a-b),nodes=offsets.map(at);
  let evaluations=nodes.length;
  const segment=(a,b)=>{
   const offset=Math.round((a.offset+b.offset)/2);if(offset===a.offset||offset===b.offset)return {a,b,score:0,mid:null};
   const mid=at(offset);evaluations++;
   const error=Math.hypot(mid.position[0]-(a.position[0]+b.position[0])/2,mid.position[1]-(a.position[1]+b.position[1])/2,mid.position[2]-(a.position[2]+b.position[2])/2),distance=Math.max(1e-12,Math.min(mid.distance,a.distance,b.distance));
   return {a,b,mid,score:error*focalPixels/distance};
  };
  const segments=nodes.slice(1).map((node,i)=>segment(nodes[i],node));
  const budget=parentId&&id!=='Moon'?Math.min(129,maxPoints):maxPoints;
  while(nodes.length<budget){
   let index=-1,worst=pixelTolerance;for(let i=0;i<segments.length;i++)if(segments[i].score>worst){worst=segments[i].score;index=i;}
   if(index<0)break;const old=segments[index];if(!old.mid)break;
   nodes.splice(index+1,0,old.mid);segments.splice(index,1,segment(old.a,old.mid),segment(old.mid,old.b));
  }
  let times;
  tracks.push({id,points:nodes.map(n=>n.position),get times(){return times??=nodes.map(n=>n.offset===0?date:validatedDate(n.epoch));},currentIndex:nodes.findIndex(n=>n.offset===0),closed:false,illustrative:provider?.illustrative??nodes.some(n=>!bodyEngineAvailableAt(id,validatedDate(n.epoch))),provider:provider?.provider??'local',coverage:provider?.coverage??null,sampling:provider?.provider==='cached'?'Cached provider trajectory within retained coverage; open arc':'Sampled ephemeris over one period; open trajectory',center:parentId?'current '+parentId:'Sun',providerAlignmentAU:norm(shift),modelEvaluations:evaluations,budgetReached:nodes.length===budget});
 }
 const result={date,tracks,frame:'current-Sun-relative Galactic AU',model:accuracyAt(date),maxPointsPerTrack:maxPoints,description:'Selected-provider sampled guides within coverage; local Moon uses an instantaneous osculating ellipse. Supplied live points are exact. Single-instant snapshots alone only align local surrounding guides.'};last={key,value:result};return result;
}
