import '../styles/gamesettings.css';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { browserStorage } from '../scripts/storage';
import { THEME_ROWS, chooseSiteTheme, currentSiteTheme, themeDetail } from './sitetheme';
import {
  GAME_SETTINGS_EVENT, GAME_SETTINGS_STORAGE_KEY, MOTION_ROWS, applyGameSettings, gameSoundAllowed, loadGameSettings,
  motionReduced, parseGameSettings, saveGameSettings, tabStops, trappedFocusIndex, type SharedGameSettings,
} from './gamesettings';

/**
 * Shared settings panel for every daily game (issue #734; logic in gamesettings.ts). The panel always holds theme,
 * high contrast, reduced motion and sound; a game passes its own settings as children, shown in their own section.
 *
 *   <GameSettings title="sudoku settings">…the game's own fieldsets…</GameSettings>  // button + dialog
 *   const { settings, reduceMotion, soundAllowed } = useSharedGameSettings();     // read the shared values
 *
 * Theme is the site's own switch (sitetheme.ts), so a pick here is the same as a pick in the footer.
 */

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function deviceReducesMotion(): boolean {
  try {
    return window.matchMedia?.(REDUCE_QUERY).matches ?? false;
  } catch {
    return false;
  }
}

/** The shared values, kept in step across every game and panel on the page and across tabs. */
export function useSharedGameSettings() {
  const [settings, setSettings] = useState<SharedGameSettings>(() => loadGameSettings(browserStorage()));
  const [deviceReduces, setDeviceReduces] = useState(deviceReducesMotion);
  const latest = useRef(settings);

  useEffect(() => {
    // Same page: take the values from the event, so a game still follows when browser storage is blocked.
    const onChange = (event: Event) => {
      const next = parseGameSettings(JSON.stringify((event as CustomEvent<unknown>).detail ?? null));
      latest.current = next;
      setSettings(next);
    };
    const reload = () => { latest.current = loadGameSettings(browserStorage()); setSettings(latest.current); };
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === GAME_SETTINGS_STORAGE_KEY) reload(); };
    window.addEventListener(GAME_SETTINGS_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    let query: MediaQueryList | undefined;
    try { query = window.matchMedia?.(REDUCE_QUERY); } catch { query = undefined; }
    const onMotion = () => setDeviceReduces(deviceReducesMotion());
    query?.addEventListener?.('change', onMotion);
    return () => {
      window.removeEventListener(GAME_SETTINGS_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
      query?.removeEventListener?.('change', onMotion);
    };
  }, []);

  useEffect(() => { applyGameSettings(document.documentElement, settings, deviceReduces); }, [settings, deviceReduces]);

  const update = useCallback((change: Partial<SharedGameSettings>) => {
    const next = { ...latest.current, ...change };
    saveGameSettings(browserStorage(), next);
    // Every game and panel on this page (this one included) follows the event; the storage event only reaches other tabs.
    window.dispatchEvent(new CustomEvent(GAME_SETTINGS_EVENT, { detail: next }));
  }, []);

  return {
    settings,
    update,
    reduceMotion: motionReduced(settings, deviceReduces),
    /** Pass the game's own sound setting, if it has one. */
    soundAllowed: (gameSetting = true) => gameSoundAllowed(settings, gameSetting),
  };
}

export interface GameSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog heading, for example "sudoku settings". */
  title?: string;
  /** The game's own settings, shown below the shared ones. */
  children?: ReactNode;
  /** Where focus goes when the dialog closes; defaults to whatever had focus when it opened. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/** The dialog alone, for a game that already has its own settings button. */
export function GameSettingsDialog({ open, onClose, title = 'game settings', children, returnFocusTo }: GameSettingsDialogProps) {
  const { settings, update } = useSharedGameSettings();
  const [theme, setTheme] = useState(() => currentSiteTheme(browserStorage()));
  const overlay = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // A modal <dialog> sits in the top layer, so it is always placed against the screen and the page behind is inert.
    if (overlay.current && !overlay.current.open) overlay.current.showModal?.();
    setTheme(currentSiteTheme(browserStorage()));
    const stops = () => tabStops([...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])] as Array<HTMLElement & { type?: string; name?: string; checked?: boolean }>);
    stops()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const list = stops();
      const target = trappedFocusIndex(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (target === undefined) return;
      event.preventDefault();
      list[target]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnFocusTo?.current ?? previous)?.focus();
    };
  }, [open, returnFocusTo]);

  if (!open) return null;
  return <dialog
    ref={overlay}
    className="game-settings-overlay"
    aria-labelledby={titleId}
    data-testid="game-settings"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div ref={panel} className="game-settings">
      <div className="game-settings-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="game-settings-close" aria-label="close settings" onClick={onClose}><span aria-hidden="true">×</span></button>
      </div>
      <fieldset>
        <legend>theme</legend>
        <div className="theme-slider" data-testid="theme-slider">
          {THEME_ROWS.map((row) => <label key={row.value} className="theme-slider-option">
            <input type="radio" name={`${id}-theme`} value={row.value} aria-label={row.label} tabIndex={theme === row.value ? 0 : -1} checked={theme === row.value} onChange={() => { setTheme(row.value); chooseSiteTheme(document, browserStorage(), row.value); }} />
            <span aria-hidden="true">{row.short}</span>
          </label>)}
        </div>
        {/* The live line shows the chosen detail. Hidden copies of all three share its cell, so the panel never changes height. */}
        <div className="game-settings-theme-detail">
          <small aria-live="polite" data-testid="theme-detail">{themeDetail(theme)}</small>
          {THEME_ROWS.map((row) => <small key={row.value} aria-hidden="true">{row.detail}</small>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>motion</legend>
        {MOTION_ROWS.map((row) => <label key={row.value} className="game-settings-option">
          <span>{row.label}<small>{row.detail}</small></span>
          <input type="radio" name={`${id}-motion`} value={row.value} checked={settings.motion === row.value} onChange={() => update({ motion: row.value })} />
        </label>)}
      </fieldset>
      <fieldset>
        <legend>every game</legend>
        <label className="game-settings-option">
          <span>high contrast<small>darker text and lines.</small></span>
          <input type="checkbox" checked={settings.highContrast} onChange={() => update({ highContrast: !settings.highContrast })} />
        </label>
        <label className="game-settings-option">
          <span>game sounds<small>turn off to keep every game silent.</small></span>
          <input type="checkbox" checked={settings.sound} onChange={() => update({ sound: !settings.sound })} />
        </label>
      </fieldset>
      {children && <div className="game-settings-own" data-testid="game-settings-own">{children}</div>}
    </div>
  </dialog>;
}

export interface GameSettingsProps {
  title?: string;
  /** Visible button text. */
  label?: string;
  children?: ReactNode;
}

/** A settings button and its dialog. With no children it is the shared panel alone (used on /play). */
export default function GameSettings({ title = 'game settings', label = 'settings', children }: GameSettingsProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Applies the saved contrast and motion to the page as soon as the button appears, before the dialog is opened.
  useSharedGameSettings();
  return <>
    <button ref={button} type="button" className="game-settings-trigger" aria-haspopup="dialog" data-testid="game-settings-button" onClick={() => setOpen(true)}>
      <span aria-hidden="true">⚙</span> {label}
    </button>
    <GameSettingsDialog open={open} onClose={() => setOpen(false)} title={title} returnFocusTo={button}>{children}</GameSettingsDialog>
  </>;
}
