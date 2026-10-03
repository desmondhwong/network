// Machine-authored: Codex / OpenAI. Pure input and geometry boundaries.
export { MIN_TIME, MAX_TIME, clampTime, parseUTC } from './time.mjs';
export function parseCoordinates(lat, lon) {
  if (String(lat).trim() === '' || String(lon).trim() === '') throw new RangeError('Enter both latitude and longitude.');
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new RangeError('Latitude must be −90…90; longitude −180…180.');
  return { latitude: lat, longitude: lon };
}
export function angularSeparation(a, b) {
  const r = Math.PI / 180, altA = a.altitude * r, altB = b.altitude * r;
  const cosine = Math.sin(altA) * Math.sin(altB) + Math.cos(altA) * Math.cos(altB) * Math.cos((a.azimuth - b.azimuth) * r);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / r;
}
export function diskOverlap(sunRadius, moonRadius, separation) {
  const R = sunRadius, r = moonRadius, d = separation;
  if (![R, r, d].every(Number.isFinite) || R <= 0 || r <= 0 || d < 0) return 0;
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.min(1, r * r / (R * R));
  const area = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R)) + r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r)) - .5 * Math.sqrt((-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r));
  return area / (Math.PI * R * R);
}
