// Codex/OpenAI: one in-flight raster plus one replaceable latest request.
// Main-thread imports contain no measured map payload. Source and standalone
// editions load the same worker module only when lunar detail is visible.
export class MoonRasterClient {
 constructor({onReady=()=>{},renderer=null,workerFactory=typeof globalThis.Worker==='function'?(url=>new Worker(url,{type:'module',name:'lunar-detail'})):null,loadModule=url=>import(url),sourceURL=new URL('./moon-raster-worker.mjs',import.meta.url).href,embeddedSource=()=>globalThis.document?.getElementById?.('solar-system-moon-worker')?.textContent,createURL=source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})),revokeURL=url=>URL.revokeObjectURL(url)}={}){
  Object.assign(this,{onReady,renderer,workerFactory,loadModule,sourceURL,embeddedSource,createURL,revokeURL});this.generation=0;this.desired=null;this.pending=null;this.inFlight=null;this.completed=null;this.worker=null;this.disposed=false;this.status=renderer?'synchronous':'unloaded';
 }
 request(options){
  if(this.disposed)return null;const key=JSON.stringify(options);
  if(this.completed?.key===key){if(this.desired?.key!==key){this.desired={key,id:++this.generation};this.pending=null;}return this.completed.result;}
  if(this.desired?.key===key)return null;
  const request={id:++this.generation,key,options};this.desired=request;this.pending=request;
  if(this.renderer){const result=this.renderer(options);this.completed={key,result};this.pending=null;return result;}
  this.start();this.dispatch();return null;
 }
 start(){
  if(this.started||this.disposed)return;this.started=true;
  try{const embedded=this.embeddedSource?.();this.url=embedded?this.createURL(JSON.parse(embedded)):this.sourceURL;this.blobURL=embedded?this.url:null;
   if(this.workerFactory){this.worker=this.workerFactory(this.url);this.worker.onmessage=event=>this.receive(event.data);this.worker.onerror=()=>this.fallback();this.status='worker';this.dispatch();}
   else this.fallback();
  }catch(error){this.error=String(error?.message??error);this.fallback();}
 }
 dispatch(){
  if(this.disposed||this.inFlight||!this.pending||!this.worker)return;
  this.inFlight=this.pending;this.pending=null;
  try{this.worker.postMessage({type:'render',id:this.inFlight.id,options:this.inFlight.options});}catch{this.fallback();}
 }
 receive(message){
  if(this.disposed||!this.inFlight||message?.id!==this.inFlight.id)return;
  const request=this.inFlight;this.inFlight=null;
  if(message.type==='error'){this.error=message.message;this.fallback();return;}
  if(message.type==='result'&&this.desired?.id===request.id&&this.desired.key===request.key){this.completed={key:request.key,result:message.result};this.onReady();}
  this.dispatch();
 }
 fallback(){
  if(this.disposed||this.loadingFallback)return;
  this.worker?.terminate();this.worker=null;this.inFlight=null;this.pending=this.desired;this.loadingFallback=true;this.status='loading-fallback';
  Promise.resolve().then(()=>this.loadModule(this.url??this.sourceURL)).then(module=>{
   if(this.disposed)return;this.renderer=module.renderMoonDetail;this.status='fallback';this.loadingFallback=false;
   const request=this.desired;if(!request?.options)return;
   const result=this.renderer(request.options);if(this.disposed||this.desired?.id!==request.id)return;this.completed={key:request.key,result};this.pending=null;this.onReady();
  }).catch(error=>{if(!this.disposed){this.error=String(error?.message??error);this.status='unavailable';this.loadingFallback=false;this.pending=null;}});
 }
 invalidate(){if(this.disposed)return;this.generation++;this.desired=null;this.pending=null;}
 destroy(){if(this.disposed)return;this.disposed=true;this.worker?.terminate();this.worker=null;this.pending=null;this.inFlight=null;this.completed=null;this.desired=null;if(this.blobURL)this.revokeURL(this.blobURL);this.blobURL=null;this.status='disposed';}
}
