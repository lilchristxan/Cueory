import '../styles/gameheader.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameSettingsDialog } from './GameSettings.tsx';
import { GameHelpButton, type GameHelpState } from './GameHelp';
import { frameHelpButton, GAME_FRAME_HELP_EVENT, GAME_FRAME_HELP_READY_EVENT, GAME_FRAME_SETTINGS_EVENT } from './GameFrameControls';

/**
 * The same corner row on every game box (Christian's brief, 2026-11-17): a drawn gear at the top left opens the game's
 * settings, with the shared settings (theme, contrast, motion, sound) in the same dialog, and the "?" at the top right
 * opens how to play. `end` holds any other corner buttons (such as print), placed just before the "?".
 */
export default function GameHeader({ name, help, helpExtra, settings, end, framed = false }: {
  /** The game's name, for the button labels and the settings title. */
  name: string;
  help: GameHelpState;
  /** Game-specific help shown above the steps (pillo's legend). */
  helpExtra?: ReactNode;
  /** The game's own settings, shown below the shared ones. */
  settings?: ReactNode;
  end?: ReactNode;
  /** A GameFrame route moves this header's existing dialogs onto the shared Frame controls. */
  framed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!framed) return;
    const detailFor = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const { gameName, trigger } = detail as { gameName?: unknown; trigger?: unknown };
      return gameName === name && trigger instanceof HTMLButtonElement ? trigger : undefined;
    };
    const openSettings = (event: Event) => { if (detailFor(event)) setOpen(true); };
    const setHelpReturnTarget = (trigger = frameHelpButton(name)) => {
      if (trigger) help.button.current = trigger;
    };
    const openHelp = (event: Event) => {
      const trigger = detailFor(event);
      if (!trigger) return;
      // GameHelp restores focus through this existing ref after its dialog closes.
      setHelpReturnTarget(trigger);
      help.show();
    };
    const setHelpWhenReady = (event: Event) => { setHelpReturnTarget(detailFor(event)); };
    // The Frame control may have hydrated before this island, or may announce itself afterwards.
    setHelpReturnTarget();
    window.addEventListener(GAME_FRAME_SETTINGS_EVENT, openSettings);
    window.addEventListener(GAME_FRAME_HELP_EVENT, openHelp);
    window.addEventListener(GAME_FRAME_HELP_READY_EVENT, setHelpWhenReady);
    return () => {
      window.removeEventListener(GAME_FRAME_SETTINGS_EVENT, openSettings);
      window.removeEventListener(GAME_FRAME_HELP_EVENT, openHelp);
      window.removeEventListener(GAME_FRAME_HELP_READY_EVENT, setHelpWhenReady);
    };
  }, [framed, help, name]);
  return (
    <>
    {!framed && <div className="game-header" data-print-hidden>
      <button
        ref={gear}
        type="button"
        className="corner-button corner-button-quiet game-header-gear"
        aria-label={`${name} settings`}
        aria-haspopup="dialog"
        data-testid="game-settings-button"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      </button>
      <div className="game-header-end">
        {end}
        <GameHelpButton help={help} name={name} className="corner-button corner-button-quiet" extra={helpExtra} />
      </div>
    </div>}
    {/* Board-level controls (for example print) remain available when Frame owns only the page-level gear and help. */}
    {framed && end && <div className="game-header" data-print-hidden><div className="game-header-end">{end}</div></div>}
    {/* In framed mode this stays out of the accessibility tree but keeps the established help dialog and seen-state. */}
    {framed && <GameHelpButton help={help} name={name} className="hidden" extra={helpExtra} />}
    <GameSettingsDialog open={open} onClose={() => setOpen(false)} title={`${name} settings`} returnFocusTo={framed ? undefined : gear}>
      {settings}
    </GameSettingsDialog>
    </>
  );
}
