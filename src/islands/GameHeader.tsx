import GameFlag from './GameFlag';
import '../styles/gameheader.css';
import { useRef, useState, type ReactNode } from 'react';
import { GameSettingsDialog } from './GameSettings.tsx';
import { GameHelpButton, type GameHelpState } from './GameHelp';

/**
 * The same corner row on every game box (Christian's brief, 2026-11-17): a drawn gear at the top left opens the game's
 * settings, with the shared settings (theme, contrast, motion, sound) in the same dialog, and the "?" at the top right
 * opens how to play. `end` holds any other corner buttons (such as print), placed just before the "?".
 */
export default function GameHeader({ name, help, helpExtra, settings, end }: {
  /** The game's name, for the button labels and the settings title. */
  name: string;
  help: GameHelpState;
  /** Game-specific help shown above the steps (pillo's legend). */
  helpExtra?: ReactNode;
  /** The game's own settings, shown below the shared ones. */
  settings?: ReactNode;
  end?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const gear = useRef<HTMLButtonElement>(null);
  return (
    <div className="game-header" data-print-hidden>
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
        <GameFlag name={name} />
        {end}
        <GameHelpButton help={help} name={name} className="corner-button corner-button-quiet" extra={helpExtra} />
      </div>
      <GameSettingsDialog open={open} onClose={() => setOpen(false)} title={`${name} settings`} returnFocusTo={gear}>
        {settings}
      </GameSettingsDialog>
    </div>
  );
}
