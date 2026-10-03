// Codex/OpenAI: stable nearest forward ray intersection with a unit sphere.
export function earthRayNormal(camera,direction){
  const [ox,oy,oz]=camera,[dx,dy,dz]=direction,a=dx*dx+dy*dy+dz*dz,b=ox*dx+oy*dy+oz*dz,r=Math.hypot(ox,oy,oz);
  if(!(a>0)||r<1-1e-12||b>=0)return null;
  const c=(r-1)*(r+1),cx=oy*dz-oz*dy,cy=oz*dx-ox*dz,cz=ox*dy-oy*dx;
  const discriminant=r<2?b*b-a*c:a-(cx*cx+cy*cy+cz*cz);
  if(discriminant<0)return null;
  const root=Math.sqrt(discriminant);
  if(r<2){const t=c/(-b+root);if(t<0)return null;return [ox+t*dx,oy+t*dy,oz+t*dz];}
  // The nearest point equals the ray's closest approach minus its half chord.
  // Cross products avoid subtracting a large camera position from itself.
  return [(dy*cz-dz*cy-dx*root)/a,(dz*cx-dx*cz-dy*root)/a,(dx*cy-dy*cx-dz*root)/a];
}
