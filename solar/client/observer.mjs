// Machine-authored by Codex/OpenAI, 2026-09-07, claim 260907-202059-001/solar-system-0.3.
// Original implementation. GPS interchange follows RFC 5870 (geo URI) and RFC 7946 (GeoJSON).
// Surface navigation uses an explicitly spherical Earth, not a WGS84 ellipsoidal geodesic.
export const EARTH_MEAN_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;
const norm = n => ((n % 360) + 360) % 360;
const signed = n => norm(n + 180) - 180;
const clamp = n => Math.max(-1, Math.min(1, n));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;

export function validateObserver({ latitude, longitude, height } = {}) {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new RangeError('Latitude must be −90…90 and longitude −180…180 degrees.');
  if (height !== undefined && (typeof height !== 'number' || !Number.isFinite(height) || height < -500 || height > 10000)) throw new RangeError('Height must be −500…10000 meters above the WGS84 ellipsoid.');
  return { latitude, longitude, ...(height === undefined ? {} : { height }) };
}

function decimal(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value.trim())) throw new RangeError('Use decimal latitude and longitude.');
  return Number(value.trim());
}

function fromJSON(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Use a coordinate object or a GeoJSON Point.');
  if (value.type === 'Feature') {
    if (value.crs !== undefined) throw new RangeError('Only WGS84 GeoJSON Point coordinates are supported.');
    return fromJSON(value.geometry);
  }
  if (value.type === 'Point') {
    if (value.crs !== undefined || !Array.isArray(value.coordinates) || ![2, 3].includes(value.coordinates.length)) throw new RangeError('GeoJSON Point coordinates must be [longitude, latitude, optional height].');
    const [longitude, latitude, height] = value.coordinates;
    return validateObserver({ latitude, longitude, height });
  }
  if (value.type !== undefined || value.crs !== undefined) throw new RangeError('Only WGS84 GeoJSON Point coordinates are supported.');
  for (const [full, short] of [['latitude', 'lat'], ['longitude', 'lon'], ['height', 'altitude']]) if (Object.hasOwn(value, full) && Object.hasOwn(value, short) && value[full] !== value[short]) throw new RangeError(`Conflicting ${full} coordinates.`);
  return validateObserver({ latitude: Object.hasOwn(value, 'latitude') ? value.latitude : value.lat, longitude: Object.hasOwn(value, 'longitude') ? value.longitude : value.lon, height: Object.hasOwn(value, 'height') ? value.height : value.altitude });
}

/** Decimal pair/triple is latitude first; GeoJSON coordinates are longitude first. */
export function parseObserver(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 65536) throw new RangeError('Paste decimal coordinates, a geo URI, or a GeoJSON Point.');
  const value = text.trim();
  if (value.startsWith('{')) {
    let parsed; try { parsed = JSON.parse(value); } catch { throw new RangeError('The coordinate JSON is not valid.'); }
    return fromJSON(parsed);
  }
  if (/^geo:/i.test(value)) {
    const [coordinates, ...parameters] = value.slice(4).split(';');
    const seen = new Set();
    for (const parameter of parameters) {
      const [key, data, extra] = parameter.split('='); const name = key.toLowerCase();
      if (seen.has(name) || extra !== undefined || !data || (name !== 'crs' && name !== 'u')) throw new RangeError('Supported geo URI parameters are crs=wgs84 and nonnegative uncertainty u.');
      seen.add(name);
      if (name === 'crs' && data.toLowerCase() !== 'wgs84') throw new RangeError('Only WGS84 coordinates are supported.');
      if (name === 'u' && (!Number.isFinite(decimal(data)) || decimal(data) < 0)) throw new RangeError('Location uncertainty must be nonnegative.');
    }
    const fields = coordinates.split(',');
    if (![2, 3].includes(fields.length)) throw new RangeError('A geo URI needs latitude, longitude and optional height.');
    const [latitude, longitude, height] = fields.map(decimal);
    // URI uncertainty is validated but is not an observer height or an accuracy guarantee.
    return validateObserver({ latitude, longitude, height });
  }
  const fields = value.includes(',') ? value.split(',') : value.split(/\s+/);
  if (![2, 3].includes(fields.length)) throw new RangeError('Enter latitude, longitude and optional height, separated by commas.');
  const [latitude, longitude, height] = fields.map(decimal);
  return validateObserver({ latitude, longitude, height });
}

/** Numeric string conversion preserves the supplied JavaScript numbers; no six-digit rounding. */
export function formatObserver(observer) {
  const { latitude, longitude, height } = validateObserver(observer);
  return [latitude, longitude, ...(height === undefined ? [] : [height])].join(', ');
}

export function observerGeoJSON(observer) {
  const { latitude, longitude, height } = validateObserver(observer);
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude, ...(height === undefined ? [] : [height])] } };
}

function frame(latitude, longitude) {
  const p = latitude * RAD, l = longitude * RAD;
  return { normal: [Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l)], north: [-Math.sin(p) * Math.cos(l), Math.cos(p), -Math.sin(p) * Math.sin(l)], east: [-Math.sin(l), 0, Math.cos(l)] };
}

/** Exact great-circle destination and transported bearing on the declared mean-radius sphere. */
export function moveObserver(latitude, longitude, bearing, distanceM) {
  validateObserver({ latitude, longitude });
  if (!Number.isFinite(bearing) || !Number.isFinite(distanceM) || Math.abs(distanceM) > 1e9) throw new RangeError('Supply a finite bearing and a movement distance within ±1 billion meters.');
  if (distanceM === 0) return { latitude, longitude, bearing: norm(bearing) };
  const { normal, north, east } = frame(latitude, longitude);
  const angle = norm(bearing) * RAD, arc = distanceM / EARTH_MEAN_RADIUS_M;
  const tangent = north.map((n, i) => n * Math.cos(angle) + east[i] * Math.sin(angle));
  const position = normal.map((n, i) => n * Math.cos(arc) + tangent[i] * Math.sin(arc));
  const transported = tangent.map((n, i) => n * Math.cos(arc) - normal[i] * Math.sin(arc));
  const nextLatitude = Math.asin(clamp(position[1])) / RAD;
  const nextLongitude = signed(Math.atan2(position[2], position[0]) / RAD);
  const nextFrame = frame(nextLatitude, nextLongitude);
  return { latitude: nextLatitude, longitude: nextLongitude, bearing: norm(Math.atan2(dot(transported, nextFrame.east), dot(transported, nextFrame.north)) / RAD) };
}

/** Forward/right distances are camera-relative; heading is parallel-transported along the move. */
export function moveObserverFrame({ latitude, longitude, heading = 0, height }, forwardM, rightM) {
  validateObserver({ latitude, longitude, height });
  if (![heading, forwardM, rightM].every(Number.isFinite)) throw new RangeError('Heading and movement distances must be finite.');
  const distance = Math.hypot(forwardM, rightM);
  const travelBearing = norm(heading + Math.atan2(rightM, forwardM) / RAD);
  const moved = moveObserver(latitude, longitude, travelBearing, distance);
  return { latitude: moved.latitude, longitude: moved.longitude, heading: norm(heading + signed(moved.bearing - travelBearing)), ...(height === undefined ? {} : { height }) };
}
