// Machine-authored Codex/OpenAI, 2026-10-01. NASA PDS RMS radial boundaries;
// colors, opacity and radial texture are schematic. See data-sources/saturn-rings/.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
import {earthRayNormal} from './ray-sphere.mjs';
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const rgb=hex=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16));
export const SATURN_RING_BANDS=Object.freeze([
  {name:'C ring',innerKm:74491,outerKm:91975,color:'#9e927e',opacity:.28,opticalDepth:'0.05–0.35'},
  {name:'B ring',innerKm:91975,outerKm:117570,color:'#d1c3a4',opacity:.88,opticalDepth:'0.4–5'},
  // PDS gives an overlapping nominal inner edge of 117500 km for the
  // division. The display begins at its tabulated B-ring outer edge.
  {name:'Cassini Division',innerKm:117570,sourceInnerKm:117500,outerKm:122050,color:'#716b60',opacity:.055,opticalDepth:'0–0.2'},
  {name:'A ring',innerKm:122050,outerKm:136770,color:'#b5aa93',opacity:.68,opticalDepth:'0.4–1'},
].map(b=>Object.freeze(b)));
export const SATURN_RING_GAPS=Object.freeze([
  Object.freeze({name:'Encke Gap',innerKm:133423,outerKm:133745}),
  Object.freeze({name:'Keeler Gap',innerKm:136487,outerKm:136522}),
]);
export const SATURN_RINGS=Object.freeze({innerKm:74491,outerKm:136770,bands:SATURN_RING_BANDS,gaps:SATURN_RING_GAPS,
  source:'https://pds-rings.seti.org/saturn/saturn_rings_table.html',frame:'Saturn equatorial plane from the supplied body frame',
  description:'Schematic thin A/B/C rings and Cassini Division; sourced radial boundaries, illustrative optical texture',
  limitation:'No particles, ring evolution, resolved density waves, vertical thickness or photometric accuracy. Shadows use a spherical planet, thin rings and point Sun; faint outer rings omitted.'});
const colors=SATURN_RING_BANDS.map(b=>rgb(b.color));
function bandIndex(radiusKm,bands=SATURN_RING_BANDS){
  if(!Number.isFinite(radiusKm))return -1;
  for(const gap of SATURN_RING_GAPS)if(radiusKm>=gap.innerKm&&radiusKm<gap.outerKm)return -1;
  for(let i=0;i<bands.length;i++)if(radiusKm>=bands[i].innerKm&&radiusKm<bands[i].outerKm)return i;
  return -1;
}
const sinc=x=>Math.abs(x)<1e-8?1:Math.sin(x)/x;
function modulation(radiusKm,texture,drdx=0,drdy=0){
  if(!texture)return 1;
  // Integrate each procedural radial wave over the local pixel footprint.
  // This prevents unresolved bands from turning into screen-space moiré.
  const wave=f=>Math.sin(radiusKm*f)*sinc(drdx*f/2)*sinc(drdy*f/2);
  return .9+.065*wave(.0006)+.035*wave(.0017);
}
/** Radius is measured from Saturn's center. Opacity is a display choice,
 * distinct from the physical optical-depth ranges retained above. */
export function saturnRingSample(radiusKm,{texture=true}={}){
  const index=bandIndex(radiusKm);if(index<0)return null;const band=SATURN_RING_BANDS[index],m=modulation(radiusKm,texture);
  return {...band,radiusKm,opacity:band.opacity*m,rgb:colors[index].map(v=>Math.round(v*m))};
}

function rasterBounds(width,height,focal,eye,forward,right,up,normal){
  // Exact extrema of (c+a cos(t)+b sin(t))/(d+e cos(t)+f sin(t))
  // tightly bound a projected circle whenever it stays in front of the eye.
  const center=eye.map(x=>-x),z=dot(center,forward);if(z+1<=0)return null;
  const seed=Math.abs(normal[2])<.9?[0,0,1]:[0,1,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],raw=cross(normal,seed),length=Math.hypot(...raw),u=raw.map(v=>v/length),v=cross(normal,u),e=dot(u,forward),f=dot(v,forward);
  if(z-Math.hypot(e,f)<=1e-8)return {x:0,y:0,width,height};
  const extrema=axis=>{
    const c=dot(center,axis),a=dot(u,axis),b=dot(v,axis),A=c*e-z*a,B=z*b-c*f,C=b*e-a*f,R=Math.hypot(A,B);
    const at=t=>(c+a*Math.cos(t)+b*Math.sin(t))/(z+e*Math.cos(t)+f*Math.sin(t));
    if(R<1e-15){const p=at(0);return [p,p];}
    const phi=Math.atan2(B,A),angle=Math.asin(clamp(-C/R,-1,1)),one=at(angle-phi),two=at(Math.PI-angle-phi);return [Math.min(one,two),Math.max(one,two)];
  };
  const x=extrema(right),y=extrema(up);
  const left=clamp(Math.floor(width/2+focal*x[0])-2,0,width),rightEdge=clamp(Math.ceil(width/2+focal*x[1])+2,0,width),top=clamp(Math.floor(height/2-focal*y[1])-2,0,height),bottom=clamp(Math.ceil(height/2-focal*y[0])+2,0,height);
  return rightEdge>left&&bottom>top?{x:left,y:top,width:rightEdge-left,height:bottom-top}:null;
}

/** Thin ring annuli in the exact supplied equatorial plane. eye and
 * planetRadiusM are unscaled planet-relative meters; bodyScale scales both
 * displayed rings and sphere. Camera/frame axes share the same world frame.
 * Composite after Saturn's disc: nearer ring pixels cover it, farther ones
 * are attenuated once by planetOpacity. The raster is capped at 160k pixels. */
export function renderSaturnRings({width,height,focal,forward,right,up,eye,frame,planetRadiusM=58232000,bodyScale=1,planetOpacity=1,maxPixels=160000,texture=true,bands=SATURN_RING_BANDS,light=null}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isFinite(focal)||focal<=0||![forward,right,up,eye,frame?.z].every(finite)||!Number.isFinite(planetRadiusM)||planetRadiusM<=0||!Number.isFinite(bodyScale)||bodyScale<=0||bodyScale>1e12||!Number.isFinite(planetOpacity)||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>160000||!Array.isArray(bands)||!bands.length||bands.some(b=>!Number.isFinite(b.innerKm)||!Number.isFinite(b.outerKm)||b.innerKm<0||b.outerKm<=b.innerKm||!/^#[\da-f]{6}$/i.test(b.color)||!Number.isFinite(b.opacity)))throw new RangeError('Invalid Saturn ring render parameters.');
  const normalLength=Math.hypot(...frame.z);if(normalLength<1e-12)throw new RangeError('Saturn ring pole must be nonzero.');
  if(light!==null&&(!finite(light)||Math.hypot(...light)<1e-12))throw new RangeError('Nonzero Saturn illumination direction required.');
  const sun=light?.map(x=>x/Math.hypot(...light));
  const normal=frame.z.map(x=>x/normalLength),outerKm=Math.max(...bands.map(b=>b.outerKm)),scaleM=outerKm*1000*bodyScale,origin=eye.map(x=>x/scaleM),planeDistance=dot(origin,normal);
  // A zero-thickness plane seen exactly edge-on has no projected area.
  if(Math.abs(planeDistance)<1e-14)return null;
  const bounds=rasterBounds(width,height,focal,origin,forward,right,up,normal);if(!bounds)return null;
  const sampleScale=Math.min(1,Math.sqrt(maxPixels/(bounds.width*bounds.height)));
  let rasterWidth=Math.max(1,Math.floor(bounds.width*sampleScale)),rasterHeight=Math.max(1,Math.floor(bounds.height*sampleScale));
  if(rasterWidth*rasterHeight>maxPixels){if(rasterWidth>=rasterHeight)rasterWidth=Math.floor(maxPixels/rasterHeight);else rasterHeight=Math.floor(maxPixels/rasterWidth);}
  const count=rasterWidth*rasterHeight,pixels=new Uint8ClampedArray(count*4),depthBuffer=new Float64Array(count);depthBuffer.fill(Infinity);
  const planetOccluded=new Uint8Array(count),palette=bands===SATURN_RING_BANDS?colors:bands.map(b=>rgb(b.color)),sphereRadius=planetRadiusM/(outerKm*1000),origin2=dot(origin,origin),c=origin2-sphereRadius*sphereRadius,opacity=clamp(planetOpacity,0,1);
  const nx=dot(right,normal),ny=dot(up,normal),dx=bounds.width/(rasterWidth*focal),dy=bounds.height/(rasterHeight*focal);
  let visibleCount=0,occludedCount=0,foregroundCount=0,shadowCount=0;
  for(let y=0;y<rasterHeight;y++)for(let x=0;x<rasterWidth;x++){
    const sx=(bounds.x+(x+.5)*bounds.width/rasterWidth-width/2)/focal,sy=(height/2-bounds.y-(y+.5)*bounds.height/rasterHeight)/focal;
    const rx=forward[0]+right[0]*sx+up[0]*sy,ry=forward[1]+right[1]*sx+up[1]*sy,rz=forward[2]+right[2]*sx+up[2]*sy,denominator=rx*normal[0]+ry*normal[1]+rz*normal[2];if(Math.abs(denominator)<1e-15)continue;
    const t=-planeDistance/denominator;if(t<=0)continue;
    const px=origin[0]+t*rx,py=origin[1]+t*ry,pz=origin[2]+t*rz,radiusKm=Math.sqrt(px*px+py*py+pz*pz)*outerKm,index=bandIndex(radiusKm,bands);if(index<0)continue;
    const a=rx*rx+ry*ry+rz*rz,b=origin[0]*rx+origin[1]*ry+origin[2]*rz,discriminant=b*b-a*c;
    let behind=false;
    if(c<0)behind=true;
    else if(b<0&&discriminant>=0){const entry=c/(-b+Math.sqrt(discriminant));behind=entry>=0&&entry<t-1e-12;}
    const pixel=y*rasterWidth+x;if(behind){planetOccluded[pixel]=1;occludedCount++;}else foregroundCount++;
    let drdx=0,drdy=0;
    if(texture){const radialScale=outerKm*outerKm*t/radiusKm,pr=px*rx+py*ry+pz*rz;
      drdx=radialScale*(px*right[0]+py*right[1]+pz*right[2]-pr*nx/denominator)*dx;
      drdy=radialScale*(px*up[0]+py*up[1]+pz*up[2]-pr*ny/denominator)*dy;}
    const m=modulation(radiusKm,texture,drdx,drdy),alpha=clamp(bands[index].opacity*m*(behind?1-opacity:1),0,1);if(alpha<=0)continue;
    const along=sun?px*sun[0]+py*sun[1]+pz*sun[2]:0,inShadow=!!sun&&along<0&&px*px+py*py+pz*pz-along*along<sphereRadius*sphereRadius,lighting=inShadow?.09:1;if(inShadow)shadowCount++;
    const start=pixel*4,color=palette[index];pixels[start]=Math.round(color[0]*m*lighting);pixels[start+1]=Math.round(color[1]*m*lighting);pixels[start+2]=Math.round(color[2]*m*lighting);pixels[start+3]=Math.round(alpha*255);depthBuffer[pixel]=t*scaleM;visibleCount++;
  }
  if(!visibleCount)return null;
  return {width:rasterWidth,height:rasterHeight,pixels,bounds,depthBuffer,planetOccluded,visibleCount,occludedCount,foregroundCount,shadowCount,maxPixels,bodyScale,planeNormal:normal,schematic:true,metadata:SATURN_RINGS};
}

/** Thin-ring transmission along the ray from a surface point toward the Sun.
 * Inputs are planet-relative meters; normal/light are world unit vectors. */
export function saturnRingTransmission(point,light,normal){
 const d=dot(light,normal);if(Math.abs(d)<1e-12)return 1;const t=-dot(point,normal)/d;if(t<=0)return 1;
 const p=point.map((v,k)=>v+t*light[k]),sample=saturnRingSample(Math.hypot(...p)/1000,{texture:false});return sample?1-sample.opacity:1;
}

export function renderSaturnRingShadow({width,height,focal,forward,right,up,eye,frame,light,planetRadiusM=58232000,bodyScale=1,bounds,maxPixels=40000}={}){
 if(![forward,right,up,eye,light,frame?.z].every(finite)||!Number.isFinite(planetRadiusM)||planetRadiusM<=0||!Number.isFinite(bodyScale)||bodyScale<=0||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>40000)throw new RangeError('Invalid Saturn shadow geometry.');
 const b=bounds??{x:0,y:0,width,height},x=clamp(Math.floor(b.x),0,width),y=clamp(Math.floor(b.y),0,height),dw=Math.max(0,Math.min(width,Math.ceil(b.x+b.width))-x),dh=Math.max(0,Math.min(height,Math.ceil(b.y+b.height))-y);if(!dw||!dh)return null;
 const scale=Math.min(1,Math.sqrt(maxPixels/(dw*dh))),rw=Math.max(1,Math.floor(dw*scale)),rh=Math.max(1,Math.floor(dh*scale)),data=new Uint8ClampedArray(rw*rh*4),camera=eye.map(v=>v/(planetRadiusM*bodyScale)),sun=light.map(v=>v/Math.hypot(...light));let hitCount=0;
 for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){const sx=(x+(i+.5)*dw/rw-width/2)/focal,sy=(height/2-y-(j+.5)*dh/rh)/focal,ray=forward.map((v,k)=>v+right[k]*sx+up[k]*sy),n=earthRayNormal(camera,ray);if(!n||dot(n,sun)<=0)continue;const transmission=saturnRingTransmission(n.map(v=>v*planetRadiusM),sun,frame.z);if(transmission>=1)continue;data[(j*rw+i)*4+3]=Math.round((1-transmission)*230);hitCount++;}
 return {width:rw,height:rh,data,x,y,displayWidth:dw,displayHeight:dh,hitCount,style:'satellite',model:'Point-Sun shadow of thin ring bands on a spherical Saturn'};
}

export function saturnRingRasterContains(raster,x,y){
  if(!raster||!Number.isFinite(x)||!Number.isFinite(y))return false;const b=raster.bounds;
  if(x<b.x||y<b.y||x>=b.x+b.width||y>=b.y+b.height)return false;
  const i=Math.floor((y-b.y)*raster.height/b.height)*raster.width+Math.floor((x-b.x)*raster.width/b.width);return raster.pixels[i*4+3]>0;
}
