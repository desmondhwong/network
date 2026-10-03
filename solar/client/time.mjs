/* Machine-authored by Codex / OpenAI, claim 260921-150509-001.
 * Exact proleptic Gregorian calendar with astronomical year zero. Calendar
 * arithmetic has no application year boundary; it is not a physical prediction.
 * Native Date is retained wherever representable, preserving modern fixtures. */
export const MIN_YEAR = -10000, MAX_YEAR = 10000; // Engine envelope, not calendar bounds.
export const MODERN_MIN_YEAR = 1800, MODERN_MAX_YEAR = 2200;
export const DAY_MILLISECONDS = 86400000n;
const NATIVE_LIMIT = 8640000000000000n;
const pad = (value, digits = 2) => String(value).padStart(digits, '0');
export const floorDivide = (a, b) => { const q = a / b, r = a % b; return r < 0n ? q - 1n : q; };
export const positiveModulo = (a, b) => ((a % b) + b) % b;
const exactInteger = value => {
  if (typeof value === 'bigint') return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new RangeError('Calendar parts require an exact integer.');
  return BigInt(value);
};

// March-based Gregorian eras; divisions crossing BCE use floor, not truncation.
function civilDays(year, month, day) {
  const y = year - (month <= 2n ? 1n : 0n), era = floorDivide(y, 400n), yoe = y - era * 400n;
  const mp = month + (month > 2n ? -3n : 9n), doy = (153n * mp + 2n) / 5n + day - 1n;
  return era * 146097n + yoe * 365n + yoe / 4n - yoe / 100n + doy - 719468n;
}
function civilParts(days) {
  const z = days + 719468n, era = floorDivide(z, 146097n), doe = z - era * 146097n;
  const yoe = (doe - doe / 1460n + doe / 36524n - doe / 146096n) / 365n;
  let year = yoe + era * 400n;
  const doy = doe - (365n * yoe + yoe / 4n - yoe / 100n), mp = (5n * doy + 2n) / 153n;
  const day = doy - (153n * mp + 2n) / 5n + 1n, month = mp + (mp < 10n ? 3n : -9n);
  year += month <= 2n ? 1n : 0n;
  return { year, month: Number(month), day: Number(day) };
}
function partsAt(epoch) {
  const days = floorDivide(epoch, DAY_MILLISECONDS), clock = Number(positiveModulo(epoch, DAY_MILLISECONDS));
  return { ...civilParts(days), hour: Math.floor(clock / 3600000), minute: Math.floor(clock / 60000) % 60,
    second: Math.floor(clock / 1000) % 60, millisecond: clock % 1000, weekday: Number(positiveModulo(days + 4n, 7n)) };
}
function yearText(year) { return year < 0n ? '-' + pad(-year, 6) : year > 9999n ? '+' + pad(year, 6) : pad(year, 4); }
const dayText = p => yearText(p.year) + '-' + pad(p.month) + '-' + pad(p.day);
const clockText = p => pad(p.hour) + ':' + pad(p.minute) + ':' + pad(p.second) + '.' + pad(p.millisecond, 3);

/** Immutable Date-like value beyond native Date. Use yearOf for an exact year and
 * addTime/differenceMillis/timeKey for arithmetic and identity. Numeric conversion
 * is approximate and can be infinite for arbitrarily long years. */
export class CalendarDate {
  #epoch;
  constructor(epochMilliseconds) { this.#epoch = exactInteger(epochMilliseconds); Object.freeze(this); }
  get epochMilliseconds() { return this.#epoch; }
  getTime() { return Number(this.#epoch); }
  valueOf() { return this.getTime(); }
  getUTCFullYear() { return Number(partsAt(this.#epoch).year); }
  getUTCMonth() { return partsAt(this.#epoch).month - 1; }
  getUTCDate() { return partsAt(this.#epoch).day; }
  getUTCDay() { return partsAt(this.#epoch).weekday; }
  getUTCHours() { return partsAt(this.#epoch).hour; }
  getUTCMinutes() { return partsAt(this.#epoch).minute; }
  getUTCSeconds() { return partsAt(this.#epoch).second; }
  getUTCMilliseconds() { return partsAt(this.#epoch).millisecond; }
  toISOString() { const p = partsAt(this.#epoch); return dayText(p) + 'T' + clockText(p) + 'Z'; }
  toJSON() { return this.toISOString(); }
  toString() { return this.toISOString(); }
}
function fromEpoch(epoch) { return epoch >= -NATIVE_LIMIT && epoch <= NATIVE_LIMIT ? new Date(Number(epoch)) : new CalendarDate(epoch); }
export function epochMilliseconds(value) {
  if (value instanceof CalendarDate) return value.epochMilliseconds;
  if (typeof value === 'bigint') return value;
  if (value instanceof Date || typeof value === 'number') {
    const time = Number(value);
    if (!Number.isFinite(time)) throw new RangeError('Invalid date or milliseconds.');
    return BigInt(Math.trunc(time));
  }
  return epochMilliseconds(validatedDate(value));
}
/** Month/day/clock overflow is intentional for calendar ticks and stepping. */
export function dateFromParts(year, month = 0, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0) {
  let y = exactInteger(year), m = exactInteger(month);
  y += floorDivide(m, 12n); m = positiveModulo(m, 12n);
  return fromEpoch((civilDays(y, m + 1n, 1n) + exactInteger(day) - 1n) * DAY_MILLISECONDS
    + exactInteger(hour) * 3600000n + exactInteger(minute) * 60000n + exactInteger(second) * 1000n + exactInteger(millisecond));
}
/** Compatibility numeric API for bounded ephemeris constants, not distant arithmetic. */
export function utcMillis(...parts) { return Number(epochMilliseconds(dateFromParts(...parts))); }
export const MIN_TIME = utcMillis(MIN_YEAR), MAX_TIME = utcMillis(MAX_YEAR + 1) - 1;
export const MIN_DATE = new Date(MIN_TIME).toISOString(), MAX_DATE = new Date(MAX_TIME).toISOString();
export const JPL_MIN_TIME = utcMillis(MODERN_MIN_YEAR), JPL_MAX_TIME = utcMillis(MODERN_MAX_YEAR + 1) - 1;
export const DATE_RANGE_LABEL = 'Any signed year · remote dates use an illustrative model';
/** Legacy name: calendar navigation no longer clamps at the engine envelope. */
export function clampTime(value) {
  if (typeof value !== 'number') return validatedDate(value);
  if (!Number.isFinite(value)) throw new RangeError('Invalid time.');
  return value;
}
function fromParts(day, time, flexibleDate = false) {
  const d = typeof day === 'string' && day.match(flexibleDate ? /^([+-]?\d+)-(\d{1,2})-(\d{1,2})$/ : /^([+-]?\d+)-(\d{2})-(\d{2})$/);
  if (!d || /^-0+$/.test(d[1])) throw new RangeError('Use astronomical year-month-day; year 0 means 1 BCE.');
  const t = typeof time === 'string' && time.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!t) throw new RangeError('Enter a complete time, HH:MM[:SS.sss].');
  const year = BigInt(d[1]), month = Number(d[2]), date = Number(d[3]);
  const hour = Number(t[1]), minute = Number(t[2]), second = Number(t[3] ?? 0), millisecond = Number((t[4] ?? '').padEnd(3, '0'));
  if (hour > 23 || minute > 59 || second > 59) throw new RangeError('That clock time is not valid.');
  const result = dateFromParts(year, month - 1, date, hour, minute, second, millisecond), p = partsAt(epochMilliseconds(result));
  if (p.year !== year || p.month !== month || p.day !== date) throw new RangeError('That Gregorian calendar date is not valid.');
  return result;
}
/** Strict date or explicit-zone timestamp, Date-like value, or Unix milliseconds. */
export function validatedDate(value) {
  if (value instanceof CalendarDate || value instanceof Date || typeof value === 'number' || typeof value === 'bigint') return fromEpoch(epochMilliseconds(value));
  if (typeof value !== 'string') throw new TypeError('Supply a Date, milliseconds, or astronomical ISO date.');
  if (!value.includes('T')) return fromParts(value, '00:00:00');
  const match = value.match(/^([+-]?\d+-\d{2}-\d{2})T(.+?)(Z|[+-]\d{2}:\d{2})$/);
  if (!match) throw new RangeError('Timestamps require an explicit Z or ±HH:MM time zone.');
  let date = fromParts(match[1], match[2]);
  if (match[3] !== 'Z') {
    const hours = Number(match[3].slice(1, 3)), minutes = Number(match[3].slice(4, 6));
    if (hours > 23 || minutes > 59) throw new RangeError('Invalid time-zone offset.');
    date = addTime(date, -(match[3][0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60000);
  }
  return date;
}
/** Manual date entry accepts one- or two-digit months/days; formatting pads them.
 * Serialized ISO timestamps retain the stricter validatedDate contract. */
export const parseUTC = (day, time) => fromParts(day, time, true);
export const yearOf = value => partsAt(epochMilliseconds(value)).year;
export const timeKey = value => validatedDate(value).toISOString();
export const differenceMillis = (a, b) => Number(epochMilliseconds(a) - epochMilliseconds(b));
export function addTime(value, deltaMilliseconds) {
  if (typeof deltaMilliseconds !== 'bigint' && (typeof deltaMilliseconds !== 'number' || !Number.isFinite(deltaMilliseconds))) throw new RangeError('Time step must be finite milliseconds or a BigInt.');
  const delta = typeof deltaMilliseconds === 'bigint' ? deltaMilliseconds : BigInt(Math.trunc(deltaMilliseconds));
  return fromEpoch(epochMilliseconds(value) + delta);
}
export const formatDateInput = value => dayText(partsAt(epochMilliseconds(value)));
export const formatTimeInput = value => clockText(partsAt(epochMilliseconds(value)));
export function formatDateLabel(value) {
  const p = partsAt(epochMilliseconds(value));
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][p.month - 1];
  return pad(p.day) + ' ' + month + ' ' + (p.year <= 0n ? (1n - p.year) + ' BCE' : p.year + ' CE');
}
export function engineAvailableAt(value) {
  const epoch = epochMilliseconds(value); return epoch >= BigInt(MIN_TIME) && epoch <= BigInt(MAX_TIME);
}
/** Safe 400-year calendar representative for illustrative orientation only. */
export function modelDate(value) {
  const date = validatedDate(value);
  if (engineAvailableAt(date)) return date;
  const p = partsAt(epochMilliseconds(date));
  return dateFromParts(2000n + positiveModulo(p.year, 400n), p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond);
}
/** Exact reduction before floating-point geometry; period is rounded to 1 ms. */
export function periodicPhase(value, periodMilliseconds, epoch = 946728000000n) {
  if (!Number.isFinite(periodMilliseconds) || periodMilliseconds < 1) throw new RangeError('Period must be positive milliseconds.');
  const period = BigInt(Math.round(periodMilliseconds));
  return Number(positiveModulo(epochMilliseconds(value) - epoch, period)) / Number(period);
}
export function jplAvailableAt(value) {
  try { const epoch = epochMilliseconds(value); return epoch >= BigInt(JPL_MIN_TIME) && epoch <= BigInt(JPL_MAX_TIME); } catch { return false; }
}
export function eclipseAvailableAt(value) { return jplAvailableAt(value); }
export function accuracyAt(value) {
  const date = validatedDate(value), extrapolated = !jplAvailableAt(date), illustrative = !engineAvailableAt(date);
  return { extrapolated, illustrative,
    label: illustrative ? 'Illustrative periodic model · not an ephemeris' : extrapolated ? 'Extrapolated model · accuracy unvalidated' : 'Calculated · ~1′ upstream target',
    detail: illustrative
      ? 'Exact calendar; illustrative circular planetary and lunar paths in fixed J2000 planes. Earth orientation and sky axes repeat a 400-year calendar representative. No long-term precession, orbital evolution, real stellar lifetimes or predictive accuracy are claimed. JPL and eclipse search remain available only for 1800–2200.'
      : extrapolated
        ? 'Remote analytical extrapolation: planetary, lunar and orientation errors are not quantified by this app; modeled ΔT makes local sky and eclipse geography especially uncertain. Fixed catalogue stars omit proper motion.'
        : 'Astronomy Engine targets about one arcminute. The 1800–2200 modern application window is not a guaranteed error interval; local contacts, ΔT and Earth orientation retain stated limitations.' };
}
