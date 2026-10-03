// Machine-authored Codex/OpenAI. Explicit data operations and bounded refresh scheduling.
import {configureISS,installISSData,exportISSData,issDataStatus,compareISSProviders} from './iss.mjs';
import {findISSPasses,issObserverAt} from './iss-passes.mjs';
import {getEphemerisCacheInfo,installEphemerisPackage,exportEphemerisPackage,setEphemerisMode} from './ephemeris-cache.mjs';
import {standalone} from './runtime.mjs';
const $=id=>document.getElementById(id);
export function nextISSRefreshTime(sources,{retryNotBefore=0,now=Date.now()}={}){
  const active=Object.values(sources).filter(source=>!source.paused);if(!active.length)return null;
  const times=active.map(source=>Date.parse(source.nextRefreshAt)).filter(Number.isFinite);
  return Math.max(retryNotBefore,now+1000,times.length?Math.min(...times):now);
}
const html=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=values=>values.map(([key,value])=>`<dt>${html(key)}</dt><dd>${html(value)}</dd>`).join('');
const canDownload=()=>!standalone&&/^https?:$/.test(location.protocol??'');
const cacheKeys={iss:'solar-system-iss-data-v1',ephemeris:'solar-system-ephemeris-v1'};

export function mountDataControls({state,onDataChange,report,getObserver,visitTime,downloadJSON}){
  let refreshTimer=null,refreshBusy=false,ephemerisBusy=false,destroyed=false,passResults=null,serverSources=null,retryNotBefore=0;
  function persist(kind,value){try{localStorage.setItem(cacheKeys[kind],JSON.stringify(value));return true;}catch{return false;}}
  function changed(){onDataChange();}
  function restoreSettings(){configureISS({provider:state.issProvider});setEphemerisMode(state.ephemerisMode);}
  function schedule(){
    clearTimeout(refreshTimer);if(destroyed||!state.issAutoRefresh||!canDownload()||document.hidden)return;
    const sources=serverSources??issDataStatus({date:state.date}).sources;
    const next=nextISSRefreshTime(sources,{retryNotBefore});if(next===null)return;
    refreshTimer=setTimeout(()=>refresh(false),Math.max(1000,next-Date.now()));refreshTimer.unref?.();
  }
  async function refresh(manual=true){
    if(refreshBusy||destroyed)return;
    if(!canDownload()){$('iss-data-message').textContent='Online refresh needs the local server. Import a saved orbit-data file here.';return;}
    refreshBusy=true;$('iss-refresh').disabled=true;$('iss-data-message').textContent='Checking current ISS data…';
    try{const response=await fetch(`/api/iss-data${manual?'?refresh=1':''}`,{signal:AbortSignal.timeout(120000)}),result=await response.json();
      if(!response.ok||!result.bundle)throw Error(result.error??'ISS data request failed.');
      if(destroyed)return;installISSData(result.bundle);serverSources=result.status?.sources??null;retryNotBefore=0;const saved=persist('iss',exportISSData());
      $('iss-data-message').textContent=(result.error?`Saved prediction retained: ${result.error}`:result.refreshed?.length?'ISS orbit data updated.':'Source cache is current; the update interval is respected.')+(saved?'':' Browser storage is full; export data to retain this update.');changed();
    }catch(error){retryNotBefore=Date.now()+60000;if(!destroyed)$('iss-data-message').textContent=`Refresh unavailable. Saved prediction remains active. ${error.message}`;}
    finally{refreshBusy=false;if(!destroyed){$('iss-refresh').disabled=!canDownload();schedule();}}
  }
  function sync({details=true}={}){
    for(const [id,key] of [['iss-provider','issProvider'],['ephemeris-mode','ephemerisMode'],['moon-surface-detail','moonSurfaceDetail'],['moon-terrain-exaggeration','moonTerrainExaggeration']])if(document.activeElement!==$(id))$(id).value=String(state[key]);
    for(const [id,key] of [['iss-auto-refresh','issAutoRefresh'],['show-iss-footprint','showISSFootprint'],['iss-visible-only','issVisiblePassesOnly'],['show-minor-bodies','showMinorBodies'],['show-physical-shadows','showPhysicalShadows']])$(id).checked=state[key];
    if(details){
    const data=issDataStatus({date:state.date}),source=data.sources[data.activeProvider],compare=compareISSProviders(state.date);
    $('iss-data-details').innerHTML=rows([
      ['Active source',data.sourceModel],['Source epoch / creation',data.epoch],['Downloaded',source?.retrievedAt],
      ['Trajectory coverage',data.coverage?`${data.coverage.start} – ${data.coverage.stop}`:'Element-age policy; see status'],
      ['Source fallback',data.fallback?'Requested source unavailable; fallback active':'No forced fallback'],
      ['GP / NASA separation',Number.isFinite(compare.residualKm.gp)?`${compare.residualKm.gp.toFixed(3)} km · model comparison`:'Unavailable'],
      ['SupGP / NASA separation',Number.isFinite(compare.residualKm.supgp)?`${compare.residualKm.supgp.toFixed(3)} km · model comparison`:'Unavailable'],
    ]);
    try{const p=issObserverAt(state.date,getObserver());$('iss-observer').innerHTML=rows([['Earth observer',`${getObserver().latitude.toFixed(3)}°, ${getObserver().longitude.toFixed(3)}°`],['Azimuth / elevation',`${p.azimuth.toFixed(1)}° / ${p.elevation.toFixed(1)}°`],['Range',`${p.rangeKm.toFixed(1)} km`],['Station sunlight',p.illumination],['Sighting estimate',p.illustrative?'Illustrative date; prediction unavailable':p.visible?'Potentially visible':p.aboveHorizon?'Above horizon; not optically visible by this filter':'Below horizon']]);}
    catch{$('iss-observer').innerHTML=rows([['Observer geometry','Unavailable for this date or observer altitude']]);}
    }
    const info=getEphemerisCacheInfo(),covered=Number(state.date)>=Date.parse(info.start)&&Number(state.date)<=Date.parse(info.end);
    $('ephemeris-cache-status').textContent=`${state.ephemerisMode==='cached'?(covered?'Cached JPL geometric positions':'Outside cache · local fallback'):'Local analytical positions'} · ${info.bodyIds.length} cached bodies · ${info.start} – ${info.end}. Apparent sky coordinates retain their stated local model.`;
    $('iss-refresh').disabled=refreshBusy||!canDownload();$('ephemeris-refresh').disabled=ephemerisBusy||!canDownload();
    $('iss-refresh').title=$('ephemeris-refresh').title=canDownload()?'':'Online retrieval requires the local server; saved files can be imported offline.';
    $('iss-passes-export').disabled=!passResults;
  }
  for(const [id,key] of [['iss-provider','issProvider'],['ephemeris-mode','ephemerisMode'],['moon-surface-detail','moonSurfaceDetail']])$(id).onchange=()=>{state[key]=$(id).value;restoreSettings();changed();};
  for(const [id,key] of [['iss-auto-refresh','issAutoRefresh'],['show-iss-footprint','showISSFootprint'],['iss-visible-only','issVisiblePassesOnly'],['show-minor-bodies','showMinorBodies'],['show-physical-shadows','showPhysicalShadows']])$(id).onchange=()=>{state[key]=$(id).checked;changed();if(key==='issAutoRefresh')schedule();};
  $('moon-terrain-exaggeration').onchange=()=>{const n=Number($('moon-terrain-exaggeration').value);if(!Number.isFinite(n)||n<1||n>20){report('Terrain multiplier must be 1–20.');return;}state.moonTerrainExaggeration=n;changed();};
  $('iss-refresh').onclick=()=>refresh(true);
  $('iss-data-export').onclick=()=>downloadJSON(exportISSData(),'solar-system-iss-data.json');
  $('ephemeris-export').onclick=()=>downloadJSON(exportEphemerisPackage(),'solar-system-ephemeris.json');
  for(const [kind,button,fileId,messageId,install,exportData] of [
    ['iss','iss-data-import','iss-data-file','iss-data-message',installISSData,exportISSData],
    ['ephemeris','ephemeris-import','ephemeris-file','ephemeris-message',installEphemerisPackage,exportEphemerisPackage],
  ]){
    $(button).onclick=()=>$(fileId).click();
    $(fileId).onchange=async()=>{const file=$(fileId).files?.[0];if(!file)return;
      try{if(file.size>6*1024*1024)throw Error('Data file exceeds 6 MiB.');const text=await file.text();if(text.length>6*1024*1024)throw Error('Data file exceeds 6 MiB.');const value=JSON.parse(text);if(destroyed)return;install(value);if(kind==='iss'){serverSources=null;retryNotBefore=0;}const saved=persist(kind,exportData());$(messageId).textContent=`Data imported and validated.${saved?'':' Browser storage unavailable; retain the file.'}`;changed();schedule();}
      catch(error){if(!destroyed)$(messageId).textContent=`Import refused; current data retained. ${error.message}`;}finally{if(!destroyed)$(fileId).value='';}
    };
  }
  $('ephemeris-refresh').onclick=async()=>{
    if(ephemerisBusy||!canDownload())return;const date=new Date(Number(state.date));if(!Number.isFinite(+date)||date.getUTCFullYear()<1800||date.getUTCFullYear()>2200){report('Choose a date from 1800–2200 for a JPL package.');return;}date.setUTCHours(0,0,0,0);
    ephemerisBusy=true;$('ephemeris-refresh').disabled=true;$('ephemeris-message').textContent='Downloading and validating 35 days of trajectories. This can take several minutes…';
    try{const response=await fetch(`/api/ephemeris-package?${new URLSearchParams({start:date.toISOString(),days:'35'})}`,{signal:AbortSignal.timeout(900000)}),value=await response.json();if(!response.ok)throw Error(value.error??'JPL package request failed.');if(destroyed)return;installEphemerisPackage(value);persist('ephemeris',exportEphemerisPackage());state.ephemerisMode='cached';restoreSettings();$('ephemeris-message').textContent='Validated trajectory package loaded. Cached geometric flight positions are active.';changed();}
    catch(error){if(!destroyed)$('ephemeris-message').textContent=`Download failed; previous data retained. ${error.message}`;}
    finally{ephemerisBusy=false;if(!destroyed)$('ephemeris-refresh').disabled=!canDownload();}
  };
  $('iss-predict').onclick=async()=>{
    if(destroyed)return;passResults=null;$('iss-passes-export').disabled=true;
    $('iss-predict').disabled=true;$('iss-passes').textContent='Calculating passes…';
    await new Promise(resolve=>setTimeout(resolve,0));
    if(destroyed)return;
    try{passResults=findISSPasses(state.date,getObserver(),{hours:24,maxPasses:20,visibleOnly:state.issVisiblePassesOnly});
      $('iss-passes').replaceChildren();
      const summary=document.createElement('p');summary.className='fineprint';summary.textContent=`24 hours from ${formatPassTime(passResults.start,state.timeZone)} · ${passResults.observer.latitude.toFixed(3)}°, ${passResults.observer.longitude.toFixed(3)}°`; $('iss-passes').appendChild(summary);
      if(!passResults.passes.length)$('iss-passes').textContent=passResults.unavailable?'No usable orbit data at this date.':'No matching passes in the next 24 hours.';
      for(const pass of passResults.passes){const button=document.createElement('button');button.className='pass-result';button.textContent=`${formatPassTime(pass.peak.date,state.timeZone)} · ${pass.peak.elevation.toFixed(1)}° max · ${Math.round(pass.durationSeconds)} s · ${pass.visible?'visible':'geometric'}`;button.title=`Rise ${pass.rise.date} at ${pass.rise.azimuth.toFixed(0)}°; set ${pass.set.date} at ${pass.set.azimuth.toFixed(0)}°. ${pass.sourceModel}`;button.onclick=()=>visitTime(pass.peak.date);$('iss-passes').appendChild(button);}
      $('iss-passes-export').disabled=false;
    }catch(error){$('iss-passes').textContent=error.message;}finally{$('iss-predict').disabled=false;}
  };
  $('iss-passes-export').onclick=()=>{if(passResults)downloadJSON(passResults,'iss-pass-table.json');};
  const visible=()=>{if(!document.hidden)schedule();};document.addEventListener('visibilitychange',visible);
  function start(){
    for(const [kind,install] of [['iss',installISSData],['ephemeris',installEphemerisPackage]])try{const text=localStorage.getItem(cacheKeys[kind]);if(text)install(JSON.parse(text));}catch{report('Saved orbit data could not be restored; bundled data remain active.');}
    restoreSettings();changed();if(state.issAutoRefresh&&canDownload())refresh(false);
  }
  function destroy(){destroyed=true;clearTimeout(refreshTimer);document.removeEventListener('visibilitychange',visible);}
  return {sync,start,destroy,restoreSettings,refresh};
}
function formatPassTime(iso,zone){try{return new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(iso));}catch{return iso;}}
