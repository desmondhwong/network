// Machine-authored by Codex/OpenAI, claim 260921-150509-001.
// Earth-local perspective geometry on a physical mean-radius sphere.
import { EARTH_RADIUS_M, globeElevation } from './zoom.mjs';
const RAD = Math.PI / 180;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const signed = value => ((value + 180) % 360 + 360) % 360 - 180;
const direction = (azimuth, elevation) => [Math.sin(azimuth * RAD) * Math.cos(elevation * RAD), Math.cos(azimuth * RAD) * Math.cos(elevation * RAD), Math.sin(elevation * RAD)];
const unit = (latitude, longitude) => [Math.cos(latitude * RAD) * Math.cos(longitude * RAD), Math.cos(latitude * RAD) * Math.sin(longitude * RAD), Math.sin(latitude * RAD)];
function frame(globe) {
  const p = globe.latitude * RAD, l = globe.longitude * RAD;
  return { east: [-Math.sin(l), Math.cos(l), 0], north: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)], up: unit(globe.latitude, globe.longitude) };
}
export function globeBasis(globe, { azimuth, elevation, fov, width, height, pan }) {
  const aim = globeElevation(globe.altitudeM, elevation), heading = azimuth * RAD;
  return { forward: direction(azimuth, aim), right: direction(azimuth + 90, 0), up: [-Math.sin(heading) * Math.sin(aim * RAD), -Math.cos(heading) * Math.sin(aim * RAD), Math.cos(aim * RAD)],
    focal: height / (2 * Math.tan(fov * RAD / 2)), x: width / 2 + pan.x, y: height / 2 + pan.y, elevation: aim };
}
export function projectGlobeLocation(location, globe, camera) {
  const basis = globeBasis(globe, camera), axes = frame(globe), normal = unit(location.latitude, location.longitude);
  const point = [dot(normal, axes.east) * EARTH_RADIUS_M, dot(normal, axes.north) * EARTH_RADIUS_M, (dot(normal, axes.up) - 1) * EARTH_RADIUS_M - globe.altitudeM];
  const depth = dot(point, basis.forward);
  if (depth <= .01) return null;
  return { x: basis.x + basis.focal * dot(point, basis.right) / depth, y: basis.y - basis.focal * dot(point, basis.up) / depth, depth };
}
export function globeLocationAt(cursor, globe, camera) {
  const basis = globeBasis(globe, camera), x = (cursor.x - basis.x) / basis.focal, y = (basis.y - cursor.y) / basis.focal;
  const raw = basis.forward.map((value, index) => value + x * basis.right[index] + y * basis.up[index]), norm = Math.hypot(...raw), ray = raw.map(value => value / norm);
  const distance = EARTH_RADIUS_M + globe.altitudeM, b = distance * ray[2], c = globe.altitudeM * (2 * EARTH_RADIUS_M + globe.altitudeM), discriminant = b * b - c;
  if (discriminant < 0 || b >= 0) return null;
  const t = c / (-b + Math.sqrt(discriminant));
  const local = [ray[0] * t / EARTH_RADIUS_M, ray[1] * t / EARTH_RADIUS_M, (globe.altitudeM + ray[2] * t + EARTH_RADIUS_M) / EARTH_RADIUS_M], axes = frame(globe);
  const normal = [0, 1, 2].map(index => axes.east[index] * local[0] + axes.north[index] * local[1] + axes.up[index] * local[2]);
  return { latitude: Math.atan2(normal[2], Math.hypot(normal[0], normal[1])) / RAD, longitude: signed(Math.atan2(normal[1], normal[0]) / RAD) };
}
/** Solve the picked ray analytically in a local east/north/up frame.
 * Unlike latitude/longitude Newton steps, this stays defined at either pole.
 * At a limb where fixed heading admits no footprint, optical-center pan retains
 * the picked point exactly; the footprint itself remains a valid sphere point.
 */
export function anchorGlobe(location, cursor, globe, camera) {
  const candidates = [{ ...globe }];
  const localPick = globeLocationAt(cursor, { latitude: 0, longitude: 0, altitudeM: globe.altitudeM }, camera);
  if (localPick) {
    const normal = unit(localPick.latitude, localPick.longitude);
    const [east, north, up] = [normal[1], normal[2], normal[0]], target = unit(location.latitude, location.longitude);
    const amplitude = Math.hypot(north, up), sine = target[2] / amplitude;
    if (Math.abs(sine) <= 1 + 1e-12) {
      const angle = Math.asin(clamp(sine, -1, 1)), offset = Math.atan2(north, up);
      for (const base of [angle - offset, Math.PI - angle - offset]) for (const turn of [-1, 0, 1]) {
        const latitude = base + turn * 2 * Math.PI;
        if (Math.abs(latitude) > Math.PI / 2 + 1e-12) continue;
        const longitude = Math.atan2(target[1], target[0]) - Math.atan2(east, up * Math.cos(latitude) - north * Math.sin(latitude));
        candidates.push({ ...globe, latitude: clamp(latitude / RAD, -90, 90), longitude: signed(longitude / RAD) });
      }
    }
  }
  const oldNormal = unit(globe.latitude, globe.longitude), target = unit(location.latitude, location.longitude);
  const exact = candidates.slice(1).filter(candidate => {
    const point = projectGlobeLocation(location, candidate, camera);
    return point && Math.hypot(point.x - cursor.x, point.y - cursor.y) < 1e-4;
  }).sort((a, b) => dot(oldNormal, unit(b.latitude, b.longitude)) - dot(oldNormal, unit(a.latitude, a.longitude)));
  if (exact.length) return { globe: exact[0], pan: { ...camera.pan } };
  candidates.push({ ...globe, latitude: location.latitude, longitude: location.longitude });
  for (const candidate of candidates) {
    if (dot(target, unit(candidate.latitude, candidate.longitude)) < EARTH_RADIUS_M / (EARTH_RADIUS_M + globe.altitudeM) - 1e-12) continue;
    const point = projectGlobeLocation(location, candidate, camera);
    if (point) return { globe: candidate, pan: { x: camera.pan.x + cursor.x - point.x, y: camera.pan.y + cursor.y - point.y } };
  }
  return { globe: { ...globe }, pan: { ...camera.pan } };
}
