// Codex/OpenAI: the same physical geometry and software renderer in both realms.
import {ISS_GEOMETRY} from './iss-geometry.mjs';
import {renderISS} from './iss-renderer.mjs';
import {renderSaturnRings,renderSaturnRingShadow} from './saturn-rings.mjs';

export function renderGeometry({kind,options,shadowOptions=null,eye,frame,coarse=false}={}) {
 if(kind==='saturn')return {
  raster:renderSaturnRings(coarse?{...options,maxPixels:4096}:options),
  shadow:shadowOptions?renderSaturnRingShadow(coarse?{...shadowOptions,maxPixels:1024}:shadowOptions):null,
  coarse,
 };
 if(kind==='iss'){
  const vertices=ISS_GEOMETRY.vertices.map(p=>[0,1,2].map(i=>eye[i]+((frame.x[i]*p[0]+frame.y[i]*p[1])+frame.z[i]*p[2])));
  return {raster:renderISS({...options,vertices,faces:ISS_GEOMETRY.faces,edges:coarse?[]:ISS_GEOMETRY.edges,...(coarse?{maxPixels:4096}:{})}),coarse};
 }
 throw new RangeError('Unknown geometry raster kind.');
}

// Renderers return fresh arrays and retain no pixel buffers. Transferring these
// arrays is safe; mesh indices are ordinary arrays and remain in the worker.
export function geometryTransferBuffers(result) {
 const buffers=new Set();for(const raster of [result?.raster,result?.shadow])if(raster)for(const value of Object.values(raster))if(ArrayBuffer.isView(value))buffers.add(value.buffer);
 return [...buffers];
}
