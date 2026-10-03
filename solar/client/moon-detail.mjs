// Machine-authored Codex/OpenAI, 2026-10-01. Measured LRO color/elevation,
// bounded software rendering. See data-sources/moon-detail/provenance.md.
import data from './data/moon-lro.json' with {type:'json'};
import {earthRayNormal} from './ray-sphere.mjs';
const C=data.color,D=data.dem,R=data.metadata.referenceRadiusM,TAU=2*Math.PI;
// The offline payload remains bundled, but decoding each measured layer is
// deferred until that layer is first sampled. Imagery does not decode the DEM.
function bytes(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
let indices=null,heights=null;
function colorIndices(){if(!indices){indices=bytes(C.indicesBase64);if(indices.length!==C.width*C.height)throw new Error('Invalid retained Moon image.');}return indices;}
function terrainHeights(){if(!heights){const raw=bytes(D.samplesBase64);if(raw.length!==D.width*D.height*2)throw new Error('Invalid retained Moon elevations.');heights=new Float32Array(D.width*D.height);for(let i=0;i<heights.length;i++)heights[i]=((raw[i*2]|raw[i*2+1]<<8)-20000)/2;}return heights;}
import {MOON_DETAIL_METADATA} from './moon-metadata.mjs';
export {MOON_DETAIL_METADATA} from './moon-metadata.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=(n,s)=>(n%s+s)%s,dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0),norm=v=>Math.hypot(...v),unit=v=>{const n=norm(v);return v.map(x=>x/n);},finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
function coordinates(latitude,longitude,width,height){return [(longitude+180)/360*width-.5,clamp((90-latitude)/180*height-.5,0,height-1)];}
function bilinear(x,y,width,height,sample){const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,ix=wrap(x0,width),jx=wrap(x0+1,width),jy=Math.min(height-1,y0+1);return (sample(y0*width+ix)*(1-fx)+sample(y0*width+jx)*fx)*(1-fy)+(sample(jy*width+ix)*(1-fx)+sample(jy*width+jx)*fx)*fy;}
function validLocation(latitude,longitude){if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude))throw new RangeError('Finite lunar coordinates required.');}
export function moonElevationAt(latitude,longitude){validLocation(latitude,longitude);const [x,y]=coordinates(latitude,longitude,D.width,D.height),samples=terrainHeights();return bilinear(x,y,D.width,D.height,i=>samples[i]);}
export function moonColorAt(latitude,longitude){validLocation(latitude,longitude);const [x,y]=coordinates(latitude,longitude,C.width,C.height),samples=colorIndices();return [0,1,2].map(channel=>bilinear(x,y,C.width,C.height,i=>C.palette[samples[i]*3+channel]));}
const location=n=>[Math.asin(clamp(n[2],-1,1))*180/Math.PI,Math.atan2(n[1],n[0])*180/Math.PI];
const heightAt=n=>moonElevationAt(...location(n));

/** Outward DEM gradient normal. Exaggeration affects display geometry only. */
export function moonTerrainNormal(latitude,longitude,exaggeration=1){
 validLocation(latitude,longitude);if(!Number.isFinite(exaggeration)||exaggeration<1||exaggeration>20)throw new RangeError('Terrain exaggeration must be 1–20.');
 const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180,normal=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)],east=[-Math.sin(lon),Math.cos(lon),0],north=[-Math.sin(lat)*Math.cos(lon),-Math.sin(lat)*Math.sin(lon),Math.cos(lat)],step=360/D.width,delta=step*Math.PI/180;
 const dhLon=(moonElevationAt(latitude,longitude+step)-moonElevationAt(latitude,longitude-step))*exaggeration/(2*delta*R*Math.max(.01,Math.cos(lat))),lo=Math.max(-90,latitude-step),hi=Math.min(90,latitude+step),dhLat=(moonElevationAt(hi,longitude)-moonElevationAt(lo,longitude))*exaggeration/((hi-lo)*Math.PI/180*R);
 return unit(normal.map((v,k)=>v-east[k]*dhLon-north[k]*dhLat));
}

/** First sampled terrain intersection within the measured radial shell.
 * Fixed 32 shell intervals plus 16 bisections bound work. Near-ground cameras
 * inside the highest terrain use the reference sphere, as Pin/collisions do. */
export function moonRayHit(camera,direction,{terrain=false,exaggeration=1}={}){
 if(!finite(camera)||!finite(direction)||!Number.isFinite(exaggeration)||exaggeration<1||exaggeration>20)throw new RangeError('Invalid Moon ray.');
 if(!terrain||norm(camera)<=1+D.maxHeightM*exaggeration/R){const normal=earthRayNormal(camera,direction);return normal?{point:normal,normal,terrain:false}:null;}
 const outer=1+D.maxHeightM*exaggeration/R,inner=1+D.minHeightM*exaggeration/R,a=dot(direction,direction),b=dot(camera,direction),c=dot(camera,camera)-outer*outer,disc=b*b-a*c;
 if(a<=0||b>=0||disc<0)return null;
 const first=c/(-b+Math.sqrt(disc)),innerDisc=b*b-a*(dot(camera,camera)-inner*inner),last=innerDisc>=0?(-b-Math.sqrt(innerDisc))/a:(-b+Math.sqrt(disc))/a;
 const point=t=>camera.map((v,k)=>v+t*direction[k]),residual=t=>{const p=point(t),n=norm(p);return n-1-heightAt(p.map(x=>x/n))*exaggeration/R;};
 let previous=first,previousValue=residual(first);
 for(let i=1;i<=32;i++){const t=first+(last-first)*i/32,value=residual(t);if(value<=0&&previousValue>=0){let lo=previous,hi=t;for(let j=0;j<16;j++){const mid=(lo+hi)/2;if(residual(mid)>0)lo=mid;else hi=mid;}const p=point((lo+hi)/2),n=unit(p);return {point:p,normal:moonTerrainNormal(...location(n),exaggeration),terrain:true};}previous=t;previousValue=value;}
 return null;
}

let previous=null;
export function renderMoonDetail({width,height,camera,forward,right,up,focal,light,mode='imagery',exaggeration=1,bounds=null,maxPixels=60000,shadow=1}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||![camera,forward,right,up,light].every(finite)||!Number.isFinite(focal)||focal<=0||!['imagery','terrain'].includes(mode)||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>60000||!Number.isFinite(shadow)||shadow<0||shadow>1)throw new RangeError('Invalid Moon raster.');
 const box=bounds??{x:0,y:0,width,height},x=clamp(Math.floor(box.x),0,width),y=clamp(Math.floor(box.y),0,height),dw=Math.max(0,Math.min(width,Math.ceil(box.x+box.width))-x),dh=Math.max(0,Math.min(height,Math.ceil(box.y+box.height))-y);
 if(!dw||!dh)return null;
 const key=JSON.stringify([width,height,camera,forward,right,up,focal,light,mode,exaggeration,x,y,dw,dh,maxPixels,shadow]);if(previous?.key===key)return previous.result;
 const scale=Math.min(1,512/Math.max(dw,dh),Math.sqrt(maxPixels/(dw*dh))),rw=Math.max(1,Math.floor(dw*scale)),rh=Math.max(1,Math.floor(dh*scale)),pixels=new Uint8ClampedArray(rw*rh*4);let hitCount=0,terrainCount=0;
 const sun=unit(light);
 for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){
  const sx=(x+(i+.5)*dw/rw-width/2)/focal,sy=(height/2-y-(j+.5)*dh/rh)/focal,ray=forward.map((v,k)=>v+right[k]*sx+up[k]*sy),hit=moonRayHit(camera,ray,{terrain:mode==='terrain',exaggeration});if(!hit)continue;
  const n=unit(hit.point),color=moonColorAt(...location(n)),illumination=.025+.975*Math.sqrt(Math.max(0,dot(hit.normal,sun)))*shadow,p=(j*rw+i)*4;
  for(let k=0;k<3;k++)pixels[p+k]=color[k]*illumination;pixels[p+3]=255;hitCount++;if(hit.terrain)terrainCount++;
 }
 const result={width:rw,height:rh,data:pixels,x,y,displayWidth:dw,displayHeight:dh,hitCount,terrainCount,style:'satellite',source:MOON_DETAIL_METADATA,mode,exaggeration,referenceSphereFallback:mode==='terrain'&&norm(camera)<=1+D.maxHeightM*exaggeration/R};previous={key,result};return result;
}
