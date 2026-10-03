/* Machine-authored Codex/OpenAI, claim260924-161257-001.
 * NASA Earth Observatory / Reto Stöckli: Blue Marble Next Generation, July2004.
 * Offline observed mosaic with display-only sampling effects; no live imagery.
 * See ../data-sources/earth-imagery-provenance.md. */
import source from './data/earth-blue-marble-200407.json' with {type:'json'};
import mask from './data/earth-natural-earth-mask.json' with {type:'json'};

export const EARTH_IMAGERY_METADATA=Object.freeze({...source.metadata,maxRasterPixels:160000,maxRasterDimension:640,styles:['satellite','pixels','dots','schematic'],description:'NASA Earth Observatory · Blue Marble July 2004 · 2048×1024 offline composite; display detail does not increase geographic accuracy.'});
const W=source.width,H=source.height,palette=Uint8Array.from(source.palette);
let indices=null,maskBits=null;
function decode(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function imageIndices(){if(!indices){indices=decode(source.indicesBase64);if(W!==2048||H!==1024||indices.length!==W*H||palette.length!==768)throw new Error('Invalid bundled Earth image dimensions.');}return indices;}
function schematicMask(){return maskBits??=decode(mask.bitsBase64);}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=2*Math.PI,RAD=Math.PI/180;
const finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const wrap=(n,size)=>(n%size+size)%size;

/** Body-fixed geographic sampling with a wrapped antimeridian and clamped poles.
 * Texture coordinates refer to pixel centers; bilinear interpolation wraps both
 * seam neighbours rather than stretching a polygon across longitude 180. */
export function earthTextureSample(latitude,longitude,{bilinear=true}={}){
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude))throw new RangeError('Finite geographic image coordinates required.');
  return sampleUV((longitude+180)/360*W-.5,(90-latitude)/180*H-.5,bilinear);
}
function sampleUV(x,y,bilinear){
  imageIndices();
  y=clamp(y,0,H-1);
  if(!bilinear){const p=indices[Math.round(y)*W+wrap(Math.round(x),W)]*3;return [palette[p],palette[p+1],palette[p+2]];}
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,x1=wrap(x0+1,W),left=wrap(x0,W),bottom=Math.min(H-1,y0+1);
  const a=indices[y0*W+left]*3,b=indices[y0*W+x1]*3,c=indices[bottom*W+left]*3,d=indices[bottom*W+x1]*3;
  return [0,1,2].map(i=>(palette[a+i]*(1-fx)+palette[b+i]*fx)*(1-fy)+(palette[c+i]*(1-fx)+palette[d+i]*fx)*fy);
}

/** Nearest forward ray hit on the unit sphere, or null. Camera and direction
 * use body-fixed axes. Factorized clearance avoids a near-ground cancellation;
 * a cross-product discriminant retains the small silhouette at large distances. */
export {earthRayNormal} from './ray-sphere.mjs';
import {earthRayNormal} from './ray-sphere.mjs';

const rasterCache=new Map();
/** Pure inverse raster projection, bounded regardless of viewport or height.
 * camera: Earth-radius units. forward/right/up/light: body-fixed vectors.
 * focal, bounds, centerX/Y, radiusPixels: full CSS-pixel canvas coordinates.
 * Orthographic mode is used only by the mini-globe and ignores camera/focal.
 * Transparent pixels miss the sphere, or form intentional dots-style gaps. */
export function renderEarthImagery({width,height,camera=[0,0,2],forward=[0,0,-1],right=[1,0,0],up=[0,1,0],focal=height,projection='perspective',radiusPixels=Math.min(width,height)/2,centerX=width/2,centerY=height/2,style='satellite',detail=75,schematicDetail='medium',light=null,bounds=null}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>100000||height>100000||!finite3(camera)||!finite3(forward)||!finite3(right)||!finite3(up)||!['perspective','orthographic'].includes(projection)||!['satellite','pixels','dots','schematic'].includes(style)||!['low','medium','high'].includes(schematicDetail)||!Number.isInteger(detail)||detail<0||detail>100||!Number.isFinite(focal)||focal<=0||!Number.isFinite(radiusPixels)||radiusPixels<=0||!Number.isFinite(centerX)||!Number.isFinite(centerY)||light!==null&&!finite3(light))throw new RangeError('Invalid Earth raster projection.');
  const box=bounds??{x:0,y:0,width,height};
  if(!['x','y','width','height'].every(k=>Number.isFinite(box[k]))||box.width<=0||box.height<=0)throw new RangeError('Positive finite Earth image bounds required.');
  const x=clamp(Math.floor(box.x),0,width),y=clamp(Math.floor(box.y),0,height),displayWidth=Math.max(0,Math.min(width,Math.ceil(box.x+box.width))-x),displayHeight=Math.max(0,Math.min(height,Math.ceil(box.y+box.height))-y);
  const key=JSON.stringify([width,height,camera,forward,right,up,focal,projection,radiusPixels,centerX,centerY,style,detail,schematicDetail,light,x,y,displayWidth,displayHeight]);
  if(rasterCache.has(key))return rasterCache.get(key);
  const budget=12000+148000*(detail/100)**2,scale=Math.min(1,640/Math.max(1,displayWidth,displayHeight),Math.sqrt(budget/Math.max(1,displayWidth*displayHeight))),rw=Math.max(1,Math.floor(displayWidth*scale)),rh=Math.max(1,Math.floor(displayHeight*scale)),data=new Uint8ClampedArray(rw*rh*4),sx=displayWidth/rw,sy=displayHeight/rh;
  const cell=style==='satellite'||style==='schematic'?1:Math.max(style==='dots'?3:1,Math.round(2+14*(1-detail/100))),cols=Math.ceil(rw/cell),colors=new Array(cols*Math.ceil(rh/cell));
  let hitCount=0;
  const normalAt=(px,py)=>{
    const rx=(px-centerX)/(projection==='orthographic'?radiusPixels:focal),uy=(centerY-py)/(projection==='orthographic'?radiusPixels:focal);
    if(projection==='orthographic'){const d=1-rx*rx-uy*uy;if(d<0)return null;const z=Math.sqrt(d);return [right[0]*rx+up[0]*uy-forward[0]*z,right[1]*rx+up[1]*uy-forward[1]*z,right[2]*rx+up[2]*uy-forward[2]*z];}
    return earthRayNormal(camera,[forward[0]+right[0]*rx+up[0]*uy,forward[1]+right[1]*rx+up[1]*uy,forward[2]+right[2]*rx+up[2]*uy]);
  };
  const colorAt=n=>{
    const u=Math.atan2(n[1],n[0])/TAU+.5,v=.5-Math.asin(clamp(n[2],-1,1))/Math.PI;
    if(style!=='schematic')return sampleUV(u*W-.5,v*H-.5,style==='satellite');
    const step={low:4,medium:2,high:1}[schematicDetail],mx=wrap(Math.floor(u*mask.width/step)*step,mask.width),my=clamp(Math.floor(v*mask.height/step)*step,0,mask.height-1),index=my*mask.width+mx;
    if(!(schematicMask()[index>>3]&(128>>(index&7))))return [23,62,89];
    const lat=Math.abs((.5-v)*180);return lat>67?[213,229,223]:lat>15&&lat<35?[185,165,116]:lat<16?[54,92,64]:[97,125,76];
  };
  for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){
    const n=normalAt(x+(i+.5)*sx,y+(j+.5)*sy);if(!n)continue;hitCount++;
    let color;
    if(cell===1)color=colorAt(n);
    else{const ci=Math.floor(i/cell),cj=Math.floor(j/cell),id=cj*cols+ci;let entry=colors[id];if(!entry){const nx=x+Math.min(rw-.5,(ci+.5)*cell)*sx,ny=y+Math.min(rh-.5,(cj+.5)*cell)*sy;entry=colors[id]=colorAt(normalAt(nx,ny)??n);}color=entry;
      if(style==='dots'&&Math.hypot((i%cell+.5)/cell-.5,(j%cell+.5)/cell-.5)>.43)continue;}
    const illumination=light?.length===3?.25+.75*Math.sqrt(Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2])):1,p=(j*rw+i)*4;
    data[p]=color[0]*illumination;data[p+1]=color[1]*illumination;data[p+2]=color[2]*illumination;data[p+3]=255;
  }
  const result={width:rw,height:rh,data,x,y,displayWidth,displayHeight,hitCount,style,detail,schematicDetail,cellSize:cell,projection,source:style==='schematic'?mask.metadata:EARTH_IMAGERY_METADATA};
  rasterCache.set(key,result);if(rasterCache.size>4)rasterCache.delete(rasterCache.keys().next().value);return result;
}

const surfaces=new WeakMap();
/** Upload a bounded raster and paint through the caller's transform/opacity/clip.
 * Factory injection supports checked Canvas consumers without an HTML document.
 * No Image() decode, URL, fetch or cross-origin canvas is involved. */
export function drawEarthImagery(context,raster,{canvasFactory=null,layer='earth'}={}){
  if(!raster||!raster.hitCount||!raster.displayWidth||!raster.displayHeight)return false;
  let layers=surfaces.get(context);if(!layers){layers=new Map();surfaces.set(context,layers);}let surface=layers.get(layer);
  if(!surface){const factory=canvasFactory??(typeof globalThis.OffscreenCanvas==='function'?()=>new OffscreenCanvas(1,1):()=>context.canvas?.ownerDocument?.createElement('canvas')??globalThis.document?.createElement('canvas'));
    const canvas=factory();if(!canvas)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;surface={canvas,ctx,raster:null,image:null};layers.set(layer,surface);if(layers.size>8)layers.delete(layers.keys().next().value);}
  if(surface.raster!==raster){
    if(surface.canvas.width!==raster.width||surface.canvas.height!==raster.height||!surface.image){surface.canvas.width=raster.width;surface.canvas.height=raster.height;surface.image=surface.ctx.createImageData(raster.width,raster.height);}
    const image=surface.image;if(!image?.data||image.data.length!==raster.data.length)throw new Error('Earth image requires Canvas ImageData support.');image.data.set(raster.data);surface.ctx.putImageData(image,0,0);surface.raster=raster;
  }
  context.save();context.imageSmoothingEnabled=raster.style==='satellite';context.drawImage(surface.canvas,raster.x,raster.y,raster.displayWidth,raster.displayHeight);context.restore();return true;
}
