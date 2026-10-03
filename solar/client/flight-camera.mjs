// Machine-authored by Codex/OpenAI; updated under 260923-181609-001/solar-system-pin-controls.
// One physical perspective camera. World coordinates are current-Sun-relative Galactic AU.
import { ALL_BODIES as BODIES } from './astro.mjs';
import { moonMetadata, satelliteFrameAt } from './moons.mjs';
import { ISS_METADATA } from './iss.mjs';
import { ISS_ONBOARD, issFrameAt } from './iss-geometry.mjs';
import { RotationAxis, Rotation_EQJ_HOR, Rotation_GAL_EQJ, Observer } from './vendor/astronomy-engine-2.1.19.mjs';
import { equatorialToGalactic, eclipticToGalactic } from './trails.mjs';
import { modelDate } from './time.mjs';
export const AU_M = 149597870700;
export const FLIGHT_MIN_ALTITUDE_M = 2;
export const FLIGHT_MAX_ALTITUDE_M = 1e28;
export const FLIGHT_MAX_POSITION_AU = 1e17;
const RAD = Math.PI / 180;
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const scale = (v,s) => v.map(n=>n*s);
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm = v => Math.hypot(...v);
export const unit = (v,fallback=[0,0,1]) => norm(v)>1e-20 ? scale(v,1/norm(v)) : [...fallback];
const wrap = n => (n%360+360)%360;
const rotateMatrix = (m,v) => [0,1,2].map(j=>m[0][j]*v[0]+m[1][j]*v[1]+m[2][j]*v[2]);
const metadataById = new Map([...BODIES,ISS_METADATA].map(body=>[body.id,body]));
export function rotateAxis(v, axis, angle) {
  const u=unit(axis), c=Math.cos(angle), s=Math.sin(angle);
  return add(add(scale(v,c),scale(cross(u,v),s)),scale(u,dot(u,v)*(1-c)));
}
export function bodyRadiusAU(id) { return (metadataById.get(id)?.radiusKm || 1)*1000/AU_M; }
export function hasBodySurface(id) { return metadataById.has(id)&&metadataById.get(id).surfaceAvailable!==false; }
/** Natural surfaces and the ISS's fixed onboard viewing point are pinnable. */
export function canPinBody(id) { return id==='ISS'||hasBodySurface(id); }
export function bodyFrame(id,date) {
  if(id==='ISS'){const frame=issFrameAt(date);return {...frame,x:eclipticToGalactic(frame.x),y:eclipticToGalactic(frame.y),z:eclipticToGalactic(frame.z),surfaceAvailable:false};}
  if(metadataById.get(id)?.artificial)return {x:[1,0,0],y:[0,1,0],z:[0,0,1],surfaceAvailable:false,description:'Inertial navigation frame; spacecraft attitude is not modeled'};
  if(metadataById.get(id)?.minorBody)return {x:[1,0,0],y:[0,1,0],z:[0,0,1],surfaceAvailable:false,illustrative:true,description:'Inertial navigation frame; minor-body attitude and shape are not modeled'};
  if(id!=='Moon'&&moonMetadata(id)) {
    const frame=satelliteFrameAt(id,date);
    return {...frame,x:eclipticToGalactic(frame.x),y:eclipticToGalactic(frame.y),z:eclipticToGalactic(frame.z)};
  }
  if(id==='Earth') {
    // Exact vendor precession, nutation and sidereal rotation; geographic longitude zero.
    const galEq=Rotation_GAL_EQJ().rot, eqHor=Rotation_EQJ_HOR(modelDate(date),new Observer(0,0,0)).rot;
    const rows=[0,1,2].map(i=>{const v=[0,0,0];v[i]=1;const h=rotateMatrix(eqHor,rotateMatrix(galEq,v));return [-h[1],h[0],h[2]];});
    return { x:rows.map(v=>v[2]), y:rows.map(v=>v[0]), z:rows.map(v=>v[1]) };
  }
  const axis=RotationAxis(id,modelDate(date)), z=unit(equatorialToGalactic([axis.north.x,axis.north.y,axis.north.z]));
  const ra=axis.ra*Math.PI/12;
  const node=equatorialToGalactic([-Math.sin(ra),Math.cos(ra),0]);
  const x=rotateAxis(node,z,(axis.spin%360)*RAD),y=unit(cross(z,x));
  return {x:unit(x),y,z};
}
export function fromBody(v,frame) { return add(add(scale(frame.x,v[0]),scale(frame.y,v[1])),scale(frame.z,v[2])); }
export function toBody(v,frame) { return [dot(v,frame.x),dot(v,frame.y),dot(v,frame.z)]; }
export function surfaceFrame(latitude,longitude,frame) {
  // Onboard latitude/longitude are canonical storage placeholders. Heading
  // is measured from along-track toward local −Y, with zenith as local up.
  if(frame.onboard)return {east:scale(frame.y,-1),north:[...frame.x],normal:[...frame.z]};
  const p=latitude*RAD,l=longitude*RAD;
  return { east:fromBody([-Math.sin(l),Math.cos(l),0],frame),north:fromBody([-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)],frame),normal:fromBody([Math.cos(p)*Math.cos(l),Math.cos(p)*Math.sin(l),Math.sin(p)],frame) };
}
export function surfaceLocation(position,center,frame,radiusAU) {
  if(frame.onboard)return {latitude:0,longitude:0,altitudeM:2};
  const v=toBody(sub(position,center),frame),distance=norm(v);
  return {latitude:Math.atan2(v[2],Math.hypot(v[0],v[1]))/RAD,longitude:Math.atan2(v[1],v[0])/RAD,altitudeM:Math.max(FLIGHT_MIN_ALTITUDE_M,(distance-radiusAU)*AU_M)};
}
export function lookBasis(forward,up=[0,0,1]) {
  forward=unit(forward);let right=cross(forward,up);
  if(norm(right)<1e-8)right=cross(forward,Math.abs(forward[2])<.8?[0,0,1]:[0,1,0]);
  right=unit(right);return {forward,right,up:unit(cross(right,forward))};
}
export function createFlight() {
  const position=[0,-38,26],basis=lookBasis(scale(position,-1));
  return {position,forward:basis.forward,up:basis.up,tether:null,followBody:'Sun',speedAU:12};
}
export function serializeFlight(flight) {
  return {position:[...flight.position],forward:[...flight.forward],up:[...flight.up],speedAU:flight.speedAU,followBody:flight.followBody??null,tether:flight.tether?{...flight.tether}:null};
}
export function restoreFlight(value) {
  if(!value || !['position','forward','up'].every(key=>Array.isArray(value[key])&&value[key].length===3&&value[key].every(n=>Number.isFinite(n)&&Math.abs(n)<=FLIGHT_MAX_POSITION_AU))) return null;
  if(norm(value.forward)<1e-9||norm(value.up)<1e-9)return null;
  const followBody=value.followBody??null;
  if(followBody!==null&&followBody!=='Sagittarius A*'&&!metadataById.has(followBody))return null;
  let tether=null;
  if(value.tether) {
    const t=value.tether;
    if(!canPinBody(t.bodyId)||!['latitude','longitude','altitudeM'].every(k=>Number.isFinite(t[k]))||Math.abs(t.latitude)>90||Math.abs(t.longitude)>180||t.altitudeM<FLIGHT_MIN_ALTITUDE_M||t.altitudeM>FLIGHT_MAX_ALTITUDE_M)return null;
    if(t.bodyId==='ISS'&&(t.latitude!==0||t.longitude!==0||t.altitudeM!==2))return null;
    if(t.controlMode!==undefined&&!['free','surface'].includes(t.controlMode))return null;
    tether={bodyId:t.bodyId,controlMode:t.controlMode??'surface',latitude:t.latitude,longitude:t.longitude,altitudeM:t.altitudeM,heading:Number.isFinite(t.heading)?(t.heading>=0&&t.heading<360?t.heading:wrap(t.heading)):180,elevation:Number.isFinite(t.elevation)?clamp(t.elevation,-90,90):0,roll:Number.isFinite(t.roll)?clamp(t.roll,-180,180):0};
  }
  const basis=Math.abs(norm(value.forward)-1)<1e-8&&Math.abs(norm(value.up)-1)<1e-8&&Math.abs(dot(value.forward,value.up))<1e-8 ? {forward:[...value.forward],up:[...value.up]} : lookBasis(value.forward,value.up);
  return {position:[...value.position],forward:basis.forward,up:basis.up,tether,followBody:tether?tether.bodyId:followBody,speedAU:clamp(Number(value.speedAU)||1,1/AU_M,1e12)};
}
export function updateTether(flight,center,frame) {
  const t=flight.tether;if(!t)return flight;
  if(t.bodyId==='ISS'){t.latitude=0;t.longitude=0;t.altitudeM=2;}
  const local=surfaceFrame(t.latitude,t.longitude,frame),heading=t.heading*RAD,elevation=t.elevation*RAD;
  flight.position=t.bodyId==='ISS'?add(center,scale(fromBody(ISS_ONBOARD.positionM,frame),1/AU_M)):add(center,scale(local.normal,bodyRadiusAU(t.bodyId)+t.altitudeM/AU_M));
  const tangent=add(scale(local.north,Math.cos(heading)),scale(local.east,Math.sin(heading)));
  const forward=unit(add(scale(tangent,Math.cos(elevation)),scale(local.normal,Math.sin(elevation))));
  const right=add(scale(local.east,Math.cos(heading)),scale(local.north,-Math.sin(heading))),levelUp=unit(cross(right,forward));
  Object.assign(flight,lookBasis(forward,rotateAxis(levelUp,forward,(t.roll||0)*RAD)));
  return flight;
}
export function attachTether(flight,id,center,frame,location=null) {
  if(!canPinBody(id))return false;
  if(id==='ISS'){
    if(flight.tether?.bodyId!=='ISS')flight.tether={bodyId:'ISS',controlMode:'surface',latitude:0,longitude:0,altitudeM:2,heading:ISS_ONBOARD.heading,elevation:ISS_ONBOARD.elevation,roll:ISS_ONBOARD.roll};
    flight.followBody=id;return updateTether(flight,center,frame);
  }
  if(!location) {
    const actualAltitude=(norm(sub(flight.position,center))-bodyRadiusAU(id))*AU_M;
    const toleranceM=Math.max(.001,norm(center)*Number.EPSILON*AU_M*8);
    if(!Number.isFinite(actualAltitude)||actualAltitude<FLIGHT_MIN_ALTITUDE_M-toleranceM)return false;
  }
  const t=location||surfaceLocation(flight.position,center,frame,bodyRadiusAU(id));
  if(!Number.isFinite(t.altitudeM)||t.altitudeM>FLIGHT_MAX_ALTITUDE_M||!Number.isFinite(t.latitude)||Math.abs(t.latitude)>90||!Number.isFinite(t.longitude)||Math.abs(t.longitude)>180)return false;
  flight.followBody=id;
  flight.tether={bodyId:id,controlMode:'free',...t,altitudeM:Math.max(FLIGHT_MIN_ALTITUDE_M,t.altitudeM),heading:0,elevation:0,roll:0};
  setTetherOrientation(flight,flight.forward,flight.up,frame);
  // Current-pose attachment adds a frame, while an explicit location is a snap.
  return location?updateTether(flight,center,frame):flight;
}
/** Recover geographic Euler fields from an arbitrary camera basis, including inverted views.
 * Explicit Pin entry captures the current view's tangent heading. At exact
 * zenith/nadir that direction is undefined, so screen-up supplies a stable
 * heading while the recovered roll still preserves the complete camera pose. */
export function setTetherOrientation(flight,forward,up,frame,{captureHeading=false}={}) {
  const t=flight.tether;if(!t)return flight;
  const local=surfaceFrame(t.latitude,t.longitude,frame),basis=lookBasis(forward,up),f=basis.forward;
  const east=dot(f,local.east),north=dot(f,local.north);
  let heading=Math.hypot(east,north)>1e-12?wrap(Math.atan2(east,north)/RAD):t.heading;
  if(captureHeading&&Math.hypot(east,north)<=1e-12) {
    const sign=dot(f,local.normal)>0?-1:1;
    heading=wrap(Math.atan2(sign*dot(basis.up,local.east),sign*dot(basis.up,local.north))/RAD);
  }
  const elevation=Math.atan2(dot(f,local.normal),Math.hypot(east,north))/RAD;
  const right=add(scale(local.east,Math.cos(heading*RAD)),scale(local.north,-Math.sin(heading*RAD))),levelUp=unit(cross(right,f));
  const roll=Math.atan2(dot(cross(levelUp,basis.up),f),dot(levelUp,basis.up))/RAD;
  Object.assign(t,{heading,elevation,roll});return flight;
}
/** Camera-local pitch/roll, with no gimbal clamp at zenith or nadir. */
export function rotateFlight(flight,{pitch=0,roll=0}={},frame=null) {
  let basis=lookBasis(flight.forward,flight.up);
  if(pitch)basis=lookBasis(rotateAxis(basis.forward,basis.right,pitch),rotateAxis(basis.up,basis.right,pitch));
  if(roll)basis=lookBasis(basis.forward,rotateAxis(basis.up,basis.forward,roll));
  Object.assign(flight,basis);
  if(flight.tether&&frame)setTetherOrientation(flight,basis.forward,basis.up,frame);
  return flight;
}
export function releaseTether(flight) { if(flight.tether)flight.followBody=flight.tether.bodyId;flight.tether=null;return flight; }

/** Shortest rotation between complete camera bases, including opposite views. */
export function interpolateBasis(first,last,fraction) {
  const quaternion=pose=>{
    const b=lookBasis(pose.forward,pose.up),m=[[b.right[0],b.up[0],-b.forward[0]],[b.right[1],b.up[1],-b.forward[1]],[b.right[2],b.up[2],-b.forward[2]]],trace=m[0][0]+m[1][1]+m[2][2];
    if(trace>0){const s=Math.sqrt(trace+1)*2;return [(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s,s/4];}
    const i=m[0][0]>m[1][1]?(m[0][0]>m[2][2]?0:2):(m[1][1]>m[2][2]?1:2),j=(i+1)%3,k=(i+2)%3,s=Math.sqrt(1+m[i][i]-m[j][j]-m[k][k])*2,q=[0,0,0,0];
    q[i]=s/4;q[j]=(m[j][i]+m[i][j])/s;q[k]=(m[k][i]+m[i][k])/s;q[3]=(m[k][j]-m[j][k])/s;return q;
  };
  const a=quaternion(first);let b=quaternion(last),d=a.reduce((sum,n,i)=>sum+n*b[i],0);if(d<0){b=b.map(n=>-n);d=-d;}
  const t=clamp(fraction,0,1),theta=Math.acos(clamp(d,-1,1)),s=Math.sin(theta);
  let q=d>.9995?a.map((n,i)=>n+(b[i]-n)*t):a.map((n,i)=>(n*Math.sin((1-t)*theta)+b[i]*Math.sin(t*theta))/s);const magnitude=Math.hypot(...q);q=q.map(n=>n/magnitude);
  const rotate=v=>{const u=q.slice(0,3),twice=scale(cross(u,v),2);return add(add(v,scale(twice,q[3])),cross(u,twice));};
  return lookBasis(rotate([0,0,-1]),rotate([0,1,0]));
}
export function turnFlight(flight,yaw,pitch,frame=null) {
  if(flight.tether&&flight.tether.controlMode!=='free') {
    // Mouse look uses the local horizon without accumulating camera bank.
    flight.tether.heading=wrap(flight.tether.heading+yaw/RAD);
    flight.tether.elevation=clamp(flight.tether.elevation+pitch/RAD,-89.99,89.99);
  } else {
    const basis=lookBasis(flight.forward,flight.up),up=frame?.normal||basis.up;
    const f=rotateAxis(flight.forward,up,-yaw),r=unit(cross(f,up));
    Object.assign(flight,lookBasis(rotateAxis(f,r,pitch),rotateAxis(up,r,pitch)));
    if(flight.tether&&frame)setTetherOrientation(flight,flight.forward,flight.up,frame);
  }
  return flight;
}
export function orbitFlight(flight,center,yaw,pitch) {
  releaseTether(flight);
  const basis=lookBasis(flight.forward,flight.up),offset=sub(flight.position,center);
  const rotate=v=>rotateAxis(rotateAxis(v,basis.up,-yaw),basis.right,pitch);
  // Add rotation deltas to the local position. Reconstructing center+offset
  // loses meter-scale moves when the selected center is billions of AU away.
  const delta=(v,axis,angle)=>{const u=unit(axis),c=-2*Math.sin(angle/2)**2;return add(add(scale(v,c),scale(cross(u,v),Math.sin(angle))),scale(u,-dot(u,v)*c));};
  const first=delta(offset,basis.up,-yaw),second=delta(add(offset,first),basis.right,pitch);
  flight.position=add(flight.position,add(first,second));Object.assign(flight,lookBasis(rotate(flight.forward),rotate(flight.up)));return flight;
}
export function panFlight(flight,right,up) {
  releaseTether(flight);const basis=lookBasis(flight.forward,flight.up);
  flight.position=add(flight.position,add(scale(basis.right,right),scale(basis.up,up)));return flight;
}
/** Update geographic storage after a free body-relative move without changing its pose. */
export function retainBodyPose(flight,center,frame) {
  const t=flight.tether;if(!t)return flight;
  if(t.bodyId==='ISS'){setTetherOrientation(flight,flight.forward,flight.up,frame);return updateTether(flight,center,frame);}
  Object.assign(t,surfaceLocation(flight.position,center,frame,bodyRadiusAU(t.bodyId)));
  t.altitudeM=clamp(t.altitudeM,FLIGHT_MIN_ALTITUDE_M,FLIGHT_MAX_ALTITUDE_M);
  setTetherOrientation(flight,flight.forward,flight.up,frame);return flight;
}
/** Camera-local translation while orbital translation and body spin stay attached. */
export function moveSpinCamera(flight,{forward=0,right=0,up=0,distanceM=0},center,frame) {
  const t=flight.tether;if(!t)return flight;
  if(t.bodyId==='ISS')return updateTether(flight,center,frame);
  const basis=lookBasis(flight.forward,flight.up),delta=add(add(scale(basis.forward,forward),scale(basis.right,right)),scale(basis.up,up)),start=[...flight.position];
  flight.position=collideFlight(start,add(start,scale(delta,distanceM/AU_M)),[{position:center,radiusAU:bodyRadiusAU(t.bodyId)}]);
  const offset=sub(flight.position,center),range=norm(offset),maxRange=bodyRadiusAU(t.bodyId)+FLIGHT_MAX_ALTITUDE_M/AU_M;
  if(range>maxRange)flight.position=add(center,scale(unit(offset),maxRange));
  return retainBodyPose(flight,center,frame);
}
export function moveTether(flight,{forward=0,right=0,up=0,distanceM=0},center,frame) {
  const t=flight.tether;if(!t)return;
  if(t.bodyId==='ISS')return updateTether(flight,center,frame);
  const local=surfaceFrame(t.latitude,t.longitude,frame),heading=t.heading*RAD;
  const tangentForward=add(scale(local.north,Math.cos(heading)),scale(local.east,Math.sin(heading)));
  const tangentRight=add(scale(local.east,Math.cos(heading)),scale(local.north,-Math.sin(heading)));
  const tangent=add(scale(tangentForward,forward),scale(tangentRight,right)),horizontal=norm(tangent);
  if(horizontal>0) {
    const angle=horizontal*distanceM/(bodyRadiusAU(t.bodyId)*AU_M+t.altitudeM),axis=unit(cross(local.normal,tangent));
    const normal=rotateAxis(local.normal,axis,angle),v=toBody(normal,frame);
    t.latitude=Math.atan2(v[2],Math.hypot(v[0],v[1]))/RAD;t.longitude=Math.atan2(v[1],v[0])/RAD;
    const next=surfaceFrame(t.latitude,t.longitude,frame),transported=rotateAxis(tangentForward,axis,angle);
    t.heading=wrap(Math.atan2(dot(transported,next.east),dot(transported,next.north))/RAD);
  }
  // Pitch/roll affect only the view. Geographic Q/E alone changes height.
  t.altitudeM=clamp(t.altitudeM+up*distanceM,FLIGHT_MIN_ALTITUDE_M,FLIGHT_MAX_ALTITUDE_M);
  return updateTether(flight,center,frame);
}
/** Orbit a tethered reference sphere at constant radius, preserving camera pose relative to it. */
export function orbitTether(flight,yaw,pitch,center,frame) {
  const t=flight.tether;if(!t)return flight;
  if(t.bodyId==='ISS'){turnFlight(flight,yaw,pitch,frame);return updateTether(flight,center,frame);}
  return moveTether(flight,{right:-yaw,forward:pitch,distanceM:bodyRadiusAU(t.bodyId)*AU_M+t.altitudeM},center,frame);
}
export function projectFlight(position,flight,{width=800,height=540,fov=60}={}) {
  const basis=lookBasis(flight.forward,flight.up),v=sub(position,flight.position),depth=dot(v,basis.forward),focal=height/(2*Math.tan(fov*RAD/2));
  return {x:width/2+dot(v,basis.right)*focal/Math.max(1e-15,depth),y:height/2-dot(v,basis.up)*focal/Math.max(1e-15,depth),depth,z:depth,factor:focal/Math.max(1e-15,depth)};
}
/** Stops a continuous move before its first sphere entry, including tunnelling at high speed. */
export function collideFlight(start,end,bodies) {
  const delta=sub(end,start),a=dot(delta,delta);if(a<1e-30)return [...end];
  let stop=1;
  for(const body of bodies) {
    const radius=body.radiusAU+FLIGHT_MIN_ALTITUDE_M/AU_M,offset=sub(start,body.position),b=dot(offset,delta),distance=norm(offset),c=(distance-radius)*(distance+radius);
    // A valid floor pose can round a few micrometres inside the safety sphere
    // after addition to an AU-scale center. Never skip its inward collision.
    // Outward/tangent travel remains available to recover imported interior poses.
    if(c<0){if(b < -distance*Math.sqrt(a)*1e-12)stop=0;continue;}
    const disc=b*b-a*c;if(disc<0||b>=0)continue;
    const t=c/(-b+Math.sqrt(disc));if(t>=0&&t<stop)stop=Math.max(0,t-1e-9);
  }
  return add(start,scale(delta,stop));
}
