// Machine-authored by Codex/OpenAI, claim 260921-150509-001.
// Distance navigation and monotone display scaling; no page/sheet transition.
export const DEFAULT_FOV = 60;
export const MAX_FOV = 90;
export const EARTH_RADIUS_M = 6371008.8;
export const GROUND_HEIGHT_M = 30;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** d log(zoom*factor)/d log(zoom) is >= 1/8, including either clamp. */
export function solarDistanceGain(zoom, maximum = 1e7, enabled = true) {
  if (!enabled) return 1;
  return Math.min(clamp(maximum, 1, 1e8), Math.max(1, 1 / Math.max(zoom, 1e-10)) ** .875);
}
export function globeElevation(altitudeM, groundElevation = -10) {
  const t = clamp(Math.log(Math.max(GROUND_HEIGHT_M, altitudeM) / GROUND_HEIGHT_M) / Math.log(100000 / GROUND_HEIGHT_M), 0, 1);
  const eased = t * t * (3 - 2 * t);
  return groundElevation + (-90 - groundElevation) * eased;
}
export function altitudeForLimb(radiusPixels, focal) {
  return EARTH_RADIUS_M * (Math.hypot(1, focal / radiusPixels) - 1);
}
export function limbRadius(altitudeM, focal) {
  return focal * EARTH_RADIUS_M / Math.sqrt(altitudeM * (2 * EARTH_RADIUS_M + altitudeM));
}
export function stepAltitude(altitudeM, factor) {
  if (!Number.isFinite(altitudeM) || altitudeM < GROUND_HEIGHT_M || !Number.isFinite(factor) || factor <= 0) throw new RangeError('Invalid camera altitude or zoom factor.');
  const next = altitudeM * factor;
  return next <= GROUND_HEIGHT_M * (1 + 1e-12) ? GROUND_HEIGHT_M : clamp(next, GROUND_HEIGHT_M, 1e12);
}
/** Liang–Barsky clipping keeps all-scale trajectories finite in the rasterizer. */
export function clipScreenSegment(a, b, width, height, margin = 2) {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  let low = 0, high = 1;
  for (const [p, q] of [[-dx, a.x + margin], [dx, width + margin - a.x], [-dy, a.y + margin], [dy, height + margin - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
    if (low > high) return null;
  }
  return [{ x: a.x + low * dx, y: a.y + low * dy }, { x: a.x + high * dx, y: a.y + high * dy }];
}
