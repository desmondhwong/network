// Machine-authored by Codex / OpenAI, claim 260921-150509-001. Exact calendar ticks.
import { validatedDate, epochMilliseconds, dateFromParts, yearOf, addTime, differenceMillis, floorDivide } from './time.mjs';
import { validTimeZone, zonedParts, zonedDateCandidates, formatZoneOffset } from './time-zones.mjs';
const DAY = 86400000, YEAR = 365.2425 * DAY;
export const TIME_SPANS = Object.freeze({gigayear:{duration:1e9*YEAR,step:1e7*YEAR},megayear:{duration:1e6*YEAR,step:1e4*YEAR},millennium:{duration:1000*YEAR,step:10*YEAR},century:{duration:100*YEAR,step:YEAR},year:{duration:YEAR,step:30*DAY},month:{duration:30*DAY,step:DAY},day:{duration:DAY,step:3600000},hour:{duration:3600000,step:60000},minute:{duration:60000,step:1000}});
const intervalFor = span => ({month:DAY,day:3600000,hour:60000,minute:1000}[span]);
const yearInterval = span => ({century:10n,millennium:100n,megayear:100000n,gigayear:100000000n}[span]);
const compatibleTime = value => { const date = validatedDate(value); return date instanceof Date ? +date : date; };

/** Automatic span crosses one viewport in one minute of wall time at the selected
 * rate, including reverse playback. Pausing leaves the selected scale intact.
 * Tick steps are UTC-epoch anchored, bounded in count and integral milliseconds. */
export function automaticTimelineSpan(secondsPerSecond) {
  if (!Number.isFinite(secondsPerSecond)) throw new RangeError('Timeline rate must be finite.');
  const duration = Math.max(1000, Math.abs(secondsPerSecond) * 60000);
  if (!Number.isFinite(duration)) throw new RangeError('Timeline span is too large.');
  const ideal = duration / 12, unit = 10 ** Math.floor(Math.log10(ideal));
  const step = Math.max(1, Math.round(([1, 2, 5, 10].find(n => n * unit >= ideal) ?? 10) * unit));
  return { duration, step };
}

function dynamicSpan(span) {
  return span && typeof span === 'object' && Number.isFinite(span.duration) && span.duration >= 1 && Number.isFinite(span.step) && span.step >= 1 && span.duration / span.step <= 200;
}

export function timelineSpanLabel(span) {
  const duration = typeof span === 'string' ? TIME_SPANS[span]?.duration : span?.duration;
  if (!Number.isFinite(duration)) return '';
  for (const [size, label] of [[1e9*YEAR,'billion years'],[1e6*YEAR,'million years'],[1000*YEAR,'thousand years'],[YEAR,'years'],[DAY,'days'],[3600000,'hours'],[60000,'minutes'],[1000,'seconds']]) {
    if (duration >= size) { const count=Number((duration / size).toPrecision(3)); return `${count} ${count===1&&size<=YEAR?label.replace(/s$/,''):label}`; }
  }
  return `${Math.round(duration)} ms`;
}

function utcTimelineTicks(center, span, width) {
  const dynamic = dynamicSpan(span);
  if ((!TIME_SPANS[span] && !dynamic) || !Number.isFinite(width) || width <= 0) return [];
  try { center = validatedDate(center); } catch { return []; }
  const duration = dynamic ? span.duration : TIME_SPANS[span].duration, start = addTime(center, -duration / 2), end = addTime(center, duration / 2), output = [];
  const add = (time, major = true) => {
    if (differenceMillis(time, start) >= 0 && differenceMillis(time, end) <= 0) output.push({time: compatibleTime(time), x: differenceMillis(time, center) / duration * width + width / 2, major});
  };
  if (dynamic) {
    const interval = BigInt(Math.round(span.step)), first = -floorDivide(-epochMilliseconds(start), interval) * interval;
    const labelEvery = BigInt(Math.max(1, Math.ceil(85 / (width * span.step / duration))));
    for (let epoch = first; epoch <= epochMilliseconds(end); epoch += interval) add(epoch, (epoch / interval) % labelEvery === 0n);
  } else if (yearInterval(span)) {
    const interval = yearInterval(span), first = floorDivide(yearOf(start), interval) * interval;
    for (let i = 0n; i < 13n; i++) add(dateFromParts(first + i * interval));
  } else if (span === 'year') {
    for (let i = 0; i < 16; i++) add(dateFromParts(yearOf(start), start.getUTCMonth() + i, 1));
  } else {
    const interval = BigInt(intervalFor(span)), count = Math.ceil(duration / Number(interval));
    const labelEvery = BigInt(Math.max(1, Math.ceil(85 / (width / count))));
    const first = -floorDivide(-epochMilliseconds(start), interval) * interval;
    for (let epoch = first; epoch <= epochMilliseconds(end); epoch += interval) add(epoch, (epoch / interval) % labelEvery === 0n);
  }
  return output;
}
function snapUTCTimelineTime(value, span) {
  const dynamic = dynamicSpan(span);
  if (!TIME_SPANS[span] && !dynamic) throw new RangeError('Invalid timeline input');
  const date = validatedDate(value), epoch = epochMilliseconds(date);
  let a, b;
  if (dynamic) {
    const interval = BigInt(Math.round(span.step)), first = floorDivide(epoch, interval) * interval;
    a = first; b = first + interval;
  } else if (yearInterval(span)) {
    const interval = yearInterval(span), first = floorDivide(yearOf(date), interval) * interval;
    a = dateFromParts(first); b = dateFromParts(first + interval);
  } else if (span === 'year') {
    a = dateFromParts(yearOf(date), date.getUTCMonth()); b = dateFromParts(yearOf(date), date.getUTCMonth() + 1);
  } else {
    const interval = BigInt(intervalFor(span)), first = floorDivide(epoch, interval) * interval;
    a = first; b = first + interval;
  }
  return compatibleTime(differenceMillis(date, a) < differenceMillis(b, date) ? a : b);
}

/** Resolve one zone for the whole ruler. BigInt/geological calendars keep exact
 * UTC ticks; the caller displays message so a civil-zone fallback is explicit. */
export function timelineZoneContext(value, requestedTimeZone = 'UTC', span) {
  const date = validatedDate(value), duration = typeof span === 'string' ? TIME_SPANS[span]?.duration : span?.duration;
  const valid = validTimeZone(requestedTimeZone);
  const dates = [date];
  if (Number.isFinite(duration)) dates.push(addTime(date, -duration / 2), addTime(date, duration / 2));
  const fallback = requestedTimeZone !== 'UTC' && (!valid || dates.some(date => !zonedParts(date, requestedTimeZone)));
  const timeZone = fallback ? 'UTC' : requestedTimeZone;
  return { requestedTimeZone, timeZone, fallback, message: fallback
    ? `Ruler · UTC; ${valid ? 'civil time is unavailable for this date or span' : 'the display time zone is invalid'} (${requestedTimeZone}).`
    : `Ruler · ${timeZone}` };
}

// Offsets are sampled at prospective boundaries and around their neighboring
// days, then every resulting instant is checked. Thus gaps add no fictitious
// tick and folds retain both real instants, including half-hour DST transitions.
function offsetsForRange(start, end, interval, zone) {
  const offsets = new Set(), anchors = [start, end];
  const first = Math.floor(start / interval) * interval;
  for (let epoch = first; epoch <= end + interval && anchors.length < 206; epoch += interval) anchors.push(epoch);
  for (const epoch of anchors) for (const shift of [-2 * DAY, 0, 2 * DAY]) {
    const parts = zonedParts(new Date(epoch + shift), zone);
    if (parts) offsets.add(parts.offsetMilliseconds);
  }
  return offsets;
}
function civilIntervalTicks(start, end, interval, zone) {
  const output = new Map();
  for (const offset of offsetsForRange(start, end, interval, zone)) {
    const first = Math.ceil((start + offset) / interval) * interval - offset;
    for (let epoch = first; epoch <= end; epoch += interval) {
      const parts = zonedParts(new Date(epoch), zone);
      if (parts?.offsetMilliseconds === offset) output.set(epoch, (epoch + offset) / interval);
    }
  }
  return [...output].sort(([a],[b]) => a - b);
}
function calendarBoundaries(date, span, zone, before, after) {
  const parts = zonedParts(date, zone), output = [];
  if (!parts) return output;
  const interval = yearInterval(span);
  for (let i = -before; i <= after; i++) {
    const civil = interval
      ? dateFromParts(floorDivide(BigInt(parts.year), interval) * interval + BigInt(i) * interval)
      : dateFromParts(parts.year, parts.month - 1 + i);
    output.push(...zonedDateCandidates({year:civil.getUTCFullYear(), month:civil.getUTCMonth()+1, day:1}, zone).map(Number));
  }
  return output.sort((a,b) => a - b);
}
/** Optional IANA zone affects tick boundaries and labels, never the UTC instant
 * represented by time. Existing callers retain the exact UTC behavior. */
export function timelineTicks(center, span, width, {timeZone = 'UTC'} = {}) {
  const dynamic = dynamicSpan(span);
  if ((!TIME_SPANS[span] && !dynamic) || !Number.isFinite(width) || width <= 0) return [];
  try { center = validatedDate(center); } catch { return []; }
  const context = timelineZoneContext(center, timeZone, span);
  if (context.timeZone === 'UTC') return utcTimelineTicks(center, span, width);
  const duration = dynamic ? span.duration : TIME_SPANS[span].duration;
  const start = +center - duration / 2, end = +center + duration / 2;
  let boundaries;
  if (span === 'year' || yearInterval(span)) {
    boundaries = calendarBoundaries(new Date(start), span, timeZone, 0, span === 'year' ? 16 : 13).map(time => [time, null]);
  } else boundaries = civilIntervalTicks(start, end, Math.round(dynamic ? span.step : intervalFor(span)), timeZone);
  const step = dynamic ? span.step : intervalFor(span), labelEvery = Math.max(1, Math.ceil(85 / (width * step / duration)));
  return boundaries.filter(([time]) => time >= start && time <= end).map(([time, index]) => ({time, x:(time - +center) / duration * width + width / 2, major:index === null || index % labelEvery === 0}));
}
export function snapTimelineTime(value, span, {timeZone = 'UTC'} = {}) {
  const dynamic = dynamicSpan(span);
  if (!TIME_SPANS[span] && !dynamic) throw new RangeError('Invalid timeline input');
  const date = validatedDate(value), context = timelineZoneContext(date, timeZone, span);
  if (context.timeZone === 'UTC') return snapUTCTimelineTime(date, span);
  const interval = Math.round(dynamic ? span.step : intervalFor(span));
  const candidates = span === 'year' || yearInterval(span)
    ? calendarBoundaries(date, span, timeZone, 2, 2)
    : civilIntervalTicks(+date - interval * 2, +date + interval * 2, interval, timeZone).map(([time]) => time);
  return candidates.reduce((nearest, candidate) => Math.abs(candidate - +date) <= Math.abs(nearest - +date) ? candidate : nearest, candidates[0] ?? +date);
}
export function formatTimelineTick(value, span, {timeZone = 'UTC'} = {}) {
  const date = validatedDate(value), context = timelineZoneContext(date, timeZone);
  const local = context.timeZone === 'UTC' ? null : zonedParts(date, context.timeZone);
  const duration = typeof span === 'string' ? TIME_SPANS[span]?.duration : span?.duration;
  const year = local?.year ?? yearOf(date), month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(local?.month ?? date.getUTCMonth()+1)-1];
  const pad = n => String(n).padStart(2,'0');
  const clock = `${pad(local?.hour ?? date.getUTCHours())}:${pad(local?.minute ?? date.getUTCMinutes())}${duration <= 600000 ? ':' + pad(local?.second ?? date.getUTCSeconds()) : ''}`;
  const label = duration >= 100 * YEAR ? String(year) : duration >= 365 * DAY ? `${month} ${year}` : duration > DAY ? `${month} ${local?.day ?? date.getUTCDate()}` : clock;
  // Explicit offsets distinguish repeated civil labels during a DST fold.
  return local ? `${label} ${formatZoneOffset(local.offsetMilliseconds).slice(3)}` : label;
}
