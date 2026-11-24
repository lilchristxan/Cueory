import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';
import { VIAL_V2_SIZES } from '../../src/config/vialsizes-v2';
import {
  DESIGN,
  LIFT,
  VIAL_RATIO,
  keyTarget,
  platterMode,
  platterScale,
  platterSpots,
  stageHeadroom,
  vialLabel,
  vialSpot,
} from '../../src/scripts/platter';

describe('vial platter layout (docs/design/home-v3 boards)', () => {
  it('puts the front vial in the middle at full size, standing highest', () => {
    const front = vialSpot(0, 'wide');
    expect(front).toMatchObject({ width: 152, x: 0, bottom: 53, layer: 20, shown: true });
  });

  it('shrinks vials by the board scales and spaces them 16 px apart edge to edge', () => {
    const scales = [1, 0.82, 0.68, 0.57, 0.48, 0.41];
    for (let step = 1; step <= 5; step += 1) {
      const near = vialSpot(step - 1, 'wide');
      const far = vialSpot(step, 'wide');
      expect(far.width).toBeCloseTo(152 * scales[step]!, 0);
      const gap = far.x - far.width / 2 - (near.x + near.width / 2);
      expect(gap).toBeCloseTo(16, 0);
    }
  });

  it('mirrors left and right, and stands the outer vials higher, further back along the front arc', () => {
    for (let step = 1; step <= 5; step += 1) {
      const right = vialSpot(step, 'wide');
      const left = vialSpot(-step, 'wide');
      expect(left.x).toBe(-right.x);
      expect(left.bottom).toBe(right.bottom);
      expect(left.width).toBe(right.width);
      expect(right.bottom).toBeGreaterThanOrEqual(vialSpot(step - 1, 'wide').bottom - 0.1);
    }
    expect(vialSpot(5, 'wide').x).toBeCloseTo(574.8, 0);
  });

  it('shows all eleven vials on wide screens, and keeps neighbours from overlapping', () => {
    const spots = platterSpots(11, 3, 'wide');
    expect(spots.every((spot) => spot.shown)).toBe(true);
    expect(spots.filter((spot) => spot.offset === 0)).toHaveLength(1);
    const ordered = [...spots].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.x - ordered[i]!.width / 2).toBeGreaterThan(ordered[i - 1]!.x + ordered[i - 1]!.width / 2);
    }
  });

  it('shows three vials on a portrait phone: the front one and one each side', () => {
    const spots = platterSpots(11, 0, 'phone');
    expect(spots.filter((spot) => spot.shown).map((spot) => spot.offset).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
    expect(vialSpot(0, 'phone')).toMatchObject({ width: 132, x: 0, bottom: 30 });
    expect(vialSpot(1, 'phone').width).toBeCloseTo(97.7, 1);
    expect(vialSpot(1, 'phone').x).toBeCloseTo(128.8, 1);
    expect(vialSpot(-1, 'phone').x).toBeCloseTo(-128.8, 1);
  });

  it('wraps round: the vial after the last is the first', () => {
    const spots = platterSpots(11, 10, 'wide');
    expect(spots[10]!.offset).toBe(0);
    expect(spots[0]!.offset).toBe(1);
    expect(spots[5]!.offset).toBe(-5);
  });

  it('gives each vial a distinct layer, the front on top', () => {
    const layers = platterSpots(11, 0, 'wide').map((s) => s.layer);
    expect(Math.max(...layers)).toBe(layers[0]);
  });

  it('picks the layout from the narrow-screen query', () => {
    expect(platterMode(true)).toBe('phone');
    expect(platterMode(false)).toBe('wide');
  });

  it('scales the track down to its stage and never up', () => {
    expect(platterScale(1440, 'wide')).toBe(1);
    expect(platterScale(1240, 'wide')).toBe(1);
    expect(platterScale(620, 'wide')).toBe(0.5);
    expect(platterScale(390, 'phone')).toBe(1);
    expect(platterScale(360, 'phone')).toBeCloseTo(0.923, 3);
    expect(platterScale(0, 'wide')).toBe(1);
  });

  it('adds headroom for the controls only when the track is scaled down', () => {
    expect(stageHeadroom(1, 'wide')).toBe(0);
    expect(stageHeadroom(0.6, 'wide')).toBeGreaterThan(0);
    expect(stageHeadroom(0.5, 'phone')).toBe(0);
    // The lifted front vial's top never rises into the 52 px control row.
    const front = DESIGN.wide.trackHeight - vialSpot(0, 'wide').bottom - vialSpot(0, 'wide').width * VIAL_RATIO;
    expect((front * 0.6 + stageHeadroom(0.6, 'wide') - LIFT)).toBeGreaterThanOrEqual(52 - 0.1);
  });

  it('turns with the arrow keys, Home and End, and ignores other keys', () => {
    expect(keyTarget('ArrowRight', 10, 11)).toBe(0);
    expect(keyTarget('ArrowLeft', 0, 11)).toBe(10);
    expect(keyTarget('Home', 4, 11)).toBe(0);
    expect(keyTarget('End', 4, 11)).toBe(10);
    expect(keyTarget('a', 4, 11)).toBeUndefined();
  });

  it('labels the front vial by what pressing it does, and side vials by what they show', () => {
    expect(vialLabel('matching', 'front-open')).toBe('matching: open');
    expect(vialLabel('matching', 'front-soon')).toBe('matching: coming soon');
    expect(vialLabel('matching', 'side')).toBe('show matching');
  });
});

describe('vial platter styles', () => {
  const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

  it('writes out every offset spot exactly as vialSpot computes it', () => {
    for (let offset = -5; offset <= 5; offset += 1) {
      const rule = css.match(new RegExp(`\\.platter-vial\\[data-offset='${offset}'\\] \\{([^}]*)\\}`))?.[1];
      expect(rule, `offset ${offset}`).toBeTruthy();
      const read = (name: string) => Number(new RegExp(`--${name}: (-?[0-9.]+);`).exec(rule!)?.[1]);
      for (const [prefix, mode] of [['w', 'wide'], ['p', 'phone']] as const) {
        const spot = vialSpot(offset, mode);
        expect([read(`${prefix}-w`), read(`${prefix}-x`), read(`${prefix}-b`), read(`${prefix}-z`)], `${mode} ${offset}`).toEqual([
          spot.width,
          spot.x,
          spot.bottom,
          spot.layer,
        ]);
      }
    }
  });
});

describe('vial platter pictures', () => {
  it('has a v2 picture for every study mode, sized as the config says', () => {
    for (const mode of studyModes) {
      const file = new URL(`../../public/vials/v2/vial-${mode.vial}.webp`, import.meta.url);
      expect(existsSync(file), mode.vial).toBe(true);
      const bytes = readFileSync(file);
      // A lossy or lossless WebP with a VP8/VP8L/VP8X header: read the canvas size.
      const kind = bytes.toString('ascii', 12, 16);
      let width = 0;
      let height = 0;
      if (kind === 'VP8X') {
        width = 1 + bytes.readUIntLE(24, 3);
        height = 1 + bytes.readUIntLE(27, 3);
      } else if (kind === 'VP8 ') {
        width = bytes.readUInt16LE(26) & 0x3fff;
        height = bytes.readUInt16LE(28) & 0x3fff;
      } else if (kind === 'VP8L') {
        const bits = bytes.readUInt32LE(21);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      }
      expect(VIAL_V2_SIZES[mode.vial], mode.vial).toEqual({ width, height });
    }
  });

  it('keeps every picture within the ratio the layout assumes', () => {
    for (const size of Object.values(VIAL_V2_SIZES)) expect(Math.abs(size.height / size.width - VIAL_RATIO)).toBeLessThan(0.08);
  });
});
