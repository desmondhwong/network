// Codex/OpenAI: optional lunar detail worker and same-module compatibility fallback.
import {renderMoonDetail} from './moon-detail.mjs';
export {renderMoonDetail};
if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
 globalThis.onmessage=({data})=>{
  if(data?.type!=='render'||!Number.isSafeInteger(data.id))return;
  try{
   const raster=renderMoonDetail(data.options);
   // The renderer retains its exact-input cache. Transfer a separate output
   // buffer so a subsequent identical request cannot return detached pixels.
   const result=raster?{...raster,data:raster.data.slice()}:null;
   globalThis.postMessage({type:'result',id:data.id,result},result?[result.data.buffer]:[]);
  }catch(error){globalThis.postMessage({type:'error',id:data.id,message:String(error?.message??error)});}
 };
}
