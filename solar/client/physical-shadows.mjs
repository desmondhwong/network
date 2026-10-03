// Machine-authored Codex/OpenAI, 2026-10-01. Geometric finite-Sun occultation.
// Spherical bodies; no atmosphere, scattering, terrain self-shadow or optics.
const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),sub=(a,b)=>a.map((x,k)=>x-b[k]),norm=v=>Math.hypot(...v),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function diskOverlapArea(a,b,d){
 if(![a,b,d].every(Number.isFinite)||a<0||b<0||d<0)throw new RangeError('Nonnegative angular radii required.');
 if(d>=a+b||!a||!b)return 0;if(d<=Math.abs(a-b))return Math.PI*Math.min(a,b)**2;
 const x=clamp((d*d+a*a-b*b)/(2*d*a),-1,1),y=clamp((d*d+b*b-a*a)/(2*d*b),-1,1),radical=Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b));
 return a*a*Math.acos(x)+b*b*Math.acos(y)-.5*Math.sqrt(radical);
}
/** Units are arbitrary but shared. Returns the darkest individual occultor's
 * visible Sun fraction; overlapping multiple occultors are not unioned. */
export function solarVisibilityAt(point,{sun=[0,0,0],sunRadius,occluders=[]}={}){
 if(!finite(point)||!finite(sun)||!Number.isFinite(sunRadius)||sunRadius<=0||!Array.isArray(occluders))throw new RangeError('Invalid shadow geometry.');
 const s=sub(sun,point),sd=norm(s);if(sd<=sunRadius)return 1;const a=Math.asin(sunRadius/sd);let visible=1;
 for(const body of occluders){if(!finite(body.position)||!Number.isFinite(body.radius)||body.radius<=0)continue;const v=sub(body.position,point),distance=norm(v);if(distance<=body.radius)return 0;if(distance>=sd||dot(v,s)<=0)continue;
  const b=Math.asin(clamp(body.radius/distance,0,1)),d=Math.acos(clamp(dot(v,s)/(distance*sd),-1,1));visible=Math.min(visible,1-diskOverlapArea(a,b,d)/(Math.PI*a*a));}
 return clamp(visible,0,1);
}
