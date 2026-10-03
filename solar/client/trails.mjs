/* Machine-authored by Codex / OpenAI, 2026-09-05, for 260905-115339-001/solar-system-0.2.
 * AU coordinates remain linear. The Galactic option adds a declared local straight-line
 * Sun velocity to heliocentric samples (engine or declared remote illustration); it is not a Galactic orbit solver. */
import { helioPositionsAt, bodyEngineAvailableAt, getPositionProviderRevision } from './astro.mjs';
import { validatedDate, addTime, differenceMillis, epochMilliseconds, positiveModulo, periodicPhase } from './time.mjs';
import { Rotation_ECL_EQJ, Rotation_EQJ_ECL, Rotation_EQJ_GAL } from './vendor/astronomy-engine-2.1.19.mjs';

export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;
export const YEAR_DAYS = 365.25;
export const GALACTIC_SPEED_KM_S = 230;
export const TRAIL_PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
// Periods choose only the plotting cadence; positions use the selected engine or illustrative provider.
const periodDays = { Mercury: 87.969, Venus: 224.701, Earth: 365.256, Mars: 686.98, Jupiter: 4332.59, Saturn: 10759.22, Uranus: 30688.5, Neptune: 60182, Pluto: 90560 };
const eclToEqj = Rotation_ECL_EQJ().rot;
const eqjToEcl = Rotation_EQJ_ECL().rot;
const eqjToGal = Rotation_EQJ_GAL().rot;
const rotate = (matrix, vector) => [0, 1, 2].map(j => matrix[0][j] * vector[0] + matrix[1][j] * vector[1] + matrix[2][j] * vector[2]);

export const equatorialToEcliptic = vector => rotate(eqjToEcl, vector);
export const equatorialToGalactic = vector => rotate(eqjToGal, vector);
export const eclipticToGalactic = vector => equatorialToGalactic(rotate(eclToEqj, vector));
/** Translate an ecliptic drawing point and rotate it without temporary vectors.
 * Keep the same addition and two-rotation order as the scalar public helpers;
 * combining the matrices would change their floating-point evaluation order. */
export function translatedEclipticToGalactic(point,center,shift) {
  const x=center[0]+(point[0]+shift[0]),y=center[1]+(point[1]+shift[1]),z=center[2]+(point[2]+shift[2]);
  const qx=eclToEqj[0][0]*x+eclToEqj[1][0]*y+eclToEqj[2][0]*z;
  const qy=eclToEqj[0][1]*x+eclToEqj[1][1]*y+eclToEqj[2][1]*z;
  const qz=eclToEqj[0][2]*x+eclToEqj[1][2]*y+eclToEqj[2][2]*z;
  return [eqjToGal[0][0]*qx+eqjToGal[1][0]*qy+eqjToGal[2][0]*qz,
    eqjToGal[0][1]*qx+eqjToGal[1][1]*qy+eqjToGal[2][1]*qz,
    eqjToGal[0][2]*qx+eqjToGal[1][2]*qy+eqjToGal[2][2]*qz];
}

/** J2000 equatorial catalogue coordinates: right ascension in hours, declination in degrees. */
export function catalogueVector(ra, dec) {
  const a = Number(ra) * Math.PI / 12, d = Number(dec) * Math.PI / 180;
  return [Math.cos(a) * Math.cos(d), Math.sin(a) * Math.cos(d), Math.sin(d)];
}

/** Galactic axes: +x toward Galactic longitude 0°, +y toward 90°, +z north. */
export function pointInTrailFrame(position, time, epoch, frame = 'galactic') {
  if (frame === 'heliocentric') return [...position];
  const point = eclipticToGalactic(position);
  point[1] += GALACTIC_SPEED_KM_S * differenceMillis(time, epoch) / 1000 / AU_KM;
  return point;
}

/** Deterministic trailing samples. Time is exact calendar UTC; span uses 365.25-day years.
 * Local detail targets 64 points/orbit with a bounded 4096-segment plotting budget.
 * Coarser spans are display interpolation, not additional ephemeris accuracy.
 */
export function getTrailData(date, years = 2, frame = 'galactic') {
  const endDate = validatedDate(date), duration=years * YEAR_DAYS * DAY_MS;
  if (!Number.isFinite(years) || years <= 0 || !Number.isFinite(duration)) throw new RangeError('Trail span must be a positive, finite plotting interval.');
  if (!['galactic', 'heliocentric'].includes(frame)) throw new RangeError('Unknown trail coordinate frame.');
  const startDate=addTime(endDate,-duration), portable=value=>value instanceof Date?+value:value;
  const start=portable(startDate),end=portable(endDate);
  const tracks = ['Sun', ...TRAIL_PLANETS].map(id => ({ id, points: [] }));
  for (const track of tracks) {
    const steps = track.id === 'Sun' ? 1 : Math.min(4096,Math.max(64, Math.ceil(duration / DAY_MS / periodDays[track.id] * 64)));
    for (let index = 0; index <= steps; index++) {
      const time = portable(addTime(startDate,Math.round(duration * (index / steps))));
      const position = track.id === 'Sun' ? [0, 0, 0] : helioPositionsAt(time, [track.id])[0].position;
      track.points.push({ time, position: pointInTrailFrame(position, time, end, frame) });
    }
  }
  return { start, end, years, frame, speedKmS: frame === 'galactic' ? GALACTIC_SPEED_KM_S : 0, clipped: false, tracks };
}

/* Unified scene model, Codex / OpenAI, claim 260921-192107-001.
 * Calendar-driven circular motion shares one phase with live bodies and trails.
 * The legacy local-line API above remains only for saved consumers/tests. */
export const PC_IN_AU = 648000 / Math.PI;
export const GALACTIC_EPOCH = 946728000000n; // J2000, 2000-01-01 12:00 UTC model origin.
const radiusPc = 8200, speedPcYear = GALACTIC_SPEED_KM_S * YEAR_DAYS * 86400 / (AU_KM * PC_IN_AU);
export const GALACTIC_MODEL = Object.freeze({
  radiusPc, radiusKpc: radiusPc / 1000, speedKmS: GALACTIC_SPEED_KM_S,
  periodYears: 2 * Math.PI * radiusPc / speedPcYear,
  pcInAU: PC_IN_AU, pcInKm: AU_KM * PC_IN_AU, yearSeconds: YEAR_DAYS * 86400,
  description: 'Circular planar orbit at fixed 8.2 kpc and 230 km/s; Galactic gravity is not integrated.',
  frame: 'Galactocentric axes parallel to IAU Galactic axes. J2000 model Sun at [-R0,0,0], moving toward +y.',
});
const galacticPeriodMS = GALACTIC_MODEL.periodYears * YEAR_DAYS * DAY_MS;
const galacticPeriodExact = BigInt(Math.round(galacticPeriodMS));
const radiusAU = radiusPc * PC_IN_AU;
const TAU = 2 * Math.PI;

/** The exact calendar reduces modulo the model period before floating geometry.
 * The period is rounded to a millisecond; that is numerical convention, not
 * millisecond physical accuracy of the circular Galactic approximation. */
export function galacticYearsAt(date, offsetYears = 0) {
  if (!Number.isFinite(offsetYears)) throw new RangeError('Galactic phase offset must be finite.');
  const phase = periodicPhase(date, galacticPeriodMS, GALACTIC_EPOCH);
  return ((phase + offsetYears / GALACTIC_MODEL.periodYears) % 1 + 1) % 1 * GALACTIC_MODEL.periodYears;
}
export const solarPhaseAt = (date, offsetYears = 0) => galacticYearsAt(date, offsetYears) / GALACTIC_MODEL.periodYears * TAU;

/** Position(time)-position(epoch), in AU. Half-angle subtraction retains local
 * precision without subtracting two billion-AU absolute positions. */
export function solarDisplacementBetween(time, epoch, offsetYears = 0) {
  let dt = positiveModulo(epochMilliseconds(time) - epochMilliseconds(epoch), galacticPeriodExact);
  if (dt > galacticPeriodExact / 2n) dt -= galacticPeriodExact;
  const delta = Number(dt) / Number(galacticPeriodExact) * TAU;
  const mid = solarPhaseAt(epoch, offsetYears) + delta / 2, chord = 2 * radiusAU * Math.sin(delta / 2);
  return [chord * Math.sin(mid), chord * Math.cos(mid), 0];
}
export function galacticCenterAt(date, offsetYears = 0) {
  const p = solarPhaseAt(date, offsetYears);
  return [radiusAU * Math.cos(p), -radiusAU * Math.sin(p), 0];
}
/** Independent full-orbit reference, in the same current Sun-relative frame. */
export function solarOrbitReference(date, samples = 361, offsetYears = 0) {
  if (!Number.isInteger(samples) || samples < 9 || samples > 10001) throw new RangeError('Use 9…10001 solar orbit samples.');
  const phase = solarPhaseAt(date, offsetYears);
  return Array.from({ length: samples }, (_, index) => {
    const delta = -index / (samples - 1) * TAU, mid = phase + delta / 2, chord = 2 * radiusAU * Math.sin(delta / 2);
    return index === samples - 1 ? [0,0,0] : [chord * Math.sin(mid), chord * Math.cos(mid), 0];
  });
}

const orbitRadii = { Mercury: .47, Venus: .73, Earth: 1.02, Mars: 1.67, Jupiter: 5.46, Saturn: 10.2, Uranus: 20.2, Neptune: 30.4, Pluto: 49.5 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
// Exact-time, bounded cache helps repeated camera redraws without quantizing a
// requested UTC or pretending that old planetary positions are current ones.
const localSampleCache = new Map(), SAMPLE_CACHE_LIMIT = 12000;
let localSampleRevision=null;
function localSample(id, time) {
  const revision=getPositionProviderRevision();
  if(revision!==localSampleRevision){localSampleCache.clear();localSampleRevision=revision;}
  const key = id + ':' + epochMilliseconds(time);
  let point = localSampleCache.get(key);
  if (point) return point;
  point = eclipticToGalactic(helioPositionsAt(time, [id])[0].position);
  localSampleCache.set(key, point);
  if (localSampleCache.size > SAMPLE_CACHE_LIMIT) localSampleCache.delete(localSampleCache.keys().next().value);
  return point;
}

/** Fixed absolute sample times, with exact requested interval endpoints.
 * Only the drawing grid is spaced; neither the selected time nor a model
 * evaluation is rounded to that grid. BigInt phase also works before epoch
 * zero and outside native Date. Offsets stay within the bounded display span. */
export function fixedTimeOffsets(value,start,end,step) {
  start=Math.round(start);end=Math.round(end);step=Math.round(step);
  if(![start,end,step].every(Number.isSafeInteger)||start>end||step<1||(end-start)/step>10000)throw new RangeError('Invalid fixed sampling interval.');
  const epoch=epochMilliseconds(value),stride=BigInt(step),first=epoch+BigInt(start),last=epoch+BigInt(end),offsets=[start];
  for(let time=first-positiveModulo(first,stride)+stride;time<last;time+=stride)offsets.push(Number(time-epoch));
  if(end!==start)offsets.push(end);
  return offsets;
}

/** Real elapsed samples, never repeated orbital templates. Far sections collapse
 * to the solar route when planet-scale excursions are subpixel or outside the
 * bounded local detail window. Their detail=false flag exposes this simplification.
 * The camera's nearest point on the elapsed solar arc chooses the detail window,
 * so flight back along a long historical trail brings its local orbits into view.
 * Each track has at most maxPoints samples regardless of the calendar/span. */
export function getElapsedTrails(date, years = 2, options = {}) {
  const end = validatedDate(date), duration = Math.trunc(years * YEAR_DAYS * DAY_MS);
  if (!Number.isFinite(years) || years < .25 || years > 100000) throw new RangeError('Use .25…100000 elapsed Julian years.');
  const camera = options.cameraPosition ?? [0,0,0], focal = options.focalPixels ?? 800;
  const maxPoints = options.maxPoints ?? 1024, offset = options.galacticYearsOffset ?? 0;
  if (!finitePoint(camera) || !Number.isFinite(focal) || focal <= 0 || !Number.isInteger(maxPoints) || maxPoints < 128 || maxPoints > 4096 || !Number.isFinite(offset)) throw new RangeError('Invalid trail plotting options.');
  const start = addTime(end, -duration);
  const timeAt = age => addTime(end, -Math.round(age));
  // All allowed trail spans are shorter than half the fixed Galactic period.
  // Share the selected epoch's phase instead of validating it at every vertex.
  const phase=solarPhaseAt(end,offset);
  const sunAt = age => {const elapsed=Math.round(age),delta=(elapsed===0?0:-elapsed)/Number(galacticPeriodExact)*TAU,mid=phase+delta/2,chord=2*radiusAU*Math.sin(delta/2);return [chord*Math.sin(mid),chord*Math.cos(mid),0];};
  // Closest point on this short (<0.0005-cycle) arc. Project into the orbital
  // plane; atan2 of cross/dot remains accurate near the present Sun.
  const center = galacticCenterAt(end, offset), radial = center.map(x => -x);
  const towardCamera = camera.map((x,i) => x - center[i]);
  const angle = Math.atan2(radial[0] * towardCamera[1] - radial[1] * towardCamera[0], radial[0] * towardCamera[0] + radial[1] * towardCamera[1]);
  // This model travels clockwise in xy, so positive mathematical angle is past.
  const closestAge = clamp(angle / TAU * Number(galacticPeriodExact), 0, duration);
  const nearestSun = sunAt(closestAge), nearestDistance = Math.hypot(...nearestSun.map((x,i) => x - camera[i]));
  const baseSteps = 48;
  const tracks = ['Sun', ...TRAIL_PLANETS].map(id => {
    let detailStart = 0, detailEnd = 0, detailed = false;
    if (id !== 'Sun' && nearestDistance < orbitRadii[id] * focal * 1.5) {
      const period = periodDays[id] * DAY_MS;
      // At least 32 samples per nominal orbit, including Mercury; spend no
      // work on invisible millions of revolutions in a remote coarse section.
      const window = Math.min(duration, (maxPoints - baseSteps - 8) / 32 * period);
      detailStart = clamp(closestAge - window / 2, 0, Math.max(0, duration - window));
      detailEnd = Math.min(duration, detailStart + window);
      detailed = true;
    }
    // Anchor interior samples to absolute UTC. Playback moves the exact
    // endpoints but reuses interior ephemerides until a sample leaves the span.
    const ages = new Set(fixedTimeOffsets(end,-Math.trunc(duration),0,duration/baseSteps).map(n=>-n));
    if (detailed) {
      const slots=maxPoints-baseSteps-6,step=Math.max(periodDays[id]*DAY_MS/32,(detailEnd-detailStart)/slots);
      for(const offset of fixedTimeOffsets(end,-detailEnd,-detailStart,step))ages.add(-offset);
    }
    const points = [...ages].sort((a,b)=>b-a).map(age => {
      const time = timeAt(age), sun = sunAt(age);
      const detail = id !== 'Sun' && (age === 0 || (detailed && age >= Math.round(detailStart) && age <= Math.round(detailEnd)));
      const local = detail ? localSample(id, time) : [0,0,0];
      return { time, position: sun.map((x,i)=>x+local[i]), detail };
    });
    return { id, points, illustrative: !bodyEngineAvailableAt(id, start) || !bodyEngineAvailableAt(id, end), detail: detailed ? 'local orbital samples plus simplified solar route' : 'simplified solar route',
      detailInterval: detailed ? { start: timeAt(detailEnd), end: timeAt(detailStart) } : null };
  });
  return { start, end, years, tracks, frame: 'sun-relative-galactic', model: GALACTIC_MODEL.description,
    simplification: 'Planetary orbital detail is sampled near the camera; distant or budget-limited intervals follow the solar route.',
    approximate: true, illustrative: tracks.some(track => track.illustrative), maxPoints };
}
