/**
 * The Home v3 vial platter: "one lesson, multiple ways to study" as eleven glass vials on a wide round platter
 * (docs/design/home-v3/, the boards' layout script). The front vial is the largest; the others get smaller and stand
 * further back along the front half of the platter, with an even gap between neighbours. This file is only the
 * numbers: where each vial stands, how big the stage is and how keys and swipes turn it. The component
 * (src/components/VialPlatter.astro) writes them as unitless custom properties and the styles multiply them by one
 * pixel (--platter-px, tokens.css), so no size lives anywhere but here and the tokens.
 *
 * Turning logic (wrap, ringOffset, keyTarget, swipeTurn) is shared with the older carousel in ./carousel.ts.
 */
import { ringOffset, wrap } from './carousel';

export { keyTarget, ringOffset, slideAnnouncement, swipeTurn, wrap } from './carousel';

/** `wide`: desktop, tablet and phone landscape (all vials). `phone`: portrait phones (the front vial and one each side). */
export type PlatterMode = 'wide' | 'phone';

interface Design {
  /** The track's design size, which the stage scales to fit its width. */
  trackWidth: number;
  trackHeight: number;
  /** The front vial's width. */
  vialWidth: number;
  /** Each step out from the front, as a share of the front vial's size. */
  scales: readonly number[];
  /** The even gap between neighbouring vials. */
  gap: number;
  /** Half the width of the platter's front arc, which sets how far back the outer vials stand. */
  radius: number;
  /** A vial's foot stands this high above the track's bottom at the front, and this much lower at the arc's far ends. */
  standFront: number;
  standDrop: number;
  /** How many vials each side of the front one are shown. */
  reach: number;
}

export const DESIGN: Record<PlatterMode, Design> = {
  wide: { trackWidth: 1240, trackHeight: 440, vialWidth: 152, scales: [1, 0.82, 0.68, 0.57, 0.48, 0.41], gap: 16, radius: 600, standFront: 111, standDrop: 58, reach: 5 },
  phone: { trackWidth: 390, trackHeight: 330, vialWidth: 132, scales: [1, 0.74], gap: 14, radius: 190, standFront: 46, standDrop: 16, reach: 1 },
};

/** How far a hovered or focused vial lifts (the boards: 8 px). Applied by the styles from --platter-lift. */
export const LIFT = 8;

/**
 * Portrait phones get the phone layout. The styles pick it with `@media (width < 40rem)` (global.css) and the script
 * reads which one applies from the styles (--platter-tw), so the two never disagree, whatever the text size.
 */
export function platterMode(narrow: boolean): PlatterMode {
  return narrow ? 'phone' : 'wide';
}

export interface VialSpot {
  /** Steps from the front vial: 0 in front, negative to its left. */
  offset: number;
  /** The vial's width in track units. */
  width: number;
  /** Its middle's distance from the track's middle (negative: left). */
  x: number;
  /** Its foot's height above the track's bottom. */
  bottom: number;
  /** Stacking: the front vial is on top. */
  layer: number;
  /** Whether it shows at all (phones show three). */
  shown: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;

/** Distance from the middle to each step's centre: half of each vial, plus the gap, between neighbours. */
function centres(design: Design): number[] {
  const half = design.vialWidth / 2;
  const out = [0];
  for (let k = 1; k < design.scales.length; k += 1) {
    out[k] = out[k - 1]! + half * design.scales[k - 1]! + design.gap + half * design.scales[k]!;
  }
  return out;
}

export function vialSpot(offset: number, mode: PlatterMode): VialSpot {
  const design = DESIGN[mode];
  const step = Math.min(Math.abs(offset), design.scales.length - 1);
  const x = Math.sign(offset) * centres(design)[step]!;
  const depth = Math.sqrt(Math.max(0, 1 - (x / design.radius) ** 2));
  return {
    offset,
    width: r1(design.vialWidth * design.scales[step]!),
    x: r1(x),
    bottom: r1(design.standFront - design.standDrop * depth),
    layer: 20 - step,
    shown: Math.abs(offset) <= design.reach,
  };
}

/** Every vial's spot, in the order of the list, with `active` in front. */
export function platterSpots(count: number, active: number, mode: PlatterMode): VialSpot[] {
  return Array.from({ length: count }, (_, index) => vialSpot(ringOffset(index, active, count), mode));
}

/** How much the track shrinks to fit a stage of this width: never larger than drawn. */
export function platterScale(stageWidth: number, mode: PlatterMode): number {
  if (stageWidth <= 0) return 1;
  return Math.round(Math.min(1, stageWidth / DESIGN[mode].trackWidth) * 1000) / 1000;
}

/** How far the track shrinks on a phone turned sideways: the landscape board draws the desktop track at 60% (844 x 390). */
export const SIDEWAYS_SCALE = 0.6;

/**
 * Room above the track for the dots (wide layout, where they sit in a row above the front vial, their bottom edge about
 * 30 px under the stage's top; the arrows stand beside the vials): the track's empty headroom shrinks with the scale
 * but the dots' place does not, so the stage adds what is missing (the boards' 4 px at 60%).
 */
export const CONTROLS_ROW = 34;
export function stageHeadroom(scale: number, mode: PlatterMode): number {
  if (mode === 'phone') return 0;
  const design = DESIGN.wide;
  const front = vialSpot(0, 'wide');
  const frontTop = design.trackHeight - front.bottom - front.width * VIAL_RATIO;
  return r1(Math.max(0, CONTROLS_ROW + LIFT - frontTop * scale));
}

/** The v2 vial pictures are about 912 × 1945: every vial is this many widths tall (the files differ by under 4%). */
export const VIAL_RATIO = 2.135;

/** What the screen reader hears when the platter comes to rest: "matching, 5 of 11". */
export function vialLabel(name: string, state: 'front-open' | 'front-soon' | 'side'): string {
  if (state === 'front-open') return `${name}: open`;
  if (state === 'front-soon') return `${name}: coming soon`;
  return `show ${name}`;
}

