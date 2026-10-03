// Machine-authored by Codex/OpenAI, 2026-09-05, claim 260905-115339-001/solar-system-0.2.
// Shared Web Request/Response boundary for the local Node server and optional Worker.
import { getHorizonsSnapshot, validateHorizonsInput, HorizonsError } from './horizons.mjs';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

function parseInput(url) {
  const parameters = url.searchParams;
  const allowed = ['date', 'latitude', 'longitude', 'height'];
  if ([...parameters.keys()].some(key => !allowed.includes(key) || parameters.getAll(key).length !== 1)
      || ['date', 'latitude', 'longitude'].some(key => !parameters.has(key))
      || [...parameters.values()].some(value => !value.trim())) {
    throw new RangeError('Expected one date, latitude, longitude, and optional nonblank height.');
  }
  const number = key => {
    const value = parameters.get(key)?.trim() ?? '0';
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new RangeError(`${key} must be a finite decimal number.`);
    return Number(value);
  };
  const { jdUT: _jdUT, ...input } = validateHorizonsInput({ date: parameters.get('date'), latitude: number('latitude'), longitude: number('longitude'), height: number('height') });
  return input;
}

/** Validation always runs before the injected provider, including in offline tests. */
export async function handleEphemerisRequest(request, { ephemeris = getHorizonsSnapshot } = {}) {
  let url;
  try { url = new URL(request.url); } catch { return json({ error: 'Invalid request URL.' }, 400); }
  if (url.pathname !== '/api/ephemeris') return json({ error: 'Not found.' }, 404);
  if (request.method !== 'GET') return json({ error: 'Use GET for ephemeris requests.' }, 405, { Allow: 'GET' });
  let input;
  try { input = parseInput(url); } catch (error) { return json({ error: error.message }, 400); }
  try { return json(await ephemeris(input)); }
  catch (error) {
    const status = [429, 502, 503, 504].includes(error?.status) ? error.status : 502;
    return json({ error: error instanceof HorizonsError ? error.message : 'JPL ephemeris is unavailable. Try again later.' }, status);
  }
}

/** Named local data endpoints; no caller-supplied upstream URL or credentials. */
export async function handleDataRequest(request,{issData,ephemerisPackage,issTelemetry}={}){
  let url;try{url=new URL(request.url);}catch{return json({error:'Invalid URL.'},400);}
  if(request.method!=='GET')return json({error:'Use GET for data requests.'},405,{Allow:'GET'});
  const params=url.searchParams;
  const validKeys=keys=>[...params.keys()].every(key=>keys.includes(key)&&params.getAll(key).length===1);
  let provider,input;
  if(url.pathname==='/api/iss-data'){
    if(!validKeys(['refresh'])||(params.has('refresh')&&params.get('refresh')!=='1'))return json({error:'Expected optional refresh=1.'},400);
    provider=issData;input={refresh:true,retryErrors:params.has('refresh')};
  }else if(url.pathname==='/api/iss-telemetry'){
    if(!validKeys(['connect','disconnect'])||[...params.values()].some(value=>value!=='1')||(params.has('connect')&&params.has('disconnect')))return json({error:'Choose connect=1 or disconnect=1.'},400);
    provider=issTelemetry;input={connect:params.has('connect'),disconnect:params.has('disconnect')};
  }else if(url.pathname==='/api/ephemeris-package'){
    const start=params.get('start')??'',date=new Date(start),days=Number(params.get('days')??35);
    if(!validKeys(['start','days'])||!/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(start)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==start.slice(0,10)||date.getUTCFullYear()<1800||date.getUTCFullYear()>2200||!Number.isInteger(days)||days<1||days>35||date.getTime()+days*86400000>=Date.UTC(2201,0,1))return json({error:'Use UTC midnight start within 1800–2200 and 1–35 days of coverage.'},400);
    provider=ephemerisPackage;input={start:date.toISOString(),days};
  }else return json({error:'Not found.'},404);
  if(typeof provider!=='function')return json({error:'This data service requires the local server.'},503);
  try{return json(await provider(input));}
  catch(error){return json({error:error instanceof RangeError?error.message:'Data provider unavailable; saved data remain usable.'},error instanceof RangeError?400:[429,502,503,504].includes(error?.status)?error.status:502);}
}
