// Machine-authored Codex/OpenAI, 2026-10-01. NASA/ESA component dimensions;
// assembly offsets and attitudes remain illustrative, not an engineering model.
// See data-sources/iss/geometry-v022.json and geometry-provenance.md.
import {issStateAt} from './iss.mjs';

const add=(a,b)=>a.map((x,k)=>x+b[k]),sub=(a,b)=>a.map((x,k)=>x-b[k]),scale=(v,s)=>v.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>scale(v,1/Math.hypot(...v));

export const ISS_ONBOARD=Object.freeze({
  positionM:Object.freeze([.4432,-5.4864,-3.15]),latitude:0,longitude:0,altitudeM:2,
  heading:0,elevation:-90,roll:0,
  description:'Fixed illustrative point inside the dimensioned Cupola; station geometry hidden while onboard',
});

/** Right-handed station axes in fixed J2000 ecliptic coordinates. +X follows
 * tangential orbital motion, +Y the orbital normal, +Z points away from Earth.
 * This local orbital frame is illustrative, not telemetry of station attitude. */
export function issFrameAt(value) {
  const state=issStateAt(value),z=unit(state.relativePosition);
  const x=unit(sub(state.velocityAUPerDay,scale(z,dot(state.velocityAUPerDay,z)))),y=unit(cross(z,x));
  return {x:unit(cross(y,z)),y,z,onboard:true,illustrative:true,
    sourceModel:state.sourceModel,description:'Illustrative local orbital frame; actual ISS attitude is not modeled'};
}

const vertices=[],faces=[],edges=[],parts=[];
const vertex=p=>{vertices.push(p);return vertices.length-1;};
const face=(indices,color,part)=>faces.push({indices,color,part});
const edge=(a,b,color='#758795')=>edges.push({indices:[a,b],color});
const palette={module:'#cad1d5',cap:'#939ea7',truss:'#9da8b0',panel:'#244572',panelBack:'#192f4a',frame:'#c6a565',radiator:'#dce4e7',window:'#386987',arm:'#d9d8c5'};
const nasa=name=>'https://www.nasa.gov/international-space-station/'+name+'/';
export const ISS_COMPONENT_DIMENSIONS=Object.freeze([
 ['Zvezda',43*.3048,13.5*.3048,nasa('zvezda-service-module')],
 ['Zarya',41.2*.3048,13.5*.3048,nasa('zarya-module')],
 ['Unity',18*.3048,14*.3048,nasa('unity-module')],
 ['Destiny',28*.3048,14*.3048,nasa('destiny-laboratory-module')],
 ['Harmony',22*.3048,14*.3048,nasa('harmony-module')],
 ['Tranquility',22*.3048,14*.3048,nasa('tranquility-module')],
 ['Kibo',36.7*.3048,14.4*.3048,nasa('japanese-experiment-module-kibo')],
 ['Kibo logistics',13.9*.3048,14.4*.3048,nasa('japanese-experiment-module-kibo')],
 ['Columbus',6.871,4.477,'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Columbus/European_Columbus_laboratory'],
 ['Cupola',4.7*.3048,9.8*.3048,nasa('cupola')],
].map(([name,lengthM,diameterM,source])=>Object.freeze({name,lengthM,diameterM,source})));

function box(name,center,size,color,{wire=false}={}) {
  const start=vertices.length,firstFace=faces.length;
  for(const p of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]])vertex(p.map((x,k)=>center[k]+x*size[k]/2));
  for(const indices of [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])face(indices.map(i=>start+i),color,name);
  if(wire)for(const [a,b]of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])edge(start+a,start+b,palette.frame);
  parts.push({name,firstFace,faceCount:faces.length-firstFace});return start;
}
function cylinder(name,first,last,radius,color=palette.module,sides=12) {
  const firstFace=faces.length,axis=unit(sub(last,first)),u=unit(cross(axis,Math.abs(axis[2])<.8?[0,0,1]:[0,1,0])),v=cross(axis,u),rings=[];
  for(const center of [first,last])rings.push(Array.from({length:sides},(_,k)=>vertex(add(center,add(scale(u,radius*Math.cos(k*2*Math.PI/sides)),scale(v,radius*Math.sin(k*2*Math.PI/sides)))))));
  for(let k=0;k<sides;k++)face([rings[0][k],rings[0][(k+1)%sides],rings[1][(k+1)%sides],rings[1][k]],color,name);
  face([...rings[0]].reverse(),palette.cap,name);face(rings[1],palette.cap,name);
  parts.push({name,firstFace,faceCount:faces.length-firstFace,first:[...first],last:[...last],lengthM:Math.hypot(...sub(last,first)),diameterM:radius*2});return rings;
}

// Exact source envelope lengths/diameters; joint offsets, tapers and branch
// positions are a simplified arrangement rather than surveyed station CAD.
function module(name,first,axis,color=palette.module,sides=12){const d=ISS_COMPONENT_DIMENSIONS.find(row=>row.name===name);return cylinder(name,first,add(first,scale(unit(axis),d.lengthM)),d.diameterM/2,color,sides);}
module('Zvezda',[-29,0,0],[1,0,0]);module('Zarya',[-15.45,0,0],[1,0,0]);
module('Unity',[-2.3,0,0],[1,0,0]);module('Destiny',[3.7,0,0],[1,0,0]);module('Harmony',[12.75,0,0],[1,0,0]);
cylinder('forward docking adapter',[19.4556,0,0],[22,0,0],1.45);
module('Kibo',[16.1,2.1336,0],[0,1,0]);module('Columbus',[16.1,-2.1336,0],[0,-1,0]);
module('Kibo logistics',[16.1,6,2.19456],[0,0,1]);box('Kibo exposed facility',[16.1,15.32,0],[5.6,4,.3],palette.radiator);
module('Tranquility',[.4432,-2.1336,0],[0,-1,0]);module('Cupola',[.4432,-5.4864,-2.1336],[0,0,-1],palette.window,6);

// Truss backbone and visible lattice rods, using physical 3D solids.
for(const x of [-1.4,1.4])for(const z of [2.6,4.2])box('truss rail',[x,0,z],[.2,94,.2],palette.truss);
for(let k=0;k<=8;k++){
  const y=-47+k*11.75;box('truss cross member',[0,y,3.4],[3,.25,1.8],palette.truss);
  if(k<8)for(const z of [2.6,4.2])cylinder('truss diagonal',[-1.4,y,z],[1.4,y+11.75,z],.09,palette.truss,4);
}
box('truss support',[0,0,1.8],[3.2,3.2,2],palette.truss);

// Eight wings split into two blanket strips each. Overall span is 109 m,
// with a 73 m extent along the arrays. Panel angles are fixed illustrations.
for(const y of [-49,-34,34,49])for(const sign of [-1,1]){
  const x=sign*19.5;
  box('solar mast',[x,y,3.4],[34,.3,.3],palette.frame);
  for(const across of [-1,1]){
    const cy=y+across*2.9;box('solar blanket',[x,cy,3.4],[34,5.2,.12],palette.panel,{wire:true});
    // Visible cell seams on each side; edges are 3D points, not billboards.
    for(let n=1;n<12;n++)for(const dz of [-.07,.07]){
      const xx=x-17+n*34/12;edge(vertex([xx,cy-2.6,3.4+dz]),vertex([xx,cy+2.6,3.4+dz]),palette.panelBack);
    }
  }
}
for(const y of [-22,-15,-8,8,15,22])box('thermal radiator',[-7,y,4.5],[10,4.5,.16],palette.radiator,{wire:true});
// Six 2023 iROSA additions: measured 18.2×6m envelope, representative fixed
// joint locations/40° cant. This retained assembly is not a 2026 inventory.
for(const [y,sign]of [[-49,-1],[-49,1],[-34,1],[34,-1],[49,-1],[49,1]]){
 const center=[sign*12,y,10],start=vertices.length;box('iROSA 2023',[0,0,0],[18.2,6,.12],'#173659',{wire:true});
 const angle=sign*40*Math.PI/180;for(let k=start;k<vertices.length;k++){const [x,v,z]=vertices[k];vertices[k]=[center[0]+x*Math.cos(angle)-z*Math.sin(angle),center[1]+v,center[2]+x*Math.sin(angle)+z*Math.cos(angle)];}
}
const armBase=[4,3,2.5],armElbow=add(armBase,scale(unit([-2,5,5.5]),8.5)),armEnd=add(armElbow,scale(unit([7,2,2]),8.5));
cylinder('Canadarm2 lower',armBase,armElbow,.17,palette.arm,6);cylinder('Canadarm2 upper',armElbow,armEnd,.15,palette.arm,6);

const bounds={min:[0,1,2].map(k=>Math.min(...vertices.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...vertices.map(v=>v[k])))};
const freezeRows=rows=>Object.freeze(rows.map(row=>Array.isArray(row)?Object.freeze(row):Object.freeze({...row,...(row.indices?{indices:Object.freeze(row.indices)}:{})})));
export const ISS_GEOMETRY=Object.freeze({
  vertices:freezeRows(vertices),faces:freezeRows(faces),edges:freezeRows(edges),parts:freezeRows(parts),
  spanM:109,widthM:73,moduleLengthM:51,radiusM:Math.max(...vertices.map(v=>Math.hypot(...v))),
  bounds:Object.freeze({min:Object.freeze(bounds.min),max:Object.freeze(bounds.max)}),units:'meters',schematic:true,
  componentDimensions:ISS_COMPONENT_DIMENSIONS,configuration:'Representative assembly with six 2023 iROSA additions; not current inventory',
  description:'NASA/ESA dimensioned modules, 94 m truss and 18.2×6 m iROSA additions; approximate assembly, joints and attitude',
});
