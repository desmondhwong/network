/* Machine-authored by Codex / OpenAI, 2026-09-07, claim 260907-230105-001/solar-system-0.4.
 * A declared phase-compressed visualization: bounded-date orbital templates repeat
 * around the analytic solar Galactic orbit. These are not planetary predictions
 * spanning one Galactic year. Retained only for compatibility with historic
 * consumers/tests: the unified scene uses getElapsedTrails from trails.mjs. */
import { eclipticToGalactic, TRAIL_PLANETS } from './trails.mjs';
import { GALACTIC_MODEL } from './galactic.mjs';

const TAU = Math.PI * 2;
const periods = { Mercury: 87.969, Venus: 224.701, Earth: 365.256, Mars: 686.98, Jupiter: 4332.59, Saturn: 10759.22, Uranus: 30688.5, Neptune: 60182 };
const mod = (value, divisor) => (value % divisor + divisor) % divisor;

export function repeatedOrbitPoint(points, phase) {
  if (!Array.isArray(points) || points.length < 2) throw new RangeError('An orbital template needs at least two points.');
  const offset = mod(phase, 1) * (points.length - 1), index = Math.floor(offset), weight = offset - index;
  return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * weight);
}

/** Build local orbital offsets and Galactic phase coordinates, with no ephemeris calls. */
export function buildGalacticCoils(templates, earthTurns = 12) {
  if (!Number.isFinite(earthTurns) || earthTurns < 1 || earthTurns > 64) throw new RangeError('Use 1…64 illustrative Earth turns per Galactic cycle.');
  return TRAIL_PLANETS.map(id => {
    const template = templates.find(track => track.id === id);
    if (!template) return null;
    const turns = earthTurns * periods.Earth / periods[id];
    const samples = Math.min(8192, Math.max(720, Math.ceil(turns * 48)));
    const points = Array.from({ length: samples + 1 }, (_, index) => {
      const age = 1 - index / samples;
      return { angle: -age * TAU, localAU: eclipticToGalactic(repeatedOrbitPoint(template.points, -age * turns)) };
    });
    return { id, turns, points };
  }).filter(Boolean);
}

/** Sun-relative AU coordinates. A fixed current solar position keeps local subtraction precise. */
export function galacticCoilPosition(point, phase, distanceFactor = 1) {
  const radiusAU = GALACTIC_MODEL.radiusPc * GALACTIC_MODEL.pcInAU;
  const angle = phase + point.angle;
  return [radiusAU * (Math.cos(phase) - Math.cos(angle)) + point.localAU[0] * distanceFactor,
    radiusAU * (Math.sin(angle) - Math.sin(phase)) + point.localAU[1] * distanceFactor,
    point.localAU[2] * distanceFactor];
}
