// Machine-authored: Codex/OpenAI. Exact user-rate conversion shared by controls and tests.
export const RATE_UNITS=Object.freeze({seconds:1,minutes:60,hours:3600,days:86400,weeks:604800,years:31557600});
export const MAX_PLAYBACK_RATE=3155760000000000;
export function parsePlaybackRate(value,unit='seconds'){
  if(typeof value!=='string'&&typeof value!=='number'||String(value).trim()===''||!Object.hasOwn(RATE_UNITS,unit))throw new RangeError('Enter a numeric playback rate and unit.');
  const rate=Number(value)*RATE_UNITS[unit];
  if(!Number.isFinite(rate)||Math.abs(rate)>MAX_PLAYBACK_RATE)throw new RangeError('Rate must be finite and no larger than 100 million years per second.');
  return rate;
}
export function playbackUnitFor(rate){
  return Object.keys(RATE_UNITS).reverse().find(unit=>Math.abs(rate)>=RATE_UNITS[unit]&&Number.isInteger(rate/RATE_UNITS[unit]))??'seconds';
}
export function magneticValue(value,stops,{absolute=.03,relative=.035}={}){
  if(!Number.isFinite(value))return value;
  const nearest=stops.filter(Number.isFinite).reduce((best,stop)=>Math.abs(stop-value)<Math.abs(best-value)?stop:best,Infinity);
  return Number.isFinite(nearest)&&Math.abs(nearest-value)<=Math.max(absolute,Math.abs(nearest)*relative)?nearest:value;
}
