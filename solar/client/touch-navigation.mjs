// Codex/OpenAI: touch geometry for the existing flight camera operations.
// Scene retains pointer custody, the captured operation and the camera state.

const pointIsFinite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Explicit choices remain available in every context. Automatic dragging
 * orbits external views and looks from geographic Pin or onboard views. */
export function resolveTouchNavigationMode(choice = 'auto', { pinMode = false, onboard = false } = {}) {
  if (['look', 'orbit', 'pan'].includes(choice)) return choice;
  return pinMode || onboard ? 'look' : 'orbit';
}

/** Read the active-touch map before replacing this pointer's position.
 * Coordinates and centers use client pixels. Twist is positive clockwise on
 * the screen and wraps to the shortest signed angle. Camera bindings decide
 * how the captured operation uses that angle; this helper never changes pose.
 * Extra fingers produce no operation until the current pair is restored. */
export function touchNavigationDelta({ pointers, pointerId, point } = {}) {
  if (!(pointers instanceof Map) || !pointIsFinite(point)) return null;
  const previous = pointers.get(pointerId);
  if (!pointIsFinite(previous) || pointers.size < 1 || pointers.size > 2) return null;
  const dx = point.x - previous.x, dy = point.y - previous.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (pointers.size === 1) return {
    dx, dy, center: { x: point.x, y: point.y }, zoomFactor: 1, twistRadians: 0, touchCount: 1,
  };

  const entries = [...pointers.entries()];
  if (!entries.every(([, position]) => pointIsFinite(position))) return null;
  const [first, second] = entries.map(([, position]) => position);
  const [nextFirst, nextSecond] = entries.map(([id, position]) => id === pointerId ? point : position);
  const oldX = second.x - first.x, oldY = second.y - first.y;
  const newX = nextSecond.x - nextFirst.x, newY = nextSecond.y - nextFirst.y;
  const oldDistance = Math.hypot(oldX, oldY), newDistance = Math.hypot(newX, newY);
  if (!Number.isFinite(oldDistance) || !Number.isFinite(newDistance)) return null;
  let zoomFactor = 1, twistRadians = 0;
  if (oldDistance > 2 && newDistance > 2) {
    zoomFactor = oldDistance / newDistance;
    // Unit vectors avoid overflow when otherwise finite coordinates are large.
    const ax = oldX / oldDistance, ay = oldY / oldDistance;
    const bx = newX / newDistance, by = newY / newDistance;
    twistRadians = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  const center = { x: nextFirst.x / 2 + nextSecond.x / 2, y: nextFirst.y / 2 + nextSecond.y / 2 };
  if (!pointIsFinite(center) || !Number.isFinite(zoomFactor) || zoomFactor <= 0 || !Number.isFinite(twistRadians)) return null;
  return { dx: dx / 2, dy: dy / 2, center, zoomFactor, twistRadians, touchCount: 2 };
}
