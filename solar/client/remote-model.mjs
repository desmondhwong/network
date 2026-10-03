// Machine-authored by Codex / OpenAI, claim 260921-150509-001.
// An illustration, not a long-term ephemeris: circular paths in frozen J2000
// planes. Seeds and nominal periods come from the bundled Astronomy Engine
// 2.1.19 at J2000 only. Moon period is a fixed 27.321661-day illustration.
import * as Astronomy from './vendor/astronomy-engine-2.1.19.mjs';
import { periodicPhase } from './time.mjs';
import { moonMetadata, satellitePositionAt } from './moons.mjs';
const TAU = 2 * Math.PI, DAY = 86400000;
const ids = ['Mercury','Venus','Earth','Moon','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
const rotation = Astronomy.Rotation_EQJ_ECL();
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = v => { const length = Math.hypot(...v); return v.map(x => x / length); };
const seedTime = Astronomy.MakeTime(new Date('2000-01-01T12:00:00.000Z'));
function seedPosition(id, days = 0) {
  const time = seedTime.AddDays(days);
  const vector = id === 'Moon' ? Astronomy.GeoMoon(time) : Astronomy.HelioVector(id, time);
  const p = Astronomy.RotateVector(rotation, vector);
  return [p.x, p.y, p.z];
}
const circles = new Map(ids.map(id => {
  const p = seedPosition(id), before = seedPosition(id, -.01), after = seedPosition(id, .01);
  const u = unit(p), normal = unit(cross(p, after.map((x, i) => x - before[i]))), v = unit(cross(normal, u));
  return [id, { u, v, radius: Math.hypot(...p), period: (id === 'Moon' ? 27.321661 : Astronomy.PlanetOrbitalPeriod(id)) * DAY }];
}));
function circleAt(id, date) {
  const circle = circles.get(id);
  if (!circle) throw new RangeError('Unsupported illustrative body: ' + id);
  const angle = periodicPhase(date, circle.period) * TAU, c = Math.cos(angle), s = Math.sin(angle);
  return circle.u.map((x, i) => circle.radius * (x * c + circle.v[i] * s));
}
export function illustrativeHelioAt(id, date) {
  if (id === 'Sun') return [0, 0, 0];
  const moon = id === 'Moon' ? null : moonMetadata(id);
  if (moon) { const parent=illustrativeHelioAt(moon.parentId,date); return satellitePositionAt(id,date).map((x,i)=>x+parent[i]); }
  const position = circleAt(id, date);
  if (id !== 'Moon') return position;
  const earth = circleAt('Earth', date);
  return position.map((x, i) => x + earth[i]);
}
export function illustrativeGeoAt(id, date) {
  if (id === 'Earth') return [0, 0, 0];
  if (id === 'Moon') return circleAt(id, date);
  const position = illustrativeHelioAt(id, date), earth = circleAt('Earth', date);
  return position.map((x, i) => x - earth[i]);
}
export const ILLUSTRATIVE_FRAME = 'Illustrative circular paths in frozen J2000 ecliptic planes; not a predicted ephemeris';
