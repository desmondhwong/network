// Machine-authored by Codex/OpenAI, 2026-09-05, claim 260905-115339-001/solar-system-0.2.
// Public primary sources: https://ssd-api.jpl.nasa.gov/doc/horizons.html
// https://ssd.jpl.nasa.gov/horizons/manual.html and https://ssd-api.jpl.nasa.gov/
// API 1.2 was observed live on 2026-09-05. No credentials or browser CORS proxy.

export const HORIZONS_ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const DAY_MS = 86400000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const TARGETS = Object.freeze([
  ['Sun', 10], ['Mercury', 199], ['Venus', 299], ['Earth', 399], ['Moon', 301],
  ['Mars', 499], ['Jupiter', 599], ['Saturn', 699], ['Uranus', 799], ['Neptune', 899], ['Pluto', 999],
].map(([id, command]) => Object.freeze({ id, command })));
const QUERY_COUNT = TARGETS.length * 3 - 3; // Sun has no vector; Earth has no observer tables.

export class HorizonsError extends Error {
  constructor(message, status = 502) { super(message); this.name = 'HorizonsError'; this.status = status; }
}

/** Height is meters above the WGS84 ellipsoid, not kilometers. Dates require an explicit zone. */
export function validateHorizonsInput({ date: value, latitude, longitude, height = 0 } = {}) {
  if (!(value instanceof Date) && typeof value !== 'string') throw new RangeError('Supply an ISO date or timestamp with a time zone.');
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/);
    if (!m) throw new RangeError('Use an ISO date; timestamps must include a time zone.');
    const [year, month, day] = m.slice(1, 4).map(Number);
    const zone = m[8] && m[8] !== 'Z' ? m[8].slice(1).split(':').map(Number) : [0, 0];
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
        || Number(m[4] || 0) > 23 || Number(m[5] || 0) > 59 || Number(m[6] || 0) > 59 || zone[0] > 23 || zone[1] > 59) {
      throw new RangeError('Invalid calendar date, time, or time zone.');
    }
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() < Date.parse('1800-01-01T00:00:00Z') || date.getTime() > Date.parse('2200-12-31T23:59:59.999Z')) {
    throw new RangeError('Date must be within 1800–2200. JPL target coverage can be narrower.');
  }
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('Latitude must be −90…90 and longitude −180…180 degrees.');
  }
  if (typeof height !== 'number' || !Number.isFinite(height) || height < -500 || height > 10000) throw new RangeError('Height must be −500…10000 meters above the WGS84 ellipsoid.');
  return { date: date.toISOString(), latitude, longitude, height, jdUT: date.getTime() / DAY_MS + 2440587.5 };
}

function csv(line) {
  const result = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (line[i] === ',' && !quoted) { result.push(value.trim()); value = ''; }
    else value += line[i];
  }
  if (quoted) throw new HorizonsError('JPL returned malformed CSV.');
  result.push(value.trim()); return result;
}

/** Parse by exact named columns, preserving empty solar/lunar marker columns. */
export function parseHorizonsResponse(payload, { kind, command, jdUT } = {}) {
  if (!payload || payload.signature?.source !== 'NASA/JPL Horizons API' || payload.signature?.version !== '1.2') {
    throw new HorizonsError('JPL returned an unrecognized API signature or version; the parser needs review.');
  }
  if (payload.error) throw new HorizonsError(`JPL could not calculate this target/date: ${String(payload.error).replace(/\s+/g, ' ').slice(0, 240)}`);
  if (typeof payload.result !== 'string' || encoder.encode(payload.result).byteLength > MAX_RESPONSE_BYTES) throw new HorizonsError('JPL returned an invalid or oversized ephemeris.');
  const text = payload.result;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === '$$SOE');
  const end = lines.findIndex(line => line.trim() === '$$EOE');
  if (start < 0 || end <= start || lines.filter(line => line.trim() === '$$SOE').length !== 1 || lines.filter(line => line.trim() === '$$EOE').length !== 1) {
    throw new HorizonsError('JPL returned no unambiguous ephemeris table; this target may not cover the requested date.');
  }
  const fields = { vectors: ['JDUT', 'X', 'Y', 'Z'], geocentric: ['Date_________JDUT', 'delta', 'TDB-UT', 'ObsEcLon', 'ObsEcLat'], topocentric: ['Date_________JDUT', 'Azimuth_(a-app)', 'Elevation_(a-app)', 'Ang-diam', 'delta'] }[kind];
  if (!fields) throw new TypeError('Unknown Horizons table kind.');
  const headerLine = lines.slice(0, start).reverse().find(line => line.includes(',') && csv(line).includes(fields[0]));
  if (!headerLine) throw new HorizonsError('JPL returned unexpected ephemeris columns or time scale.');
  const headers = csv(headerLine);
  const rows = lines.slice(start + 1, end).filter(line => line.trim());
  if (rows.length !== 1) throw new HorizonsError('JPL must return exactly the requested instant.');
  const values = csv(rows[0]);
  if (values.length !== headers.length || fields.some(field => headers.filter(header => header === field).length !== 1)) {
    throw new HorizonsError('JPL returned missing, duplicate, or misaligned ephemeris columns.');
  }
  const numbers = {};
  for (const field of fields) {
    const value = values[headers.indexOf(field)];
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new HorizonsError(`JPL returned an unavailable or invalid ${field} value.`);
    numbers[field] = Number(value);
  }
  if (Number.isFinite(jdUT) && Math.abs(numbers[fields[0]] - jdUT) > 1e-8) throw new HorizonsError('JPL returned a different instant than requested.');
  const target = text.match(/^Target body name:\s*(.*?)\s*\((\d+)\)\s*\{source:\s*([^}]+)\}/m);
  const center = text.match(/^Center body name:\s*(.*?)\s*\((\d+)\)\s*\{source:\s*([^}]+)\}/m);
  if (!target || !center || (command !== undefined && Number(target[2]) !== command) || Number(center[2]) !== (kind === 'vectors' ? 10 : 399)) {
    throw new HorizonsError('JPL returned an unexpected target or coordinate origin.');
  }
  if (kind === 'vectors' && (!/^Reference frame\s*:\s*Ecliptic of J2000\.0\s*$/m.test(text) || !/^Output units\s*:\s*AU-D\s*$/m.test(text) || !/^Output type\s*:\s*GEOMETRIC cartesian states\s*$/m.test(text))) {
    throw new HorizonsError('JPL vector frame, units, or correction mode changed.');
  }
  if (kind !== 'vectors' && !/^Atmos refraction:\s*NO \(AIRLESS\)\s*$/m.test(text)) throw new HorizonsError('JPL observer refraction mode changed.');
  if (kind === 'geocentric' && !/^Center-site name:\s*GEOCENTRIC\s*$/m.test(text)) throw new HorizonsError('JPL returned a surface site instead of the geocenter.');
  if (kind === 'topocentric' && !/^Center-site name:\s*\(user defined site below\)\s*$/m.test(text)) throw new HorizonsError('JPL returned an unexpected observing site.');
  const bounded = (field, min, max) => { if (numbers[field] < min || numbers[field] > max) throw new HorizonsError(`JPL returned an out-of-range ${field} value.`); };
  if (kind === 'vectors') for (const field of ['X', 'Y', 'Z']) bounded(field, -1000, 1000);
  if (kind !== 'vectors') bounded('delta', Number.MIN_VALUE, 1000);
  if (kind === 'geocentric') { bounded('ObsEcLon', 0, 360); bounded('ObsEcLat', -90, 90); }
  if (kind === 'topocentric') { bounded('Azimuth_(a-app)', 0, 360); bounded('Elevation_(a-app)', -90, 90); bounded('Ang-diam', Number.MIN_VALUE, 360 * 3600); }
  const header = label => lines.find(line => line.startsWith(label))?.slice(label.length).trim() || null;
  return { numbers, metadata: { target: target[1].trim(), targetId: Number(target[2]), ephemeris: target[3].trim(), centerId: Number(center[2]), centerEphemeris: center[3].trim(), apiVersion: payload.signature.version, eopFile: header('EOP file        :'), eopCoverage: header('EOP coverage    :') } };
}

function requestUrl(kind, command, input) {
  const parameters = { COMMAND: command, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: kind === 'vectors' ? 'VECTORS' : 'OBSERVER', CENTER: kind === 'vectors' ? '500@10' : kind === 'geocentric' ? '500@399' : 'coord@399', TLIST: input.jdUT, TLIST_TYPE: 'JD', TIME_TYPE: 'UT', TIME_DIGITS: 'FRACSEC', CSV_FORMAT: 'YES', REF_SYSTEM: 'ICRF', CAL_TYPE: 'GREGORIAN' };
  if (kind === 'vectors') Object.assign(parameters, { REF_PLANE: 'ECLIPTIC', VEC_TABLE: 1, VEC_CORR: 'NONE', OUT_UNITS: 'AU-D' });
  else Object.assign(parameters, { QUANTITIES: kind === 'geocentric' ? '20,30,31' : '4,13,20', CAL_FORMAT: 'BOTH', RANGE_UNITS: 'AU', APPARENT: 'AIRLESS', EXTRA_PREC: 'YES', ELEV_CUT: -90, SKIP_DAYLT: 'NO' });
  if (kind === 'topocentric') Object.assign(parameters, { COORD_TYPE: 'GEODETIC', SITE_COORD: `${input.longitude},${input.latitude},${input.height / 1000}` });
  const url = new URL(HORIZONS_ENDPOINT); url.searchParams.set('format', 'json');
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, `'${value}'`);
  return url;
}

async function boundedJson(response) {
  if (!response.ok) throw new HorizonsError(`JPL service returned HTTP ${response.status}. Try again later.`);
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new HorizonsError('JPL returned an oversized response.');
  if (!response.body) throw new HorizonsError('JPL returned an empty response.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new HorizonsError('JPL returned an oversized response.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(decoder.decode(bytes)); } catch { throw new HorizonsError('JPL returned invalid JSON.'); }
}

// Process-wide serialization, also across independently constructed clients.
// JPL fair-use policy: one API request at a time, no automatic failure retries.
let queue = Promise.resolve(); let queuedSnapshots = 0;
export function serialized(task) {
  if (queuedSnapshots >= 3) return Promise.reject(new HorizonsError('A JPL snapshot is already loading. Try again after it finishes.', 503));
  queuedSnapshots++;
  const result = queue.then(task);
  queue = result.catch(() => {}).finally(() => { queuedSnapshots--; });
  return result;
}

/** Dependency injection is for offline tests; no request accepts a remote URL. */
export function createHorizonsClient({ fetchImpl = globalThis.fetch, timeoutMs = 15000, maxSnapshotMs = 90000, cacheSize = 24, cacheTtlMs = 6 * 60 * 60 * 1000, now = Date.now } = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') throw new TypeError('A fetch and clock function are required.');
  if (![timeoutMs, maxSnapshotMs, cacheTtlMs].every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(cacheSize) || cacheSize < 1 || cacheSize > 100) throw new RangeError('Invalid Horizons client limits.');
  const snapshots = new Map(); const requests = new Map(); const inFlight = new Map();
  const getCached = (cache, key) => {
    const hit = cache.get(key); if (!hit) return null;
    if (now() - hit.at >= cacheTtlMs) { cache.delete(key); return null; }
    cache.delete(key); cache.set(key, hit); return hit.value;
  };
  const putCached = (cache, key, value, max) => {
    cache.delete(key); cache.set(key, { value, at: now() });
    while (cache.size > max) cache.delete(cache.keys().next().value);
  };
  async function query(kind, target, input, deadline) {
    const url = requestUrl(kind, target.command, input); const key = url.href;
    const hit = getCached(requests, key); if (hit) return hit;
    const remaining = deadline - now();
    if (remaining <= 0) throw new HorizonsError('JPL snapshot exceeded its time limit. Try again later.');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' } });
      const parsed = parseHorizonsResponse(await boundedJson(response), { kind, command: target.command, jdUT: input.jdUT });
      parsed.fetchedAt = new Date(now()).toISOString();
      putCached(requests, key, parsed, cacheSize * QUERY_COUNT); return parsed;
    } catch (error) {
      if (error instanceof HorizonsError) throw error;
      throw new HorizonsError(controller.signal.aborted ? 'JPL request timed out. Try again later.' : 'JPL could not be reached. Check the connection and try again later.');
    } finally { clearTimeout(timer); }
  }
  async function calculate(input) {
    const deadline = now() + maxSnapshotMs;
    const bodies = []; const sky = []; const provenance = []; const fetchTimes = [];
    for (const target of TARGETS) {
      const vector = target.id === 'Sun' ? null : await query('vectors', target, input, deadline);
      const geo = target.id === 'Earth' ? null : await query('geocentric', target, input, deadline);
      const topo = target.id === 'Earth' ? null : await query('topocentric', target, input, deadline);
      const longitude = geo ? geo.numbers.ObsEcLon % 360 : null;
      bodies.push({ id: target.id, name: target.id, position: vector ? ['X', 'Y', 'Z'].map(key => vector.numbers[key]) : [0, 0, 0], longitude, latitude: geo?.numbers.ObsEcLat ?? null, distanceAU: geo?.numbers.delta ?? 0, sign: geo ? SIGNS[Math.floor(longitude / 30)] : null, degree: geo ? longitude % 30 : null, retrograde: null });
      if (topo) sky.push({ id: target.id, altitude: topo.numbers['Elevation_(a-app)'], azimuth: topo.numbers['Azimuth_(a-app)'] % 360, angularRadius: topo.numbers['Ang-diam'] / 7200, distanceAU: topo.numbers.delta });
      provenance.push({ id: target.id, horizonsId: target.command, targetKind: 'body center', vectors: vector?.metadata ?? null, geocentric: geo?.metadata ?? null, topocentric: topo?.metadata ?? null });
      for (const item of [vector, geo, topo].filter(Boolean)) fetchTimes.push(item.fetchedAt);
    }
    return {
      date: input.date, fetchedAt: new Date(now()).toISOString(), source: 'JPL Horizons',
      observer: { latitude: input.latitude, longitude: input.longitude, height: input.height },
      ephemeris: { provider: 'NASA/JPL Solar System Dynamics', apiVersion: '1.2', endpoint: HORIZONS_ENDPOINT, documentation: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html', manual: 'https://ssd.jpl.nasa.gov/horizons/manual.html', queryCount: QUERY_COUNT, oldestDataFetchedAt: fetchTimes.sort()[0], targets: provenance },
      frames: { position: 'Heliocentric geometric ICRF ecliptic J2000.0; AU; VEC_CORR=NONE', longitudeLatitude: 'Geocentric apparent IAU76/80 ecliptic of date; degrees; light-time, gravitational deflection and stellar aberration', sky: 'Topocentric airless apparent azimuth/elevation; degrees; north=0, east=90; WGS84 geodetic observer', angularRadius: 'Half of Horizons equatorial angular diameter; degrees', time: 'TIME_TYPE=UT for all tables; Horizons converts internally to dynamical time', height: 'Meters above WGS84 ellipsoid; converted to kilometers for SITE_COORD' },
      limitations: [
        'Before 1962 Horizons UT is UT1; the ISO Z label is a civil date interface, not a historical UTC measurement.',
        'Future leap seconds and Earth orientation are predictions; distant future sky positions are limited by those assumptions.',
        'Body-center ephemeris coverage can be narrower than the 1800–2200 input range; unavailable targets fail the entire snapshot.',
        'Airless positions exclude atmospheric refraction, terrain and local weather. Angular radii use equatorial full-disk diameters.',
        'A single instant does not establish retrograde motion or eclipse contacts; retrograde is null.',
      ], bodies, sky,
    };
  }
  return async function getSnapshot(raw) {
    const input = validateHorizonsInput(raw);
    const key = JSON.stringify(input);
    const cached = getCached(snapshots, key); if (cached) return structuredClone(cached);
    if (inFlight.has(key)) return structuredClone(await inFlight.get(key));
    const pending = serialized(async () => {
      const result = await calculate(input); putCached(snapshots, key, result, cacheSize); return result;
    });
    inFlight.set(key, pending);
    try { return structuredClone(await pending); } finally { inFlight.delete(key); }
  };
}

export const getHorizonsSnapshot = createHorizonsClient();
