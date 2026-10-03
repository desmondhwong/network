// Codex/OpenAI: conservative visibility of a complete frozen ellipse.
// Inputs use camera coordinates (positiveZ forward); caller expands the
// viewport for line width/roundoff. Dynamic trajectories need separate bounds.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function ellipseMayEnterView(center,axisA,axisB,halfX,halfY,{margin=1e-12}={}){
 const planes=[[0,0,1],[1,0,halfX],[-1,0,halfX],[0,1,halfY],[0,-1,halfY]];
 for(const plane of planes)if(dot(plane,center)+Math.hypot(dot(plane,axisA),dot(plane,axisB)) < -margin*Math.hypot(...plane))return false;
 const normal=[axisA[1]*axisB[2]-axisA[2]*axisB[1],axisA[2]*axisB[0]-axisA[0]*axisB[2],axisA[0]*axisB[1]-axisA[1]*axisB[0]],distance=dot(normal,center),a2=dot(axisA,axisA),b2=dot(axisB,axisB);
 if(!(a2>0&&b2>0)||Math.abs(distance)<margin*Math.hypot(...normal))return true;
 // Intersect the expanded viewport corners with the orbital plane. If all
 // four forward hits are strictly inside the ellipse, their convex footprint
 // contains no orbital boundary, even when the large orbit surrounds the eye.
 const limit=Math.max(0,1-margin/Math.sqrt(Math.min(a2,b2)))**2;
 for(const x of [-halfX,halfX])for(const y of [-halfY,halfY]){
  const denominator=normal[0]*x+normal[1]*y+normal[2],t=distance/denominator;if(!(t>0&&Number.isFinite(t)))return true;
  const px=t*x-center[0],py=t*y-center[1],pz=t-center[2],u=(px*axisA[0]+py*axisA[1]+pz*axisA[2])/a2,v=(px*axisB[0]+py*axisB[1]+pz*axisB[2])/b2;
  if(!(u*u+v*v<limit))return true;
 }
 return false;
}
