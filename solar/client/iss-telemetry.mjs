// Experimental ISS Live evaluation. A transport connection is not fresh telemetry.
export const ISS_TELEMETRY_JOINTS=Object.freeze({P4000007:'2A beta gimbal',P4000008:'4A beta gimbal',P6000007:'4B beta gimbal',P6000008:'2B beta gimbal',S4000007:'1A beta gimbal',S4000008:'3A beta gimbal',S6000007:'3B beta gimbal',S6000008:'1B beta gimbal',S0000001:'Starboard radiator joint',S0000002:'Port radiator joint',S0000003:'Starboard solar alpha joint',S0000004:'Port solar alpha joint'});
export const ISS_TELEMETRY_ITEMS=Object.freeze(['TIME_000001','TIME_000002','USLAB000032','USLAB000033','USLAB000034','USLAB000035','USLAB000036','USLAB000037','USLAB000018','USLAB000019','USLAB000020','USLAB000021','USLAB000013','USLAB000015','USLAB000017',...Object.keys(ISS_TELEMETRY_JOINTS)]);
const POSITION=['USLAB000032','USLAB000033','USLAB000034'],VELOCITY=['USLAB000035','USLAB000036','USLAB000037'],QUATERNION=['USLAB000018','USLAB000019','USLAB000020','USLAB000021'];
let snapshot={connection:'disconnected',items:{},receivedAt:null,error:null};
export function installISSTelemetrySnapshot(value){if(!value||typeof value!=='object'||!value.items||typeof value.items!=='object')throw new TypeError('Invalid telemetry snapshot');const items={};for(const id of ISS_TELEMETRY_ITEMS){const r=value.items[id];if(r&&r.value!==null&&r.timeStamp!==null&&Number.isFinite(Number(r.value))&&Number.isFinite(Number(r.timeStamp)))items[id]={value:Number(r.value),timeStamp:Number(r.timeStamp)};}snapshot={connection:String(value.connection??'unknown'),items,receivedAt:value.receivedAt??null,error:value.error?String(value.error):null};return getISSTelemetryStatus();}
export function evaluateISSTelemetry(value,{now=new Date(),date=now,maxAgeSeconds=30,maxSkewSeconds=1}={}){
  const items=value.items??{},year=Number(items.TIME_000002?.value),actual=+new Date(now),simulation=+new Date(date);
  const validYear=Number.isInteger(year)&&year>=2000&&year<=2200;
  // Public Mimic client defines TimeStamp as hours since Dec 31 preceding year.
  // This is a candidate convention, checked against the actual wall clock here.
  const epoch=r=>validYear&&r&&Number.isFinite(r.timeStamp)?Date.UTC(year-1,11,31)+r.timeStamp*3600000:NaN;
  function group(ids){const rows=ids.map(id=>items[id]);if(rows.some(r=>!r||!Number.isFinite(r.value)||!Number.isFinite(r.timeStamp)))return null;const times=rows.map(epoch),latest=Math.max(...times),oldest=Math.min(...times);if(!times.every(Number.isFinite)||latest-oldest>maxSkewSeconds*1000||actual-oldest>maxAgeSeconds*1000||latest-actual>5000)return null;return {values:rows.map(r=>r.value),timestamp:new Date(latest).toISOString(),ageSeconds:(actual-oldest)/1000};}
  const nav=group([...POSITION,...VELOCITY]),attitude=group(QUATERNION),timestamp=nav?.timestamp??attitude?.timestamp??null,coherent=!!nav,ageSeconds=timestamp?(actual-Date.parse(timestamp))/1000:null,simulationMatches=timestamp?Math.abs(simulation-Date.parse(timestamp))<=5000:false;
  const joints=Object.fromEntries(Object.entries(ISS_TELEMETRY_JOINTS).map(([id,label])=>{const g=group([id]);return [id,{label,value:g?.values[0]??null,unit:'degrees',timestamp:g?.timestamp??null,fresh:!!g}];}));
  const plausible=nav&&Math.hypot(...nav.values.slice(0,3))>6300&&Math.hypot(...nav.values.slice(0,3))<10000&&Math.hypot(...nav.values.slice(3))>6000&&Math.hypot(...nav.values.slice(3))<9000;
  return {connection:value.connection??'disconnected',receivedAt:value.receivedAt??null,timestamp,ageSeconds,coherent:!!plausible,simulationMatches,experimental:true,geometryUsable:false,joints,navigation:plausible?{positionKm:nav.values.slice(0,3),velocityMps:nav.values.slice(3),frame:'GNC J2000 propagated state (source label)',timestamp:nav.timestamp}:null,attitude:attitude?{components:attitude.values,frame:'LVLH (source label)',timestamp:attitude.timestamp}:null,itemCount:Object.keys(items).length,error:value.error??null,status:value.error?'Telemetry unavailable · '+value.error:plausible?'Fresh coherent candidate telemetry · evaluation only; frame conventions unvalidated':Object.keys(items).length?'Telemetry incomplete, stale, or timestamps inconsistent · predicted orbit retained':'Waiting for timestamped telemetry · predicted orbit retained',limitations:'Experimental public feed. Timestamp convention checked for freshness; quaternion order, mapping direction and LVLH basis remain unvalidated. Telemetry never replaces predicted position or schematic attitude.'};
}
export function getISSTelemetryStatus(options={}){return evaluateISSTelemetry(snapshot,options);}
// No unsafe quaternion inference. These become non-null only after independently
// documented frame/direction conventions and current feed validation are available.
export function getISSTelemetryAttitude(){return null;}
export function getISSTelemetryPose(){return null;}
export function createISSTelemetryClient({fetchImpl=globalThis.fetch,onUpdate=()=>{},pollMs=2000,now=()=>new Date()}={}){
  let running=false,timer=null,controller=null,connected=false,destroyed=false,generation=0;
  async function request(action='',expected=generation){
    const active=new AbortController();controller=active;const timeout=setTimeout(()=>active.abort(),12000);
    try{const response=await fetchImpl('/api/iss-telemetry'+(action?'?'+action+'=1':''),{signal:active.signal});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();if(expected===generation&&!destroyed)installISSTelemetrySnapshot(data);}
    catch(error){if(expected===generation&&!destroyed){installISSTelemetrySnapshot({...snapshot,connection:'error',error:error.message});running=false;}}
    finally{clearTimeout(timeout);if(controller===active)controller=null;}
    const result=getISSTelemetryStatus({now:now()});if(expected!==generation||destroyed)return result;onUpdate(result);if(running){timer=setTimeout(()=>request('',expected),pollMs);timer?.unref?.();}return result;
  }
  function cancel(){running=false;generation++;clearTimeout(timer);controller?.abort();controller=null;}
  return {connect(){if(destroyed)throw new Error('Telemetry client disposed');if(running)return Promise.resolve(getISSTelemetryStatus({now:now()}));running=true;connected=true;generation++;return request('connect');},disconnect(){const wasConnected=connected;cancel();connected=false;if(destroyed||!wasConnected)return Promise.resolve(getISSTelemetryStatus({now:now()}));return request('disconnect');},destroy(){cancel();destroyed=true;connected=false;},dispose(){this.destroy();},poll(){return running?request():Promise.resolve(getISSTelemetryStatus({now:now()}));},status(options={}){return getISSTelemetryStatus({now:now(),...options});}};
}
