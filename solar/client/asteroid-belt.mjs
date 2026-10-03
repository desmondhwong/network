/* Machine-authored by Codex/OpenAI for 0.17. Schematic main-belt particles;
 * see data-sources/asteroid-belt/provenance.md. These are not named asteroids. */
import { epochMilliseconds, positiveModulo } from './time.mjs';

export const ASTEROID_BELT_METADATA = Object.freeze({
  count: 1536, innerAU: 2.2, outerAU: 3.2, schematic: true,
  description: 'Schematic main belt · synthetic particles, not asteroid ephemerides',
});
const TAU = 2 * Math.PI, EPOCH = 946728000000n;
let seed = 170930;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const particles = Array.from({ length: ASTEROID_BELT_METADATA.count }, () => {
  const radius = 2.2 + random(), inclination = random() * 0.15, node = random() * TAU;
  return { radius, cosI: Math.cos(inclination), sinI: Math.sin(inclination),
    cosN: Math.cos(node), sinN: Math.sin(node), phase: random() * TAU,
    period: BigInt(Math.round(365.256 * 86400000 * radius ** 1.5)), brightness: 0.25 + random() * 0.65 };
});
let previousTime = null, previousPoints = null;

/** Heliocentric J2000 ecliptic AU. Circular, inclined demonstration orbits;
 * period follows a^1.5. Exact integer phase reduction keeps remote dates finite. */
export function asteroidBeltAt(date) {
  const time = epochMilliseconds(date);
  if (time === previousTime) return previousPoints;
  const points = Object.freeze(particles.map(p => {
    const phase = p.phase + TAU * Number(positiveModulo(time - EPOCH, p.period)) / Number(p.period);
    const x = p.radius * Math.cos(phase), y = p.radius * Math.sin(phase);
    return Object.freeze({ position: Object.freeze([
      p.cosN * x - p.sinN * p.cosI * y,
      p.sinN * x + p.cosN * p.cosI * y,
      p.sinI * y,
    ]), brightness: p.brightness });
  }));
  previousTime = time; previousPoints = points;
  return points;
}
