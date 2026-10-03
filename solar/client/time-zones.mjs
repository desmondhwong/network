// Machine-authored by Codex/OpenAI. Offline geographic estimates and host IANA rules.
import lookup from './vendor/tz-lookup-11.7.0.mjs';
import { dateFromParts } from './time.mjs';

const formatters = new Map();
const zones = new Map(), partCache = new Map(), candidateCache = new Map();
const remember = (cache, key, value, limit = 512) => { if (cache.size >= limit) cache.delete(cache.keys().next().value); cache.set(key, value); return value; };
export function validTimeZone(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
  if (zones.has(zone)) return zones.get(zone);
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return remember(zones, zone, true, 64); } catch { return remember(zones, zone, false, 64); }
}
export function zoneAt(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try { const zone = lookup(latitude, longitude); return validTimeZone(zone) ? zone : null; } catch { return null; }
}
/** Numeric Gregorian civil parts and the actual offset at an instant. Native
 * years 1..9999 only: astronomical/deep-time dates deliberately return null. */
export function zonedParts(date, zone) {
  // Civil zones have no useful interpretation across the app's geological clock.
  if (!validTimeZone(zone) || !(date instanceof Date) || !Number.isFinite(+date) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  const key = `${zone}:${Math.floor(+date / 1000)}`;
  if (partCache.has(key)) return { ...partCache.get(key), millisecond: date.getUTCMilliseconds() };
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, calendar:'gregory', numberingSystem:'latn', era:'short', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', timeZoneName:'short' });
    if (formatters.size >= 32) formatters.clear();
    formatters.set(zone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  if (p.era === 'BC' || Number(p.year) > 9999) return null;
  const result = Object.fromEntries(['year','month','day','hour','minute','second'].map(key => [key, Number(p[key])]));
  result.offsetMilliseconds = +dateFromParts(result.year, result.month - 1, result.day, result.hour, result.minute, result.second) - Math.floor(+date / 1000) * 1000;
  result.timeZoneName = p.timeZoneName;
  remember(partCache, key, result, 2048);
  return { ...result, millisecond: date.getUTCMilliseconds() };
}
export function formatZonedTime(date, zone) {
  const p = zonedParts(date, zone), pad = (n, width = 2) => String(n).padStart(width, '0');
  if (!p) return 'Civil time unavailable for this date';
  return `${pad(p.year,4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${p.timeZoneName}`;
}
export function formatZoneOffset(milliseconds) {
  const seconds = Math.round(Math.abs(milliseconds) / 1000), pad = n => String(n).padStart(2, '0');
  return `UTC${milliseconds < 0 ? '-' : '+'}${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}${seconds % 60 ? ':' + pad(seconds % 60) : ''}`;
}
/** A civil boundary can have zero instants (a clock gap), one, or two (a fold).
 * Probe both sides of a transition, then validate every candidate against Intl. */
export function zonedDateCandidates(parts, zone) {
  if (!validTimeZone(zone) || !Number.isInteger(parts.year) || parts.year < 1 || parts.year > 9999) return [];
  const p = { month:1, day:1, hour:0, minute:0, second:0, millisecond:0, ...parts };
  const civil = +dateFromParts(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond);
  const key = `${zone}:${civil}`;
  if (candidateCache.has(key)) return candidateCache.get(key).map(epoch => new Date(epoch));
  const offsets = new Set();
  for (let hours = -48; hours <= 48; hours += 12) {
    const nearby = zonedParts(new Date(civil + hours * 3600000), zone);
    if (nearby) offsets.add(nearby.offsetMilliseconds);
  }
  const epochs = [...offsets].map(offset => civil - offset).filter(epoch => {
    const actual = zonedParts(new Date(epoch), zone);
    return actual && ['year','month','day','hour','minute','second','millisecond'].every(key => actual[key] === p[key]);
  }).sort((a,b) => a - b);
  remember(candidateCache, key, epochs);
  return epochs.map(epoch => new Date(epoch));
}
