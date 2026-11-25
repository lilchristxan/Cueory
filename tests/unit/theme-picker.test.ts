import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_ROWS } from '../../src/islands/sitetheme';

const source = readFileSync(new URL('../../src/components/ThemePicker.astro', import.meta.url), 'utf8');

describe('footer theme picker contract', () => {
  it('offers Light, Dark and Follow device as one radio group', () => {
    expect(source).toContain("light: 'light'");
    expect(source).toContain("dark: 'dark'");
    expect(source).toContain("device: 'follow device'");
    expect(source).toContain('<input type="radio" name="theme" value={row.value} aria-label={names[row.value]} />');
    expect(source).toContain('<fieldset data-theme-picker hidden>');
  });

  it('is the shared theme slider: the same rows as the game panel, the visible word decorative beside the accessible name', () => {
    expect(source).toContain("import { THEME_ROWS } from '../islands/sitetheme'");
    expect(source).toContain('class="theme-slider');
    expect(source).toContain('class="theme-slider-option"');
    expect(source).toContain('<span aria-hidden="true">{row.short}</span>');
    expect(source).not.toContain('segmented');
    // The accessible names are unchanged from the old footer switch, and each contains the visible word.
    const names = { light: 'light', dark: 'dark', device: 'follow device' };
    for (const row of THEME_ROWS) expect(names[row.value]).toContain(row.short);
  });

  it('applies the selected theme and restores original browser bar colors for device mode', () => {
    expect(source).toContain('applyChoice(root, current)');
    expect(source).toContain('saveChoice(storage, value)');
    expect(source).toContain("choice === 'device' || !page ? original : page");
    expect(source).toContain("picker.addEventListener('change'");
    expect(source).toContain('picker.hidden = false');
  });
});
