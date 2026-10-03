// Machine-authored: Codex / OpenAI / gpt-6; claim 260924-104536-001/solar-system-flight-galaxy.
// Explicit Canvas 2D attitude diagrams. No event handlers, timers or camera mutations.
const RAD = Math.PI / 180;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const wrap = value => ((value % 360) + 360) % 360;

/** The compressed pitch diagram always retains its horizon; exact angles stay
 * in the adjacent numerical readout. This is an attitude cue, not a projection
 * of the visible world. Heading is clockwise from N in the supplied frame. */
export function instrumentGeometry(values = {}) {
  const rollDegrees = wrap(finite(values.rollDegrees) + 180) - 180;
  const pitchDegrees = clamp(finite(values.pitchDegrees), -90, 90);
  const headingDegrees = wrap(finite(values.headingDegrees));
  const yawControl = clamp(finite(values.yawControl), -1, 1);
  return { rollDegrees, pitchDegrees, headingDegrees, yawControl,
    rollRadians: -rollDegrees * RAD,
    pitchOffset: .72 * Math.sin(pitchDegrees * RAD),
    yawRadians: yawControl * Math.PI / 3,
    pinMode: values.pinMode === true };
}

/** Draw one bounded instrument; zero-size/hidden canvases use stable defaults.
 * kind: horizon | yaw | director. pixelRatio is optional and capped at 3. */
export function renderFlightInstrument(canvas, values = {}, kind = 'director') {
  if (!canvas?.getContext || !['horizon', 'yaw', 'director'].includes(kind)) return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const geometry = instrumentGeometry(values), director = kind === 'director';
  const box = canvas.getBoundingClientRect?.() || {};
  const fallback = director ? 240 : 48;
  const width = clamp(finite(box.width, fallback) || fallback, 16, 1024);
  const height = clamp(finite(box.height, fallback) || fallback, 16, 1024);
  const ratio = clamp(finite(values.pixelRatio, finite(globalThis.devicePixelRatio, 1)), 1, 3);
  const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const palette = values.theme === 'light'
    ? { sky: '#c5dce3', ground: '#d0bf9e', line: '#293b3f', text: '#28332b', cue: '#603d0a', bg: '#fafaf8' }
    : { sky: '#294954', ground: '#574733', line: '#f0f3e9', text: '#e1ead8', cue: '#ffcf83', bg: '#1b1e1b' };
  const x = width / 2, y = height / 2, size = Math.min(width, height);
  const line = (ax, ay, bx, by, color = palette.line, weight = 1.5) => {
    context.strokeStyle = color; context.lineWidth = weight;
    context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke();
  };
  const label = (text, tx, ty, fontSize = 11, color = palette.text) => {
    context.font = `${fontSize}px system-ui, sans-serif`; context.textAlign = 'center';
    context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, tx, ty);
  };
  const rim = radius => {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.strokeStyle = palette.text; context.lineWidth = 1; context.stroke();
  };
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (kind === 'yaw') {
    const radius = size * .42;
    context.fillStyle = palette.bg; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); rim(radius);
    for (const yaw of [-1, 0, 1]) {
      const angle = yaw * Math.PI / 3;
      line(x + Math.sin(angle) * radius * .73, y - Math.cos(angle) * radius * .73,
        x + Math.sin(angle) * radius * .93, y - Math.cos(angle) * radius * .93, palette.text, 1);
    }
    line(x, y, x + Math.sin(geometry.yawRadians) * radius * .7, y - Math.cos(geometry.yawRadians) * radius * .7, palette.cue, 2.5);
    label('YAW', x, y + radius * .45, Math.max(7, size * .15));
  } else {
    const radius = size * (director ? .32 : .43);
    context.save();
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.clip();
    context.translate(x, y); context.rotate(geometry.rollRadians);
    const offset = geometry.pitchOffset * radius;
    context.fillStyle = palette.sky; context.fillRect(-radius * 3, -radius * 3, radius * 6, radius * 6);
    context.fillStyle = palette.ground; context.fillRect(-radius * 3, offset, radius * 6, radius * 3);
    line(-radius * 2, offset, radius * 2, offset, palette.line, director ? 2 : 1.5);
    if (director) {
      for (const pitch of [-60, -30, 30, 60]) {
        const py = offset - pitch / 90 * radius * .8, span = pitch % 60 === 0 ? radius * .34 : radius * .22;
        line(-span, py, span, py, palette.line, 1);
        label(String(pitch), span + 14, py, 9, palette.line);
      }
    }
    context.restore();
    rim(radius);
    // Fixed aircraft reference is drawn independently of the moving horizon.
    line(x - radius * .52, y, x - radius * .15, y, palette.cue, 2.5);
    line(x + radius * .15, y, x + radius * .52, y, palette.cue, 2.5);
    line(x - radius * .15, y, x, y + radius * .11, palette.cue, 2.5);
    line(x, y + radius * .11, x + radius * .15, y, palette.cue, 2.5);
    if (director) {
      const compassRadius = size * .43;
      for (let bearing = 0; bearing < 360; bearing += 15) {
        const angle = (bearing - geometry.headingDegrees) * RAD;
        const sx = Math.sin(angle), cy = -Math.cos(angle);
        const cardinal = bearing % 90 === 0;
        line(x + sx * compassRadius * .84, y + cy * compassRadius * .84,
          x + sx * compassRadius * .92, y + cy * compassRadius * .92, palette.text, cardinal ? 2 : 1);
        if (cardinal) label(['N', 'E', 'S', 'W'][bearing / 90], x + sx * compassRadius * 1.05, y + cy * compassRadius * 1.05, 12);
      }
      // Fixed heading lubber line and independent held-yaw input marker.
      line(x, y - compassRadius * .88, x, y - radius * .96, palette.cue, 2);
      const yawY = y + radius * .71;
      line(x - radius * .48, yawY, x + radius * .48, yawY, palette.cue, 1);
      line(x, yawY - 3, x, yawY + 3, palette.cue, 1);
      const yawX = x + geometry.yawControl * radius * .48;
      context.beginPath(); context.arc(yawX, yawY, 3, 0, Math.PI * 2); context.fillStyle = palette.cue; context.fill();
      label(geometry.pinMode ? 'PIN' : 'FLIGHT', x, y + radius * .44, 9, palette.cue);
    }
  }
  context.restore();
  return { ...geometry, width, height, pixelRatio: ratio };
}
