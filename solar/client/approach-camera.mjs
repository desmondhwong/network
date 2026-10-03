// Machine-authored by Codex/OpenAI, claim 260921-150509-001.
// Continuous chart-to-orbit camera: rotating orthonormal frame plus perspective,
// derived from the existing camera fields, never an opacity/page transition.
import { Rotation_GAL_EQJ, Rotation_EQJ_HOR, Observer } from './vendor/astronomy-engine-2.1.19.mjs';
import { modelDate } from './time.mjs';
import { EARTH_RADIUS_M } from './zoom.mjs';
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const rotate = (m, v) => [0, 1, 2].map(j => m[0][j] * v[0] + m[1][j] * v[1] + m[2][j] * v[2]);
const galEq = Rotation_GAL_EQJ().rot;
export function galacticToENU(date, latitude, longitude) {
  const eqHor = Rotation_EQJ_HOR(modelDate(date), new Observer(latitude, longitude, 0)).rot;
  const columns = [0, 1, 2].map(axis => {
    const v = [0, 0, 0]; v[axis] = 1;
    const h = rotate(eqHor, rotate(galEq, v)); return [-h[1], h[0], h[2]];
  });
  return vector => rotate(columns, vector);
}
function quaternion({ right, up, forward }) {
  const m = [0, 1, 2].map(i => [right[i], up[i], -forward[i]]);
  const trace = m[0][0] + m[1][1] + m[2][2]; let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
  } else {
    const i = m[0][0] > m[1][1] && m[0][0] > m[2][2] ? 0 : m[1][1] > m[2][2] ? 1 : 2;
    const j = (i + 1) % 3, k = (i + 2) % 3, s = Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]) * 2;
    q = [0, 0, 0, (m[k][j] - m[j][k]) / s]; q[i] = s / 4; q[j] = (m[j][i] + m[i][j]) / s; q[k] = (m[k][i] + m[i][k]) / s;
  }
  return q;
}
export function interpolateBasis(first, last, t) {
  const a = quaternion(first), b = quaternion(last); let cosine = dot(a, b);
  if (cosine < 0) { for (let i = 0; i < 4; i++) b[i] = -b[i]; cosine = -cosine; }
  const theta = Math.acos(Math.min(1, cosine));
  const wa = theta < 1e-6 ? 1 - t : Math.sin((1 - t) * theta) / Math.sin(theta), wb = theta < 1e-6 ? t : Math.sin(t * theta) / Math.sin(theta);
  const q = a.map((value, i) => value * wa + b[i] * wb), norm = Math.hypot(...q), [x, y, z, w] = q.map(value => value / norm);
  return { right: [1 - 2 * (y*y + z*z), 2 * (x*y + z*w), 2 * (x*z - y*w)],
    up: [2 * (x*y - z*w), 1 - 2 * (x*x + z*z), 2 * (y*z + x*w)],
    forward: [-2 * (x*z + y*w), -2 * (y*z - x*w), -(1 - 2 * (x*x + y*y))] };
}
export function approachCamera({ zoom, entryZoom, focal, unit, yaw, pitch, azimuth, toENU, auM, displayScale = 1 }) {
  const fraction = Math.max(0, Math.min(1, Math.log(zoom / (entryZoom / 128)) / Math.log(128)));
  if (fraction <= 0) return null;
  const t = fraction * fraction * (3 - 2 * fraction);
  const first = { right: toENU([Math.cos(yaw), -Math.sin(yaw), 0]), up: toENU([Math.sin(yaw)*Math.sin(pitch), Math.cos(yaw)*Math.sin(pitch), Math.cos(pitch)]), forward: toENU([Math.sin(yaw)*Math.cos(pitch), Math.cos(yaw)*Math.cos(pitch), -Math.sin(pitch)]) };
  const a = azimuth * Math.PI / 180, last = { right: [Math.cos(a), -Math.sin(a), 0], up: [Math.sin(a), Math.cos(a), 0], forward: [0, 0, -1] };
  const basis = interpolateBasis(first, last, t), distanceAU = Math.hypot(focal / (unit * displayScale), EARTH_RADIUS_M / auM);
  return { ...basis, t, distanceAU, focal, scale: unit * (1-t) + focal / distanceAU * t, toENU };
}
export function projectApproach(vector, camera, center) {
  const forward = dot(vector, camera.forward), denominator = 1 + camera.t * forward / camera.distanceAU;
  const scale = camera.scale / Math.max(1e-9, denominator);
  return { x: center.x + dot(vector, camera.right) * scale, y: center.y - dot(vector, camera.up) * scale,
    z: forward, depth: denominator, factor: scale / camera.scale };
}
