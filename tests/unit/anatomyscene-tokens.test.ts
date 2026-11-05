import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readColors,
  readExportTokens,
  type ExportTokens,
} from '../../src/islands/anatomyscene';

const root = {} as HTMLElement;

const EXPORT_TOKEN_NAMES: Record<keyof ExportTokens, string> = {
  reference: '--export-reference',
  title: '--export-title',
  label: '--export-label',
  credit: '--export-credit',
  pad: '--export-pad',
  offset: '--export-offset',
  gap: '--export-gap',
  radius: '--export-radius',
  line: '--export-line',
  dash: '--export-dash',
  dashGap: '--export-dash-gap',
  dot: '--export-dot',
  leading: '--export-leading',
  labelPadX: '--export-label-pad-x',
  labelPadY: '--export-label-pad-y',
  labelRoom: '--export-label-room',
};

function stubComputedStyle(values: Record<string, string>) {
  const getPropertyValue = vi.fn((name: string) => values[name] ?? '');
  const style = { getPropertyValue } as unknown as CSSStyleDeclaration;
  const getStyles = vi.fn(() => style);
  vi.stubGlobal('getComputedStyle', getStyles);
  return { getPropertyValue, getStyles };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anatomy scene theme tokens', () => {
  it('reads and trims the palette colors and uses the configured font and dim opacity', () => {
    const { getStyles } = stubComputedStyle({
      '--color-page': ' #ffffff ',
      '--color-surface': ' #f5f5f5 ',
      '--color-ink': ' #111111 ',
      '--color-ink-soft': ' #555555 ',
      '--color-line': ' #dddddd ',
      '--color-model': ' #aaaaaa ',
      '--color-model-alt': ' #bbbbbb ',
      '--color-model-selected': ' #333333 ',
      '--model-dim-alpha': '0.35',
      '--font-body': ' Lato, sans-serif ',
    });

    expect(readColors(root)).toEqual({
      page: '#ffffff',
      surface: '#f5f5f5',
      ink: '#111111',
      inkSoft: '#555555',
      line: '#dddddd',
      model: '#aaaaaa',
      modelAlt: '#bbbbbb',
      modelSelected: '#333333',
      dimAlpha: 0.35,
      font: 'Lato, sans-serif',
    });
    expect(getStyles).toHaveBeenCalledWith(root);
  });

  it('falls back for a missing font and a non-numeric dim opacity', () => {
    stubComputedStyle({
      '--model-dim-alpha': 'not-a-number',
      '--font-body': '   ',
    });

    expect(readColors(root)).toMatchObject({
      dimAlpha: 0.2,
      font: 'sans-serif',
    });
  });
});

describe('anatomy picture export tokens', () => {
  it('reads every required export token as a number', () => {
    const expected: ExportTokens = {
      reference: 1,
      title: 2,
      label: 3,
      credit: 4,
      pad: 5,
      offset: 6,
      gap: 7,
      radius: 8,
      line: 9,
      dash: 10,
      dashGap: 11,
      dot: 12,
      leading: 13,
      labelPadX: 14,
      labelPadY: 15,
      labelRoom: 16,
    };
    const values = Object.fromEntries(
      (Object.keys(EXPORT_TOKEN_NAMES) as Array<keyof ExportTokens>).map((key, index) => [
        EXPORT_TOKEN_NAMES[key],
        String(index + 1),
      ]),
    );

    const { getPropertyValue } = stubComputedStyle(values);
    expect(readExportTokens(root)).toEqual(expected);
    expect(getPropertyValue).toHaveBeenCalledTimes(Object.keys(EXPORT_TOKEN_NAMES).length);
  });

  it('names the missing or invalid token when an export size cannot be read', () => {
    const values = Object.fromEntries(
      (Object.keys(EXPORT_TOKEN_NAMES) as Array<keyof ExportTokens>).map((key) => [
        EXPORT_TOKEN_NAMES[key],
        '1',
      ]),
    );
    values['--export-gap'] = 'not-a-number';
    stubComputedStyle(values);

    expect(() => readExportTokens(root)).toThrow(
      'The picture sizes are missing (--export-gap).',
    );
  });
});
