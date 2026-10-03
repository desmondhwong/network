// Geometric sighting estimates: WGS84 observer, no terrain, refraction or weather.
import {MakeTime,Observer,ObserverVector,VectorObserver,Vector,Rotation_EQJ_HOR,Rotation_ECL_EQJ,GeoVector} from './vendor/astronomy-engine-2.1.19.mjs';
import {issStateAt} from './iss.mjs';
const AU=149597870.7,DEG=180/Math.PI,R=6378.137,RSUN=695700;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v)),clamp=x=>Math.max(-1,Math.min(1,x));
const rotate=(m,v)=>[0,1,2].map(j=>m[0][j]*v[0]+m[1][j]*v[1]+m[2][j]*v[2]);
const eq=Rotation_ECL_EQJ().rot;
function dateOf(value){const d=new Date(value);if(!Number.isFinite(+d))throw new RangeError('Pass geometry requires a finite modern calendar date');return d;}
function observerOf(value){const {latitude,longitude,height=0}=value??{};if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(height)||height< -1000||height>100000)throw new RangeError('Invalid Earth observer');return new Observer(latitude,longitude,height);}
function geometry(date){const state=issStateAt(date),position=rotate(eq,state.relativePosition),sun=GeoVector('Sun',date,false),sunFromISS=[sun.x-position[0],sun.y-position[1],sun.z-position[2]],earthRadius=Math.asin(Math.min(1,R/(norm(position)*AU))),sunRadius=Math.asin(RSUN/(norm(sunFromISS)*AU)),separation=Math.acos(clamp(dot(unit(position).map(x=>-x),unit(sunFromISS)))),illumination=separation+sunRadius<earthRadius?'umbra':separation-sunRadius<earthRadius?'penumbra':'sunlit';return {state,position,sun,illumination};}
export function issIlluminationAt(value){const date=dateOf(value),g=geometry(date);return {illumination:g.illumination,sunlit:g.illumination!=='umbra',sourceModel:g.state.sourceModel,illustrative:g.state.illustrative};}
export function issObserverAt(value,where){
  const date=dateOf(value),observer=observerOf(where),g=geometry(date),p=ObserverVector(date,observer,false),relative=g.position.map((x,i)=>x-[p.x,p.y,p.z][i]),rotation=Rotation_EQJ_HOR(date,observer).rot,hor=rotate(rotation,relative),sun=rotate(rotation,[g.sun.x-p.x,g.sun.y-p.y,g.sun.z-p.z]);
  const elevation=Math.atan2(hor[2],Math.hypot(hor[0],hor[1]))*DEG,azimuth=((Math.atan2(-hor[1],hor[0])*DEG)%360+360)%360,sunElevation=Math.atan2(sun[2],Math.hypot(sun[0],sun[1]))*DEG,sunlit=g.illumination!=='umbra';
  return {date:date.toISOString(),azimuth,elevation,rangeKm:norm(relative)*AU,sunElevation,sunlit,illumination:g.illumination,visible:elevation>0&&sunlit&&sunElevation< -6,aboveHorizon:elevation>0,sourceModel:g.state.sourceModel,provider:g.state.provider,illustrative:g.state.illustrative,usablePrediction:!g.state.illustrative,assumptions:'Geometric horizon; Sun below −6° for visibility; no terrain, weather, refraction or brightness model'};
}
export function issFootprintAt(value,{steps=96}={}){
  if(!Number.isInteger(steps)||steps<16||steps>720)throw new RangeError('Footprint steps must be 16…720');
  const date=dateOf(value),g=geometry(date),sub=VectorObserver(new Vector(...g.position,MakeTime(date)),false),angularRadius=Math.acos(Math.min(1,R/(norm(g.position)*AU))),lat=sub.latitude/DEG,lon=sub.longitude/DEG,points=[];
  for(let i=0;i<=steps;i++){const bearing=2*Math.PI*i/steps,p=Math.asin(Math.sin(lat)*Math.cos(angularRadius)+Math.cos(lat)*Math.sin(angularRadius)*Math.cos(bearing)),l=lon+Math.atan2(Math.sin(bearing)*Math.sin(angularRadius)*Math.cos(lat),Math.cos(angularRadius)-Math.sin(lat)*Math.sin(p));points.push({latitude:p*DEG,longitude:((l*DEG+540)%360)-180});}
  return {points,subpoint:{latitude:sub.latitude,longitude:sub.longitude,heightKm:sub.height/1000},angularRadiusDeg:angularRadius*DEG,sourceModel:g.state.sourceModel,illustrative:g.state.illustrative,assumptions:'Spherical Earth horizon footprint, 6378.137 km; terrain and refraction omitted'};
}
export function findISSPasses(value,where,{hours=24,maxPasses=10,minElevation=0,visibleOnly=false}={}){
  const start=+dateOf(value);observerOf(where);if(!Number.isFinite(hours)||hours<=0||hours>72||!Number.isInteger(maxPasses)||maxPasses<1||maxPasses>100||!Number.isFinite(minElevation)||minElevation<0||minElevation>=90)throw new RangeError('Invalid pass search bounds');
  const stop=start+hours*3600000,step=30000,at=ms=>issObserverAt(new Date(ms),where),cross=(a,b)=>{let va=at(a).elevation-minElevation;while(b-a>100){const m=(a+b)/2,v=at(m).elevation-minElevation;if((v>=0)===(va>=0)){a=m;va=v;}else b=m;}return (a+b)/2;},passes=[];
  let prevTime=start,prev=at(start),rise=prev.elevation>=minElevation?start:null;
  const finish=(set,clippedEnd)=>{let lo=rise,hi=set;for(let i=0;i<30&&hi-lo>100;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(at(a).elevation<at(b).elevation)lo=a;else hi=b;}const peak=at((lo+hi)/2),samples=[];for(let t=rise;t<=set;t+=step)samples.push(at(t));samples.push(at(set));const visible=samples.some(s=>s.visible),illustrative=samples.some(s=>s.illustrative);if((!visibleOnly||visible)&&!illustrative)passes.push({rise:at(rise),peak,set:at(set),visible,clippedStart:rise===start,clippedEnd,durationSeconds:(set-rise)/1000,minElevation,visibilitySamples:samples.filter(s=>s.visible).map(s=>({date:s.date,elevation:s.elevation,azimuth:s.azimuth})),sourceModel:peak.sourceModel,illustrative:false});rise=null;};
  for(let t=Math.min(start+step,stop);t<=stop;t=Math.min(t+step,stop)){
    const current=at(t);if(rise===null&&prev.elevation<minElevation&&current.elevation>=minElevation)rise=cross(prevTime,t);
    if(rise!==null&&current.elevation<minElevation)finish(cross(prevTime,t),false);
    if(passes.length>=maxPasses||t===stop)break;prev=current;prevTime=t;
  }
  if(rise!==null&&passes.length<maxPasses)finish(stop,true);
  return {passes,start:new Date(start).toISOString(),stop:new Date(stop).toISOString(),observer:{...where},minElevation,visibleOnly,unavailable:at(start).illustrative,assumptions:'Predictions only; geometric horizon, 30-second search, crossings refined to 0.1 second; visible = sunlit with Sun below −6°; no weather/terrain/refraction guarantee'};
}
