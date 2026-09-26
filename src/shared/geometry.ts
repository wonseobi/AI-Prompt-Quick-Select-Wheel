// Wheel math. Angles are in degrees, 0 = straight up, increasing clockwise,
// so slot 0 sits at 12 o'clock and slot 2 at 3 o'clock.

import { SLOT_COUNT } from "./types";

export const SLOT_ARC = 360 / SLOT_COUNT;

const rad = (deg: number) => (deg * Math.PI) / 180;

export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];
}

/** Direction from center to (dx, dy) in wheel degrees, 0..360. */
export function angleOf(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

/** Which slot the vector points at, or null inside the dead zone. */
export function slotFromVector(dx: number, dy: number, deadZone: number): number | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  return Math.round(angleOf(dx, dy) / SLOT_ARC) % SLOT_COUNT;
}

/**
 * Ring segment for slot `i` with parallel-edged gaps of `gap` px
 * (the angular gap is wider on the inner edge so the gap width stays even).
 */
export function segmentPath(cx: number, cy: number, r0: number, r1: number, i: number, gap: number): string {
  const mid = i * SLOT_ARC;
  const outerHalf = SLOT_ARC / 2 - (gap / 2 / r1) * (180 / Math.PI);
  const innerHalf = SLOT_ARC / 2 - (gap / 2 / r0) * (180 / Math.PI);
  const [ox0, oy0] = polar(cx, cy, r1, mid - outerHalf);
  const [ox1, oy1] = polar(cx, cy, r1, mid + outerHalf);
  const [ix1, iy1] = polar(cx, cy, r0, mid + innerHalf);
  const [ix0, iy0] = polar(cx, cy, r0, mid - innerHalf);
  return `M${ox0} ${oy0} A${r1} ${r1} 0 0 1 ${ox1} ${oy1} L${ix1} ${iy1} A${r0} ${r0} 0 0 0 ${ix0} ${iy0} Z`;
}

/** Shortest-path unwrap so a rotating pointer never spins the long way round. */
export function unwrapAngle(previous: number, next: number): number {
  const delta = ((next - previous + 540) % 360) - 180;
  return previous + delta;
}
