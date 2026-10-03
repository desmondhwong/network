// Machine-authored: Codex / OpenAI. Local application; see ../../PROJECT.md.
import { validatedDate, stateAt, appendMoons, appendMinorBodies, MINOR_BODIES, MINOR_BODY_IDS, MOONS, MOON_IDS, horizontal, ECLIPSES, nextEclipses, findNextEclipse } from './astro.mjs';
import { Scene } from './scene.mjs';
import { SURFACE_BODY_IDS, bodySurfaceOpacity } from './body-surfaces.mjs';
import { findNextLunarEclipse } from './lunar-eclipse.mjs';
import { parseUTC, parseCoordinates, angularSeparation, diskOverlap } from './controls.mjs';
import { TIME_SPANS, timelineTicks, snapTimelineTime, automaticTimelineSpan, timelineSpanLabel, formatTimelineTick, timelineZoneContext } from './timeline.mjs';
import { GALACTIC_MODEL, galacticYearsAt } from './galactic.mjs';
import { formatDateInput, formatTimeInput, formatDateLabel, accuracyAt, jplAvailableAt, eclipseAvailableAt, addTime, timeKey, differenceMillis, yearOf } from './time.mjs';
import { zodiacAt, getZodiacEarthLines, astrologyAt } from './zodiac.mjs';
import { MiniGlobe, loadLand } from './mini-globe.mjs';
import { loadCities } from './surface-map.mjs';
import { moveObserverFrame, parseObserver, formatObserver, observerGeoJSON } from './observer.mjs';
import { standalone, localData, dataResponse } from './runtime.mjs';
import { captureWorkspace, parseWorkspace, captureArrangement, parseArrangement, SCENE_V7_DEFAULTS, SCENE_V8_DEFAULTS, SCENE_V9_DEFAULTS, SCENE_V10_DEFAULTS, SCENE_V11_DEFAULTS, SCENE_V12_DEFAULTS, SCENE_V13_DEFAULTS, SCENE_V15_DEFAULTS, SCENE_V16_DEFAULTS, SCENE_V17_DEFAULTS, ASTROLOGY_OBJECT_IDS } from './workspace.mjs';
import { RATE_UNITS, parsePlaybackRate, playbackUnitFor, magneticValue } from './playback.mjs';
import { renderFlightInstrument } from './instruments.mjs';
import { mountLayout } from './layout.mjs';
import { mountTouchFlight } from './touch-flight.mjs';
import { stellarCatalogueSummary } from './spatial-stars.mjs';
import { validTimeZone, zoneAt, formatZonedTime } from './time-zones.mjs';
import { ISS_METADATA, appendISS, getISSDataRevision } from './iss.mjs';
import { ISS_GEOMETRY } from './iss-geometry.mjs';
import { moonInfoAt } from './moon-info.mjs';
import { mountDataControls } from './data-controls.mjs';
import { createISSTelemetryClient } from './iss-telemetry.mjs';
import { encodeSharedView, decodeSharedView } from './shared-view.mjs';
import { controlCommands, mountCommandMenu } from './commands.mjs';
import { LAUNCH_SITES, LAUNCH_SITE_PLACES } from './launch-sites.mjs';

const $ = id => document.getElementById(id);
const day = 86400000;
const state = { date: new Date(Date.now()), selected: 'Sun', mode: 'space', latitude: 40.7128, longitude: -74.006, theme: 'dark', orbits: true, labels: true, scale: 'true', fov: 60, trackSun: false, playing: false, liveNow: false, speed: 86400, panel: 'bodies', span: 'year', activeEvent: null, height: 0, refraction: 'none', trailYears: 2, trailFrame: 'galactic', trailBodies: undefined, showStars: true, showConstellations: false, stars: [], constellations: [] };
Object.assign(state,{unifiedFlight:true,showSolarOrbit:true,bodyScale:1,markerMode:'schematic',markerSize:1,keepSolarVisible:false,solarDistanceScale:1e7,showGalacticTrails:true,galacticCoils:12,earthOpacity:1,showSurfaceMap:true,showCities:true,curvature:1,heading:0,moveSpeed:3000000,galacticYears:0,galacticSpeed:1000000,galacticPlaying:false});
Object.assign(state,{autoTimelineSpan:true,showFlightStats:true,showConstellationNames:false,showStellarMotion:true,showSurfaceMarkings:true,surfaceOpacity:1,surfaceOpacities:{}});
Object.assign(state,{animateNavigation:true,showSurfaceGrid:true,surfaceGridSpacing:10,surfaceGridOpacity:.4,showSurfaceTexture:true,surfaceTextureOpacity:.55,showSurfacePin:true,surfacePinHeight:1,surfacePin:null,showZodiacLabels:true,zodiacOpacity:.16});
Object.assign(state,SCENE_V7_DEFAULTS,SCENE_V8_DEFAULTS,SCENE_V9_DEFAULTS,SCENE_V10_DEFAULTS,SCENE_V11_DEFAULTS,SCENE_V12_DEFAULTS,SCENE_V13_DEFAULTS,SCENE_V15_DEFAULTS, SCENE_V16_DEFAULTS, SCENE_V17_DEFAULTS,{showEclipticLongitudes:false,showAstrology:false,showZodiac:false,showZodiacOutline:true,showZodiacGrid:false,showZodiacLabels:true,zodiacRadiusEarth:5,zodiacGridOpacity:.5,eclipticRadiusEarth:5,eclipticOpacity:.5,showClusterLabels:false,moonVisibility:{...SCENE_V12_DEFAULTS.moonVisibility},astrologyObjects:Object.fromEntries(ASTROLOGY_OBJECT_IDS.map(id=>[id,{...SCENE_V10_DEFAULTS.astrologyObjects[id]}])),surfacePinHeight:2,pinSpeedMultiplier:10});
let numberDestination=null,numberPreset=0,opacityBody='Earth';
const panelVisibility={source:true,heading:true,inspector:true,observer:true,map:true,tools:true,timeline:true};
let density='normal', revealed=false, revealVisibility=null, revealTimelineCollapsed=false, panelsHidden=false, revealPanelsHidden=false, lastArrangement='', jplGeneration=0, workspaceImportGeneration=0, workspaceImportPending=false;
let timelineCollapsed=false, magneticSnap=true, globe, layout, land=null, cities=null, calculationCache=null;
let topbarHidden=false, revealTopbarHidden=false, stellarCatalogueText='';
let dataControls=null,telemetryClient=null,motionUITimer=null,lastViewInputKey='';
const places = { 'new-york': [40.7128,-74.006], london:[51.5074,-.1278], dallas:[32.7767,-96.797], luxor:[25.6872,32.6396], sydney:[-33.8688,151.2093], ...LAUNCH_SITE_PLACES };
const dateFormatters=new Map();
const fmt=(date,options)=>{const key=JSON.stringify(options);let formatter=dateFormatters.get(key);if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...options});dateFormatters.set(key,formatter);}return formatter.format(date);};
const number = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : '—';
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const report = text => { $('status').textContent = text; };
let bodies = [], sky = [], scene, frame, clockStartFrame = null, clockStartDate = null, lastUI = -Infinity, lastTables = -Infinity, coilPointer = null, coilFrame = null, coilDate = null, touchFlight, initialMessage = '', modelEvent = null, jplSnapshot = null, jplLoading = false, jplMessage = '', jplError = false;
try { const theme = localStorage.getItem('solar-system-theme'); if (['light','dark'].includes(theme)) state.theme = theme; } catch {}

try {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('date')) state.date = validatedDate(hash.get('date'));
  if (hash.has('lat') && hash.has('lon')) Object.assign(state, parseCoordinates(hash.get('lat'), hash.get('lon')));
  if (hash.get('view')==='surface') state.selected='Earth';
  else if (['space','system','track','coil','galactic'].includes(hash.get('view'))) state.mode='space';
} catch { initialMessage = 'Saved date or coordinates were invalid; default values retained.'; }

try {
  scene = new Scene($('scene'), {
    onSelect(id) { if(density==='zen'&&!revealed&&zenTap?.pointerType==='touch')return;selectBody(id==='Solar system'?'Sun':id,true); },
    onMove:moveOnEarth,
    onAstrologyPick:updateAstrologyHover,
    onViewChange(view) {
      if(view.observer?.bodyId==='Earth'){Object.assign(state,parseCoordinates(view.observer.latitude,view.observer.longitude));$('place').value='custom';}
      if(Number.isFinite(view.fov)&&view.fov!==state.fov){state.fov=view.fov;syncFov();}
      if(view.manualAim){clearTracking();$('track-sun').setAttribute('aria-pressed','false');}
      if(Number.isFinite(view.heading)){state.heading=((view.heading%360)+360)%360;}
      const selectionChanged=!!view.selected&&view.selected!==state.selected;
      if(view.selected)state.selected=view.selected;
      state.mode='space';
      const nearEarth=!view.flight?.tether&&scene?.earthFlightLocation?.()?.altitudeM<=100000;
      const now=performance.now();
      const inputKey=[...scene.heldKeys].sort().join(',')+`:${scene.pointers.size}:${!!scene.navigationAnimation}:${!!scene.zoomAnimation}:${scene.flight?.tether?.bodyId??''}:${scene.flight?.followBody??''}`;
      const inputChanged=inputKey!==lastViewInputKey;lastViewInputKey=inputKey;
      // drawPending coordinates paint order; only active input permits slower UI.
      const moving=scene.deferredInputPaint||scene.pointers.size||scene.heldKeys.size||scene.navigationAnimation||scene.zoomAnimation;
      const motion=!!(view.drawPending&&!selectionChanged&&moving&&!inputChanged);
      const syncUI=!motion||now<lastUI||now-lastUI>=100;
      if(view.observer||view.selected||nearEarth)render(selectionChanged,{paint:!view.drawPending,animation:motion,now});
      else if(syncUI){lastUI=now;syncObserverAux();syncSpaceReadout();syncZoomReadout();applyPanels({stats:false});}
      clearTimeout(motionUITimer);
      if(motion){motionUITimer=setTimeout(()=>{motionUITimer=null;if(!document.hidden)render(false,{paint:false});},120);motionUITimer.unref?.();}

    }
  });
} catch (error) { $('render-error').hidden = false; console.error(error); }
try { globe=new MiniGlobe($('mini-globe'),{onObserverChange:(position,context)=>moveToMapPin(position,context?.bodyId),onHeightChange:(height,context)=>setCameraHeight(height,context?.bodyId),onDoubleClick:(position,context)=>moveToMapPin(position,context?.bodyId,{enter:true})}); }
catch(error){report('Mini globe could not start.');console.error(error);}

function activePanels(){return revealed?revealVisibility:panelVisibility;}
function activePanelsHidden(){return revealed?revealPanelsHidden:panelsHidden;}
function activeTimelineCollapsed(){return revealed?revealTimelineCollapsed:timelineCollapsed;}
function activeTopbarHidden(){return revealed?revealTopbarHidden:topbarHidden;}
function chromeState(){return {topbar:activeTopbarHidden(),sidebar:activePanelsHidden(),timeline:activeTimelineCollapsed()||!activePanels().timeline};}
function setChrome(part,hidden){
  if(part==='topbar'){if(revealed)revealTopbarHidden=hidden;else topbarHidden=hidden;}
  if(part==='sidebar'){
    if(revealed)revealPanelsHidden=hidden;else panelsHidden=hidden;
    const sidebarKeys=['source','inspector','observer','map','tools'];
    if(!hidden&&sidebarKeys.every(key=>!activePanels()[key]))for(const key of sidebarKeys)activePanels()[key]=true;
  }
  if(part==='timeline'){if(revealed)revealTimelineCollapsed=hidden;else timelineCollapsed=hidden;if(!hidden)activePanels().timeline=true;}
}
function changeChrome(part,hidden=!chromeState()[part]){
  // A recovery button can leave Zen without requiring access to a hidden menu.
  if(density==='zen'&&!revealed){density='normal';setChrome('topbar',true);setChrome('sidebar',true);setChrome('timeline',true);hidden=false;}
  setChrome(part,hidden);layout?.close();render(true);$('scene').focus();
  if(part==='sidebar'&&!hidden&&layout?.compact)layout.open();
  report(`${part==='topbar'?'Top menu':part==='sidebar'?'Sidebar':'Timeline'} ${hidden?'hidden':'shown'}.`);
}
function toggleChrome(){
  const before=chromeState(),anyHidden=Object.values(before).some(Boolean)||Object.values(activePanels()).some(visible=>!visible)||(density==='zen'&&!revealed);
  if(anyHidden&&density==='zen'&&!revealed)density='normal';
  for(const key of Object.keys(panelVisibility))activePanels()[key]=anyHidden;
  for(const part of Object.keys(before))setChrome(part,!anyHidden);
  layout?.close();render(true);$('scene').focus();report(anyHidden?'All panels shown.':'All panels hidden. H shows them.');
}
function applyPanels({stats=true}={}){
  const visibility=activePanels(), collapsed=activeTimelineCollapsed();
  const zen=density==='zen'&&!revealed, topHidden=zen||activeTopbarHidden(), sideHidden=zen||activePanelsHidden(), timeHidden=zen||!visibility.timeline||collapsed;
  if(sideHidden||!visibility.tools)touchFlight?.release();
  $('app').dataset.density=density;
  $('app').dataset.revealed=String(revealed);
  $('app').dataset.panelHidden=String(activePanelsHidden());
  $('app').dataset.topbarHidden=String(topHidden);$('app').dataset.sidebarHidden=String(sideHidden);$('app').dataset.timelineHidden=String(timeHidden);
  document.querySelector('.topbar').hidden=topHidden;
  for(const [id,hidden] of [['reveal-topbar',topHidden],['reveal-sidebar',sideHidden||(topHidden&&layout?.compact)],['reveal-timeline',timeHidden]])if($(id))$(id).hidden=!hidden;
  if($('toggle-chrome'))$('toggle-chrome').setAttribute('aria-pressed',String(topHidden&&sideHidden&&timeHidden));
  if($('toggle-topbar'))$('toggle-topbar').setAttribute('aria-pressed',String(topHidden));
  $('workspace-return').hidden=!revealed;
  $('workspace-density').value=density;
  $('source-panel').hidden=!visibility.source;
  $('view-heading').hidden=topHidden||!visibility.heading;
  const sidebarVisible=visibility.inspector||(earthObserverActive()&&visibility.observer);
  document.body.classList.toggle('quiet',!sidebarVisible);$('inspector-column').hidden=!sidebarVisible;
  $('inspector').hidden=!visibility.inspector;
  $('observer-panel').hidden=!earthObserverActive()||!visibility.observer;
  if($('astrology-panel'))$('astrology-panel').hidden=!visibility.inspector;
  if($('eclipses-panel'))$('eclipses-panel').hidden=!visibility.inspector;
  if($('astrology-calculations'))$('astrology-calculations').hidden=!earthObserverActive();
  $('alignments-panel').hidden=!earthObserverActive();
  if($('astrology-context'))$('astrology-context').textContent=earthObserverActive()?'Earth-centered tropical coordinates · current UTC and observer':'Astrology is available with Earth selected or surface-locked.';
  $('astrology-controls')?.querySelectorAll('input,select,button').forEach(control=>control.disabled=!earthObserverActive());
  if($('show-longitude-points'))$('show-longitude-points').disabled=!earthObserverActive()||!state.showEclipticLongitudes;
  $('mini-map-panel').hidden=!surfaceBody()||!visibility.map;
  if($('body-surface-panel'))$('body-surface-panel').hidden=!surfaceBody()||!visibility.tools;
  if($('surface-opacity-panel'))$('surface-opacity-panel').hidden=!visibility.tools;
  $('trail-controls').hidden=state.mode!=='space'||!visibility.tools;$('galactic-controls').hidden=state.mode!=='space'||!visibility.tools;
  if($('iss-panel'))$('iss-panel').hidden=!visibility.tools;
  if($('moon-panel'))$('moon-panel').hidden=!visibility.tools;
  if($('flight-director-panel'))$('flight-director-panel').hidden=!visibility.tools;
  $('flight-controls').hidden=!visibility.tools;$('view-tools').hidden=!visibility.tools;
  $('controls').hidden=timeHidden;
  $('timeline-content').hidden=collapsed;
  $('timeline-collapse').setAttribute('aria-expanded',String(!collapsed));
  $('timeline-collapse').textContent='Hide';
  $('timeline-collapse').setAttribute('aria-label',collapsed?'Expand timeline':'Collapse timeline');
  $('timeline-collapse').title=collapsed?'Expand timeline':'Collapse timeline';
  document.querySelectorAll('[data-visibility]').forEach(input=>{input.checked=visibility[input.dataset.visibility];});
  $('quiet').setAttribute('aria-pressed',String(activePanelsHidden()));$('quiet').textContent=activePanelsHidden()?'Show sidebar · P':'Hide sidebar · P';
  if(stats)syncFlightStats();
}
function clearTracking(){state.trackSun=false;state.trackBody=null;}
function trackingTarget(){return state.trackBody??(state.trackSun?'Sun':null);}
function syncClocks(){
  if($('live-now'))$('live-now').setAttribute('aria-pressed',String(state.liveNow));
  const offset=differenceMillis(state.date,new Date(Date.now()))/1000;
  const delta=Number.isFinite(offset)&&Math.abs(offset)<86400*365?`${Math.abs(offset).toFixed(Math.abs(offset)<10?1:0)} s ${offset<0?'behind':'ahead'}`:'remote date';
  if($('clock-mode'))$('clock-mode').textContent=`${state.liveNow?'Live':state.playing?'Simulation':'Paused'} · ${delta}`;
  $('zone-date').textContent=`${formatZonedTime(state.date,state.timeZone)} · ${state.timeZone}`;
  const t=scene?.camera?.flight?.tether, output=$('pin-local-time');
  output.hidden=!pinMode();
  if(!pinMode())return;
  if(t.bodyId==='ISS'){output.textContent=`ISS onboard · ${formatZonedTime(state.date,'UTC')} · UTC`;return;}
  if(t.bodyId!=='Earth'){output.textContent=`${t.bodyId} pin · no civil time zone`;return;}
  const automatic=state.pinTimeZone==='auto',zone=automatic?zoneAt(t.latitude,t.longitude):state.pinTimeZone;
  output.textContent=zone?`Pin local · ${formatZonedTime(state.date,zone)} · ${zone}${automatic?' (estimated zone)':''}`:'Pin local · time zone unavailable';
}
function syncPinTracking(){
  const active=pinMode(),body=scene?.camera?.flight?.tether?.bodyId;
  $('pin-tracking-controls').hidden=!active;
  const select=$('pin-track-target');
  for(const option of select.options){const disabled=option.value===body;if(option.disabled!==disabled)option.disabled=disabled;}
  // A native select can hold a pending choice until change fires. Playback must
  // not write its previous value while the picker is focused/open.
  if(trackingTarget()&&document.activeElement!==select&&select.value!==trackingTarget())select.value=trackingTarget();
  if(select.value===body)select.value=body==='Sun'?'Earth':'Sun';
  $('pin-track-body').setAttribute('aria-pressed',String(!!trackingTarget()));
  $('pin-track-body').textContent=trackingTarget()?`Stop tracking ${trackingTarget()}`:`Track ${select.value}`;
  $('aim-body').disabled=!active;$('pin-track-body').disabled=!active;
  const issStatus=$('iss-model-status'),iss=bodies.find(row=>row.id==='ISS');
  if(issStatus){issStatus.hidden=!active||select.value!=='ISS';issStatus.textContent=iss?`ISS · ${iss.status} · elements ${iss.epoch}`:'';}
}
function setFov(value){
  if(!Number.isFinite(value)||value<.12||value>90){$('fov-exact').setCustomValidity('Enter a field of view from 0.12 to 90 degrees.');report('FOV must be 0.12–90 degrees.');return;}
  $('fov-exact').setCustomValidity('');state.fov=value;scene?.setFov?.(value);syncFov();render();report(`Field of view ${number(value,2)}°.`);
}
function stepFov(factor){setFov(Math.max(.12,Math.min(90,state.fov*factor)));}
function onboardISS(){return scene?.camera?.flight?.tether?.bodyId==='ISS';}
function syncISSControls(){
  for(const [id,key] of [['show-iss','showISS'],['show-iss-orbit','showISSOrbit'],['iss-orbit-through-earth','issOrbitThroughEarth']])if($(id))$(id).checked=state[key];
  for(const [id,key] of [['iss-orbit-opacity','issOrbitOpacity'],['iss-orbit-width','issOrbitWidth'],['iss-orbit-color','issOrbitColor'],['iss-orbit-style','issOrbitStyle']])if($(id)&&document.activeElement!==$(id))$(id).value=String(state[key]);
  if($('iss-leave'))$('iss-leave').disabled=!onboardISS();
  if($('iss-onboard'))$('iss-onboard').setAttribute('aria-pressed',String(onboardISS()));
  const iss=bodies.find(body=>body.id==='ISS');
  if($('iss-panel-status'))$('iss-panel-status').textContent=iss?`${onboardISS()?'Onboard · station model hidden. ':''}${iss.status} · elements ${iss.epoch}`:'ISS orbit model loading.';
}
function visitISS(onboard=false){
  state.selected='ISS';state.showISS=true;clearTracking();scene?.stopMovement();render(true);
  if(onboard){
    scene?.togglePinMode?.({bodyId:'ISS',force:true,animate:false});render(true);
    finishNavigation('Onboard ISS. Drag to look; Leave onboard releases the station.');
  }else flyToSelected();
}
function syncEarthMoonControls(){
  if($('show-moon'))$('show-moon').checked=state.moonVisibility.Moon!==false;
  for(const [id,key] of [['show-moon-orbit','showMoonOrbit'],['moon-orbit-through-earth','moonOrbitThroughEarth']])if($(id))$(id).checked=state[key];
  for(const [id,key] of [['moon-orbit-opacity','moonOrbitOpacity'],['moon-orbit-width','moonOrbitWidth'],['moon-orbit-color','moonOrbitColor'],['moon-orbit-style','moonOrbitStyle']])if($(id)&&document.activeElement!==$(id))$(id).value=String(state[key]);
  if($('moon-surface'))$('moon-surface').setAttribute('aria-pressed',String(pinMode()&&scene?.camera?.flight?.tether?.bodyId==='Moon'));
}
function visitMoon(surface=false){
  state.selected='Moon';state.showMoons=true;state.moonVisibility={...state.moonVisibility,Moon:true};clearTracking();scene?.stopMovement();render(true);
  if(surface){
    scene?.flyTo?.('Moon',{surface:true,altitudeM:2,animate:false});
    scene?.togglePinMode?.({bodyId:'Moon',force:true,animate:false});render(true);
    finishNavigation('View from Moon · 2 m above the reference sphere. Pin controls move the viewpoint; choose Earth to aim or track.');
  }else flyToSelected();
  syncMoonControls();syncEarthMoonControls();
}
function renderMoonInfo(){
  const output=$('moon-info');if(!output)return;
  const info=moonInfoAt(state.date,{bodies});
  output.innerHTML=`<dl class="data-grid"><dt>Phase</dt><dd>${escape(info.phaseName)} · ${number(info.phaseDegrees,1)}°</dd><dt>Illuminated</dt><dd>${number(info.illuminatedPercent,1)}%</dd><dt>Earth center distance</dt><dd>${number(info.distanceKm,0)} km</dd><dt>Angular diameter</dt><dd>${number(info.angularDiameterArcmin,2)} arcmin</dd><dt>Light travel time</dt><dd>${number(info.lightTravelSeconds,2)} s</dd></dl><p class="fineprint">${escape(info.status)} Distance uses the current scene; phase uses ${escape(info.sourceModel)}.${info.eventSearchAvailable?' Event times use Astronomy Engine.':''}</p>${info.nextQuarters.length?`<h4>Next phases · UTC</h4><dl class="data-grid">${info.nextQuarters.map(event=>`<dt>${escape(event.name)}</dt><dd>${escape(event.dateISO.replace('T',' ').replace(/\.\d{3}Z$/,' UTC'))}</dd>`).join('')}</dl>`:'<p class="fineprint">Phase event search is available for 1800–2200.</p>'}`;
}
function pinMode(){return scene?.camera?.flight?.tether?.controlMode==='surface';}
function selectBody(id,toggle=false){state.selected=toggle&&state.selected===id?null:id;render(true);report(state.selected?`${state.selected} selected.`:'Selection cleared.');}
function surfaceBody(){
  const flight=scene?.camera?.flight;
  const id=flight?.tether?.bodyId??state.selected;
  return bodies.some(body=>body.id===id&&body.surfaceAvailable!==false)?id:bodies.some(body=>body.id===flight?.followBody&&body.surfaceAvailable!==false)?flight.followBody:null;
}
function currentSurfaceObserver(id=surfaceBody()){
  if(!id)return null;
  const tether=scene?.camera?.flight?.tether;
  if(tether?.bodyId===id)return {...tether,height:tether.altitudeM};
  const camera=scene?.bodySurfaceLocation?.(id);
  if(camera&&[camera.latitude,camera.longitude,camera.altitudeM].every(Number.isFinite))return {...camera,bodyId:id,height:Math.max(0,camera.altitudeM)};
  if(id==='Earth')return {...currentEarthObserver(),bodyId:id};
  return {bodyId:id,latitude:0,longitude:0,height:2,heading:0};
}
function syncSurfacePin(){
  const point=pinMode()?currentSurfaceObserver():null;
  state.surfacePin=point?{bodyId:point.bodyId,latitude:point.latitude,longitude:point.longitude,heightM:point.height}:null;
  if(point)state.surfacePinHeight=point.height;
}
function setCameraHeight(height,id=surfaceBody()){
  if(!Number.isFinite(height)||height<2||height>1e28){report('Camera height must be between 2 m and 1e28 m.');return false;}
  if(!pinMode()||scene?.camera?.flight?.tether?.bodyId!==id){report('Enter Pin mode to change camera height.');return false;}
  scene.setObserver({altitudeM:height});syncObserverAux();render();return true;
}

function moveToMapPin(position,id=surfaceBody(),{enter=false}={}){
  if(!id||id!==surfaceBody())return;
  if(enter)scene?.togglePinMode?.({bodyId:id,force:true,animate:false});
  if(!pinMode()||scene?.camera?.flight?.tether?.bodyId!==id)return;
  clearTracking();scene.setObserver(position);state.activeEvent=null;
  if(id==='Earth'){Object.assign(state,position);$('place').value='custom';}
  render(true);report(`${id} pin moved to ${number(position.latitude,3)}°, ${number(position.longitude,3)}°.`);
}
function syncObserverAux({draw=true,details=true}={}){
  if(earthObserverActive()&&Number.isFinite(scene?.camera?.heading))state.heading=scene.camera.heading;
  syncSurfacePin();
  if(!draw)return;
  const pinInput=$('surface-pin-height');if(pinInput){pinInput.disabled=!pinMode();if(document.activeElement!==pinInput)pinInput.value=Number(state.surfacePinHeight.toPrecision(12));}
  const observer=currentEarthObserver(),id=surfaceBody(),surface=currentSurfaceObserver(id);
  if(document.activeElement!==$('heading'))$('heading').value=number(state.heading,2);
  if(document.activeElement!==$('gps-value'))$('gps-value').value=formatObserver({...observer,...(observer.height>10000?{height:undefined}:{})});
  if($('surface-body-name'))$('surface-body-name').textContent=id?`${id} surface display`:'Surface display';
  if($('mini-map-title'))$('mini-map-title').textContent=id?`${id} globe${pinMode()?' · Pin mode':''}`:'Globe';
  if($('mini-globe-status'))$('mini-globe-status').textContent=pinMode()?'Drag the pin base to move. Drag the ball up to raise or down to lower the camera.':'Preview · double-click the globe to place a pin and enter Pin mode. G enters at the closest point.';
  if(surface){
    $('map-coordinates').textContent=pinMode()?`${id} · ${surface.latitude.toFixed(6)}°, ${surface.longitude.toFixed(6)}° · ${number(surface.height,2)} m`:`${id} · body-fixed overview`;
    if(!$('mini-map-panel').hidden&&(details||readoutVisible('mini-map-panel')))globe?.render({...Object.fromEntries(Object.keys(SCENE_V9_DEFAULTS).filter(key=>key.startsWith('pin')).map(key=>[key,state[key]])),surfaceOpacities:state.surfaceOpacities,surfaceOpacity:state.surfaceOpacity,earthOpacity:state.earthOpacity,earthMapStyle:state.earthMapStyle,earthImageDetail:state.earthImageDetail,pinMode:pinMode(),showEarthTerrain:state.showEarthTerrain,earthTerrainDetail:state.earthTerrainDetail,heightEditable:pinMode()&&scene?.camera?.flight?.tether?.bodyId===id,bodyId:id,latitude:surface.latitude,longitude:surface.longitude,height:surface.height,heading:Number.isFinite(surface.heading)?surface.heading:scene?.camera?.heading??state.heading,land,showSurfaceMarkings:state.showSurfaceMarkings,showSurfaceGrid:state.showSurfaceGrid,surfaceGridSpacing:state.surfaceGridSpacing,surfaceGridOpacity:state.surfaceGridOpacity,showSurfaceTexture:state.showSurfaceTexture,surfaceTextureOpacity:state.surfaceTextureOpacity,showSurfacePin:state.showSurfacePin,surfacePin:state.surfacePin,showZodiacLabels:state.showZodiacLabels,zodiacOpacity:state.zodiacOpacity,showZodiac:id==='Earth'&&state.showAstrology&&state.showZodiacOutline,zodiac:id==='Earth'&&state.showZodiacOutline?getZodiacEarthLines(state.date):null});
  }
}
function currentEarthObserver(){const t=scene?.camera?.flight?.tether;if(t?.bodyId==='Earth')return {latitude:t.latitude,longitude:t.longitude,height:t.altitudeM};if(!t&&scene?.state&&timeKey(scene.state.date)===timeKey(state.date)){const earth=scene.earthFlightLocation?.();if(earth&&earth.altitudeM<=100000)return {latitude:earth.latitude,longitude:earth.longitude,height:earth.altitudeM};}return {latitude:state.latitude,longitude:state.longitude,height:state.height};}
function setEarthObserver(position){
  const t=scene?.camera?.flight?.tether;
  if(!t&&scene?.earthFlightLocation?.()?.altitudeM<=100000)scene.flyTo('Earth',{surface:true,altitudeM:currentEarthObserver().height});
  if(scene?.camera?.flight?.tether?.bodyId==='Earth')scene.setObserver(position);
}
function earthObserverActive(){return surfaceBody()==='Earth';}
function syncNavigation(){
  const flight=scene?.camera?.flight,tether=flight?.tether;
  $('flight-status').textContent=onboardISS()?`ISS onboard · ${pinMode()?'Pin view':'orbital frame lock'} · illustrative station attitude`:tether?`${tether.controlMode==='free'?'Free camera · spin lock':'Pin mode'} · ${tether.bodyId} · ${number(tether.latitude,3)}°, ${number(tether.longitude,3)}°`:flight?.followBody?`Following ${flight.followBody} orbit · freely steerable`:'Free flight · movement speed adapts to distance';
  $('free-flight').disabled=!tether&&!flight?.followBody;$('free-flight').textContent='Release all locks';
  $('follow-orbit').checked=!!flight?.followBody;$('follow-orbit').disabled=!!tether;
  const lockTarget=scene?.resolveLockTarget?.(),canPin=!!lockTarget&&bodies.some(body=>body.id===lockTarget&&(body.id==='ISS'||body.surfaceAvailable!==false));
  $('tether-surface').disabled=!tether&&!canPin;
  $('tether-surface').textContent=onboardISS()?'Leave onboard frame · F':tether?'Release surface lock · F':lockTarget==='ISS'?'Lock onboard frame · F':'Lock surface here · F';
  $('tether-surface').title=lockTarget==='ISS'?'Enter or release the fixed ISS onboard frame (F)':'Toggle surface spin lock without moving the camera (F)';
  $('tether-surface').setAttribute('aria-pressed',String(!!tether));
  $('fly-target').textContent=flight?.followBody||tether?'Release all locks · L':'Lock orbit here · L';
  $('fly-target').setAttribute('aria-pressed',String(!!flight?.followBody));
  if($('snap-surface')){$('snap-surface').disabled=!bodies.some(body=>body.id===state.selected&&(body.id==='ISS'||body.surfaceAvailable!==false));$('snap-surface').textContent=state.selected==='ISS'?'View from ISS · Shift+F':'Land upright · Shift+F';}
  if($('snap-surface'))$('snap-surface').title=state.selected==='ISS'?'Enter the ISS onboard view (Shift+F)':'Land upright on the destination reference sphere (Shift+F)';
  if($('reset-surface')){$('reset-surface').disabled=!flight;$('reset-surface').textContent=onboardISS()?'Reset station frame · R':tether?'Reset surface plane · R':'Reset Galactic plane · R';}
  $('tether-height-control').hidden=true;
  if($('surface-control-mode')){$('surface-control-mode').disabled=!tether;$('surface-control-mode').value=tether?.controlMode??'free';}
  if(tether&&document.activeElement!==$('tether-height'))$('tether-height').value=Number(tether.altitudeM.toPrecision(10));
  $('view-index').textContent=onboardISS()?'Onboard ISS':tether?'Surface lock':flight?.followBody?'Orbit lock':'Free flight';
  $('view-title').textContent=onboardISS()?'ISS · orbital view':tether?`${tether.bodyId} · ${number(tether.altitudeM/1000,3)} km high`:state.selected??'No selection';
  if($('camera-status'))$('camera-status').textContent=`${pinMode()?'Pin mode':'Free camera'} · Selected: ${state.selected??'none'} · Orbit: ${flight?.followBody??'off'} · Spin: ${tether?.bodyId??'off'}`;
  if($('pin-mode')){$('pin-mode').setAttribute('aria-pressed',String(pinMode()));$('pin-mode').textContent=pinMode()?'Exit Pin mode · G':'Enter Pin mode · G';$('pin-mode').disabled=!pinMode()&&!canPin;}
  if($('snap-pin'))$('snap-pin').disabled=!pinMode()&&!canPin;
  if($('pin-speed'))$('pin-speed').disabled=onboardISS();
  if($('pin-mode'))$('pin-mode').title=lockTarget==='ISS'?'Enter or change the ISS onboard Pin controls (G)':'Enter or leave Pin mode without moving the camera (G)';
  if($('snap-pin'))$('snap-pin').title=lockTarget==='ISS'?'Restore the Earth-facing ISS onboard view (Shift+G)':'Drop a pin, reset pitch and roll and lower to 2 meters (Shift+G)';
  $('field-hint').textContent=onboardISS()?'Onboard ISS · drag to look · arrows roll / pitch · , / . yaw · Leave onboard to fly freely':tether&&tether.controlMode!=='free'?'W A S D tangent · Q / E height · drag looks · Shift-drag pans · Option-drag orbits':'W A S D Q E flies · arrows roll / pitch · , / . yaw · drag looks · Shift-drag pans · Option-drag orbits';
  $('aim-sun').hidden=true;$('track-sun').hidden=true;$('fov-control').hidden=false;
  syncPinTracking();syncClocks();syncISSControls();syncEarthMoonControls();
  syncFlightStats();
}
function syncFlightStats(){
  const hud=$('flight-stats'),text=$('flight-stats-text');if(!hud||!text)return;hud.hidden=!state.showFlightStats;
  const stats=scene?.getCameraInfo?.()??scene?.getFlightStats?.();if(!stats){text.textContent='Flight stats ready on camera initialization';return;}
  const value=n=>Number.isFinite(n)?(Math.abs(n)>=1e7||Math.abs(n)>0&&Math.abs(n)<.001?n.toExponential(2):Number(n.toPrecision(4)).toLocaleString('en-US')):'—';
  const speed=stats.speedMps>=1e6?`${value(stats.speedMps/1000)} km/s`:`${value(stats.speedMps)} m/s`;
  const details=[`Camera ${speed}`,stats.frame,stats.referenceBody?`${stats.referenceBody}: orbit ${value(stats.orbitalSpeedKmS)} km/s · spin ${value(stats.surfaceSpinSpeedKmS)} km/s`:null,stats.heightM!=null?`Height ${value(stats.heightM/1000)} km`:null,`FOV ${value(stats.fovDegrees)}°`,pinMode()?`Pin ${value(stats.pinSpeedMps)} m/s · ${value(stats.pinAngularSpeedDegS)}°/s · ×${value(state.pinSpeedMultiplier)}`:null];
  text.innerHTML=details.filter(Boolean).map(item=>`<span>${escape(item)}</span>`).join('');
  if($('pin-speed-stats'))$('pin-speed-stats').textContent=onboardISS()?'Fixed onboard viewpoint · drag to look; Leave onboard to move freely.':pinMode()?`${value(stats.pinSpeedMps)} m/s · ${value(stats.pinAngularSpeedDegS)}°/s · Shift: 1% speed`:'Pin speed scales with body radius. G enters Pin mode.';
  const roll=Number.isFinite(stats.rollDegrees)?stats.rollDegrees:0,pitch=Number.isFinite(stats.pitchDegrees)?stats.pitchDegrees:0;
  const heading=Number.isFinite(stats.headingDegrees)?stats.headingDegrees:0,yaw=Number.isFinite(stats.yawControl)?stats.yawControl:0;
  const headingText=`${number(heading,1)}° ${stats.compassCardinal??''} · ${stats.compassReference??'Galactic axes'}`;
  const instrument={rollDegrees:roll,pitchDegrees:pitch,headingDegrees:heading,yawControl:yaw,pinMode:pinMode(),theme:state.theme};
  for(const [id,kind] of [['attitude-horizon','horizon'],['attitude-yaw','yaw'],['flight-director','director']])if($(id))renderFlightInstrument($(id),instrument,kind);
  if($('flight-attitude'))$('flight-attitude').setAttribute('aria-label',`Camera attitude: roll ${number(roll,1)} degrees, pitch ${number(pitch,1)} degrees`);
  if($('attitude-roll'))$('attitude-roll').textContent=`Roll ${number(roll,1)}°`;
  if($('attitude-pitch'))$('attitude-pitch').textContent=`Pitch ${number(pitch,1)}°`;
  if($('attitude-heading'))$('attitude-heading').textContent=`Heading ${headingText}`;
  const yawText=`Yaw ${yaw===0?'neutral':yaw<0?'left':'right'} · ${number(stats.yawRateDegreesS??0,1)}°/s`;
  if($('yaw-readout'))$('yaw-readout').textContent=yawText;
  if($('pin-compass-readout')){$('pin-compass-readout').hidden=!pinMode();$('pin-compass-readout').textContent=`Compass ${headingText}`;}
  if($('flight-director-readout'))$('flight-director-readout').textContent=`${pinMode()?'Pin':'Free'} · ${headingText} · Roll ${number(roll,1)}° · Pitch ${number(pitch,1)}° · ${yawText}`;
  hud.title=`Position: ${(stats.positionAU??[]).map(value).join(', ')} AU (${stats.positionFrame}). Scale: ${value(stats.scaleAUPerPixel)} AU/px. Available flight speed ${value(stats.navigationSpeedMps)} m/s.`;
}
function moveOnEarth({forward=0,right=0,up=0,seconds=.1,slow=false}={}){
  scene?.moveFlight?.({forward,right,up,seconds,slow});
}
function syncSpaceReadout(){
  $('distance-scale-note').textContent='One physical distance scale. Small distant bodies retain selectable symbols; the camera and tether use actual radii.';
}
function syncZoomReadout(){
  const flight=scene?.camera?.flight,tether=flight?.tether;
  $('zoom-level').textContent=onboardISS()?'Onboard ISS':tether?`${tether.bodyId} · ${tether.altitudeM>=1000?`${number(tether.altitudeM/1000,1)} km`:`${number(tether.altitudeM,1)} m`}`:'Free flight';
  $('zoom-level').title=onboardISS()?'Onboard viewpoint follows the station. Leave onboard to fly freely.':'Scroll travels toward the cursor. Surface tether stays engaged until released; Q / E changes its height.';
  $('space-display-controls').hidden=false;
  syncNavigation();
}

function syncFov() {
  if(document.activeElement!==$('fov-exact'))$('fov-exact').value=String(Number(state.fov.toFixed(4)));
  const select = $('fov');
  let custom = select.querySelector('[data-custom]');
  const exact = [...select.options].find(o => !o.dataset.custom && Math.abs(Number(o.value) - state.fov) < .001);
  if (exact) { select.value = exact.value; custom?.remove(); }
  else { if (!custom) { custom = new Option(); custom.dataset.custom = 'true'; select.add(custom); } custom.value = String(state.fov); custom.textContent = `${number(state.fov,1)}° · custom`; select.value = custom.value; }
}
function setDate(date, message, {keepLive=false,animation=false}={}) {
  try{state.date=validatedDate(date);clockStartFrame=null;if(!keepLive)state.liveNow=false;}catch(error){report(error.message);return;}
  render(!animation,{animation});
  if (message) report(message);
}
function setMode(){state.mode='space';render(true);}
function finishNavigation(message){syncNavigation();applyPanels({stats:false});syncObserverAux();layout?.sync();report(message);$('scene').focus();}
function flyToSelected(){
  if(!state.selected){report('Select a destination first.');return;}
  scene?.stopMovement();state.mode='space';clearTracking();render(true);
  scene?.flyTo?.(state.selected,{animate:state.animateNavigation});
  finishNavigation(`Framed ${state.selected} and following its orbit. L releases.${state.selected==='ISS'?'':' Shift+F lands upright.'}`);
}
function toggleOrbit(){
  clearTracking();
  if(scene?.toggleOrbitLock?.())finishNavigation(scene.camera.flight.followBody?`Orbit locked to ${scene.camera.flight.followBody}. Position and view retained.`:'Orbit lock released. Position and view retained.');
  else finishNavigation('Point at or select the Sun, a planet or the Moon to attach an orbit lock.');
}
function toggleTether(){
  if($('tether-surface').disabled){finishNavigation('Surface lock is unavailable for this destination. Choose Earth or another body with a reference surface.');return;}
  clearTracking();
  if(scene?.toggleSurfaceLock?.())finishNavigation(onboardISS()?'Onboard ISS. Drag to look; Leave onboard releases the station.':scene.camera.flight.tether?`Spin-locked to ${scene.camera.flight.tether.bodyId}. Free camera; G enters Pin mode.`:'Attachment released; orbital following retained. Position and view retained.');
  else finishNavigation('Surface lock is unavailable here. Select a body and use Land upright / Shift+F to move to its reference surface.');
}
function snapSurface(){
  clearTracking();
  if(scene?.landOnSurface?.(state.selected,{animate:state.animateNavigation})){render(true);finishNavigation(state.selected==='ISS'?'Onboard ISS. Drag to look; use Leave onboard to fly freely.':`Landed upright on ${state.selected}. Free camera; G enters Pin mode.`);}
  else finishNavigation('Select the Sun, a planet or the Moon to land on its reference sphere.');
}
function togglePin(low=false){
  clearTracking();
  if(scene?.togglePinMode?.({low,animate:state.animateNavigation})){
    render(true);finishNavigation(onboardISS()?'ISS onboard view. Drag to look; G changes Pin controls; Leave onboard releases the station.':pinMode()?(low?'Pin lowering to 2 m and resetting pitch and roll.':'Pin mode on. Position and view retained. G exits; Shift+G lowers to 2 m.'):'Pin mode off. Spin and orbit locks retained.');
  }else finishNavigation('Select the Sun, a planet or the Moon to enter Pin mode.');
}
function jumpDestination(id,{cycle=false}={}){
  const repeated=cycle&&numberDestination===id;
  numberPreset=repeated?numberPreset%3+1:0;numberDestination=cycle?id:null;
  const preset=['relative','default','solar','surface'][numberPreset];
  clearTracking();
  scene?.jumpToBody?.(id,{preset,animate:state.animateNavigation});
  finishNavigation(`${id} · ${['matching body-relative view','default orbital view','Sun relationship view','upright surface view'][numberPreset]}. Repeated number presses cycle views.`);
}
function navigateMode(mode){
  layout?.close();
  if(mode==='surface'){state.selected='Earth';render(true);scene?.flyTo?.('Earth',{surface:true,altitudeM:30});}
  else scene?.releaseAllLocks?.();
  state.mode='space';render(true);
}

function panel(name, focus = false) {
  state.panel = name;
  document.querySelectorAll('[data-panel]').forEach(button => { const selected = button.dataset.panel === name; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; if (selected && focus) button.focus(); });
  $('bodies-panel').hidden=false;$('events-panel').hidden=false;$('alignments-panel').hidden=!earthObserverActive();
  const section=$(name==='events'?'eclipses-panel':name==='alignments'?'astrology-panel':'inspector');if(section){section.open=true;if(focus)section.querySelector('summary')?.focus();}
  render(true);
  if (name === 'events') searchEclipse();
}
function play(value = !state.playing) {
  if (value && activeJpl()) { report('Use calculated data to enable playback. JPL values are for one instant.'); return; }
  state.galacticPlaying=false;
  state.playing = value;
  if(!value)state.liveNow=false;
  $('galactic-play').setAttribute('aria-pressed','false');$('galactic-play').textContent='Play Galactic rate';
  $('play').setAttribute('aria-pressed', String(value));
  $('play').textContent = value ? 'Pause' : 'Play';
  cancelAnimationFrame(frame); clockStartFrame = null; lastUI = -Infinity;
  if ((value||state.galacticPlaying) && !document.hidden) frame = requestAnimationFrame(tick);
  if(!value)render(); // Flush the final clock instant even between throttled display frames.
  report(value ? 'Time running.' : 'Time paused.');
}
function tick(now) {
  if ((!state.playing&&!state.galacticPlaying) || document.hidden) return;
  if (clockStartFrame===null){clockStartFrame=now;clockStartDate=state.date;}
  if(state.playing){
    // Compute from one clock anchor: fractional milliseconds accumulate and the
    // displayed rate is independent of frame duration or paint throttling.
    state.date = state.liveNow ? new Date(Date.now()) : addTime(clockStartDate,Math.max(0,now-clockStartFrame)*state.speed);
  }
  render(false,{animation:true,now});
  frame = requestAnimationFrame(tick);
}

function activeJpl() {
  const observer=currentEarthObserver();
  return jplSnapshot && jplSnapshot.date === state.date.toISOString() && ['latitude','longitude','height'].every(key=>Math.abs(jplSnapshot.observer[key]-observer[key])<1e-8) ? jplSnapshot : null;
}
function validJplSnapshot(data, request) {
  const ids = stateAt(request.date).map(body => body.id), skyIds = ids.filter(id => id !== 'Earth');
  const validRows = (rows, expected, check) => Array.isArray(rows) && rows.length === expected.length && new Set(rows.map(row => row?.id)).size === expected.length && rows.every(row => row && expected.includes(row.id) && check(row));
  return data?.source === 'JPL Horizons' && data.date === request.date
    && ['latitude','longitude','height'].every(key => data.observer?.[key] === request[key])
    && validRows(data.bodies, ids, row => Array.isArray(row.position) && row.position.length === 3 && row.position.every(Number.isFinite) && Number.isFinite(row.distanceAU) && row.distanceAU >= 0 && (row.id === 'Earth' || [row.longitude,row.latitude,row.degree].every(Number.isFinite) && typeof row.sign === 'string'))
    && validRows(data.sky, skyIds, row => [row.altitude,row.azimuth,row.angularRadius,row.distanceAU].every(Number.isFinite) && Math.abs(row.altitude) <= 90 && row.azimuth >= 0 && row.azimuth <= 360 && row.angularRadius > 0 && row.distanceAU > 0);
}
function aspectsFromBodies(current) {
  const rows=current.filter(b=>ASTROLOGY_OBJECT_IDS.includes(b.id) && Number.isFinite(b.longitude)), result=[];
  const definitions=[['Conjunction',0],['Sextile',60],['Square',90],['Trine',120],['Opposition',180]];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const delta=Math.abs(((rows[i].longitude-rows[j].longitude+540)%360)-180);
    for(const [name,angle] of definitions){const orb=Math.abs(delta-angle);if(orb<=6)result.push({a:rows[i].id,b:rows[j].id,name,angle,orb});}
  }
  return result.sort((a,b)=>a.orb-b.orb);
}
function skyAtObserver(observer,precision){
  if(!(earthObserverActive()||state.trackSun)||observer.height>100000)return [];
  const key=[observer.latitude,observer.longitude,observer.height,state.refraction,!!precision].join(':');
  if(calculationCache.sky?.key!==key||calculationCache.sky?.precision!==precision)calculationCache.sky={key,precision,rows:bodies.filter(b=>ASTROLOGY_OBJECT_IDS.includes(b.id)).map(b=>({...b,...(precision?precision.sky.find(row=>row.id===b.id):horizontal(b.id,state.date,observer.latitude,observer.longitude,{height:observer.height,refraction:state.refraction}))}))};
  return calculationCache.sky.rows;
}
function astrologyForObserver(observer,precision){
  const key=[observer.latitude,observer.longitude,!!precision].join(':');
  if(calculationCache.astrology?.key!==key||calculationCache.astrology?.precision!==precision)calculationCache.astrology={key,precision,value:astrologyAt(state.date,observer.latitude,observer.longitude,{bodies:bodies.filter(body=>!body.parentId||body.id==='Moon')})};
  return calculationCache.astrology.value;
}
function readoutVisible(id){
  for(let node=$(id);node;node=node.parentElement){if(node.hidden)return false;if(node.tagName==='DETAILS'&&!node.open)return false;}
  return !chromeState().sidebar;
}
function setReadoutText(element,value){if(element.textContent!==value)element.textContent=value;}
function render(forceTables = false,{animation=false,now=performance.now(),paint=true}={}) {
  // Visual simulation follows requestAnimationFrame; controls need fewer writes.
  // Direct edits and the final paused instant always synchronize immediately.
  const updateUI=!animation||forceTables||now<lastUI||now-lastUI>=100;
  if(updateUI)lastUI=now;
  const dateKey=`${timeKey(state.date)}:${state.ephemerisMode}:${getISSDataRevision()}`;
  if(calculationCache?.time!==dateKey)calculationCache={time:dateKey,bodies:stateAt(state.date)};
  const calculated=calculationCache.bodies, precision=activeJpl(), accuracy=accuracyAt(state.date), observer=currentEarthObserver();
  bodies=precision?appendMinorBodies(appendISS(appendMoons(calculated.map(body=>({...body,...precision.bodies.find(row=>row.id===body.id)})),state.date),state.date),state.date):(calculationCache.allBodies??=appendMinorBodies(appendISS(appendMoons(calculated,state.date),state.date),state.date));
  sky=skyAtObserver(observer,precision);
  if(updateUI){
  const iss=bodies.find(body=>body.id==='ISS'),issSource=iss?.illustrative?'ISS: illustrative orbit':iss?.provider==='oem'?'ISS: NASA trajectory':iss?.provider==='supgp'?'ISS: SupGP prediction':'ISS: saved orbital elements';
  setReadoutText($('data-source'),(state.ephemerisMode==='cached'&&!precision?'Cached JPL geometric flight positions where covered; local apparent sky':precision?'Positions: JPL Horizons · loaded instant (core); added moons: local estimates':accuracy.label)+` · ${issSource}`);
  setReadoutText($('footer-source'),(state.ephemerisMode==='cached'&&!precision?'Cached JPL geometric flight / local sky':precision?'Core positions: JPL · added moons: local satellite models':accuracy.illustrative?'Illustrative orbital model':accuracy.extrapolated?'Extrapolated · accuracy unvalidated':'Astronomy Engine · ~1′ target accuracy')+` · ${issSource}`);
  setReadoutText($('date-precision'),accuracy.detail);
  $('find-next-eclipse').disabled=!eclipseAvailableAt(state.date);
  setReadoutText($('find-next-eclipse'),`Find next ${state.eclipseKind} eclipse`);
  setReadoutText($('events-explainer'),eclipseAvailableAt(state.date)?`Calculate the next ${state.eclipseKind} eclipse after the selected instant. View it from a computed Earth-surface observer.`:'Eclipse search is available for 1800–2200. Remote ephemerides are extrapolated; eclipse accuracy is unvalidated.');
  $('use-engine').hidden=!precision;
  $('load-jpl').disabled=standalone||jplLoading||!jplAvailableAt(state.date)||observer.height>10000;
  $('load-jpl').title=standalone?'JPL queries require the optional local server. This file calculates offline.':observer.height>10000?'JPL observer queries require a height at or below 10 km.':'';
  $('load-jpl').setAttribute('aria-busy',String(jplLoading));
  setReadoutText($('load-jpl'),jplLoading?'Loading JPL…':'Load JPL');
  $('play').disabled=!!precision;
  $('play').setAttribute('aria-pressed',String(state.playing));
  setReadoutText($('play'),state.playing?'Pause':'Play');
  $('source-status').dataset.state=jplError?'error':jplLoading?'pending':'ready';
  setReadoutText($('source-status'),jplLoading?'JPL request in progress; calculated data remain displayed.':precision?`UTC ${formatDateInput(state.date)} ${formatTimeInput(state.date)} · source kernels retained`:jplMessage||(accuracy.illustrative?'Remote calendar · illustrative orbital model; no ephemeris accuracy is claimed.':standalone?'Offline copy · JPL queries require the local server.':!jplAvailableAt(state.date)?'JPL retrieval is available for 1800–2200; this date uses the extrapolated model.':'Load JPL for direct ephemeris data.'));
  for(const id of ['show-stars','show-constellations','show-constellation-names','show-stellar-motion'])$(id).disabled=state.stars.length===0;
  document.documentElement.dataset.theme=state.theme;
  setReadoutText($('theme'),state.theme==='light'?'Dark':'Light');
  $('theme').setAttribute('aria-label',`Switch to ${state.theme==='light'?'dark':'light'} theme`);
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  if(document.activeElement!==$('date'))$('date').value=formatDateInput(state.date);
  if(document.activeElement!==$('time'))$('time').value=formatTimeInput(state.date);
  setReadoutText($('date-display'),formatDateLabel(state.date));
  for(const [id,key] of [['time-zone','timeZone'],['pin-time-zone','pinTimeZone'],['timeline-time-zone-mode','timelineTimeZoneMode']])if(document.activeElement!==$(id))$(id).value=state[key];
  setReadoutText($('field-date'),`${formatDateInput(state.date)} / ${formatTimeInput(state.date)} UTC`);
  setReadoutText($('view-index'),state.mode==='surface'?'Earth surface':'Space');
  setReadoutText($('view-title'),state.mode==='surface'?'Earth navigation':`Tracking ${state.selected}`);
  if(document.activeElement!==$('track-target'))$('track-target').value=state.selected??'';
  $('galactic-play').setAttribute('aria-pressed',String(state.galacticPlaying));
  setReadoutText($('galactic-play'),state.galacticPlaying?'Pause Galactic rate':'Play Galactic rate');
  if(document.activeElement!==$('galactic-phase'))$('galactic-phase').value=state.galacticYears/GALACTIC_MODEL.periodYears;
  setReadoutText($('galactic-phase-label'),`${(galacticYearsAt(state.date,state.galacticYears)/1e6).toFixed(3)} Myr into orbit`);
  setReadoutText($('galactic-model-note'),`Circular model · ${GALACTIC_MODEL.radiusKpc} kpc · ${GALACTIC_MODEL.speedKmS} km/s · ${(GALACTIC_MODEL.periodYears/1e6).toFixed(3)} Myr per cycle. Sun and planet trails share UTC and the chosen length; distant curves are illustrative.`);
  $('galaxy-view').hidden=state.mode!=='space';
  $('solar-view').hidden=state.mode!=='space';
  $('aim-sun').hidden=state.mode!=='surface';
  $('track-sun').hidden=state.mode!=='surface';
  $('track-sun').setAttribute('aria-pressed',String(state.trackSun));
  $('fov-control').hidden=state.mode!=='surface';
  setReadoutText($('field-hint'),state.mode==='surface'?'W A S D moves · Shift slows · scroll out to lift off Earth':'Drag orbit · Shift-drag pan · zoom toward the cursor');
  $('alignments-panel').querySelector('h3').textContent=accuracy.illustrative?'Illustrative ecliptic positions':'Tropical longitudes';
  $('alignments-panel').querySelector('.panel-intro p').textContent=accuracy.illustrative?'Periodic model in fixed J2000 planes. Sign bins and aspects are illustrative geometry.':'Tropical zodiac · geocentric ecliptic longitude. Aspects use a 6° orb.';
  $('center-view').title='Center the tracked target (C)';
  $('physical-scale-controls').hidden=state.markerMode!=='physical';
  $('symbol-scale-controls').hidden=state.markerMode!=='schematic';
  $('space-display-controls').hidden=false;
  $('marker-mode').value=state.markerMode;
  $('keep-solar-visible').checked=state.keepSolarVisible;
  setReadoutText($('body-scale-note'),state.markerMode==='schematic'?'Small distant bodies keep selectable symbols; nearby globes use their physical radius.':`Displayed radii ×${state.bodyScale}. Bodies may overlap. Navigation and Pin height use actual reference radii.`);
  setReadoutText($('timeline-title'),state.autoTimelineSpan?`Time · auto ${timelineSpanLabel(currentTimelineSpan())}`:'Time · UTC');
  $('timeline-span').value=state.span;
  if($('auto-timeline-span'))$('auto-timeline-span').checked=state.autoTimelineSpan;
  $('timeline-span').title=state.autoTimelineSpan?'Automatic span follows playback rate. Choose a scale here to switch to manual.':'Manual timeline span';
  syncFov();
  applyPanels({stats:false});
  if(document.activeElement!==$('latitude'))$('latitude').value=observer.latitude;
  if(document.activeElement!==$('longitude'))$('longitude').value=observer.longitude;
  if(document.activeElement!==$('height'))$('height').value=Number(observer.height.toPrecision(12));
  $('height').disabled=observer.height>10000;
  $('height').title=observer.height>10000?'Use Camera height to adjust this tether; JPL supports up to 10 km.':'Earth observer height in meters';
  }
  syncSurfacePin();
  const recovery=$('reveal-topbar'),recoveryBox=recovery?.hidden?null:recovery?.getBoundingClientRect();
  state.compassTopInset=recoveryBox?Math.max(0,Math.min(96,recoveryBox.bottom-($('scene')?.getBoundingClientRect().top??0)))+8:0;
  const astrologyObserver=currentSurfaceObserver('Earth')??observer;
  state.astrologyActive=earthObserverActive();
  state.astrology=state.astrologyActive?astrologyForObserver(astrologyObserver,precision):null;
  try{scene?.render({...state,bodies,sky,land,cities,skyObserver:observer,astrologyObserver:{latitude:astrologyObserver.latitude,longitude:astrologyObserver.longitude},skySource:precision?'JPL Horizons':'Astronomy Engine'},{paint:false});}catch(error){$('render-error').hidden=false;console.error(error);}
  syncObserverAux({draw:updateUI,details:!animation});
  // The camera rebases with a new UTC inside Scene.render. Derive overlays again
  // from that final pose before paint, so its pin and the minimap share one epoch.
  const finalFootprint=currentSurfaceObserver('Earth')??observer;
  const finalPin=state.surfacePin,oldPin=scene?.state?.surfacePin;
  const finalSkyObserver=currentEarthObserver();
  const footprintChanged=finalFootprint.latitude!==astrologyObserver.latitude||finalFootprint.longitude!==astrologyObserver.longitude;
  if(scene&&(JSON.stringify(finalPin)!==JSON.stringify(oldPin)||footprintChanged||['latitude','longitude','height'].some(k=>finalSkyObserver[k]!==observer[k]))){
    const finalPrecision=activeJpl();
    if(finalPrecision!==precision)return render(forceTables,{animation,now,paint}); // Rebind provider labels/body rows when the final observer invalidates a loaded instant.
    state.astrology=state.astrologyActive?astrologyForObserver(finalFootprint,finalPrecision):null;
    sky=skyAtObserver(finalSkyObserver,finalPrecision);
    try{scene.render({...state,bodies,sky,land,cities,skyObserver:finalSkyObserver,astrologyObserver:{latitude:finalFootprint.latitude,longitude:finalFootprint.longitude},skySource:finalPrecision?'JPL Horizons':'Astronomy Engine'},{paint});}catch(error){$('render-error').hidden=false;console.error(error);}
  }else if(paint){try{scene?.redraw();}catch(error){$('render-error').hidden=false;console.error(error);}}
  if(updateUI&&stellarCatalogueText){const shown=state.showStars||state.showConstellations||state.showConstellationNames;$('catalogue-status').textContent=`${stellarCatalogueText} · ${shown?(scene?.stellarFrame?.label??'Stellar reference positions'):'Stellar display hidden'}`;$('catalogue-status').title=shown?(scene?.stellarFrame?.limitations??''):'';}
  if(updateUI){
  if($('milky-way-status'))$('milky-way-status').textContent=!state.showMilkyWay?'Milky Way layer hidden.':(scene?.renderedMilkyWay?.frame?.description??'Catalogue centers at their source epochs; schematic populations. Cluster motions and Galactic evolution are not integrated.');
  syncSpaceReadout();renderCoil();persistArrangement();
  if(forceTables||!animation||now<lastTables||now-lastTables>300){renderTables({deferHidden:animation});lastTables=now;}
  if(earthObserverActive()&&(!animation||readoutVisible('sky-readout')))renderSky();
  if(!animation||readoutVisible('astrology-panel'))renderAstrology();
  syncZoomReadout();layout?.sync({measure:false});
  }
}

function renderTables({deferHidden=false}={}) {
  if(!deferHidden||readoutVisible('moon-panel'))renderMoonInfo();dataControls?.sync({details:!deferHidden||readoutVisible('iss-panel')});
  $('moon-orbit-model').textContent=scene?.renderedMoonOrbit?.sampling??'Moon guide uses the active position model.';
  const focused = document.activeElement;
  const focusedBody = focused?.dataset.body, focusedEvent = focused?.dataset.event;
  if(!deferHidden||readoutVisible('inspector')){
  const query=$('body-search').value.trim().toLowerCase();
  const listed=bodies.filter(b=>query?`${b.name} ${b.id} ${b.parentId??'Sun'}`.toLowerCase().includes(query):!b.parentId||b.id==='Moon'||b.artificial||b.id===state.selected);
  const list=$('body-list'),existing=[...list.querySelectorAll('[data-body]')];
  // Retain row identity through click sequences and live ephemeris refreshes.
  if(existing.length!==listed.length||existing.some((row,i)=>row.dataset.body!==listed[i].id)){
    list.innerHTML=listed.map(b=>`<button class="body-row" data-body="${escape(b.id)}" aria-pressed="false"><span class="body-dot"></span><span class="body-name"></span><span class="body-distance"></span></button>`).join('');
  }
  for(const [i,row] of [...list.querySelectorAll('[data-body]')].entries()){
    const body=listed[i],selected=state.selected===body.id;
    row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));
    row.querySelector('.body-dot').style.backgroundColor=body.color;
    row.querySelector('.body-name').textContent=body.parentId&&!body.artificial?`${body.name} · ${body.parentId}`:body.name;
    row.querySelector('.body-distance').textContent=body.artificial?`${number(body.distanceAU*149597870.7,0)} km from Earth` : body.id==='Sun'?'Origin':`${number(Math.hypot(...body.position),2)} AU`;
  }
  const selected = bodies.find(b => b.id === state.selected) || bodies[0];
  const galacticTarget=state.selected==='Sagittarius A*';
  $('selected-name').textContent = galacticTarget?'Sagittarius A*':selected.name;
  $('track-body').textContent = `Fly to ${galacticTarget?'Sagittarius A*':selected.name}`;
  $('selected-data').innerHTML = `<dt>From Sun</dt><dd>${number(Math.hypot(...selected.position),activeJpl()?8:5)} AU</dd><dt>${selected.radiusEstimated?'Display radius placeholder':'Mean radius'}</dt><dd>${Number(selected.radiusKm).toLocaleString('en-US')} km</dd><dt>From Earth</dt><dd>${selected.id === 'Earth' ? 'Observer origin' : `${number(selected.distanceAU,activeJpl()?8:5)} AU`}</dd>${selected.id !== 'Earth'&&Number.isFinite(selected.longitude) ? `<dt>${selected.illustrative?'Model longitude':'Tropical position'}</dt><dd>${number(selected.degree,activeJpl()?5:2)}° ${escape(selected.sign)}</dd>` : ''}`;
  if(selected.artificial)$('selected-data').innerHTML=`<dt>Object</dt><dd>International Space Station · Earth spacecraft</dd><dt>Orbit model</dt><dd>${escape(selected.sourceModel)}</dd><dt>Status</dt><dd>${escape(selected.status)}</dd><dt>Elements epoch</dt><dd>${escape(selected.epoch)}</dd><dt>From Earth center</dt><dd>${number(selected.distanceAU*149597870.7,1)} km</dd><dt>Representation</dt><dd>${escape(ISS_GEOMETRY.description)} · ${escape(ISS_GEOMETRY.configuration)}</dd>`;
  else if(selected.parentId&&selected.id!=='Moon')$('selected-data').innerHTML+=`<dt>Parent</dt><dd>${escape(selected.parentId)}</dd><dt>Orbit model</dt><dd>${escape(selected.sourceModel??'Local mean-orbit estimate')}</dd>${selected.radiusEstimated?'<dt>Radius</dt><dd>Unknown; 1 km display placeholder</dd>':''}`;
  if(state.selected&&!galacticTarget){
    $('selected-data').innerHTML+=`<dt>Position source</dt><dd>${escape(selected.sourceModel??(activeJpl()?'JPL Horizons · requested instant':'Astronomy Engine 2.1.19'))}</dd><dt>Coverage / model status</dt><dd>${escape(selected.cacheStatus??selected.status??(selected.illustrative?'Illustrative model':accuracyAt(state.date).label))}</dd><dt>Physical size</dt><dd>${selected.radiusEstimated?'Display placeholder; unknown source radius':selected.artificial?'Sourced component dimensions; simplified structure':'Source mean radius; reference sphere'}</dd><dt>Surface / attitude</dt><dd>${selected.id==='Earth'?'Fixed NASA Blue Marble composite; modeled Earth orientation':selected.id==='Moon'?'NASA lunar imagery / LOLA terrain; modeled rotation':selected.artificial?'See ISS data and telemetry controls':selected.parentId?'Schematic surface; modeled or synchronous rotation':'Schematic surface; modeled rotation'}</dd>`;
  }
  $('track-body').disabled=!state.selected;
  if(!state.selected){$('selected-name').textContent='No selection';$('track-body').textContent='Select a destination';$('selected-data').innerHTML='<dt>Selection</dt><dd>Click a body to inspect it.</dd>';}
  if(galacticTarget)$('selected-data').innerHTML=`<dt>Model position</dt><dd>Galactic origin</dd><dt>Solar orbit radius</dt><dd>${GALACTIC_MODEL.radiusKpc} kpc</dd><dt>Representation</dt><dd>Coordinate marker</dd>`;
  }
  if(!deferHidden||readoutVisible('eclipses-panel')){
  const upcoming = nextEclipses(state.date,3);
  const active = ECLIPSES.find(e => e.id === state.activeEvent);
  const shown = active && Math.abs(differenceMillis(active.date,state.date)) < day ? [active,...upcoming.filter(e => e.id !== active.id)].slice(0,3) : upcoming;
  $('event-list').innerHTML = shown.length ? shown.map(e => `<article class="event"><span class="event-date">${fmt(new Date(e.visitDate ?? e.date),{year:'numeric',month:'long',day:'numeric'})}${e.id === state.activeEvent ? ' · Selected' : ''}</span><h4>${escape(e.name)}</h4><div class="event-meta">${escape(e.localType ?? e.type)} solar eclipse</div><p>${escape(e.location)} · ${e.localPeakDate ? 'local' : 'global'} maximum ${formatTimeInput(new Date(e.localPeakDate ?? e.date)).slice(0,8)} UTC</p>${canVisit(e) ? `<button data-event="${e.id}">View eclipse from Earth</button>` : '<p>Observer unavailable</p>'}</article>`).join('') : `<p class="empty-state">No later eclipse is included in this catalogue. This does not mean no eclipse will occur. Choose an earlier date or revisit the 2024 example.</p>`;
  }
  if(!deferHidden||readoutVisible('astrology-panel')){
  $('zodiac-table').innerHTML = bodies.filter(b => ASTROLOGY_OBJECT_IDS.includes(b.id)).map(b => `<div class="zodiac-row"><span>${escape(b.name)}</span><span>${number(b.degree,activeJpl()?5:2)}° ${escape(b.sign)}</span></div>`).join('');
  const aspects = aspectsFromBodies(bodies);
  $('aspect-list').innerHTML = aspects.length ? aspects.map(a => `<div class="aspect"><span>${escape(a.a)} / ${escape(a.b)}<br><span class="fineprint">${escape(a.name)} · ${a.angle}°</span></span><small>${number(a.orb,1)}° orb</small></div>`).join('') : '<p class="empty-state">No major aspects within the 6° orb.</p>';
  }
  if (focusedBody) $('body-list').querySelector(`[data-body="${CSS.escape(focusedBody)}"]`)?.focus({preventScroll:true});
  if (focusedEvent) $('event-list').querySelector(`[data-event="${CSS.escape(focusedEvent)}"]`)?.focus({preventScroll:true});
}
function renderSky() {
  const sun = sky.find(b => b.id === 'Sun'), moon = sky.find(b => b.id === 'Moon');
  const observer=currentEarthObserver();
  if(!sun||!moon){$('sky-readout').innerHTML='<dt>Sky readout</dt><dd>Available up to 100 km observer height. Higher altitudes use the geometric space scene.</dd>';$('zodiac-readout').hidden=true;return;}
  const separation = angularSeparation(sun,moon);
  const overlap = diskOverlap(sun.angularRadius, moon.angularRadius, separation);
  const visible = sun.altitude > 0;
  $('sky-readout').innerHTML = `<dt>Observer height</dt><dd>${number(observer.height,2)} m</dd><dt>Sun altitude</dt><dd>${number(sun.altitude,activeJpl()?5:3)}°${visible ? '' : ' / below horizon'}</dd><dt>Sun bearing</dt><dd>${number(sun.azimuth,activeJpl()?5:3)}°</dd><dt>Moon altitude</dt><dd>${number(moon.altitude,activeJpl()?5:3)}°</dd><dt>Disk separation</dt><dd>${number(separation,activeJpl()?6:4)}°</dd><dt>Solar obscuration</dt><dd>${visible ? `${number(overlap * 100,1)}%` : 'Not visible'}</dd><dt>Instant (UTC)</dt><dd>${formatTimeInput(state.date)}</dd>`;
  const zodiac=zodiacAt(state.date,observer.latitude,observer.longitude);
  const angle=point=>point?`${number(point.degree,4)}° ${escape(point.sign)}`:'Undefined';
  $('zodiac-readout').hidden=!state.showAstrology||!state.showZodiacOutline;
  $('zodiac-readout').innerHTML=`<dt>ASC / eastern horizon</dt><dd>${angle(zodiac.ascendant)}</dd><dt>MC / upper meridian</dt><dd>${angle(zodiac.midheaven)}</dd><dt>Local sidereal time</dt><dd>${number(zodiac.siderealHours,6)} h</dd>${zodiac.issues.length?`<dt>Geometry</dt><dd>${escape(zodiac.issues.join(' '))}</dd>`:''}`;
}
function renderAstrology(){
  const out=$('astrology-readout');if(!out)return;
  const data=state.astrology;
  if(!state.astrologyActive||!data){out.innerHTML='';updateAstrologyHover(null);return;}
  const points=data.points??[],observer=currentSurfaceObserver('Earth');
  const describe=point=>point?`${number(point.degree,6)}° ${escape(point.sign)} · λ${number(point.longitudeDeg,6)}° · β${number(point.latitudeDeg??0,6)}°`:'Undefined at this observer';
  out.innerHTML=`<dt>UTC</dt><dd>${escape(state.date.toISOString())}</dd><dt>Observer footprint</dt><dd>${number(observer.latitude,6)}°, ${number(observer.longitude,6)}°</dd>`+
    points.map(point=>`<dt>${escape(point.label??point.name??point.id)}${point.id!==point.label?` (${escape(point.id)})`:''}</dt><dd>${describe(point)}${Number.isFinite(point.azimuth)?`<br>Az ${number(point.azimuth,4)}° · Alt ${number(point.altitude,4)}°`:''}</dd>`).join('')+
    (Number.isFinite(data.siderealHours)?`<dt>Local sidereal time</dt><dd>${number(data.siderealHours,6)}h</dd>`:'')+
    `<dt>Coordinates</dt><dd>${escape(data.frame??'Geocentric tropical ecliptic/equinox of date; ASC/MC from the observer footprint')}</dd>`+
    (data.issues?.length?`<dt>Geometry</dt><dd>${escape(data.issues.join(' '))}</dd>`:'');
}
function updateAstrologyHover(value){
  const out=$('astrology-hover');if(!out)return;
  const point=value?.point??value;
  out.textContent=point&&Number.isFinite(point.longitudeDeg)?`${point.label??point.name??point.id??'Coordinate'} · ${number(point.degree,6)}° ${point.sign} · longitude ${number(point.longitudeDeg,6)}° · latitude ${number(point.latitudeDeg??0,6)}°`:'Hover the longitude grid or a celestial point; click a point to retain its coordinates.';
}
function searchEclipse() {
  if(!eclipseAvailableAt(state.date)){modelEvent=null;$('model-eclipse').textContent='Eclipse search is limited to 1800–2200; remote calculations do not establish eclipse timing accuracy.';report('Choose a date within 1800–2200 for eclipse search.');return;}
  const from = validatedDate(state.date);
  try {
    modelEvent = state.eclipseKind==='lunar'?findNextLunarEclipse(from):findNextEclipse(from);
    $('model-eclipse').innerHTML = modelEvent ? `<article class="event"><span class="event-date">Searched after ${`${formatDateInput(from)} ${formatTimeInput(from).slice(0,5)}`} UTC</span><h4>${fmt(new Date(modelEvent.date),{month:'long',day:'numeric',year:'numeric'})}</h4><div class="event-meta">${escape(modelEvent.type)} ${state.eclipseKind} eclipse · Astronomy Engine</div><p>Global maximum ${formatTimeInput(new Date(modelEvent.date)).slice(0,8)} UTC</p>${canVisit(modelEvent) ? `<p>${escape(modelEvent.location)} · ${number(modelEvent.latitude,2)}°, ${number(modelEvent.longitude,2)}°${modelEvent.localPeakDate ? `<br>Local maximum ${formatTimeInput(new Date(modelEvent.localPeakDate)).slice(0,8)} UTC` : ''}</p><button id="visit-model-eclipse">View eclipse from Earth</button>` : '<p>Observer unavailable</p>'}</article>` : '<p class="empty-state">No model eclipse found within the next 400 days or remaining date range. Choose an earlier date to search again.</p>';
    if (canVisit(modelEvent)) $('visit-model-eclipse').onclick=()=>visitEvent(modelEvent.id);
    report(modelEvent ? 'Eclipse calculated. Load JPL at the viewing instant to inspect direct observer data.' : 'Model search finished without a result in its bounded range.');
  } catch(error) { $('model-eclipse').textContent=error.message;report('Eclipse search could not finish for this input.'); }
}
function canVisit(event) {
  return event && event.hasObserver !== false && Number.isFinite(event.latitude) && Number.isFinite(event.longitude) && Number.isFinite(Date.parse(event.visitDate ?? event.date));
}
function visitEvent(id) {
  const event=ECLIPSES.find(e=>e.id===id)||(modelEvent?.id===id?modelEvent:null);
  if(!canVisit(event)){report('This eclipse has no available viewing location.');return;}
  scene?.cancelNavigation?.();scene?.cancelZoomAnimation?.();state.galacticPlaying=false;play(false);
  state.activeEvent=id;state.date=new Date(event.visitDate??event.localPeakDate??event.date);
  state.height=30;state.latitude=event.latitude;state.longitude=event.longitude;
  state.mode='space';state.selected='Earth';clearTracking();
  $('place').value='custom';activePanels().inspector=true;
  if(revealed)revealPanelsHidden=false;else panelsHidden=false;
  const target=event.category==='lunar'?'Moon':'Sun';
  render(true);
  scene?.landAndAim?.({body:'Earth',latitude:event.latitude,longitude:event.longitude,altitudeM:30,target,fov:1.5,animate:state.animateNavigation});
  setPlaybackRate(60,{unit:'seconds',renderNow:false});
  finishNavigation(`${event.location} · ${event.category==='lunar'?'calculated greatest eclipse':'calculated local maximum'} · Earth surface looking at the ${target}. Drag or Option-drag to explore; F leaves fixed-height movement, L releases orbit following.`);
}

const spans = TIME_SPANS;
function timelineZone(){return state.timelineTimeZoneMode==='display'?state.timeZone:'UTC';}
function currentTimelineSpan(){return state.autoTimelineSpan?automaticTimelineSpan(state.speed):state.span;}
function currentTimelineDuration(){const span=currentTimelineSpan();return typeof span==='string'?spans[span].duration:span.duration;}
function currentTimelineStep(){const span=currentTimelineSpan();return typeof span==='string'?spans[span].step:span.step;}
function renderCoil() {
  const canvas=$('time-coil'),context=canvas.getContext('2d');if(!context)return;
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height,dpr=Math.min(devicePixelRatio||1,2);if(w<=0||h<=0)return;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement),line=css.getPropertyValue('--line'),muted=css.getPropertyValue('--muted'),signal=css.getPropertyValue('--signal');
  const axis=h*.22,major=h*.5,minor=h*.38;
  const span=currentTimelineSpan(),duration=currentTimelineDuration();
  const zone=timelineZoneContext(state.date,timelineZone(),span);
  $('timeline-zone-status').textContent=zone.message;
  const ticks=timelineTicks(state.date,span,w,{timeZone:zone.timeZone});context.strokeStyle=line;context.lineWidth=1;context.beginPath();context.moveTo(0,axis);context.lineTo(w,axis);
  for(const tick of ticks){context.moveTo(tick.x,axis);context.lineTo(tick.x,tick.major?major:minor);}context.stroke();
  context.font='14px system-ui,sans-serif';context.textAlign='center';context.fillStyle=muted;
  let lastRight=-Infinity;
  for(const tick of ticks){
    if(!tick.major)continue;
    const full=formatTimelineTick(tick.time,span,{timeZone:zone.timeZone});
    const budget=Math.min(140,w*.28);let text=full,keep=Math.min(full.length,24);
    while(context.measureText(text).width>budget&&keep>1){keep--;const left=Math.ceil(keep/2),right=Math.floor(keep/2);text=full.slice(0,left)+'…'+(right?full.slice(-right):'');}
    const half=context.measureText(text).width/2;
    if(tick.x-half<2||tick.x+half>w-2||tick.x-half<lastRight+12)continue;
    context.fillText(text,tick.x,h-4);lastRight=tick.x+half;
  }
  context.strokeStyle=signal;context.beginPath();context.moveTo(w/2,2);context.lineTo(w/2,h*.65);context.stroke();context.fillStyle=signal;context.fillRect(w/2-2,0,4,4);
}

async function loadJpl() {
  if(standalone){report('JPL queries require the local server. Offline calculations remain available.');return;}
  if(jplLoading)return;
  if(!jplAvailableAt(state.date)){report('JPL retrieval is limited to the verified 1800–2200 interval.');return;}
  if(currentEarthObserver().height>10000){report('JPL observer queries require a height at or below 10 km.');return;}
  play(false);
  const generation=++jplGeneration;
  const request={date:state.date.toISOString(),...currentEarthObserver()};
  jplSnapshot=null;jplLoading=true;jplError=false;jplMessage='';render(true);
  try {
    const response=await fetch(`/api/ephemeris?${new URLSearchParams(request)}`,{signal:AbortSignal.timeout(100000)});
    const data=await response.json();
    if(generation!==jplGeneration)return;
    if(!response.ok)throw new Error(data.error || 'JPL request failed.');
    if(!validJplSnapshot(data,request))throw new Error('JPL returned an incomplete or mismatched dataset.');
    jplSnapshot=data;
    jplMessage=activeJpl()?'':'JPL result retained for its requested instant; current data are calculated.';
    report(activeJpl()?'JPL ephemeris loaded for this instant and observer.':'JPL query completed for a previous instant; current data remain calculated.');
  }catch(error){if(generation!==jplGeneration)return;jplMessage=`JPL unavailable: ${error.message} Calculated data remain displayed.`;jplError=true;report('JPL query failed; no JPL data were applied.');}
  finally{if(generation===jplGeneration){jplLoading=false;render(true);}}
}
async function loadCatalogue(){
  try{
    const data=await localData('sky','/data/sky.json');
    if(!Array.isArray(data.stars)||!Array.isArray(data.constellations))throw new Error('Catalogue invalid');
    state.stars=data.stars;state.constellations=data.constellations;
    const summary=stellarCatalogueSummary(data);
    stellarCatalogueText=`${summary.stars.toLocaleString()} spatial stars · ${summary.measured.toLocaleString()} measured depths · ${summary.illustrative.toLocaleString()} illustrative`;
    $('catalogue-status').textContent=stellarCatalogueText;
    $('catalogue-status').title=summary.description;
    render(true);
  }catch(error){$('catalogue-status').textContent='Catalogue unavailable';for(const id of ['show-stars','show-constellations','show-constellation-names','show-stellar-motion'])$(id).disabled=true;report(error.message);}
}
$('load-jpl').onclick=loadJpl;
$('use-engine').onclick=()=>{jplSnapshot=null;jplError=false;jplMessage='';render(true);report('Calculated ephemeris active; playback enabled.');};
for(const [id,key] of [['animate-navigation','animateNavigation'],['show-surface-grid','showSurfaceGrid'],['show-surface-texture','showSurfaceTexture'],['show-surface-pin','showSurfacePin'],['show-zodiac-labels','showZodiacLabels']]){
  if($(id))$(id).onchange=()=>{state[key]=$(id).checked;if(key==='animateNavigation'&&!state[key])scene?.cancelNavigation?.();render();};
}
const numericControls={
  'surface-grid-spacing':{key:'surfaceGridSpacing',min:1,max:30,stops:[1,5,10,15,30]},
  'surface-grid-opacity':{key:'surfaceGridOpacity',min:0,max:1},
  'surface-texture-opacity':{key:'surfaceTextureOpacity',min:0,max:1},
  'zodiac-opacity':{key:'zodiacOpacity',min:0,max:1},
  'zodiac-radius':{key:'zodiacRadiusEarth',min:1.01,max:500},
  'ecliptic-radius':{key:'eclipticRadiusEarth',min:1.01,max:500},
  'ecliptic-opacity':{key:'eclipticOpacity',min:0,max:1},
  'zodiac-grid-spacing':{key:'zodiacGridStep',min:1,max:90,stops:[1,5,10,15,30,45,60,90]},
  'zodiac-grid-opacity':{key:'zodiacGridOpacity',min:0,max:1},
  'zodiac-grid-width':{key:'zodiacGridWidth',min:.25,max:5},
  'pin-stem-width':{key:'pinStemWidth',min:.5,max:8},
  'pin-stem-opacity':{key:'pinStemOpacity',min:0,max:1},
  'pin-point-size':{key:'pinPointSize',min:2,max:16},
  'pin-point-opacity':{key:'pinPointOpacity',min:0,max:1},
  'milky-way-opacity':{key:'milkyWayOpacity',min:0,max:1},
  'earth-image-detail':{key:'earthImageDetail',min:0,max:100}
};
const astrologyControlMap={
  'show-astrology':'showAstrology','show-zodiac-outline':'showZodiacOutline','show-zodiac-grid':'showZodiacGrid','zodiac-color':'zodiacColor',
  'show-ecliptic-ring':'showEclipticRing','ecliptic-color':'eclipticColor','zodiac-grid-color':'zodiacGridColor',
  'show-ecliptic-longitudes':'showEclipticLongitudes','show-longitude-points':'showLongitudePoints','show-celestial-points':'showCelestialPoints','show-point-stats':'showPointStats'
};
function syncAstrologyControls(){


  for(const [id,key] of Object.entries(astrologyControlMap)){
    const input=$(id);if(!input)continue;
    if(typeof state[key]==='boolean')input.checked=state[key];else if(document.activeElement!==input)input.value=state[key];
  }
  for(const [id,{key}] of Object.entries(numericControls)){
    for(const target of [$(id),$(id+'-input')])if(target&&document.activeElement!==target){target.value=state[key];target.setCustomValidity('');}
    const output=$(id+'-value');if(output)output.textContent=key.endsWith('Opacity')?`${Math.round(state[key]*100)}%`:key.endsWith('Earth')?`${Number(state[key].toFixed(2))} R⊕`:key==='zodiacGridStep'?`${state[key]}°`:String(state[key]);
  }
  const stops=$('overlay-radius-stops');
  if(stops){const values=[...new Set([1.01,2,3,5,6,10,20,50,100,200,500,state.zodiacRadiusEarth,state.eclipticRadiusEarth])].sort((a,b)=>a-b);stops.innerHTML=values.map(value=>`<option value="${value}"></option>`).join('');}
  if($('eclipse-kind'))$('eclipse-kind').value=state.eclipseKind;
}
for(const [id,{key,min,max,stops}] of Object.entries(numericControls)){
  for(const input of [$(id),$(id+'-input')]){
    if(!input)continue;
    const apply=()=>{
      let value=Number(input.value);
      if(!input.value.trim()||!Number.isFinite(value)||value<min||value>max){input.setCustomValidity(`Enter a number from ${min} to ${max}.`);report(`Enter a number from ${min} to ${max}.`);return;}
      if(key==='earthImageDetail'&&!Number.isInteger(value)){input.setCustomValidity('Enter a whole number from 0 to 100.');report('Enter a whole number from 0 to 100.');return;}
      input.setCustomValidity('');
      if(input.type==='range')value=magneticValue(value,key.endsWith('Earth')?[1.01,2,3,5,6,10,20,50,100,200,500,key==='zodiacRadiusEarth'?state.eclipticRadiusEarth:state.zodiacRadiusEarth]:stops??(max===1?[0,.25,.5,.75,1]:[]),max===1?{absolute:.02,relative:0}:undefined);
      state[key]=value;input.value=String(value);syncAstrologyControls();render();
    };
    input.onchange=apply;if(input.type==='range')input.oninput=apply;
  }
}
if($('surface-pin-height'))$('surface-pin-height').onchange=()=>setCameraHeight(Number($('surface-pin-height').value));
if($('surface-control-mode'))$('surface-control-mode').onchange=()=>{scene?.setSurfaceControlMode?.($('surface-control-mode').value);render();};
for(const [id,key] of Object.entries(astrologyControlMap)){
  const input=$(id);if(!input)continue;
  const apply=()=>{const value=typeof state[key]==='boolean'?input.checked:input.value.toLowerCase();if(typeof value==='string'&&!/^#[0-9a-f]{6}$/.test(value))return;state[key]=value;if(key==='showEclipticLongitudes'){state.showMoonLongitude=value;state.astrologyObjects={...state.astrologyObjects,Moon:{...state.astrologyObjects.Moon,longitude:value}};}syncAstrologyControls();render();};
  input.onchange=apply;if(input.type==='color')input.oninput=apply;
}
const flightDisplayControls={'earth-map-style':'earthMapStyle','pin-stem-color':'pinStemColor','pin-point-color':'pinPointColor','show-milky-way':'showMilkyWay','show-cluster-labels':'showClusterLabels','milky-way-detail':'milkyWayDetail'};
function syncFlightDisplayControls(){
  for(const [id,key] of Object.entries(flightDisplayControls)){const input=$(id);if(!input)continue;if(typeof state[key]==='boolean')input.checked=state[key];else if(document.activeElement!==input)input.value=state[key];}
}
for(const [id,key] of Object.entries(flightDisplayControls)){
  const input=$(id);if(!input)continue;
  const apply=()=>{const value=typeof state[key]==='boolean'?input.checked:input.value.toLowerCase();if(key==='earthMapStyle'?!['satellite','pixels','dots','schematic'].includes(value):key==='milkyWayDetail'?!['low','medium','high'].includes(value):typeof value==='string'&&!/^#[0-9a-f]{6}$/.test(value))return;state[key]=value;syncFlightDisplayControls();render();};
  input.onchange=apply;if(input.type==='color')input.oninput=apply;
}
const moonParents=[...new Set(MOONS.map(moon=>moon.parentId))];
function mountMoonControls(){
  $('moon-parent').innerHTML=moonParents.map(parent=>`<option value="${escape(parent)}">${escape(parent)} · ${MOONS.filter(moon=>moon.parentId===parent).length} moons</option>`).join('');
  $('moon-visibility').innerHTML=moonParents.map(parent=>`<fieldset class="moon-group" data-moon-parent="${escape(parent)}"><legend>${escape(parent)} moons</legend>${MOONS.filter(moon=>moon.parentId===parent).map(moon=>`<label><input type="checkbox" data-moon-id="${escape(moon.id)}" checked> ${escape(moon.name??moon.id)}</label>`).join('')}</fieldset>`).join('');
  for(const id of ['track-target','pin-track-target']){
    const select=$(id);
    for(const parent of moonParents){
      const added=MOONS.filter(moon=>moon.parentId===parent&&moon.id!=='Moon');if(!added.length)continue;
      const group=document.createElement('optgroup');group.label=`${parent} moons`;
      for(const moon of added)group.appendChild(new Option(moon.name??moon.id,moon.id));
      select.appendChild(group);
    }
  }
  $('moon-parent').onchange=syncMoonControls;
  $('show-non-earth-moons').onchange=()=>{state.showNonEarthMoons=$('show-non-earth-moons').checked;syncMoonControls();render();};
  $('show-moons').onchange=()=>{state.showMoons=$('show-moons').checked;syncMoonControls();render();};
  $('moon-visibility').addEventListener('change',event=>{const id=event.target.dataset.moonId;if(!MOON_IDS.includes(id))return;state.moonVisibility={...state.moonVisibility,[id]:event.target.checked};render();});
  $('show-asteroid-belt').onchange=()=>{state.showAsteroidBelt=$('show-asteroid-belt').checked;render();};
}
function syncMoonControls(){
  $('show-non-earth-moons').checked=state.showNonEarthMoons;
  $('show-moons').checked=state.showMoons;$('show-asteroid-belt').checked=state.showAsteroidBelt;
  for(const group of $('moon-visibility').querySelectorAll('[data-moon-parent]'))group.hidden=group.dataset.moonParent!==$('moon-parent').value;
  for(const input of $('moon-visibility').querySelectorAll('[data-moon-id]'))input.checked=state.moonVisibility[input.dataset.moonId]!==false;
}
mountMoonControls();
for(const id of ['track-target','pin-track-target']){const group=document.createElement('optgroup');group.label='Named asteroids and comets';for(const body of MINOR_BODIES)group.appendChild(new Option(body.name,body.id));$(id).appendChild(group);}
$('moon-fly').onclick=()=>visitMoon();
$('moon-surface').onclick=()=>visitMoon(true);
$('show-moon').onchange=()=>{state.moonVisibility={...state.moonVisibility,Moon:$('show-moon').checked};syncMoonControls();render();};
for(const [id,key] of [['show-moon-orbit','showMoonOrbit'],['moon-orbit-through-earth','moonOrbitThroughEarth']])$(id).onchange=()=>{state[key]=$(id).checked;render();};
for(const [id,key,min,max] of [['moon-orbit-opacity','moonOrbitOpacity',0,1],['moon-orbit-width','moonOrbitWidth',.25,8]]){
  const input=$(id);input.onchange=()=>{const value=input.value.trim()?Number(input.value):NaN;if(!Number.isFinite(value)||value<min||value>max){input.setCustomValidity(`Enter a value from ${min} to ${max}.`);report(`Moon orbit ${id.endsWith('width')?'width':'opacity'} must be ${min}–${max}.`);return;}input.setCustomValidity('');state[key]=value;render();};
}
$('moon-orbit-color').oninput=$('moon-orbit-color').onchange=()=>{const value=$('moon-orbit-color').value.toLowerCase();if(/^#[0-9a-f]{6}$/.test(value)){state.moonOrbitColor=value;render();}};
$('moon-orbit-style').onchange=()=>{const value=$('moon-orbit-style').value;if(['solid','dashed'].includes(value)){state.moonOrbitStyle=value;render();}};
$('iss-fly').onclick=()=>visitISS();
$('iss-onboard').onclick=()=>visitISS(true);
$('iss-leave').onclick=()=>{if(!onboardISS())return;clearTracking();scene.releaseAllLocks();render(true);finishNavigation('Left ISS onboard view. Position and direction retained; free flight.');};
for(const [id,key] of [['show-iss','showISS'],['show-iss-orbit','showISSOrbit'],['iss-orbit-through-earth','issOrbitThroughEarth']])$(id).onchange=()=>{state[key]=$(id).checked;render();};
for(const [id,key,min,max] of [['iss-orbit-opacity','issOrbitOpacity',0,1],['iss-orbit-width','issOrbitWidth',.25,8]]){
  const input=$(id);input.onchange=()=>{const value=input.value.trim()?Number(input.value):NaN;if(!Number.isFinite(value)||value<min||value>max){input.setCustomValidity(`Enter a value from ${min} to ${max}.`);report(`ISS orbit ${id.endsWith('width')?'width':'opacity'} must be ${min}–${max}.`);return;}input.setCustomValidity('');state[key]=value;render();};
}
$('iss-orbit-color').oninput=$('iss-orbit-color').onchange=()=>{const value=$('iss-orbit-color').value.toLowerCase();if(/^#[0-9a-f]{6}$/.test(value)){state.issOrbitColor=value;render();}};
$('iss-orbit-style').onchange=()=>{const value=$('iss-orbit-style').value;if(['solid','dashed'].includes(value)){state.issOrbitStyle=value;render();}};
for(const id of ['track-target','pin-track-target']){
  const group=document.createElement('optgroup');group.label='Earth spacecraft';group.appendChild(new Option('ISS · International Space Station',ISS_METADATA.id));$(id).appendChild(group);
}
for(const site of LAUNCH_SITES){const option=new Option(site.label,site.id);option.title='Approximate launch-site map location';$('launch-site-options').appendChild(option);}
$('show-stars').onchange=()=>{state.showStars=$('show-stars').checked;render();};
$('show-constellations').onchange=()=>{state.showConstellations=$('show-constellations').checked;render();};
for(const [id,key] of [['show-constellation-names','showConstellationNames'],['show-stellar-motion','showStellarMotion'],['show-flight-stats','showFlightStats']]){
  if($(id))$(id).onchange=()=>{state[key]=$(id).checked;render();};
}
$('trail-years').onchange=()=>{state.trailYears=Number($('trail-years').value);render();};
$('trail-frame').onchange=()=>{state.trailFrame=$('trail-frame').value;render();};
$('trail-bodies').onchange=()=>{state.trailBodies=$('trail-bodies').value==='inner'?['Mercury','Venus','Earth','Mars']:undefined;render();};
$('height').onchange=()=>{const height=Number($('height').value);if($('height').value.trim()===''||!Number.isFinite(height)||height< -500||height>10000){report('Elevation must be −500…10000 m.');return;}state.height=height;setEarthObserver({altitudeM:Math.max(2,height)});render(true);report('Observer elevation updated.');};


function syncSurfaceOpacityControls(){
  const opacity=bodySurfaceOpacity(state,opacityBody),earth=bodySurfaceOpacity(state,'Earth');
  $('surface-opacity-body').value=opacityBody;
  $('surface-opacity').value=String(opacity);$('surface-opacity-value').textContent=`${Math.round(opacity*100)}%`;
  $('surface-opacity').setAttribute('aria-label',`${opacityBody} surface opacity`);
  $('surface-opacity-opaque').disabled=opacity===1;
  $('earth-opacity').value=String(earth);$('earth-opacity-value').textContent=`${Math.round(earth*100)}%`;
}
function setSurfaceOpacity(value,id=opacityBody){
  if(!Number.isFinite(value)||!SURFACE_BODY_IDS.includes(id))return;
  state.surfaceOpacities={...state.surfaceOpacities,[id]:Math.max(0,Math.min(1,value))};
  syncSurfaceOpacityControls();render();
}
for(const id of SURFACE_BODY_IDS)$('surface-opacity-body').appendChild(new Option(id,id));
$('surface-opacity-body').onchange=()=>{const id=$('surface-opacity-body').value;if(SURFACE_BODY_IDS.includes(id)){opacityBody=id;syncSurfaceOpacityControls();}};
$('surface-opacity-opaque').onclick=()=>setSurfaceOpacity(1);
$('earth-opacity').oninput=()=>setSurfaceOpacity(Number($('earth-opacity').value),'Earth');
if($('surface-opacity'))$('surface-opacity').oninput=$('surface-opacity').onchange=()=>setSurfaceOpacity(Number($('surface-opacity').value));
if($('show-surface-markings'))$('show-surface-markings').onchange=()=>{state.showSurfaceMarkings=$('show-surface-markings').checked;render();};
$('earth-opacity').onchange=$('earth-opacity').oninput;
$('move-speed').onchange=()=>{state.moveSpeed=Number($('move-speed').value);render();report(`Movement ${state.moveSpeed.toLocaleString()} m/s; Shift slows to 1%.`);};
$('heading').onchange=()=>{const value=Number($('heading').value);if(!Number.isFinite(value)||$('heading').value.trim()===''){report('Enter a finite heading in degrees.');return;}state.heading=((value%360)+360)%360;clearTracking();scene?.setHeading?.(state.heading);render(true);};
for(const [id,forward,right] of [['move-forward',1,0],['move-back',-1,0],['move-left',0,-1],['move-right',0,1]])$(id).onclick=event=>moveOnEarth({forward,right,slow:!!event.shiftKey});
$('center-view').onclick=()=>{scene?.recenter?.();report('View centered.');};
$('galaxy-view').onclick=()=>{scene?.jumpToBody?.('Sagittarius A*',{preset:'default',animate:state.animateNavigation});finishNavigation('Galactic center view.');};
$('solar-view').onclick=()=>{scene?.jumpToBody?.('Sun',{preset:'solar',animate:state.animateNavigation});finishNavigation('Solar system overview.');};
$('earth-view').onclick=()=>{scene?.jumpToBody?.('Earth',{preset:'default',animate:state.animateNavigation});finishNavigation('Earth view.');};
$('zoom-in').onclick=()=>scene?.changeZoom(.7);
$('zoom-out').onclick=()=>scene?.changeZoom(1/.7);
$('galactic-play').onclick=()=>{if(state.galacticPlaying){play(false);state.galacticPlaying=false;}else{setPlaybackRate(state.galacticSpeed*31557600,{unit:'years'});play(true);state.galacticPlaying=state.playing;}render();report(state.playing?'UTC running at Galactic rate. Sun, planets and trails share this clock.':'Time paused.');};
$('galactic-speed').onchange=()=>{state.galacticSpeed=Number($('galactic-speed').value);if(state.galacticPlaying)setPlaybackRate(state.galacticSpeed*31557600,{unit:'years',galactic:true});};
$('galactic-phase').oninput=()=>{state.galacticYears=Math.max(0,Math.min(1,Number($('galactic-phase').value)))*GALACTIC_MODEL.periodYears;render();};
$('galactic-phase').onchange=$('galactic-phase').oninput;
$('galactic-reset').onclick=()=>{state.galacticYears=0;render();};
function syncPlaybackControls(){
  const unit=state.playbackUnit;
  if(document.activeElement!==$('custom-speed'))$('custom-speed').value=String(state.speed/RATE_UNITS[unit]);
  if($('custom-speed-unit'))$('custom-speed-unit').value=unit;
  const select=$('speed');let custom=select.querySelector('[data-custom-rate]');
  const match=[...select.options].find(option=>!option.dataset.customRate&&Number(option.value)===state.speed);
  if(match){custom?.remove();select.value=match.value;}
  else{if(!custom){custom=new Option();custom.dataset.customRate='true';select.add(custom);}custom.value=String(state.speed);custom.textContent=`${Number((state.speed/RATE_UNITS[unit]).toPrecision(10))} ${unit} / s`;select.value=custom.value;}
}
function setPlaybackRate(rate,{unit=playbackUnitFor(rate),galactic=false,renderNow=true}={}){
  state.liveNow=false;state.speed=parsePlaybackRate(rate);state.playbackUnit=unit;state.galacticPlaying=galactic&&state.playing;
  // Begin the new rate at the next frame; old wall-clock debt cannot use the new rate.
  clockStartFrame=null;syncPlaybackControls();if(renderNow)render();
}
function customPlaybackRate(){
  try{const unit=$('custom-speed-unit')?.value??'seconds';setPlaybackRate(parsePlaybackRate($('custom-speed').value,unit),{unit});$('custom-speed').setCustomValidity('');report(`Time rate: ${state.speed/RATE_UNITS[unit]} ${unit} / s.`);}
  catch(error){$('custom-speed').setCustomValidity(error.message);report(error.message);}
}
$('custom-speed').onchange=customPlaybackRate;
if($('custom-speed-unit'))$('custom-speed-unit').onchange=customPlaybackRate;
function setBodyScale(value){
  if(!Number.isFinite(value)||value<1||value>1e12){report('Body radius multiplier must be 1…1,000,000,000,000.');return;}
  state.bodyScale=value;$('body-scale').value=String(value);$('body-scale-slider').value=Math.log10(value);
  if(value===1)state.scale='true';
  render(true);
}
$('body-scale').onchange=()=>{if($('body-scale').value.trim()===''){report('Enter a body radius multiplier.');return;}setBodyScale(Number($('body-scale').value));};
$('body-scale-slider').oninput=()=>setBodyScale(Number((10**Number($('body-scale-slider').value)).toPrecision(6)));
$('body-scale-slider').onchange=$('body-scale-slider').oninput;
$('actual-size').onclick=()=>{state.markerMode='physical';state.keepSolarVisible=false;setBodyScale(1);report('Actual physical radii and relative distances.');};
$('enlarged-size').onclick=()=>{state.markerMode='schematic';state.markerSize=1;state.keepSolarVisible=true;$('marker-size').value='1';$('marker-size-slider').value='1';render(true);report('Similar-sized body symbols; solar system remains legible at Galactic scale.');};
$('marker-mode').onchange=()=>{state.markerMode=$('marker-mode').value;render(true);};
function setMarkerSize(value){if(!Number.isFinite(value)||value<.25||value>4){report('Symbol size must be 0.25…4.');return;}state.markerSize=value;$('marker-size').value=value;$('marker-size-slider').value=value;render();}
$('marker-size').onchange=()=>setMarkerSize(Number($('marker-size').value));
$('marker-size-slider').oninput=()=>setMarkerSize(Number($('marker-size-slider').value));
$('keep-solar-visible').onchange=()=>{state.keepSolarVisible=$('keep-solar-visible').checked;render();};
function setSolarDistanceScale(value){if(!Number.isFinite(value)||value<1||value>1e8){report('Far-view distance factor must be 1…100000000.');return;}state.solarDistanceScale=value;$('solar-distance-scale').value=value;$('solar-distance-slider').value=Math.log10(value);render();}
$('solar-distance-scale').onchange=()=>setSolarDistanceScale(Number($('solar-distance-scale').value));
$('solar-distance-slider').oninput=()=>setSolarDistanceScale(Number((10**Number($('solar-distance-slider').value)).toPrecision(6)));
$('show-galactic-trails').onchange=()=>{state.showGalacticTrails=$('show-galactic-trails').checked;render();};
$('galactic-coils').onchange=()=>{state.galacticCoils=Math.max(1,Math.min(64,Math.round(Number($('galactic-coils').value)||12)));$('galactic-coils').value=state.galacticCoils;render();};
$('show-surface-map').onchange=()=>{state.showSurfaceMap=$('show-surface-map').checked;render();};
$('show-cities').onchange=()=>{state.showCities=$('show-cities').checked;render();};
$('globe-curvature').onclick=()=>{state.curvature=1;state.fov=60;state.selected='Earth';setMode('space');scene?.fitEarth?.();report('Earth globe at its reference radius.');};
document.querySelectorAll('[data-visibility]').forEach(input=>{input.onchange=()=>{activePanels()[input.dataset.visibility]=input.checked;render(true);};});
$('show-panels').onclick=()=>{for(const key of Object.keys(panelVisibility))activePanels()[key]=true;for(const part of ['topbar','sidebar','timeline'])setChrome(part,false);render(true);};
$('hide-panels').onclick=()=>{for(const key of Object.keys(panelVisibility))activePanels()[key]=false;render(true);};
$('timeline-collapse').onclick=()=>changeChrome('timeline');
if($('toggle-chrome'))$('toggle-chrome').onclick=toggleChrome;
if($('toggle-topbar'))$('toggle-topbar').onclick=()=>changeChrome('topbar');
for(const part of ['topbar','sidebar','timeline'])if($(`reveal-${part}`))$(`reveal-${part}`).onclick=()=>{changeChrome(part,false);if(part==='sidebar'&&layout?.compact)layout.open();};
$('timeline-snap').onchange=()=>{magneticSnap=$('timeline-snap').checked;persistArrangement();report(magneticSnap?'Timeline magnetic snapping on.':'Timeline snapping off.');};
function applyGps(text){
  const observer=parseObserver(text);Object.assign(state,observer);state.activeEvent=null;$('place').value='custom';setEarthObserver({latitude:state.latitude,longitude:state.longitude,...(observer.height===undefined?{}:{altitudeM:Math.max(2,observer.height)})});
  render(true);globe?.focusObserver();report('GPS coordinates applied.');
}
$('gps-apply').onclick=()=>{try{applyGps($('gps-value').value);}catch(error){report(error.message);}};
$('gps-copy').onclick=async()=>{const observed=currentEarthObserver();const text=formatObserver({...observed,...(observed.height>10000?{height:undefined}:{})});$('gps-value').value=text;try{if(!globalThis.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);report('GPS coordinates copied.');}catch{$('gps-value').focus();$('gps-value').select?.();report('Select and copy the GPS text. Clipboard access is unavailable.');}};
$('gps-export').onclick=()=>{const observed=currentEarthObserver(),data=JSON.stringify(observerGeoJSON({...observed,...(observed.height>10000?{height:undefined}:{})}),null,2)+'\n',url=URL.createObjectURL(new Blob([data],{type:'application/geo+json'})),link=document.createElement('a');link.href=url;link.download='observer.geojson';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);report('Observer GeoJSON exported.');};
$('gps-import').onclick=()=>$('gps-file').click();
$('gps-file').onchange=async()=>{const file=$('gps-file').files?.[0];if(!file)return;try{if(file.size>65536)throw new Error('GPS import must be a text or GeoJSON file smaller than 64 KiB.');applyGps(await file.text());}catch(error){report(error.message);}finally{$('gps-file').value='';}};

$('modes').addEventListener('click', e => { const button=e.target.closest('[data-mode]');if(button)navigateMode(button.dataset.mode); });
$('body-list').addEventListener('dblclick',e=>{const button=e.target.closest('[data-body]');if(button){e.preventDefault();jumpDestination(button.dataset.body);}});
$('body-list').addEventListener('click', e => { const button=e.target.closest('[data-body]');if(button){selectBody(button.dataset.body,true);} });
$('event-list').addEventListener('click', e => { const button=e.target.closest('[data-event]');if(button)visitEvent(button.dataset.event); });
document.querySelectorAll('[data-panel]').forEach(button => {
  button.addEventListener('click', () => panel(button.dataset.panel));
  button.addEventListener('keydown', e => { const names=['bodies','events','alignments'], i=names.indexOf(state.panel); if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();panel(e.key==='Home'?names[0]:e.key==='End'?names[2]:names[(i+(e.key==='ArrowRight'?1:2))%3],true);} });
});
$('track-body').onclick=flyToSelected;
$('fly-target').onclick=toggleOrbit;
if($('snap-orbit'))$('snap-orbit').onclick=flyToSelected;
if($('snap-surface'))$('snap-surface').onclick=snapSurface;
$('tether-surface').onclick=toggleTether;
if($('pin-mode'))$('pin-mode').onclick=()=>togglePin();
if($('snap-pin'))$('snap-pin').onclick=()=>togglePin(true);
if($('pin-speed'))$('pin-speed').onchange=()=>{const value=Number($('pin-speed').value);if(!$('pin-speed').value.trim()||!Number.isFinite(value)||value<.01||value>100){report('Pin speed multiplier must be .01–100.');return;}state.pinSpeedMultiplier=value;render();};
if($('show-earth-terrain'))$('show-earth-terrain').onchange=()=>{state.showEarthTerrain=$('show-earth-terrain').checked;render();};
if($('earth-terrain-detail'))$('earth-terrain-detail').onchange=()=>{state.earthTerrainDetail=$('earth-terrain-detail').value;render();};
if($('reset-surface'))$('reset-surface').onclick=()=>{if(scene?.resetReferencePlane?.()){clearTracking();syncNavigation();render();report(scene.camera.flight.tether?'Surface plane restored.':'Galactic orbital plane restored: roll and pitch zero.');}$('scene').focus();};
$('follow-orbit').onchange=()=>{scene?.setFollowBody?.($('follow-orbit').checked?state.selected:null);syncNavigation();report($('follow-orbit').checked?'Following the destination’s orbit while you steer freely.':'Camera released into Galactic space.');};
$('free-flight').onclick=()=>{scene?.releaseAllLocks?.();syncNavigation();applyPanels();report('Free flight. Position and direction retained.');$('scene').focus();};
$('tether-height').onchange=()=>{const value=Number($('tether-height').value);if(!$('tether-height').value.trim()||!Number.isFinite(value)||value<2||value>1e28){report('Locked height must be 2–1e28 meters.');return;}scene?.setObserver?.({altitudeM:value});syncZoomReadout();};
$('mouse-look').onclick=async()=>{try{if(!$('scene').requestPointerLock)throw Error();await $('scene').requestPointerLock();report('Mouse look active. Escape releases the pointer.');}catch{report('Pointer capture is unavailable. Drag the scene to look around.');}$('scene').focus();};
$('show-solar-orbit').onchange=()=>{state.showSolarOrbit=$('show-solar-orbit').checked;render();};
$('track-target').onchange=()=>{state.selected=$('track-target').value||null;render(true);report(state.selected==='ISS'?'ISS selected. Fly to ISS for a close view, or View from ISS to go onboard.':state.selected?`${state.selected} selected. L/F locks here; G enters Pin mode.`:'Selection cleared.');};
$('reset-view').onclick=()=>{if(!state.selected)return;scene?.jumpToBody?.(state.selected,{preset:'default',animate:state.animateNavigation});finishNavigation('Default destination view.');};
$('aim-sun').onclick=()=>{scene?.lookAtSun(sky);report(sky.find(b=>b.id==='Sun')?.altitude>0?'View centered on the Sun.':'The Sun is below your horizon at this time.');};
$('track-sun').onclick=()=>{state.trackBody=trackingTarget()==='Sun'?null:'Sun';state.trackSun=state.trackBody==='Sun';render();};
$('pin-track-target').onchange=()=>{if(trackingTarget()){state.trackBody=$('pin-track-target').value;state.trackSun=state.trackBody==='Sun';render();}syncPinTracking();};
$('aim-body').onclick=()=>{clearTracking();scene?.lookAtBody?.($('pin-track-target').value);render();report(`View aimed at ${$('pin-track-target').value}.`);};
$('pin-track-body').onclick=()=>{state.trackBody=trackingTarget()?null:$('pin-track-target').value;state.trackSun=state.trackBody==='Sun';render();report(state.trackBody?`Tracking ${state.trackBody}. Dragging releases tracking.`:'Tracking off.');};
$('fov').onchange=()=>setFov(Number($('fov').value));
$('fov-exact').onchange=()=>setFov($('fov-exact').value.trim()?Number($('fov-exact').value):NaN);
$('fov-narrow').onclick=()=>stepFov(1/1.2);$('fov-wide').onclick=()=>stepFov(1.2);$('fov-reset').onclick=()=>setFov(60);
for(const [id,key] of [['time-zone','timeZone'],['pin-time-zone','pinTimeZone']])$(id).onchange=()=>{const zone=$(id).value.trim();if(!(key==='pinTimeZone'&&zone==='auto')&&!validTimeZone(zone)){$(id).setCustomValidity('Enter a supported IANA time zone, such as America/New_York.');report('Unknown time zone. Use an IANA name such as America/New_York.');return;}$(id).setCustomValidity('');state[key]=zone;render();};
$('timeline-time-zone-mode').onchange=()=>{const value=$('timeline-time-zone-mode').value;if(['utc','display'].includes(value)){state.timelineTimeZoneMode=value;render();}};
$('orbits').onchange=()=>{state.orbits=$('orbits').checked;render();};
$('labels').onchange=()=>{state.labels=$('labels').checked;render();};
$('theme').onclick=()=>{state.theme=state.theme==='light'?'dark':'light';try{localStorage.setItem('solar-system-theme',state.theme);}catch{}render();};
$('quiet').onclick=()=>changeChrome('sidebar');
$('historic-eclipse').onclick=()=>{const event=ECLIPSES.find(e=>e.date.startsWith('2024-04-08'));if(event)visitEvent(event.id);};
$('find-next-eclipse').onclick=searchEclipse;
if($('eclipse-kind'))$('eclipse-kind').onchange=()=>{state.eclipseKind=$('eclipse-kind').value;modelEvent=null;$('model-eclipse').textContent='';render();};
function readDate(){const dateText=$('date').value,timeText=$('time').value;play(false);try{const date=parseUTC(dateText,timeText);setDate(date,'UTC instant selected.');$('date').value=formatDateInput(state.date);$('time').value=formatTimeInput(state.date);$('date').setCustomValidity('');$('time').setCustomValidity('');}catch(error){report(error.message);}}
$('date').onchange=readDate;$('time').onchange=readDate;
$('now').onclick=()=>{state.activeEvent=null;setDate(Date.now(),state.playing?'Returned to now; playback continues.':'Returned to now.',{keepLive:state.liveNow});};
$('live-now').onclick=()=>{
  if(state.liveNow){play(false);return;}
  jplSnapshot=null;state.activeEvent=null;setDate(Date.now());setPlaybackRate(1,{unit:'seconds',renderNow:false});state.liveNow=true;play(true);render(true);report('Live now · following the current clock at 1×.');
};
$('play').onclick=()=>play();
$('step-back').onclick=()=>setDate(addTime(state.date,-day),'Stepped back one day.');
$('step-forward').onclick=()=>setDate(addTime(state.date,day),'Stepped forward one day.');
$('speed').onchange=()=>{setPlaybackRate(Number($('speed').value));report(`Time rate: ${$('speed').selectedOptions[0].textContent}.`);};
$('place').onchange=()=>{const id=$('place').value,place=places[id];if(place){[state.latitude,state.longitude]=place;setEarthObserver({latitude:state.latitude,longitude:state.longitude});render(true);scene?.lookAtSun(sky);$('place').value=id;const site=LAUNCH_SITES.find(row=>row.id===id);report(site?`${site.label} · approximate launch-site location selected.`:'Observer location changed.');}};
function readLocation(){try{Object.assign(state,parseCoordinates($('latitude').value,$('longitude').value));$('place').value='custom';setEarthObserver({latitude:state.latitude,longitude:state.longitude});render(true);report('Observer coordinates selected.');}catch(error){report(error.message);}}
$('latitude').onchange=readLocation;$('longitude').onchange=readLocation;
function setSpan(span){if(!TIME_SPANS[span])return;state.span=span;state.autoTimelineSpan=false;$('timeline-span').value=span;document.querySelectorAll('[data-span]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.span===state.span)));render();report(`${timelineSpanLabel(span)} manual time scale.`);}
$('time-scales').addEventListener('click',e=>{const button=e.target.closest('[data-span]');if(button)setSpan(button.dataset.span);});
$('timeline-span').onchange=()=>setSpan($('timeline-span').value);
if($('auto-timeline-span'))$('auto-timeline-span').onchange=()=>{state.autoTimelineSpan=$('auto-timeline-span').checked;render();report(state.autoTimelineSpan?'Timeline span follows the selected playback rate.':'Manual timeline span retained.');};
function flushCoil({animation=false}={}){if(coilFrame!==null)cancelAnimationFrame(coilFrame);coilFrame=null;const date=coilDate;coilDate=null;if(date)setDate(date,undefined,{animation});}
function cancelCoil(){const pointer=coilPointer;coilPointer=null;flushCoil();if(pointer){scene?.endInteraction();try{if($('time-coil').hasPointerCapture?.(pointer.id))$('time-coil').releasePointerCapture(pointer.id);}catch{}}}
$('time-coil').addEventListener('pointerdown',e=>{if(coilPointer)return;e.preventDefault();play(false);coilPointer={x:e.clientX,width:$('time-coil').getBoundingClientRect().width,date:state.date,id:e.pointerId,span:currentTimelineSpan(),duration:currentTimelineDuration()};scene?.markInteraction();$('time-coil').setPointerCapture(e.pointerId);});
$('time-coil').addEventListener('pointermove',e=>{if(!coilPointer||e.pointerId!==coilPointer.id||coilPointer.width<=0)return;scene?.markInteraction();coilDate=addTime(coilPointer.date,-(e.clientX-coilPointer.x)/coilPointer.width*coilPointer.duration);if(coilFrame===null)coilFrame=requestAnimationFrame(()=>flushCoil({animation:true}));});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('time-coil').addEventListener(type,e=>{if(coilPointer&&e.pointerId===coilPointer.id){const span=coilPointer.span;coilPointer=null;flushCoil();scene?.endInteraction();if(type==='pointerup'&&magneticSnap)setDate(snapTimelineTime(state.date,span,{timeZone:timelineZone()}));report(magneticSnap&&type==='pointerup'?`Time snapped to ${timelineZoneContext(state.date,timelineZone(),span).timeZone} notch.`:'Time selected.');}});
$('time-coil').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();setDate(addTime(state.date,(e.key==='ArrowRight'?1:-1)*currentTimelineStep()),'Time stepped.');}});
// ZSS arrangements contain framing only. Full JSON export explicitly carries scene data.
const arrangementKey='solar-system-arrangement-v1', savedArrangementKey='solar-system-saved-arrangement-v1';
const workspaceDialog=$('workspace-dialog');
function workspaceConfig(){return {state,panelVisibility:activePanels(),panelsHidden:activePanelsHidden(),topbarHidden:activeTopbarHidden(),timelineCollapsed:activeTimelineCollapsed(),magneticSnap,density,scene,globe};}
function workspaceMessage(message){$('workspace-status').textContent=message;report(message);}
function persistArrangement(){
  const serialized=JSON.stringify(captureArrangement(workspaceConfig()));
  if(serialized===lastArrangement)return;
  lastArrangement=serialized;
  try{localStorage.setItem(arrangementKey,serialized);}catch{/* The active arrangement remains usable in memory. */}
}
function useArrangement(value){
  const arrangement=value.workspace;
  density=arrangement.density;state.theme=arrangement.theme;
  panelsHidden=arrangement.panelsHidden??false;
  topbarHidden=arrangement.topbarHidden??false;
  Object.assign(panelVisibility,arrangement.panelVisibility);
  timelineCollapsed=arrangement.timelineCollapsed;magneticSnap=arrangement.magneticSnap;
  $('timeline-snap').checked=magneticSnap;
  revealed=false;
  try{localStorage.setItem('solar-system-theme',state.theme);}catch{}
}
function releasePointerLook(){
  const moving=scene?.interactiveDetail();
  if(document.pointerLockElement)document.exitPointerLock?.();
  scene?.stopMovement();scene?.cancelNavigation?.();scene?.cancelZoomAnimation?.();
  clearTimeout(motionUITimer);motionUITimer=null;lastViewInputKey='';
  if(moving&&!document.hidden){scene?.endInteraction?.();render(false,{paint:false});}
  else syncFlightStats();
}
function showWorkspace(){
  releasePointerLook();
  layout?.close();scene?.cancelZoomAnimation?.();
  scene?.stopMovement();
  $('workspace-density').value=density;
  if(!workspaceDialog.open)workspaceDialog.showModal();
  $('workspace-density').focus();
}
function cancelWorkspaceImport(){if(workspaceImportPending){++workspaceImportGeneration;workspaceImportPending=false;workspaceMessage('Workspace import cancelled. Current scene preserved.');}}
function closeWorkspace(){cancelWorkspaceImport();workspaceDialog.close();$('scene').focus();}
function returnToZen(){revealed=false;render(true);$('scene').focus();}
$('workspace-open').onclick=showWorkspace;
$('workspace-close').onclick=closeWorkspace;
$('workspace-return').onclick=returnToZen;
$('workspace-density').onchange=()=>{
  density=$('workspace-density').value;revealed=false;render(true);
  workspaceMessage(density==='zen'?'Zen hides the frame. Press Escape, tap the field on touch, or click empty space to show Controls.':`${density==='normal'?'Normal':'Reduced'} interface selected.`);
};
$('workspace-show-all').onclick=()=>{
  cancelWorkspaceImport();revealVisibility=Object.fromEntries(Object.keys(panelVisibility).map(key=>[key,true]));revealTimelineCollapsed=false;revealPanelsHidden=false;revealTopbarHidden=false;revealed=true;workspaceDialog.close();render(true);$('workspace-open').focus();
  workspaceMessage('All controls shown temporarily. Return to your view restores the arrangement.');
};
$('workspace-save').onclick=()=>{
  try{localStorage.setItem(savedArrangementKey,JSON.stringify(captureArrangement(workspaceConfig())));workspaceMessage('Arrangement saved on this browser. Scene and date are unchanged.');}
  catch{workspaceMessage('Browser storage is unavailable. Export a workspace file to retain this arrangement.');}
};
$('workspace-restore').onclick=()=>{
  try{const text=localStorage.getItem(savedArrangementKey);if(!text)throw new Error('No saved arrangement in this browser.');useArrangement(parseArrangement(text));render(true);workspaceMessage('Saved arrangement restored. Scene and date are unchanged.');}
  catch(error){workspaceMessage(error.message);}
};
$('workspace-reset').onclick=()=>{
  density='normal';revealed=false;panelsHidden=false;topbarHidden=false;for(const key of Object.keys(panelVisibility))panelVisibility[key]=true;
  timelineCollapsed=false;magneticSnap=true;$('timeline-snap').checked=true;render(true);
  workspaceMessage('Normal arrangement restored. Theme, scene and date are unchanged.');
};
function downloadJSON(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('body-search').oninput=()=>renderTables();
$('workspace-share').onclick=async()=>{
  try{const token=await encodeSharedView(captureWorkspace(workspaceConfig()));const base=String(location.href??'').split('#')[0];const link=`${base}#viewstate=${token}`;
    $('shared-view-output').hidden=false;$('shared-view-link').value=link;
    try{await navigator.clipboard.writeText(link);workspaceMessage('View link copied. Shared views open paused.');}catch{workspaceMessage('Select and copy the view link below.');$('shared-view-link').focus();$('shared-view-link').select?.();}
  }catch(error){workspaceMessage(error.message);}
};
$('workspace-export').onclick=()=>{
  try{downloadJSON(captureWorkspace(workspaceConfig()),'solar-system-workspace.json');workspaceMessage('Workspace exported with date, coordinates, camera and settings. Imports open paused with calculated data.');}
  catch(error){workspaceMessage(`Export failed: ${error.message}`);}
};
function syncWorkspaceControls(){
  syncAstrologyControls();syncFlightDisplayControls();syncMoonControls();syncISSControls();syncEarthMoonControls();
  const values={'surface-grid-spacing':state.surfaceGridSpacing,'surface-grid-opacity':state.surfaceGridOpacity,'surface-texture-opacity':state.surfaceTextureOpacity,'surface-pin-height':state.surfacePinHeight,'zodiac-opacity':state.zodiacOpacity,'body-scale':state.bodyScale,'body-scale-slider':Math.log10(state.bodyScale),'marker-size':state.markerSize,'marker-size-slider':state.markerSize,'solar-distance-scale':state.solarDistanceScale,'solar-distance-slider':Math.log10(state.solarDistanceScale),'galactic-coils':state.galacticCoils,'earth-opacity':state.earthOpacity,'surface-opacity':state.surfaceOpacity,'move-speed':state.moveSpeed,'galactic-speed':state.galacticSpeed,'pin-speed':state.pinSpeedMultiplier,'earth-terrain-detail':state.earthTerrainDetail,'trail-years':state.trailYears,'trail-frame':state.trailFrame,'trail-bodies':state.trailBodies?'inner':'all'};
  for(const [id,value] of Object.entries(values))if($(id))$(id).value=String(value);
  const checks={'show-earth-terrain':state.showEarthTerrain,'animate-navigation':state.animateNavigation,'show-surface-grid':state.showSurfaceGrid,'show-surface-texture':state.showSurfaceTexture,'show-surface-pin':state.showSurfacePin,'show-zodiac-labels':state.showZodiacLabels,'orbits':state.orbits,'labels':state.labels,'show-stars':state.showStars,'show-constellations':state.showConstellations,'show-zodiac':state.showZodiac,'show-galactic-trails':state.showGalacticTrails,'show-solar-orbit':state.showSolarOrbit,'show-surface-map':state.showSurfaceMap,'show-cities':state.showCities,'timeline-snap':magneticSnap,'show-constellation-names':state.showConstellationNames,'show-stellar-motion':state.showStellarMotion,'show-flight-stats':state.showFlightStats,'auto-timeline-span':state.autoTimelineSpan,'show-surface-markings':state.showSurfaceMarkings};
  for(const [id,value] of Object.entries(checks))if($(id))$(id).checked=value;
  for(const [id,value] of [['surface-grid-opacity',state.surfaceGridOpacity],['surface-texture-opacity',state.surfaceTextureOpacity],['zodiac-opacity',state.zodiacOpacity]])if($(id+'-value'))$(id+'-value').textContent=`${Math.round(value*100)}%`;
  syncSurfaceOpacityControls();
  syncPlaybackControls();$('place').value='custom';
  document.querySelectorAll('[data-panel]').forEach(button=>{const selected=button.dataset.panel===state.panel;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  $('bodies-panel').hidden=false;$('events-panel').hidden=false;$('alignments-panel').hidden=!earthObserverActive();
  document.querySelectorAll('[data-span]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.span===state.span)));
}
function importWorkspace(text){
  const imported=parseWorkspace(text); // Validate the complete document before the first mutation.
  const {camera,savedViews,miniGlobe,date,...incoming}=imported.scene;
  cancelAnimationFrame(frame);scene?.stopMovement();scene?.cancelNavigation?.();scene?.cancelZoomAnimation?.();state.playing=false;state.liveNow=false;state.galacticPlaying=false;clockStartFrame=null;
  ++jplGeneration;jplSnapshot=null;jplLoading=false;jplError=false;jplMessage='';modelEvent=null;
  $('model-eclipse').textContent='';
  const oldSurface=incoming.mode==='surface';
  Object.assign(state,incoming,{unifiedFlight:true,mode:'space',date:validatedDate(date),trailBodies:incoming.trailBodies??undefined,activeEvent:null});
  useArrangement(imported);dataControls?.restoreSettings();calculationCache=null;syncWorkspaceControls();
  render(true); // First establish the mode; Scene initializes cameras on mode entry.
  if(scene){
    const {flight,...legacyCamera}=camera;
    Object.assign(scene,{...legacyCamera,pan:{...camera.pan}});
    if(flight)scene.restoreFlight(flight);else scene.restoreLegacyCamera?.(camera,{mode:oldSurface?'surface':'space',selected:state.selected,latitude:state.latitude,longitude:state.longitude});
    scene.savedViews=new Map(Object.entries(savedViews));
    scene.lastInputHeading=state.heading;scene.lastInputFov=state.fov;scene.fov=state.fov;
    scene.labelPlacements.clear();scene.labelVisibility.clear();scene.labelEdgeSince.clear();scene.redraw();
  }
  state.surfacePin=imported.scene.surfacePin?{...imported.scene.surfacePin}:null;
  render(true); // Rebind the restored camera, marker and observer before restoring minimap framing.
  syncObserverAux();syncSpaceReadout();syncZoomReadout();
  if(globe&&miniGlobe){globe.view=miniGlobe.view?{...miniGlobe.view}:null;globe.zoom=miniGlobe.zoom;globe.pan={...miniGlobe.pan};if(miniGlobe.view)globe.render();}
  workspaceMessage('Workspace imported. Time is paused; calculated data are active.');
}
$('workspace-import').onclick=()=>$('workspace-file').click();
$('workspace-file').onchange=async()=>{
  const file=$('workspace-file').files?.[0];if(!file)return;
  const generation=++workspaceImportGeneration;workspaceImportPending=true;workspaceMessage('Reading workspace file…');
  try{const text=await file.text();if(generation!==workspaceImportGeneration)return;importWorkspace(text);}
  catch(error){if(generation===workspaceImportGeneration)workspaceMessage(`Import refused: ${error.message} Current workspace preserved.`);}
  finally{if(generation===workspaceImportGeneration){workspaceImportPending=false;$('workspace-file').value='';}}
};
workspaceDialog.addEventListener('click',event=>{if(event.target===workspaceDialog){const box=workspaceDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeWorkspace();}});
workspaceDialog.addEventListener('cancel',event=>{event.preventDefault();closeWorkspace();});
document.addEventListener('click',event=>{if(!event.target.closest('#panel-menu'))$('panel-menu').removeAttribute('open');});
let zenTap=null;
$('scene').addEventListener('pointerdown',event=>{
  if(density==='zen'&&!revealed)zenTap=scene?.pointers.size>1?null:{id:event.pointerId,pointerType:event.pointerType,x:event.clientX,y:event.clientY};
});
$('scene').addEventListener('pointermove',event=>{if(zenTap&&Math.hypot(event.clientX-zenTap.x,event.clientY-zenTap.y)>=6)zenTap=null;});
$('scene').addEventListener('pointercancel',()=>{zenTap=null;});
$('scene').addEventListener('pointerup',event=>{
  const tap=zenTap;zenTap=null;
  if(tap&&tap.id===event.pointerId&&(!scene||scene.dragDistance<6)&&(event.pointerType==='touch'||!scene?.hitAt(scene.localPoint(event))))showWorkspace();
});
try{const current=localStorage.getItem(arrangementKey);if(current)useArrangement(parseArrangement(current));}catch{initialMessage='Saved arrangement was unavailable or invalid; default controls retained.';}
const help=$('help');$('help-open').onclick=$('about-open').onclick=()=>{releasePointerLook();layout?.close();scene?.cancelZoomAnimation?.();scene?.stopMovement();help.showModal();};$('help-close').onclick=()=>help.close();
$('workspace-help').onclick=()=>{releasePointerLook();cancelWorkspaceImport();workspaceDialog.close();help.showModal();};
function revealControl(control){
  const dialog=control.closest('dialog');
  if(dialog){if(!dialog.open)dialog.showModal();}
  else{
    if(density==='zen')density='normal';
    if(control.closest('#controls'))setChrome('timeline',false);
    else if(control.closest('.topbar'))setChrome('topbar',false);
    else {setChrome('sidebar',false);for(const key of ['tools','source','inspector','observer','map'])activePanels()[key]=true;}
    render(true);
    if(layout?.compact&&control.closest('#side-dock'))layout.open();
  }
  for(let parent=control;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  const highlight=control.closest('label')??control;
  highlight.classList.add('command-highlight');setTimeout(()=>highlight.classList.remove('command-highlight'),2500);
  control.scrollIntoView?.({block:'center'});(control.tagName==='DETAILS'?control.querySelector('summary'):control)?.focus();
}
const commandMenu=mountCommandMenu({dialog:$('command-dialog'),input:$('command-search'),list:$('command-results'),count:$('command-count'),
  beforeOpen(){releasePointerLook();scene?.stopMovement();layout?.close();for(const id of ['help','workspace-dialog','time-options-dialog'])$(id).close();},
  getCommands(){return [
    ...[true,false].map(show=>({id:`astrology:${show}`,title:`${show?'Show':'Hide'} astrology overlays`,section:'Astrology · Earth',priority:30,keywords:'astrology zodiac overlay',run:()=>{if(show&&!earthObserverActive())selectBody('Earth');state.showAstrology=show;render(true);report(`Astrology overlays ${show?'shown':'hidden'}.`);}})),
    ...controlCommands(document,{reveal:revealControl,report}),
    ...bodies.flatMap(body=>[
      {id:`select:${body.id}`,title:`Select ${body.name}`,section:body.parentId?`${body.parentId} · moons`:'Solar system',keywords:body.id,run:()=>selectBody(body.id)},
      {id:`fly:${body.id}`,title:`Fly to ${body.name}`,section:body.parentId??'Solar system',keywords:body.id,priority:8,run:()=>{selectBody(body.id);flyToSelected();}},
    ]),
  ];},
});
$('commands-open').onclick=commandMenu.open;$('commands-close').onclick=commandMenu.close;
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  if(help.open||$('command-dialog').open)return;
  const regionKey=String(e.key).toLowerCase(),editable=e.target.closest('input,select,textarea,[contenteditable="true"]');
  if(!workspaceDialog.open&&!$('time-options-dialog').open&&!editable&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&['h','b','p','t'].includes(regionKey)){
    e.preventDefault();if(e.repeat)return;
    if(regionKey==='h')toggleChrome();else changeChrome({b:'topbar',p:'sidebar',t:'timeline'}[regionKey]);return;
  }
  if(layout?.openState)return;
  if(e.key==='Escape'&&workspaceDialog.open){e.preventDefault();closeWorkspace();return;}
  if(workspaceDialog.open)return;
  if(e.key==='Escape'&&(density==='zen'||revealed)){e.preventDefault();if(revealed)returnToZen();else showWorkspace();return;}
  if(e.key==='Escape'){if(!document.pointerLockElement&&!e.target.closest('input,select,textarea,[contenteditable="true"]')){e.preventDefault();selectBody(null);}return;}
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,button,summary,a[href],[contenteditable="true"]'))return;
  const key=e.key.toLowerCase();
  if(key==='_'||(e.shiftKey&&(key==='-'||e.code==='Minus'))){e.preventDefault();setFov(60);return;}
  if(key==='-'||key==='+'||key==='='){e.preventDefault();stepFov(key==='-'?1/1.2:1.2);return;}
  if(key==='o'){e.preventDefault();showWorkspace();return;}
  if(e.repeat&&['f','l','g','r','h','b','p','t','n','0','1','2','3','4','5','6','7','8','9'].includes(key))return;
  if(key==='f'){e.preventDefault();if(e.shiftKey)snapSurface();else toggleTether();return;}
  if(key==='g'){e.preventDefault();togglePin(e.shiftKey);return;}
  if(key==='l'){e.preventDefault();if(e.shiftKey)flyToSelected();else toggleOrbit();return;}
  if(key==='r'){e.preventDefault();$('reset-surface')?.click();return;}
  if(/^\d$/.test(key)){e.preventDefault();jumpDestination(['Sun','Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Moon'][Number(key)],{cycle:true});return;}
  if(key==='c'){e.preventDefault();scene?.recenter?.();report('View centered.');}else if(key===' '){e.preventDefault();play();}else if(key==='n')$('now').click();else if(key==='?'){releasePointerLook();help.showModal();}else if(key==='['||key===']'){e.preventDefault();setDate(addTime(state.date,(key===']'?day:-day)),'Time stepped.');}
});
window.addEventListener('blur',()=>{releasePointerLook();cancelCoil();globe?.cancelInteraction();scene?.cancelPointerInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(motionUITimer);releasePointerLook();globe?.cancelInteraction();scene?.cancelPointerInput();cancelCoil();}cancelAnimationFrame(frame);clockStartFrame=null;if(!document.hidden&&(state.playing||state.galacticPlaying)){if(state.liveNow){state.date=new Date(Date.now());render();}frame=requestAnimationFrame(tick);}else if(!document.hidden){scene?.endInteraction?.();render(false,{paint:false});}});
new ResizeObserver(()=>renderCoil()).observe($('time-coil'));
window.addEventListener('pagehide',event=>{clearTimeout(motionUITimer);cancelAnimationFrame(frame);cancelCoil();touchFlight?.release();globe?.cancelInteraction();if(!event.persisted){touchFlight?.destroy();scene?.destroy();globe?.destroy();layout?.destroy();dataControls?.destroy();telemetryClient?.destroy();commandMenu.destroy();}});
window.addEventListener('pageshow',event=>{if(event.persisted){clockStartFrame=null;if(state.liveNow)state.date=new Date(Date.now());render(true);if((state.playing||state.galacticPlaying)&&!document.hidden)frame=requestAnimationFrame(tick);}});
layout=mountLayout({onChange:()=>{touchFlight?.release();scene?.stopMovement();if(layout?.openState)releasePointerLook();render(true);}});
touchFlight=mountTouchFlight({
  fine:()=>$('touch-flight-fine')?.checked??false,
  begin(key,fine){clearTracking();scene?.cancelNavigation();if(scene){scene.slowMovement=fine;scene.setMovementInput('touch',key,true);scene.markInteraction();scene.startMovement();}},
  end(key){scene?.setMovementInput('touch',key,false);if(!scene?.heldKeys.size){scene?.stopMovement();scene?.endInteraction();render(false,{paint:false});}},
  step(key,fine){clearTracking();scene?.cancelNavigation();if(key.startsWith('arrow'))scene?.rotateFlight({roll:key==='arrowright'?.09:key==='arrowleft'?-.09:0,pitch:key==='arrowup'?.09:key==='arrowdown'?-.09:0});else scene?.moveFlight({forward:key==='w'?1:key==='s'?-1:0,right:key==='d'?1:key==='a'?-1:0,up:key==='e'?1:key==='q'?-1:0,seconds:.1,slow:fine});},
  action(name){if(name==='reset')$('reset-surface').click();else if(name==='fov-reset')setFov(60);else stepFov(name==='fov-in'?1/1.1:1.1);}
});
for(const section of document.querySelectorAll('details.control-section'))section.addEventListener('toggle',()=>{if(section.open)render(true);});
syncWorkspaceControls();render(true);
if(new URLSearchParams(location.hash.slice(1)).get('view')==='surface'){scene?.flyTo?.('Earth',{surface:true,altitudeM:30});}
report(initialMessage || 'Ready.');
loadCatalogue();
loadLand('/data/earth-land.json',{fetchImpl:dataResponse('land')}).then(data=>{land=data;render();}).catch(()=>report('Coastline data unavailable; coordinate globe remains usable.'));

loadCities('/data/cities.json',{fetchImpl:dataResponse('cities')}).then(data=>{cities=data;render();}).catch(()=>report('City data unavailable; geographic coordinates remain usable.'));

const sharedViewToken=new URLSearchParams(location.hash.slice(1)).get('viewstate');
if(sharedViewToken)decodeSharedView(sharedViewToken).then(value=>{importWorkspace(JSON.stringify(value));report('Shared view restored, paused.');}).catch(error=>report(`Shared view was not restored: ${error.message}`));

dataControls=mountDataControls({state,onDataChange:()=>{calculationCache=null;render(true);},report,getObserver:currentEarthObserver,
  visitTime:date=>{play(false);setDate(date,'ISS pass peak selected.');selectBody('ISS');},downloadJSON});
dataControls.start();
telemetryClient=createISSTelemetryClient({onUpdate:value=>{
  const fields=[value.connection,value.status,Number.isFinite(value.ageSeconds)?`sample age ${value.ageSeconds.toFixed(1)} s`:'sample age unavailable',value.coherent?'coherent state':'awaiting coherent state'];
  $('iss-telemetry-status').textContent=fields.filter(Boolean).join(' · ')+'. Evaluation readout; orbital geometry remains on the selected prediction provider.';
  const values=[];if(value.navigation)values.push(['J2000 position candidate (km)',value.navigation.positionKm.map(x=>x.toFixed(3)).join(', ')],['Velocity candidate (m/s)',value.navigation.velocityMps.map(x=>x.toFixed(2)).join(', ')]);
  if(value.attitude)values.push(['LVLH quaternion candidate',value.attitude.components.map(x=>x.toFixed(5)).join(', ')]);
  for(const joint of Object.values(value.joints??{}))if(joint.fresh)values.push([joint.label,`${joint.value.toFixed(2)}° · ${joint.timestamp}`]);
  $('iss-telemetry-values').innerHTML=values.map(([key,value])=>`<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('');
}});
$('iss-telemetry-connect').onclick=()=>{if(standalone){report('Telemetry requires the local server.');return;}telemetryClient.connect();};
$('iss-telemetry-disconnect').onclick=()=>telemetryClient.disconnect();
