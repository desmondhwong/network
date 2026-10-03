// Codex/OpenAI: optional fine-detail ISS and Saturn raster worker.
import {renderGeometry,geometryTransferBuffers} from './geometry-raster.mjs';
export {renderGeometry};
if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
 globalThis.onmessage=({data})=>{
  if(data?.type!=='render'||!Number.isSafeInteger(data.id))return;
  try{const result=renderGeometry(data.options);globalThis.postMessage({type:'result',id:data.id,result},geometryTransferBuffers(result));}
  catch(error){globalThis.postMessage({type:'error',id:data.id,message:String(error?.message??error)});}
 };
}
