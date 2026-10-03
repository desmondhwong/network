/* Machine-authored Codex/OpenAI, claim260924-104536-001.
 * Bounded schematic Milky Way in inertial Galactic axes; separately sourced
 * cluster centers. See ../data-sources/milky-way-provenance.md. */
import clusterData from './data/milky-way-clusters.json' with {type:'json'};
import {catalogueVector,equatorialToGalactic,PC_IN_AU,GALACTIC_MODEL,GALACTIC_EPOCH,galacticCenterAt,solarDisplacementBetween} from './trails.mjs';
import {epochMilliseconds} from './time.mjs';

const TAU=2*Math.PI,RAD=Math.PI/180,R0=GALACTIC_MODEL.radiusPc;
const detailCounts=Object.freeze({low:4800,medium:9600,high:19200});
const aliases={Melotte_25:'Hyades',Melotte_22:'Pleiades',Melotte_111:'Coma Berenices',Melotte_20:'Alpha Persei',NGC_2632:'Praesepe / M44',IC_2391:'IC 2391',IC_2602:'Southern Pleiades / IC 2602',NGC_2516:'NGC 2516',NGC_3532:'NGC 3532',NGC_869:'Double Cluster / NGC 869',NGC_884:'Double Cluster / NGC 884',NGC_2682:'M67',NGC_2168:'M35',NGC_2099:'M37',NGC_1912:'M38',NGC_6705:'Wild Duck / M11',NGC_6405:'M6',NGC_6475:'M7','NGC 104':'47 Tucanae','NGC 5139':'Omega Centauri','NGC 6205':'M13','NGC 6121':'M4','NGC 6656':'M22','NGC 7078':'M15','NGC 5904':'M5','NGC 6341':'M92','NGC 6752':'NGC 6752'};
export const MILKY_WAY_METADATA=Object.freeze({
  ...clusterData.metadata,clusterCount:clusterData.clusters.length,
  detailCounts,frame:'Inertial Galactic axes; galactocentric AU, current-Sun-relative on projection.',
  description:'Schematic 3D spiral arms, disk, bar/bulge and stellar halo; 2,024 catalogue cluster centers. Generated points are illustrative samples, not measured individual stars.',
  timeModel:'The galaxy pattern and cluster centers are fixed in inertial Galactic coordinates. Solar motion follows the shared circular model; cluster motions and Galactic evolution are not integrated. Remote dates are illustrative.',
  modelParameters:Object.freeze({diskRadiusPc:16000,diskScaleHeightPc:150,haloRadiusPc:30000,barHalfLengthPc:3100,barAngleDegrees:27,armPitchDegrees:13,armCount:4}),
  fieldFadePc:5,clusterFadePc:.05,localCatalogueExclusionPc:300,
  epoch:'Open clusters ICRS epoch 2015.5; globular centers equinox J2000 (catalogue 2010 edition).',
});

// Numerical J2000 epoch is shared with the solar model. Open-cluster coordinates
// are translated from the solar position at their documented 2015.5 epoch.
const OPEN_EPOCH=GALACTIC_EPOCH+BigInt(Math.round(15.5*365.25*86400000));
const openSolarShift=solarDisplacementBetween(OPEN_EPOCH,GALACTIC_EPOCH).map(n=>n/PC_IN_AU);
const clusterAnchors=Object.freeze(clusterData.clusters.map(row=>{
  const unit=equatorialToGalactic(catalogueVector(row.raDeg/15,row.decDeg));
  const shift=row.type==='open'?openSolarShift:[0,0,0];
  const position=unit.map((n,i)=>(n*row.distancePc+shift[i]-(i===0?R0:0))*PC_IN_AU);
  const label=aliases[row.id]??row.name??row.id.replaceAll('_',' ');
  return Object.freeze({...row,label,position:Object.freeze(position),kind:'measured-center',component:'cluster',labelPriority:aliases[row.id]?100:row.distancePc<300?50:0,
    radiusPc:Number.isFinite(row.angularHalfRadiusDeg)&&row.angularHalfRadiusDeg>0?row.distancePc*Math.tan(row.angularHalfRadiusDeg*RAD):null,
    radiusMeaning:row.type==='open'?'projected half-member radius':'projected half-light radius'});
}));
function generator(seed=0x6d773134){let value=seed;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return (value+.5)/4294967296;};}
function normal(random){return Math.sqrt(-2*Math.log(random()))*Math.cos(TAU*random());}
function sphere(random){const z=random()*2-1,a=TAU*random(),s=Math.sqrt(1-z*z);return [s*Math.cos(a),s*Math.sin(a),z];}
const cache=new Map();

/** Deterministic cached model. No frame/date/camera work happens in this builder.
 * Synthetic member clouds use observed projected half radii, but their depth,
 * membership, relative brightness and individual positions are illustrative. */
export function milkyWayModel(detail='medium'){
  if(!Object.hasOwn(detailCounts,detail))throw new RangeError('Milky Way detail must be low, medium or high.');
  if(cache.has(detail))return cache.get(detail);
  const random=generator(),points=[],arms=[],target=detailCounts[detail],pitch=Math.tan(13*RAD),bar=27*RAD;
  const add=(position,component,color,weight=1,clusterId=null)=>{
    if(component!=='cluster'&&Math.hypot(position[0]+R0,position[1],position[2])<300)return;
    points.push(Object.freeze({position:Object.freeze(position.map(v=>v*PC_IN_AU)),kind:'model',component,color,weight,...(clusterId?{clusterId}:{})}));
  };
  // Four logarithmic lanes are an explicitly schematic topology, not a fit to
  // maser/Gaia measurements. Unequal colors/widths keep it a legible overview.
  for(let arm=0;arm<4;arm++){
    const path=[];
    for(let j=0;j<=160;j++){const r=2500+13500*j/160,a=Math.log(r/3100)/pitch+bar+arm*Math.PI/2;path.push(Object.freeze([r*Math.cos(a)*PC_IN_AU,r*Math.sin(a)*PC_IN_AU,0]));}
    arms.push(Object.freeze({id:`model-arm-${arm+1}`,kind:'model',points:Object.freeze(path)}));
  }
  for(let i=0;i<target;i++){
    const type=i%20;
    if(type<9){const arm=i%4,r=2800+13200*Math.sqrt(random()),a=Math.log(r/3100)/pitch+bar+arm*Math.PI/2+normal(random)*.025,spread=normal(random)*180;
      add([(r+spread)*Math.cos(a),(r+spread)*Math.sin(a),normal(random)*90],'arm',i%3?'#8fb9df':'#d5e7ed',.55+random()*.45);
    }else if(type<16){const r=Math.min(16000,-Math.log(random()*random())*2400),a=TAU*random(),z=normal(random)*(i%5?150:600);
      add([r*Math.cos(a),r*Math.sin(a),z],'disk','#c7bca7',.25+random()*.45);
    }else if(type<19){const n=[normal(random),normal(random),normal(random)],x=n[0]*1300,y=n[1]*480;
      add([x*Math.cos(bar)-y*Math.sin(bar),x*Math.sin(bar)+y*Math.cos(bar),n[2]*450],'bulge',i%3?'#e8be89':'#ffe0aa',.5+random()*.5);
    }else{const radius=3000+27000*Math.pow(random(),1.7),v=sphere(random);add(v.map(n=>n*radius),'halo','#b9abc7',.25+random()*.35);}
  }
  // Only selected nearby/named anchors have generated cloud members. Other
  // observed centers stay inexpensive exact-position markers.
  const cloudClusters=clusterAnchors.filter(c=>c.labelPriority>=50&&c.radiusPc!==null).slice(0,48),members=detail==='low'?24:detail==='medium'?48:96;
  for(const cluster of cloudClusters)for(let i=0;i<members;i++){
    const v=sphere(random),u=random(),r=cluster.radiusPc*Math.sqrt(u/Math.max(.02,1-u));
    add(cluster.position.map((n,j)=>n/PC_IN_AU+v[j]*r),'cluster',cluster.type==='globular'?'#ffe0ae':'#b9deff',.5+random()*.5,cluster.id);
  }
  const model=Object.freeze({points:Object.freeze(points),clusters:clusterAnchors,arms:Object.freeze(arms),metadata:MILKY_WAY_METADATA,detail,pointCount:points.length,cloudClusterCount:cloudClusters.length});cache.set(detail,model);return model;
}

/** One frame per draw. No giant floating-year conversion: shared center uses
 * exact calendar modulo. A frozen galactocentric point does NOT rotate with
 * the Sun, so solar travel changes our position within this overview. */
export function createMilkyWayFrame(date,offsetYears=0){
  const center=galacticCenterAt(date,offsetYears),epoch=epochMilliseconds(date),modern=epoch>=GALACTIC_EPOCH-100n*31557600000n&&epoch<=GALACTIC_EPOCH+100n*31557600000n;
  return {center,epoch,offsetYears,illustrative:true,catalogueEpochNearby:modern,description:modern?'Catalogue cluster centers; schematic populations and shape.':'Illustrative remote epoch: fixed cluster centers and pattern; no Galactic evolution.'};
}
export function milkyWayPosition(point,frame){const p=Array.isArray(point)?point:point.position;return [p[0]+frame.center[0],p[1]+frame.center[1],p[2]+frame.center[2]];}

const positionBuffers=new WeakMap();
/** Snapshot a static model into reusable, caller-owned drawing vectors.
 * A new model/detail selection requires a new buffer. Catalogue/source arrays
 * are never changed, and multiple views keep independent output buffers. */
export function createMilkyWayPositionBuffer(model) {
  const source=[],targets=[];
  const allocate=point=>{const p=Array.isArray(point)?point:point.position;if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw new RangeError('Finite Galactic source vectors are required.');source.push(p[0],p[1],p[2]);const output=[0,0,0];targets.push(output);return output;};
  const positions={arms:model.arms.map(arm=>arm.points.map(allocate)),points:model.points.map(allocate),clusters:model.clusters.map(allocate)};
  const buffer=Object.freeze({positions,count:targets.length});positionBuffers.set(buffer,{source:Float64Array.from(source),targets});return buffer;
}

/** Exact per-coordinate addition with no per-point allocation during playback.
 * Returned vectors are reused until this buffer's next update. */
export function updateMilkyWayPositionBuffer(buffer,frame) {
  const compiled=positionBuffers.get(buffer);if(!compiled)throw new TypeError('Supply a compiled Galactic position buffer.');
  const {source,targets}=compiled,c=frame.center;
  for(let i=0,k=0;i<targets.length;i++,k+=3){const p=targets[i];p[0]=source[k]+c[0];p[1]=source[k+1]+c[1];p[2]=source[k+2]+c[2];}
  return buffer.positions;
}
