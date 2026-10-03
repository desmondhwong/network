/* Machine-authored by Codex / OpenAI, claims260921-192107-001 and260922-120354-001.
 * Legacy fixed markers and expanded observed stellar kinematics with bounded
 * illustrative Galactic paths; unsupported distances use labeled scenery.
 * See ../data-sources/stellar-motion-provenance.md and retained accessions. */
import distanceData from './data/star-distances.json' with { type: 'json' };
import motionData from './data/stellar-catalogue.json' with { type: 'json' };
import { catalogueVector, equatorialToGalactic, PC_IN_AU, GALACTIC_EPOCH, GALACTIC_MODEL, solarDisplacementBetween } from './trails.mjs';
import { epochMilliseconds, positiveModulo } from './time.mjs';

export const SPATIAL_STAR_METADATA = Object.freeze({
  ...motionData.metadata,
  description: 'XHIP bright and nearby stars with quality-filtered parallax, proper motion and radial velocity where available. Other depths are illustrative; long-time Galactic paths are bounded illustrations.',
  fallback: 'Deterministic HIP-identifier hash chooses 300–1200 pc for visual depth only; not a measured or inferred distance. Nonstellar constellation anchors remain direction-only.',
});
function illustrativeDepth(id) {
  let hash = 2166136261;
  for (const char of String(id)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return 300 + (hash >>> 0) / 4294967295 * 900;
}

/** Exact HIP identifier join. Negative, zero, poor-significance or absent
 * parallaxes do not become invented measured distances. Their stable scenery
 * depth is explicitly illustrative; no magnitude-to-distance inference is made.
 * Nonstellar constellation anchors always remain directions. */
export function spatialStarCatalogue(sky, distances = distanceData) {
  if (!Array.isArray(sky?.stars)) throw new TypeError('Supply a sky catalogue.');
  return sky.stars.map(star => {
    const direction = equatorialToGalactic(catalogueVector(star.ra, star.dec));
    const row = distances.parallaxes?.[star.id];
    const good = star.render !== false && Number.isFinite(row?.parallaxMas) && row.parallaxMas > 0
      && Number.isFinite(row.errorMas) && row.errorMas >= 0 && row.errorMas / row.parallaxMas <= .2;
    const distancePc = good ? 1000 / row.parallaxMas : star.render === false ? null : illustrativeDepth(star.id);
    return { ...star, direction, distancePc, distanceKind: good ? 'measured-parallax' : distancePc === null ? 'direction-only' : 'illustrative-depth',
      parallaxMas: row?.parallaxMas ?? null, parallaxErrorMas: row?.errorMas ?? null,
      position: distancePc === null ? null : direction.map(x => x * distancePc * PC_IN_AU) };
  });
}

/** Frozen J2000 marker minus the circular model's current solar displacement.
 * Shared rebasing keeps a freely moving camera and stars in the same Galactic
 * frame. Remote epochs are illustrative, not forward stellar-motion prediction. */
let cachedEpoch, cachedOffset, cachedMovement;
export function spatialStarPosition(star, date, offsetYears = 0) {
  if (!star?.position) return null;
  const epoch = epochMilliseconds(date);
  if (epoch !== cachedEpoch || offsetYears !== cachedOffset) {
    cachedMovement = solarDisplacementBetween(date, GALACTIC_EPOCH, offsetYears);
    // A phase-only change moves the Sun relative to the same frozen star field.
    // Include the shifted epoch Sun as well as elapsed motion at that phase.
    // Half-angle form preserves the small offset case without R-R*cos(theta).
    const half = (offsetYears % GALACTIC_MODEL.periodYears) / GALACTIC_MODEL.periodYears * Math.PI;
    const chord = 2 * GALACTIC_MODEL.radiusPc * PC_IN_AU * Math.sin(half);
    cachedMovement = [cachedMovement[0] + chord * Math.sin(half), cachedMovement[1] + chord * Math.cos(half), cachedMovement[2]];
    cachedEpoch = epoch; cachedOffset = offsetYears;
  }
  return star.position.map((x,i) => x - cachedMovement[i]);
}

/** Magnitude varies with observer distance for traversable points, avoiding
 * stars blinking out merely because the camera has left the original Sun. */
export function spatialStarMagnitude(star, observerDistanceAU) {
  if (!star.position || !(observerDistanceAU > 0)) return star.mag;
  const referenceDistance = star.distancePc * PC_IN_AU;
  return star.mag + 5 * Math.log10(observerDistanceAU / referenceDistance);
}

/* Expanded catalogue and bounded stellar motion, Codex/OpenAI,
 * claim260922-120354-001. See stellar-motion-provenance.md for equations,
 * source epoch, missing velocity components and long-time limitations. */
const YEAR_MS = 365.25 * 86400000, YEAR_S = YEAR_MS / 1000;
const MAS_RAD = Math.PI / (180 * 3600000), SUN_RADIUS_AU = GALACTIC_MODEL.radiusPc * PC_IN_AU;
const SUN_SPEED_AU_YEAR = GALACTIC_MODEL.speedKmS * YEAR_S / 149597870.7;
const GROUP_COUNT = 128, GROUP_PC = 250, TAU = Math.PI * 2;
const groups = Array.from({length:GROUP_COUNT},(_,i)=>{
  const omega=SUN_SPEED_AU_YEAR / ((i+1)*GROUP_PC*PC_IN_AU);
  return {omega,period:BigInt(Math.round(TAU/omega*YEAR_MS))};
});
const sourceRows = new Map(motionData.rows.map(r=>[String(r[0]),r]));
const expandedCache = new WeakMap();
function orbitParameters(star, relativeVelocity=[0,0,0], measured=false) {
  if(!star.position)return star;
  const q=[star.position[0]-SUN_RADIUS_AU,star.position[1],star.position[2]];
  const group=Math.max(0,Math.min(GROUP_COUNT-1,Math.round(Math.hypot(q[0],q[1])/PC_IN_AU/GROUP_PC)-1)),omega=groups[group].omega;
  const circular=[omega*q[1],-omega*q[0],0];
  const absolute=measured?[relativeVelocity[0],relativeVelocity[1]+SUN_SPEED_AU_YEAR,relativeVelocity[2]]:circular;
  return {...star,relativeVelocityAUYear:relativeVelocity,orbitGroup:group,
    orbitOrigin:q,orbitResidual:[absolute[0]-circular[0],absolute[1]-circular[1],absolute[2]]};
}
function sourceStar(row, original) {
  const [id,raDeg,decDeg,parallaxMas,errorMas,pmRaMasYear,pmDecMasYear,pmRaError,pmDecError,rv,rvError,rvQuality,mag,sourceName,astrometrySource,properMotionSource,rvReference,constellation]=row;
  const reliable=Number.isFinite(parallaxMas)&&parallaxMas>0&&Number.isFinite(errorMas)&&errorMas>=0&&errorMas/parallaxMas<=.2;
  const properMotionAccepted=reliable&&Number.isFinite(pmRaMasYear)&&Number.isFinite(pmDecMasYear);
  const distancePc=reliable?1000/parallaxMas:illustrativeDepth(id);
  const ra=raDeg*Math.PI/180,dec=decDeg*Math.PI/180;
  const direction=equatorialToGalactic(catalogueVector(raDeg/15,decDeg));
  const radialAccepted=reliable&&Number.isFinite(rv)&&Number.isFinite(rvError)&&rvError>=0&&rvError<999&&['A','B'].includes(rvQuality);
  const east=equatorialToGalactic([-Math.sin(ra),Math.cos(ra),0]);
  const north=equatorialToGalactic([-Math.cos(ra)*Math.sin(dec),-Math.sin(ra)*Math.sin(dec),Math.cos(dec)]);
  const tangentFactor=distancePc*PC_IN_AU*MAS_RAD,radialAU=radialAccepted?rv*YEAR_S/149597870.7:0;
  const velocity=direction.map((x,i)=>(properMotionAccepted?(east[i]*pmRaMasYear+north[i]*pmDecMasYear)*tangentFactor:0)+x*radialAU);
  // Catalogue coordinates are at J1991.25 despite the service's RAJ2000 name.
  // Propagate 8.75 Julian years to the scene's J2000 origin; no epoch confusion.
  const position=direction.map((x,i)=>x*distancePc*PC_IN_AU+velocity[i]*8.75);
  const star={...original,id:String(id),ra:raDeg/15,dec:decDeg,mag,name:original?.name||sourceName||'',render:true,
    position,direction,distancePc,distanceKind:reliable?'measured-parallax':'illustrative-depth',
    parallaxMas,parallaxErrorMas:errorMas,referenceDistanceAU:Math.hypot(...position),
    properMotion:{raCosDecMasYear:pmRaMasYear,decMasYear:pmDecMasYear,raErrorMasYear:pmRaError,decErrorMasYear:pmDecError},
    radialVelocityKmS:radialAccepted?rv:null,radialVelocityErrorKmS:rvError,radialVelocityQuality:rvQuality,
    kinematics:properMotionAccepted?(radialAccepted?'proper-motion-and-radial-velocity':'proper-motion-assumed-zero-radial'):radialAccepted?'radial-velocity-assumed-zero-proper-motion':'illustrative-circular',
    source:'XHIP V/137D',sourceEpoch:1991.25,astrometrySource,properMotionSource,rvReference,constellation};
  return orbitParameters(star,velocity,properMotionAccepted||radialAccepted);
}

/** Expanded offline sample, exact HIP joins and original constellation vertices.
 * Every supplied original star remains present, even outside the source cuts.
 * Fresh catalogues are cached by the caller's immutable source-array identity. */
export function expandedStarCatalogue(sky, source=motionData) {
  if(!Array.isArray(sky?.stars))throw new TypeError('Supply a sky catalogue.');
  if(!Array.isArray(source?.rows))throw new TypeError('Supply source rows in the retained stellar catalogue schema.');
  if(source===motionData&&expandedCache.has(sky.stars))return expandedCache.get(sky.stars);
  const originals=new Map([...(source.fallbackStars||[]),...sky.stars].map(s=>[String(s.id),s]));
  const stars=source.rows.map(row=>sourceStar(row,originals.get(String(row[0]))));
  const sourceIds=source===motionData?sourceRows:new Set(source.rows.map(row=>String(row[0])));
  for(const star of spatialStarCatalogue({stars:[...originals.values()]}))if(!sourceIds.has(String(star.id)))stars.push(orbitParameters(star));
  const result=stars.sort((a,b)=>(a.mag-b.mag)||String(a.id).localeCompare(String(b.id)));
  if(source===motionData)expandedCache.set(sky.stars,result);return result;
}

let lastFrame=null;
/** At most128 exact phase reductions/trigonometric groups per date, independent
 * of star count. Finite periodic evolution works even at arbitrary signed years.
 * No numerical integration accumulates error, lag or unbounded path history. */
export function createStellarFrame(date,offsetYears=0,motionEnabled=true) {
  const epoch=epochMilliseconds(date);
  if(!Number.isFinite(offsetYears))throw new RangeError('Stellar phase offset must be finite.');
  if(lastFrame?.epoch===epoch&&lastFrame.offsetYears===offsetYears&&lastFrame.motionEnabled===!!motionEnabled)return lastFrame;
  // Reuse the legacy helper's exact circular-Sun rebase without a star loop.
  spatialStarPosition({position:[0,0,0]},date,offsetYears);
  const delta=epoch-GALACTIC_EPOCH,local=delta>=-BigInt(1000*YEAR_MS)&&delta<=BigInt(1000*YEAR_MS);
  const modes=motionEnabled?groups.map(({period,omega})=>{
    let elapsed=positiveModulo(delta,period);if(elapsed>period/2n)elapsed-=period;
    const phase=Number(elapsed)/Number(period)*TAU,s=Math.sin(phase),half=Math.sin(phase/2);
    return {sin:s,cosMinusOne:-2*half*half,sinOverOmega:s/omega};
  }):[];
  lastFrame={epoch,offsetYears,motionEnabled:!!motionEnabled,sunMovement:[...cachedMovement],groups:modes,
    mode:!motionEnabled?'fixed':local?'catalogue-kinematics':'illustrative-galactic',
    label:!motionEnabled?'Fixed stellar reference positions':local?'Catalogue proper motions; accepted radial velocities where available':'Illustrative bounded Galactic paths · not predicted stellar orbits',
    limitations:'Missing radial velocity assumes zero. Shared circular speed and grouped analytic paths omit gravitational perturbations, stellar evolution and binary motion.'};
  return lastFrame;
}

/** Allocation is one 3-vector; no date parsing, trig, BigInt or orbit integration
 * occurs per star. The analytic derivative at J2000 matches accepted heliocentric
 * kinematics; long-time motion is an explicitly bounded Galactic illustration. */
export function spatialStarPositionInFrame(star,frame) {
  if(!star.position)return null;
  let dx=0,dy=0,dz=0;
  if(frame.motionEnabled&&Number.isInteger(star.orbitGroup)){
    const f=frame.groups[star.orbitGroup],q=star.orbitOrigin,v=star.orbitResidual;
    dx=q[0]*f.cosMinusOne+q[1]*f.sin+v[0]*f.sinOverOmega;
    dy=-q[0]*f.sin+q[1]*f.cosMinusOne+v[1]*f.sinOverOmega;
    dz=q[2]*f.cosMinusOne+v[2]*f.sinOverOmega;
  }
  return [star.position[0]+dx-frame.sunMovement[0],star.position[1]+dy-frame.sunMovement[1],star.position[2]+dz-frame.sunMovement[2]];
}

const stellarBuffers=new WeakMap();
/** Compile a catalogue snapshot into a caller-owned drawing buffer. Rebuild
 * after replacing/editing the catalogue. The source and scalar API stay
 * untouched; each update reuses the output vectors and their ordering/nulls. */
export function createStellarPositionBuffer(stars) {
  if(!Array.isArray(stars))throw new TypeError('Supply a stellar catalogue array.');
  const source=new Float64Array(stars.length*9),positions=new Array(stars.length),byGroup=Array.from({length:GROUP_COUNT},()=>[]),fixed=[];
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  for(let i=0;i<stars.length;i++){
    const star=stars[i];if(!star.position){positions[i]=null;continue;}
    if(!vector(star.position))throw new RangeError('Finite stellar source vectors are required.');
    const base=i*9;source.set(star.position,base);positions[i]=[0,0,0];
    if(Number.isInteger(star.orbitGroup)){
      if(star.orbitGroup<0||star.orbitGroup>=GROUP_COUNT||!vector(star.orbitOrigin)||!vector(star.orbitResidual))throw new RangeError('Invalid stellar orbit group or coefficients.');
      source.set(star.orbitOrigin,base+3);source.set(star.orbitResidual,base+6);byGroup[star.orbitGroup].push(i);
    }else fixed.push(i);
  }
  const buffer=Object.freeze({positions,count:stars.length});
  stellarBuffers.set(buffer,{source,byGroup:byGroup.map(indices=>Uint32Array.from(indices)),fixed:Uint32Array.from(fixed)});return buffer;
}

/** Identical arithmetic to spatialStarPositionInFrame at this exact frame.
 * Group coefficients are read once per group and no per-star vectors are
 * allocated. Returned positions are mutable until this buffer's next update. */
export function updateStellarPositionBuffer(buffer,frame) {
  const compiled=stellarBuffers.get(buffer);if(!compiled)throw new TypeError('Supply a compiled stellar position buffer.');
  const {source,byGroup,fixed}=compiled,positions=buffer.positions,sun=frame.sunMovement;
  if(frame.motionEnabled){
    for(let group=0;group<byGroup.length;group++){
      const indices=byGroup[group];if(!indices.length)continue;
      const f=frame.groups[group],c=f.cosMinusOne,s=f.sin,w=f.sinOverOmega;
      for(let n=0;n<indices.length;n++){
        const index=indices[n],k=index*9,p=positions[index];
        const dx=source[k+3]*c+source[k+4]*s+source[k+6]*w;
        const dy=-source[k+3]*s+source[k+4]*c+source[k+7]*w;
        const dz=source[k+5]*c+source[k+8]*w;
        p[0]=source[k]+dx-sun[0];p[1]=source[k+1]+dy-sun[1];p[2]=source[k+2]+dz-sun[2];
      }
    }
    for(let n=0;n<fixed.length;n++){const index=fixed[n],k=index*9,p=positions[index];p[0]=source[k]+0-sun[0];p[1]=source[k+1]+0-sun[1];p[2]=source[k+2]+0-sun[2];}
  }else{
    for(let index=0;index<positions.length;index++){const p=positions[index];if(!p)continue;const k=index*9;p[0]=source[k]+0-sun[0];p[1]=source[k+1]+0-sun[1];p[2]=source[k+2]+0-sun[2];}
  }
  return positions;
}

export function stellarCatalogueSummary(sky={stars:[]}) {
  const stars=Array.isArray(sky)?sky:expandedStarCatalogue(sky);
  const counts={stars:0,measured:0,illustrative:0,directionOnly:0,properMotions:0,radialVelocities:0};
  for(const star of stars){if(star.render!==false)counts.stars++;if(star.distanceKind==='measured-parallax')counts.measured++;else if(star.distanceKind==='illustrative-depth')counts.illustrative++;else counts.directionOnly++;
    if(star.kinematics?.startsWith('proper-motion'))counts.properMotions++;if(star.radialVelocityKmS!==null&&Number.isFinite(star.radialVelocityKmS))counts.radialVelocities++;}
  return {...counts,description:`${counts.stars.toLocaleString('en-US')} spatial stars · ${counts.measured.toLocaleString('en-US')} parallax distances · proper motion + optional radial velocity`};
}

/** Conventional constellation labels follow their current unique member points.
 * Their centroid is a display label anchor, never a physical constellation body. */
export function constellationLabelAnchors(constellations,positions) {
  return (constellations||[]).map(c=>{
    const ids=new Set((c.lines||[]).flat().map(String)),points=[...ids].map(id=>positions.get(id)).filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
    if(!points.length)return null;
    return {id:c.id,name:c.name||c.id,position:[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length)};
  }).filter(Boolean);
}
