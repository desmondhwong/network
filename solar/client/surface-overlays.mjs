// Machine-authored Codex/OpenAI, claim 260922-161953-001.
// Shared body-fixed geographic geometry. Texture/marks are schematic drawings.
import {ALL_BODIES as BODIES} from './astro.mjs';
const RAD=Math.PI/180,DEG=1/RAD,AU_M=149597870700;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),signed=v=>((v+180)%360+360)%360-180;
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function surfaceUnit(latitude,longitude){
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude))throw new RangeError('Finite geographic coordinates required.');
 const p=latitude*RAD,l=longitude*RAD;return [Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)];
}
const path=(kind,points)=>({kind,points,vectors:points.map(([lon,lat])=>surfaceUnit(lat,lon))});
const gridCache=new Map();
/** Analytic small-circle / meridian intersections with the observer-visible cap.
 * capDegrees=acos(bodyRadius/eyeRadius) is the physical visible surface; 180 is
 * a complete minimap sphere. Sampling adapts to cap size, within a fixed budget. */
export function surfaceGridGeometry({spacing=10,viewLatitude=0,viewLongitude=0,capDegrees=180,maxPoints=24000}={}){
 if(![1,5,10,15,30].includes(spacing))throw new RangeError('Grid spacing must be 1, 5, 10, 15 or 30 degrees.');
 if(!Number.isFinite(viewLatitude)||Math.abs(viewLatitude)>90||!Number.isFinite(viewLongitude)||!Number.isFinite(capDegrees)||capDegrees<=0||capDegrees>180||!Number.isInteger(maxPoints)||maxPoints<2000||maxPoints>100000)throw new RangeError('Invalid surface grid view or budget.');
 const key=[spacing,viewLatitude,viewLongitude,capDegrees,maxPoints].join('|');if(gridCache.has(key))return gridCache.get(key);
 const segments=[],p=viewLatitude*RAD,c=Math.cos(Math.min(180,capDegrees)*RAD),whole=capDegrees>=179.999;
 for(let lon=-180;lon<180;lon+=spacing){
  const kind=lon===0?'prime':'meridian';
  if(whole){segments.push({kind,constant:lon,from:-90,to:90,meridian:true});continue;}
  const a=Math.sin(p),b=Math.cos(p)*Math.cos((lon-viewLongitude)*RAD),r=Math.hypot(a,b);if(r<1e-15||c>r+1e-13)continue;
  const half=Math.acos(clamp(c/r,-1,1)),mid=Math.atan2(a,b);
  for(const shift of [-2*Math.PI,0,2*Math.PI]){const from=Math.max(-Math.PI/2,mid-half+shift),to=Math.min(Math.PI/2,mid+half+shift);if(to-from>1e-12)segments.push({kind,constant:lon,from:from*DEG,to:to*DEG,meridian:true});}
 }
 for(let lat=-90+spacing;lat<90;lat+=spacing){
  let half=180;
  if(!whole){const a=Math.cos(lat*RAD)*Math.cos(p),b=c-Math.sin(lat*RAD)*Math.sin(p);if(Math.abs(a)<1e-15){if(b>0)continue;}else{if(b/a>1+1e-13)continue;half=Math.acos(clamp(b/a,-1,1))*DEG;}}
  if(half>1e-10)segments.push({kind:lat===0?'equator':'parallel',constant:lat,from:whole?-180:viewLongitude-half,to:whole?180:viewLongitude+half,meridian:false});
 }
 const desiredStep=Math.min(3,spacing/2,capDegrees/12),length=segments.reduce((n,s)=>n+s.to-s.from,0),step=Math.max(desiredStep,length/Math.max(1,maxPoints-segments.length*2));
 const paths=segments.map(s=>{const count=Math.max(1,Math.ceil((s.to-s.from)/step));return path(s.kind,Array.from({length:count+1},(_,i)=>{const t=s.from+(s.to-s.from)*i/count;return s.meridian?[s.constant,clamp(t,-90,90)]:[signed(t),s.constant];}));});
 const value={paths,pointCount:paths.reduce((n,p)=>n+p.points.length,0),spacing,capDegrees,samplingStepDegrees:step,frame:'body-fixed longitude east / latitude north'};
 gridCache.set(key,value);if(gridCache.size>16)gridCache.delete(gridCache.keys().next().value);return value;
}
const marks=new Map(),textures=new Map();
function bodyIndex(id){const i=BODIES.findIndex(b=>b.id===id);if(i<0)throw new RangeError('Unknown reference body.');return i;}
export function surfaceMarkings(bodyId){
 const index=bodyIndex(bodyId);if(marks.has(bodyId))return marks.get(bodyId);
 const paths=Array.from({length:3},(_,mark)=>path('schematic-mark',Array.from({length:49},(_,j)=>{const a=j/48*Math.PI*2,size=7+mark*4,w=1+.12*Math.sin(3*a+index);return [signed(-115+index*31+mark*117+Math.cos(a)*size*w),-35+mark*32+Math.sin(a)*size*.65*w];})));
 marks.set(bodyId,paths);return paths;
}
/** Deterministic fine procedural patterns, not imagery or mapped features.
 * Smooth spherical ellipses avoid longitude-cell/checkerboard boundaries.
 * Bands have coherent latitude tones; crater/cloud/granule motifs are schematic.
 * Patch opacity is a multiplier, so the UI still controls the whole layer. */
export function surfaceTexture(bodyId){
 const index=bodyIndex(bodyId);if(textures.has(bodyId))return textures.get(bodyId);
 const polygons=[];let seed=761+index*9187;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const ellipse=(lon,lat,width,height,tone,opacity,pattern)=>{
  const n=surfaceUnit(lat,lon),l=lon*RAD,p=lat*RAD,e=[-Math.sin(l),Math.cos(l),0],north=[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)];
  const points=Array.from({length:17},(_,i)=>{const a=i/16*2*Math.PI,x=width*RAD*Math.cos(a),y=height*RAD*Math.sin(a),r=Math.hypot(x,y),s=r?Math.sin(r)/r:1,v=n.map((c,j)=>c*Math.cos(r)+(e[j]*x+north[j]*y)*s);return [Math.atan2(v[1],v[0])*DEG,Math.asin(clamp(v[2],-1,1))*DEG];});
  polygons.push({...path('schematic-texture',points),tone,opacity,pattern});
 };
 const gas=['Jupiter','Saturn','Uranus','Neptune'].includes(bodyId);
 if(gas){
  for(let band=0;band<32;band++){
   const lat=-78+band*5,width=1+random()*1.3,tone=Math.sin(band*.9+index)>0?'light':'dark',opacity=.12+random()*.25;
   // Identical band edges across sectors: no checkerboard or tonal tile seams.
   for(let sector=0;sector<6;sector++){
    const edge=(j,upper)=>{const lon=-180+sector*60+j*5;return [lon,lat+(upper?width:0)+.25*Math.sin((lon+index*19)*RAD*3+band)];};
    polygons.push({...path('schematic-texture',[...Array.from({length:13},(_,j)=>edge(j,false)),...Array.from({length:13},(_,j)=>edge(12-j,true))]),tone,opacity,pattern:'cloud-band'});
   }
  }
  for(let i=0;i<24;i++)ellipse(random()*360-180,random()*130-65,2+random()*5,.4+random(),'light',.2,'cloud-oval');
 }else{
  const count=bodyId==='Sun'?320:bodyId==='Earth'?130:220;
  for(let i=0;i<count;i++){
   const lat=Math.asin(2*(i+.5)/count-1)*DEG,lon=signed(i*137.507764+index*33),size=.6+random()*2.2;
   const cloudy=['Earth','Venus'].includes(bodyId),sun=bodyId==='Sun',pattern=sun?'granule':cloudy?'cloud-wisp':'crater-mottle';
   ellipse(lon,lat,cloudy?size*3:size,cloudy?size*.45:size*(.6+random()*.4),random()>.45?'light':'dark',sun?.16+random()*.15:.12+random()*.3,pattern);
   if(!cloudy&&!sun&&i%3===0)ellipse(lon,lat,size*.65,size*.6,'dark',.16,'crater-floor');
  }
  if(bodyId==='Mars')for(const latitude of [-89,89])ellipse(0,latitude,5,5,'light',.55,'schematic-polar-cap');
 }
 textures.set(bodyId,polygons);return polygons;
}
/** Base is exactly on the declared reference sphere; head is exactly heightM
 * above it. Visibility and near-plane culling belong to the renderer. */
export function surfacePinGeometry(pin,{frame,center=[0,0,0],radiusAU}={}){
 if(!pin||!BODIES.some(b=>b.id===pin.bodyId)||!Number.isFinite(pin.longitude)||Math.abs(pin.longitude)>180||!Number.isFinite(pin.heightM)||pin.heightM<0||pin.heightM>1e28||!finiteVector(center)||!frame||!['x','y','z'].every(k=>finiteVector(frame[k])))throw new RangeError('Valid pin and body frame required.');
 radiusAU??=BODIES.find(b=>b.id===pin.bodyId).radiusKm*1000/AU_M;
 if(!Number.isFinite(radiusAU)||radiusAU<=0)throw new RangeError('Positive reference radius required.');
 const local=surfaceUnit(pin.latitude,pin.longitude),normal=[0,1,2].map(i=>frame.x[i]*local[0]+frame.y[i]*local[1]+frame.z[i]*local[2]);
 const base=center.map((x,i)=>x+normal[i]*radiusAU),head=center.map((x,i)=>x+normal[i]*(radiusAU+pin.heightM/AU_M));
 return {...pin,base,head,normal,local,radiusAU,heightAU:pin.heightM/AU_M,frame:'current-Sun-relative Galactic AU'};
}
