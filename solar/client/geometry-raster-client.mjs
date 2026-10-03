// Codex/OpenAI: optional detail worker with an exact-current solid fallback.
// One client per visible object prevents ISS and Saturn from superseding one
// another. Queues contain one in-flight job and one replaceable latest job.
import {renderGeometry} from './geometry-raster.mjs';
export class GeometryRasterClient {
 constructor({onReady=()=>{},renderer=renderGeometry,workerFactory=typeof globalThis.Worker==='function'?(url=>new Worker(url,{type:'module',name:'geometry-detail'})):null,sourceURL=new URL('./geometry-raster-worker.mjs',import.meta.url).href,embeddedSource=()=>globalThis.document?.getElementById?.('solar-system-geometry-worker')?.textContent,createURL=source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})),revokeURL=url=>URL.revokeObjectURL(url)}={}){
  Object.assign(this,{onReady,renderer,workerFactory,sourceURL,embeddedSource,createURL,revokeURL});this.generation=0;this.desired=null;this.pending=null;this.inFlight=null;this.completed=null;this.worker=null;this.disposed=false;this.status=workerFactory?'unloaded':'synchronous';
 }
 request(options){
  if(this.disposed)return null;const key=JSON.stringify(options);
  if(this.completed?.key===key){if(this.desired?.key!==key){this.desired={key,id:++this.generation};this.pending=null;}return this.completed.result;}
  if(this.desired?.key===key)return null;
  const request={id:++this.generation,key,options};this.desired=request;this.pending=request;
  if(!this.workerFactory||this.failed){const result=this.renderer(options);this.completed={key,result};this.pending=null;return result;}
  this.start();this.dispatch();return this.completed?.key===key?this.completed.result:null;
 }
 start(){
  if(this.started||this.disposed)return;this.started=true;
  try{const embedded=this.embeddedSource?.();this.url=embedded?this.createURL(JSON.parse(embedded)):this.sourceURL;this.blobURL=embedded?this.url:null;
   this.worker=this.workerFactory(this.url);this.worker.onmessage=event=>this.receive(event.data);this.worker.onerror=()=>this.fallback();this.status='worker';
  }catch(error){this.error=String(error?.message??error);this.fallback();}
 }
 dispatch(){
  if(this.disposed||this.inFlight||!this.pending||!this.worker)return;
  this.inFlight=this.pending;this.pending=null;
  try{this.worker.postMessage({type:'render',id:this.inFlight.id,options:this.inFlight.options});}catch(error){this.error=String(error?.message??error);this.fallback();}
 }
 receive(message){
  if(this.disposed||!this.inFlight||message?.id!==this.inFlight.id)return;
  const request=this.inFlight;this.inFlight=null;
  if(message.type==='error'){this.error=message.message;this.fallback();return;}
  if(message.type==='result'&&this.desired?.id===request.id&&this.desired.key===request.key){this.completed={key:request.key,result:message.result};this.onReady();}
  this.dispatch();
 }
 fallback(){
  if(this.disposed||this.failed)return;this.failed=true;this.worker?.terminate();this.worker=null;this.inFlight=null;this.pending=null;this.status='fallback';
  const request=this.desired;if(!request?.options)return;
  try{const result=this.renderer(request.options);if(this.disposed||this.desired?.id!==request.id)return;this.completed={key:request.key,result};queueMicrotask(()=>{if(!this.disposed&&this.completed?.key===this.desired?.key)this.onReady();});}
  catch(error){this.error=String(error?.message??error);this.status='unavailable';}
 }
 invalidate(){if(this.disposed)return;this.generation++;this.desired=null;this.pending=null;}
 destroy(){if(this.disposed)return;this.disposed=true;this.worker?.terminate();this.worker=null;this.pending=null;this.inFlight=null;this.completed=null;this.desired=null;if(this.blobURL)this.revokeURL(this.blobURL);this.blobURL=null;this.status='disposed';}
}
