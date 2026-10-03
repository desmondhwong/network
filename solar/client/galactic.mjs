/* Machine-authored by Codex / OpenAI, 2026-09-07, claim 260907-202059-001.
 * An explicitly circular Galactic orbit, not a measured solar trajectory.
 * Sources, epoch conventions and limits: ../data-sources/galactic-provenance.md. */
import { catalogueVector, equatorialToGalactic, eclipticToGalactic, GALACTIC_MODEL } from './trails.mjs';
export { GALACTIC_MODEL, galacticYearsAt, solarPhaseAt, solarDisplacementBetween, galacticCenterAt, solarOrbitReference } from './trails.mjs';
import { validatedDate } from './astro.mjs';
import { accuracyAt, differenceMillis } from './time.mjs';

const TAU = 2 * Math.PI;
const AU_KM = 149597870.7;
const PC_IN_AU = 648000 / Math.PI;
const YEAR_SECONDS = 365.25 * 86400;
const RADIUS_PC = 8200;
const SPEED_KM_S = 230;
const SPEED_PC_YEAR = SPEED_KM_S * YEAR_SECONDS / (AU_KM * PC_IN_AU);

// Xu et al. 2022: J2000/ICRF coordinate axes, reference epoch 2020.0.
// Coordinate epoch is distinct from the J2000 axes; proper motion is in mas/year.
const raHours = 17 + 45 / 60 + 40.032863 / 3600;
const decDeg = -(29 + 28.24260 / 3600);
const equatorial = catalogueVector(raHours, decDeg);
export const SGR_A = Object.freeze({
  name: 'Sagittarius A*', raHours, decDeg, referenceEpoch: 2020,
  eastMotionMasYear: -3.152, northMotionMasYear: -5.586,
  equatorial: Object.freeze(equatorial), galactic: Object.freeze(equatorialToGalactic(equatorial)),
  source: 'https://arxiv.org/abs/2210.03390v3',
});

/** A direction only: proper-motion extrapolation in fixed J2000 axes, no parallax. */
export function sagittariusAAt(value) {
  const date = validatedDate(value), accuracy=accuracyAt(date);
  // An arbitrarily remote calendar is a visualization model, not permission to
  // propagate a measured linear proper motion toward numerical infinity.
  const years = accuracy.illustrative?0:differenceMillis(date,Date.UTC(2020,0,1,12))/(YEAR_SECONDS*1000);
  const ra = raHours * Math.PI / 12, dec = decDeg * Math.PI / 180;
  const east = [-Math.sin(ra), Math.cos(ra), 0];
  const north = [-Math.cos(ra) * Math.sin(dec), -Math.sin(ra) * Math.sin(dec), Math.cos(dec)];
  const masInRadians = Math.PI / (180 * 3600 * 1000);
  const vector = equatorial.map((v, i) => v + years * masInRadians * (SGR_A.eastMotionMasYear * east[i] + SGR_A.northMotionMasYear * north[i]));
  const norm = Math.hypot(...vector), direction = vector.map(v => v / norm);
  const rightAscension = ((Math.atan2(direction[1], direction[0]) * 12 / Math.PI) % 24 + 24) % 24;
  return { ...SGR_A, date: date.toISOString(), extrapolated: accuracy.extrapolated, illustrative:accuracy.illustrative, raHours: rightAscension,
    decDeg: Math.asin(direction[2]) * 180 / Math.PI,
    equatorial: direction, galactic: equatorialToGalactic(direction),
    limitation: accuracy.illustrative?'Fixed reference direction for the illustrative remote-date model; no long-term proper-motion prediction.':'Linear measured proper-motion extrapolation; no parallax or gravitational deflection; not a long-term orbital prediction.' };
}

/** The independent model clock is elapsed Julian years, never an ephemeris UTC. */
export function solarOrbitAt(years = 0) {
  if (typeof years !== 'number' || !Number.isFinite(years)) throw new RangeError('Galactic elapsed years must be finite.');
  const phaseRadians = (years % GALACTIC_MODEL.periodYears) / GALACTIC_MODEL.periodYears * TAU;
  const c = Math.cos(phaseRadians), s = Math.sin(phaseRadians);
  return { years, phaseRadians, position: [-RADIUS_PC * c, RADIUS_PC * s, 0],
    velocity: [SPEED_PC_YEAR * s, SPEED_PC_YEAR * c, 0] };
}

/** One complete orbit including its repeated endpoint. */
export function galacticOrbitPoints(samples = 361) {
  if (!Number.isInteger(samples) || samples < 9 || samples > 10001) throw new RangeError('Use 9…10001 Galactic orbit samples.');
  return Array.from({ length: samples }, (_, index) => solarOrbitAt(index / (samples - 1) * GALACTIC_MODEL.periodYears));
}

/** Embed current heliocentric J2000-ecliptic AU geometry in the model's pc frame.
 * This translation does not evolve planetary elements over Galactic timescales. */
export function embedSolarPosition(positionAU, years = 0) {
  if (!Array.isArray(positionAU) || positionAU.length !== 3 || !positionAU.every(Number.isFinite)) throw new RangeError('Supply three finite heliocentric AU coordinates.');
  const local = eclipticToGalactic(positionAU), sun = solarOrbitAt(years).position;
  return sun.map((value, index) => value + local[index] / PC_IN_AU);
}
