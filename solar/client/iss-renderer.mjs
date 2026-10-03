// Machine-authored Codex/OpenAI, 2026-10-01. Bounded software depth rendering
// for the schematic ISS. Inputs are camera-relative meters, not world AU.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const unit=v=>{const d=Math.hypot(...v);return d>1e-20?v.map(x=>x/d):[0,0,1];};
const rgb=color=>/^#[\da-f]{6}$/i.test(color)?[1,3,5].map(k=>parseInt(color.slice(k,k+2),16)):[190,205,215];
const edgeValue=(a,b,x,y)=>(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
const indexKey=primitive=>[...primitive.indices].sort((a,b)=>a-b).join(',')+'|'+(primitive.color||'')+'|'+primitive.indices.join(',');
const primitiveOrders=new WeakMap();
function orderedPrimitives(primitives){
  // Only cache immutable catalogue meshes. Callers may pass mutable test or
  // custom geometry; those lists retain the ordinary recomputed ordering.
  let rows=primitiveOrders.get(primitives);if(rows)return rows;
  const immutable=Object.isFrozen(primitives)&&primitives.every(p=>Object.isFrozen(p)&&Object.isFrozen(p.indices));
  if(!rows){rows=primitives.map((primitive,index)=>({primitive,index,key:indexKey(primitive)})).sort((a,b)=>a.key.localeCompare(b.key));if(immutable)primitiveOrders.set(primitives,rows);}
  return rows;
}

function clipPolygon(input,planes) {
  let polygon=input;
  for(const plane of planes){
    if(polygon.length<3)return [];
    const result=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane(a),db=plane(b);
      if(da>=0)result.push(a);
      if((da>=0)!==(db>=0)){const t=da/(da-db);result.push(a.map((v,k)=>v+(b[k]-v)*t));}
    }
    polygon=result;
  }
  return polygon;
}
function clipSegment(first,last,planes) {
  let a=first,b=last;
  for(const plane of planes){
    const da=plane(a),db=plane(b);if(da<0&&db<0)return null;
    if((da>=0)!==(db>=0)){const t=da/(da-db),point=a.map((v,k)=>v+(b[k]-v)*t);if(da<0)a=point;else b=point;}
  }
  return [a,b];
}

/** Project and rasterize convex polygon faces and optional 3D edges. The image
 * is cropped to the visible geometry and adaptively sampled at <=160k pixels.
 * Depth is perspective-correct camera Z in meters; faces are opaque/two-sided.
 * Only the caller applies scene opacity/planet occlusion when compositing. */
export function renderISS({width,height,vertices,faces,edges=[],forward,right,up,focal,light=[0,0,1],shade=true,sunVisibility=1,near=.001,maxPixels=160000}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isFinite(focal)||focal<=0||![forward,right,up,light].every(finite)||!Array.isArray(vertices)||!Array.isArray(faces)||!Array.isArray(edges)||!Number.isFinite(near)||near<=0||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>160000)throw new RangeError('Invalid ISS raster parameters.');
  if(!vertices.every(finite))throw new RangeError('ISS vertices must be finite camera-relative meters.');
  if(!Number.isFinite(sunVisibility)||sunVisibility<0||sunVisibility>1)throw new RangeError('ISS Sun visibility must be 0–1.');
  const validPrimitive=(p,min)=>Array.isArray(p.indices)&&p.indices.length>=min&&p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length);
  if(faces.some(p=>!validPrimitive(p,3))||edges.some(p=>!validPrimitive(p,2)||p.indices.length!==2))throw new RangeError('Invalid ISS mesh indices.');
  const camera=v=>[dot(v,right),dot(v,up),dot(v,forward)],points=vertices.map(camera),worldLight=unit(light);
  const hx=width/(2*focal),hy=height/(2*focal),planes=[p=>p[2]-near,p=>p[0]+hx*p[2],p=>hx*p[2]-p[0],p=>p[1]+hy*p[2],p=>hy*p[2]-p[1]];
  const project=p=>({x:clamp(width/2+focal*p[0]/Math.max(near,p[2]),0,width),y:clamp(height/2-focal*p[1]/Math.max(near,p[2]),0,height),inverseZ:1/Math.max(near,p[2])});
  let left=width,rightEdge=0,top=height,bottom=0;
  const include=polygon=>{for(const p of polygon){left=Math.min(left,p.x);rightEdge=Math.max(rightEdge,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}};
  const projectedFaces=[];
  // A stable order resolves exactly coplanar ties independently of traversal.
  for(const {primitive:face,index:originalFace}of orderedPrimitives(faces)){
    const original=face.indices.map(i=>points[i]),clipped=clipPolygon(original,planes);if(clipped.length<3)continue;
    // Camera coordinates can be left-handed (screen-right/up, forward). Keep
    // outward normals and illumination in the supplied world basis so changing
    // viewpoint never reverses the lit side of a physical panel.
    const world=face.indices.map(i=>vertices[i]),normal=unit(cross(sub(world[1],world[0]),sub(world[2],world[0]))),brightness=shade?.08+.92*Math.max(0,dot(normal,worldLight))*sunVisibility:1;
    const color=rgb(face.color).map(v=>Math.round(v*brightness)),polygon=clipped.map(project);include(polygon);
    projectedFaces.push({...face,originalFace,polygon,colorRGB:color,depth:original.reduce((s,p)=>s+p[2],0)/original.length});
  }
  const projectedEdges=[];
  for(const {primitive:edge}of orderedPrimitives(edges)){
    const clipped=clipSegment(points[edge.indices[0]],points[edge.indices[1]],planes);if(!clipped)continue;
    const line=clipped.map(project);include(line);projectedEdges.push({...edge,line,colorRGB:rgb(edge.color).map(x=>shade?Math.round(x*(.08+.92*sunVisibility)):x)});
  }
  if(!projectedFaces.length&&!projectedEdges.length)return null;
  left=Math.max(0,Math.floor(left)-1);top=Math.max(0,Math.floor(top)-1);rightEdge=Math.min(width,Math.ceil(rightEdge)+1);bottom=Math.min(height,Math.ceil(bottom)+1);
  const bounds={x:left,y:top,width:rightEdge-left,height:bottom-top};if(bounds.width<1||bounds.height<1)return null;
  const sampleScale=Math.min(1,Math.sqrt(maxPixels/(bounds.width*bounds.height)));
  let rasterWidth=Math.max(1,Math.floor(bounds.width*sampleScale)),rasterHeight=Math.max(1,Math.floor(bounds.height*sampleScale));
  if(rasterWidth*rasterHeight>maxPixels){if(rasterWidth>=rasterHeight)rasterWidth=Math.floor(maxPixels/rasterHeight);else rasterHeight=Math.floor(maxPixels/rasterWidth);}
  const count=rasterWidth*rasterHeight,pixels=new Uint8ClampedArray(count*4),depthBuffer=new Float64Array(count);depthBuffer.fill(Infinity);
  const scaleX=rasterWidth/bounds.width,scaleY=rasterHeight/bounds.height,local=p=>({x:(p.x-left)*scaleX,y:(p.y-top)*scaleY,inverseZ:p.inverseZ});
  const paint=(index,color)=>{const n=index*4;pixels[n]=color[0];pixels[n+1]=color[1];pixels[n+2]=color[2];pixels[n+3]=255;};
  let triangleCount=0;
  for(const face of projectedFaces){
    const polygon=face.polygon.map(local);
    for(let k=1;k<polygon.length-1;k++){
      const a=polygon[0],b=polygon[k],c=polygon[k+1],area=edgeValue(a,b,c.x,c.y);if(Math.abs(area)<1e-15)continue;triangleCount++;
      const x0=clamp(Math.floor(Math.min(a.x,b.x,c.x)),0,rasterWidth-1),x1=clamp(Math.ceil(Math.max(a.x,b.x,c.x)),0,rasterWidth-1),y0=clamp(Math.floor(Math.min(a.y,b.y,c.y)),0,rasterHeight-1),y1=clamp(Math.ceil(Math.max(a.y,b.y,c.y)),0,rasterHeight-1);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const px=x+.5,py=y+.5,wa=edgeValue(b,c,px,py)/area,wb=edgeValue(c,a,px,py)/area,wc=1-wa-wb;
        if(wa< -1e-10||wb< -1e-10||wc< -1e-10)continue;
        const inverseZ=wa*a.inverseZ+wb*b.inverseZ+wc*c.inverseZ;if(inverseZ<=0)continue;
        const z=1/inverseZ,index=y*rasterWidth+x;
        if(z<depthBuffer[index]){depthBuffer[index]=z;paint(index,face.colorRGB);}
      }
    }
  }
  // Optional seams/rails use the same depth test. Their tiny metric bias only
  // prevents a coplanar seam from fighting its own polygon, not hidden edges.
  const edgeDepthBuffer=new Float64Array(count);edgeDepthBuffer.fill(Infinity);
  for(const edge of projectedEdges){
    const [a,b]=edge.line.map(local),dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    const visit=(x,y)=>{
      if(x<0||x>=rasterWidth||y<0||y>=rasterHeight)return;
      const t=length2?clamp(((x+.5-a.x)*dx+(y+.5-a.y)*dy)/length2,0,1):0;
      if(Math.hypot(x+.5-a.x-t*dx,y+.5-a.y-t*dy)>.65)return;
      const inverseZ=a.inverseZ+(b.inverseZ-a.inverseZ)*t;if(inverseZ<=0)return;
      const z=1/inverseZ,index=y*rasterWidth+x,bias=.0001+z*1e-7;
      if(z<=depthBuffer[index]+bias&&z<edgeDepthBuffer[index]){edgeDepthBuffer[index]=z;paint(index,edge.colorRGB);}
    };
    // Scan only a narrow band along the major axis, rather than the entire
    // diagonal bounding rectangle; hundreds of long seams remain bounded.
    if(Math.abs(dx)>=Math.abs(dy)){
      const lo=clamp(Math.floor(Math.min(a.x,b.x)-.75),0,rasterWidth-1),hi=clamp(Math.ceil(Math.max(a.x,b.x)+.75),0,rasterWidth-1);
      for(let x=lo;x<=hi;x++){const t=dx?clamp((x+.5-a.x)/dx,0,1):0,cy=a.y+t*dy;for(let y=Math.floor(cy-1);y<=Math.floor(cy+1);y++)visit(x,y);}
    }else{
      const lo=clamp(Math.floor(Math.min(a.y,b.y)-.75),0,rasterHeight-1),hi=clamp(Math.ceil(Math.max(a.y,b.y)+.75),0,rasterHeight-1);
      for(let y=lo;y<=hi;y++){const t=clamp((y+.5-a.y)/dy,0,1),cx=a.x+t*dx;for(let x=Math.floor(cx-1);x<=Math.floor(cx+1);x++)visit(x,y);}
    }
  }
  let visibleCount=0;for(let i=0;i<count;i++){if(pixels[i*4+3])visibleCount++;depthBuffer[i]=Math.min(depthBuffer[i],edgeDepthBuffer[i]);}
  return {width:rasterWidth,height:rasterHeight,pixels,bounds,depthBuffer,projectedFaces,visibleCount,triangleCount,edgeCount:projectedEdges.length,near,maxPixels,scaleX,scaleY,schematic:true};
}

/** Alpha-accurate screen-space picking for the cropped/downsampled image. */
export function issRasterContains(raster,x,y) {
  if(!raster||!Number.isFinite(x)||!Number.isFinite(y))return false;
  const b=raster.bounds;if(x<b.x||y<b.y||x>=b.x+b.width||y>=b.y+b.height)return false;
  const px=Math.floor((x-b.x)*raster.width/b.width),py=Math.floor((y-b.y)*raster.height/b.height);
  return raster.pixels[(py*raster.width+px)*4+3]>0;
}
