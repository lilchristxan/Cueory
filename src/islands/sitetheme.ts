/**
 * Theme rows inside a game's settings (sudoku) drive the site's own theme switch, so there is only one theme system.
 * Picking a row checks the matching radio in the footer's ThemePicker.astro and fires its change event: that applies,
 * saves and tints the browser bar exactly as a footer pick does. If the footer switch isn't on the page, the same
 * helpers from src/scripts/theme.ts apply and save the pick directly.
 */
import { applyChoice, readChoice, saveChoice, type ThemeChoice, type ThemeStorage } from '../scripts/theme';

/**
 * The three positions of the theme slider (.theme-slider in global.css), left to right. `short` is the visible word on
 * the segment, `label` the accessible name (it always contains the visible word), `detail` the helper line.
 */
export interface ThemeSliderOption { value: ThemeChoice; short: string; label: string; detail: string }
export const THEME_ROWS: ReadonlyArray<ThemeSliderOption> = [
  { value: 'light', short: 'light', label: 'light mode', detail: 'always use light mode, whatever your device is set to.' },
  { value: 'dark', short: 'dark', label: 'dark mode', detail: 'always use dark mode, whatever your device is set to.' },
  { value: 'device', short: 'device', label: 'follow device', detail: 'match your device setting.' },
];

/** Helper line for the chosen position. */
export function themeDetail(choice: ThemeChoice): string {
  return THEME_ROWS.find((row) => row.value === choice)?.detail ?? '';
}

interface PickerInput { checked: boolean; dispatchEvent(event: Event): boolean }
export interface ThemeDocument {
  documentElement: { dataset: DOMStringMap };
  querySelector(selectors: string): unknown;
}

export function currentSiteTheme(storage: ThemeStorage | undefined): ThemeChoice {
  return readChoice(storage);
}

export function chooseSiteTheme(doc: ThemeDocument, storage: ThemeStorage | undefined, choice: ThemeChoice): void {
  const input = doc.querySelector(`[data-theme-picker] input[name="theme"][value="${choice}"]`) as PickerInput | null;
  if (input && typeof input.dispatchEvent === 'function') {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  applyChoice(doc.documentElement, choice);
  saveChoice(storage, choice);
}
