// Machine-authored: Codex/OpenAI. Lunar eclipse consumer of the retained MIT
// Astronomy Engine2.1.19. Shadow-cone equations/constants follow its CalcShadow;
// upstream source/license remain under vendor/. Colors are illustrative.
import * as A from './vendor/astronomy-engine-2.1.19.mjs';
import {validatedDate,eclipseAvailableAt,JPL_MAX_TIME,engineAvailableAt} from './time.mjs';
import {eclipticToGalactic} from './trails.mjs';

const DAY=86400000,AU=A.KM_PER_AU,earthRadius=6371+88,sunRadius=695700,moonRadius=1737.4;
const wrap=x=>((x+180)%360+360)%360-180;
const array=v=>[v.x,v.y,v.z];
const toGalactic=v=>eclipticToGalactic(array(A.RotateVector(A.Rotation_EQJ_ECL(),v)));

export function findNextLunarEclipse(value){
  const date=validatedDate(value);
  if(!eclipseAvailableAt(date))throw new RangeError('Lunar eclipse search is available for1800–2200.');
  const start=date.getTime(),end=Math.min(start+400*DAY,JPL_MAX_TIME);
  if(start>=end)return null;
  let event=A.SearchLunarEclipse(new Date(start-DAY));
  if(event.peak.date.getTime()<=start)event=A.NextLunarEclipse(event.peak);
  if(event.peak.date.getTime()>end)return null;
  const equator=A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(event.peak),A.GeoMoon(event.peak)));
  const latitude=equator.dec,longitude=wrap(15*(equator.ra-A.SiderealTime(event.peak))),peak=event.peak.date.toISOString();
  const contact=(minutes,sign)=>minutes>0?new Date(event.peak.date.getTime()+sign*minutes*60000).toISOString():null;
  return {id:`lunar-${peak.slice(0,10)}`,name:'Lunar eclipse',category:'lunar',target:'Moon',type:event.kind,
    date:peak,visitDate:peak,globalPeakDate:peak,localPeakDate:peak,latitude,longitude,hasObserver:true,
    location:'Sublunar observer at greatest eclipse',observerBasis:'Computed Moon declination and apparent sidereal rotation; Moon overhead',
    obscuration:event.obscuration,source:'astronomy-engine-lunar-search',
    contacts:{penumbralBegin:contact(event.sd_penum,-1),partialBegin:contact(event.sd_partial,-1),totalBegin:contact(event.sd_total,-1),peak,totalEnd:contact(event.sd_total,1),partialEnd:contact(event.sd_partial,1),penumbralEnd:contact(event.sd_penum,1)},
    timeBasis:'Computed greatest eclipse and geometric shadow contacts; modeled Earth orientation and atmosphere, not exact observational predictions.'};
}

/** Earth shadow at the Moon's perpendicular plane. Offset is Moon-relative
 * Galactic AU; a renderer clips the shadow to the visible physical lunar disk. */
export function lunarShadowAt(value){
  const date=validatedDate(value);if(!engineAvailableAt(date))return null;
  const time=A.MakeTime(date),sun=A.GeoVector('Sun',time,true),moon=A.GeoMoon(time),s=array(sun),m=array(moon);
  const dir=s.map(x=>-x),length2=dir.reduce((n,x)=>n+x*x,0),u=dir.reduce((n,x,i)=>n+x*m[i],0)/length2;
  if(u<=0)return null;
  const offset=dir.map((x,i)=>u*x-m[i]),distanceKm=AU*Math.hypot(...offset);
  const umbraRadiusKm=earthRadius-u*(sunRadius-earthRadius),penumbraRadiusKm=earthRadius+u*(sunRadius+earthRadius);
  if(distanceKm>=penumbraRadiusKm+moonRadius)return null;
  return {offsetGalacticAU:toGalactic(new A.Vector(...offset,time)),axisGalactic:toGalactic(new A.Vector(...dir,time)),
    umbraRadiusAU:Math.max(0,umbraRadiusKm)/AU,penumbraRadiusAU:penumbraRadiusKm/AU,moonRadiusAU:moonRadius/AU,
    distanceKm,umbraRadiusKm,penumbraRadiusKm,source:'Astronomy Engine vectors and shadow-cone model',
    limitation:'Effective atmospheric radius88km; display tint/penumbral shading are illustrative, not photometry.'};
}
