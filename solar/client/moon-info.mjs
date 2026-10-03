// Machine-authored Codex/OpenAI, 2026-10-01. Local Earth-Moon information;
// source/model limits: data-sources/moon-info/provenance.md.
import * as A from './vendor/astronomy-engine-2.1.19.mjs';
import {validatedDate,engineAvailableAt,jplAvailableAt,epochMilliseconds,JPL_MAX_TIME} from './time.mjs';
import {illustrativeGeoAt} from './remote-model.mjs';
const AU=A.KM_PER_AU,DAY=86400000,RADIUS_KM=1737.4,DEG=180/Math.PI;
const quarters=['New Moon','First quarter','Full Moon','Last quarter'];
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite),norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const wrap=x=>((x%360)+360)%360,clamp=x=>Math.max(-1,Math.min(1,x));
const quarterCache=new Map();let lastBase=null;
function phaseName(degrees){
  for(let q=0;q<4;q++)if(Math.abs(((degrees-q*90+540)%360)-180)<=1)return quarters[q];
  return degrees<90?'Waxing crescent':degrees<180?'Waxing gibbous':degrees<270?'Waning gibbous':'Waning crescent';
}
function nextQuarters(date){
  const day=Math.floor(date.getTime()/DAY)*DAY;let events=quarterCache.get(day);
  if(!events){
    events=[];let event=A.SearchMoonQuarter(new Date(day));
    // Five candidates cover the next four after a within-day phase change.
    for(let i=0;i<5;i++){
      const time=event.time.date.getTime();if(time>JPL_MAX_TIME||time>day+40*DAY)break;
      events.push({quarter:event.quarter,name:quarters[event.quarter],date:event.time.date.toISOString(),dateISO:event.time.date.toISOString()});
      if(i<4)event=A.NextMoonQuarter(event);
    }
    quarterCache.set(day,events);if(quarterCache.size>12)quarterCache.delete(quarterCache.keys().next().value);
  }
  return events.filter(e=>Date.parse(e.date)>date.getTime()).slice(0,4).map(e=>({...e}));
}
function baseAt(date){
  const key=epochMilliseconds(date).toString();if(lastBase?.key===key)return lastBase.value;
  const engine=engineAvailableAt(date),modern=jplAvailableAt(date);let phaseDegrees,illuminatedFraction,phaseAngleDeg,moon;
  if(engine){
    const info=A.Illumination('Moon',date);phaseDegrees=A.MoonPhase(date);illuminatedFraction=info.phase_fraction;phaseAngleDeg=info.phase_angle;
    moon=[info.gc.x,info.gc.y,info.gc.z];
  }else{
    moon=illustrativeGeoAt('Moon',date);const sun=illustrativeGeoAt('Sun',date),toSun=sub(sun,moon),toEarth=moon.map(x=>-x);
    phaseDegrees=wrap((Math.atan2(moon[1],moon[0])-Math.atan2(sun[1],sun[0]))*DEG);
    const cosine=clamp(toSun.reduce((s,x,k)=>s+x*toEarth[k],0)/(norm(toSun)*norm(toEarth)));phaseAngleDeg=Math.acos(cosine)*DEG;illuminatedFraction=(1+cosine)/2;
  }
  const value={phaseDegrees,phaseAngleDeg,illuminatedFraction,distanceKm:norm(moon)*AU,illustrative:!engine,extrapolated:!modern,eventSearchAvailable:modern,
    sourceModel:engine?'Astronomy Engine 2.1.19':'Illustrative circular Moon model',
    status:!engine?'Illustrative Moon geometry; no predicted phases or events':!modern?'Extrapolated lunar model; accuracy unvalidated; phase events unavailable':'Calculated geocentric Moon; modeled Earth orientation and ΔT; no guaranteed error bound'};
  lastBase={key,value};return value;
}

/** Geocentric phase/illumination and Earth-center distance. Supplied snapshots
 * may override only the distance with their displayed Earth/Moon positions.
 * Next quarter times are searched only within the application's 1800–2200
 * modern window; no event search is attempted for remote calendar years. */
export function moonInfoAt(value,{bodies,observer}={}) {
  const date=validatedDate(value),base=baseAt(date),rows=Array.isArray(bodies)?bodies:[],earth=rows.find(b=>b.id==='Earth'),moon=rows.find(b=>b.id==='Moon');
  const supplied=finite(earth?.position)&&finite(moon?.position)?norm(sub(moon.position,earth.position))*AU:null;
  const distanceKm=Number.isFinite(supplied)&&supplied>RADIUS_KM?supplied:base.distanceKm;
  const info={...base,date:date.toISOString(),phaseName:phaseName(base.phaseDegrees),waxing:base.phaseDegrees<180,
    illuminatedPercent:base.illuminatedFraction*100,distanceKm,distanceAU:distanceKm/AU,
    distanceSource:distanceKm===supplied?'Supplied Earth and Moon centers':base.sourceModel,
    angularDiameterArcmin:2*Math.asin(clamp(RADIUS_KM/distanceKm))*DEG*60,lightTravelSeconds:distanceKm/299792.458,
    nextQuarters:base.eventSearchAvailable?nextQuarters(date):[],observer:null};
  if(observer){
    const latitude=observer.latitude,longitude=observer.longitude,height=observer.height??observer.altitudeM??0;
    if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(height))throw new RangeError('Moon observer requires valid Earth latitude, longitude and height.');
    if(base.eventSearchAvailable){
      const site=new A.Observer(latitude,longitude,height),eq=A.Equator('Moon',date,site,true,true),horizontal=A.Horizon(date,site,eq.ra,eq.dec);
      info.observer={latitude,longitude,height,altitude:horizontal.altitude,azimuth:horizontal.azimuth,distanceKm:eq.dist*AU,refraction:'none',sourceModel:base.sourceModel};
    }
  }
  return info;
}
