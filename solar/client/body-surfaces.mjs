// Machine-authored by Codex / OpenAI. Drawing opacity is independent of camera,
// selection and landing eligibility; minor bodies also have schematic surfaces.
import {ALL_BODIES} from './astro.mjs';

export const SURFACE_BODY_IDS = Object.freeze(ALL_BODIES.filter(body=>!body.artificial).map(body=>body.id));
export const BODY_SURFACE_IDS = SURFACE_BODY_IDS;
const supported = new Set(SURFACE_BODY_IDS);
export const hasBodySurfaceOpacity = id => supported.has(id);

/** Sparse overrides preserve legacy global appearance until a body is edited.
 * Workspace validation rejects invalid overrides; this renderer helper also
 * tolerates incomplete runtime state without inheriting prototype properties. */
export function bodySurfaceOpacity(state,id) {
  if(!supported.has(id))return 1;
  const map=state?.surfaceOpacities;
  const override=map&&typeof map==='object'?Object.getOwnPropertyDescriptor(map,id)?.value:undefined;
  if(Number.isFinite(override)&&override>=0&&override<=1)return override;
  const legacy=Number.isFinite(state?.surfaceOpacity)?state.surfaceOpacity:
    id==='Earth'&&Number.isFinite(state?.earthOpacity)?state.earthOpacity:1;
  return Math.max(0,Math.min(1,legacy));
}
