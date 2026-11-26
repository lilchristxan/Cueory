import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameSettingsDialog } from './GameSettings.tsx';
import GearIcon from './GearIcon';
import PrintHint from './PrintHint';
import { requestPrint } from './gameprintevent';

interface Props {
  gameName: string;
  steps: readonly string[];
  hasPillLegend?: boolean;
  /** The id this game's print rules use (gameprint.ts), when the game can print: the printer button shows and announces it. */
  printId?: string;
  /** Framed daily-game islands listen for the events and retain their existing dialogs. */
  bridge?: boolean;
  wide?: boolean;
  children?: ReactNode;
}

export const GAME_FRAME_SETTINGS_EVENT = 'cueory:game-frame-settings';
export const GAME_FRAME_HELP_EVENT = 'cueory:game-frame-help';
export const GAME_FRAME_HELP_READY_EVENT = 'cueory:game-frame-help-ready';

/**
 * Framed game islands hydrate independently from the visible Frame controls. Keep the visible
 * help button available to either island first, then announce it to an island that hydrates later.
 */
const frameHelpButtons = new Map<string, HTMLButtonElement>();

export function frameHelpButton(gameName: string): HTMLButtonElement | undefined {
  return frameHelpButtons.get(gameName);
}

export function registerFrameHelpButton(gameName: string, button: HTMLButtonElement) {
  frameHelpButtons.set(gameName, button);
  window.dispatchEvent(new CustomEvent(GAME_FRAME_HELP_READY_EVENT, { detail: { gameName, trigger: button } }));
  return () => {
    if (frameHelpButtons.get(gameName) === button) frameHelpButtons.delete(gameName);
  };
}

/**
 * The game island and the Frame controls hydrate on their own clocks, and the game is the later one on most loads. An
 * open request sent before the game listens would be lost, so the controls hold the latest one and send it again the
 * moment the game says it is listening (it is never dropped, and never sent twice).
 */
export const GAME_FRAME_LISTENING_EVENT = 'cueory:game-frame-listening';
const listeningGames = new Set<string>();

export function announceFrameListening(gameName: string) {
  listeningGames.add(gameName);
  window.dispatchEvent(new CustomEvent(GAME_FRAME_LISTENING_EVENT, { detail: { gameName } }));
  return () => { listeningGames.delete(gameName); };
}

/** The shared Frame owns the visible controls; the framed island retains its established dialog content and state. */
export default function GameFrameControls({ gameName, steps, hasPillLegend = false, printId, bridge = false, wide = false, children }: Props) {
  const gearRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const helpOpen = pinned || hovered;

  useEffect(() => {
    if (!bridge || !helpBtnRef.current) return;
    return registerFrameHelpButton(gameName, helpBtnRef.current);
  }, [bridge, gameName]);

  useEffect(() => {
    if (bridge || !helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setHovered(false);
      helpBtnRef.current?.focus();
    };
    const onOutside = (event: PointerEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [bridge, helpOpen]);

  const waiting = useRef<{ type: string; trigger: HTMLButtonElement } | null>(null);
  useEffect(() => {
    if (!bridge) return;
    const replay = (event: Event) => {
      const detail = (event as CustomEvent<{ gameName?: string }>).detail;
      const held = waiting.current;
      if (!held || detail?.gameName !== gameName) return;
      waiting.current = null;
      window.dispatchEvent(new CustomEvent(held.type, { detail: { gameName, trigger: held.trigger } }));
    };
    window.addEventListener(GAME_FRAME_LISTENING_EVENT, replay);
    return () => window.removeEventListener(GAME_FRAME_LISTENING_EVENT, replay);
  }, [bridge, gameName]);

  const open = (type: typeof GAME_FRAME_SETTINGS_EVENT | typeof GAME_FRAME_HELP_EVENT, trigger: HTMLButtonElement | null) => {
    if (bridge) {
      if (!trigger) return;
      if (!listeningGames.has(gameName)) { waiting.current = { type, trigger }; return; }
      window.dispatchEvent(new CustomEvent(type, { detail: { gameName, trigger } }));
      return;
    }
    if (type === GAME_FRAME_SETTINGS_EVENT) setSettingsOpen(true);
    else setPinned((current) => !current);
  };

  return (
    <>
    {/* The two corner buttons sit together at the top right of the play area (gameframe.css): settings, then "?". */}
    <div className="game-frame-corner" data-print-hidden>
      <button
        ref={gearRef}
        type="button"
        className="game-frame-btn game-frame-gear"
        aria-label={`${gameName} settings`}
        aria-haspopup="dialog"
        data-testid="game-frame-gear"
        onClick={() => open(GAME_FRAME_SETTINGS_EVENT, gearRef.current)}
      >
        <GearIcon className="game-frame-gear-icon" />
      </button>

      {/* The printer sits just left of the "?" on games that print. It announces the print on the document and decides
          nothing itself: the game's own code answers (gameprintevent.ts). */}
      {printId && (
        <button
          type="button"
          className="game-frame-btn game-frame-print"
          aria-label="print"
          data-testid="game-frame-print"
          onClick={() => requestPrint(printId)}
        >
          <svg viewBox="0 0 24 24" className="game-frame-print-icon" aria-hidden="true" focusable="false">
            <path d="M7 9V4h10v5" />
            <path d="M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-3A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H17" />
            <path d="M7 14h10v6H7z" />
          </svg>
        </button>
      )}

      {/* The ? sits to the right of the printer, at the very corner */}
      {bridge ? (
        <button
          ref={helpBtnRef}
          type="button"
          className="game-frame-btn game-frame-how"
          aria-label={`how to play ${gameName}`}
          aria-haspopup="dialog"
          data-testid="game-frame-help-button"
          onClick={() => open(GAME_FRAME_HELP_EVENT, helpBtnRef.current)}
        >
          <span aria-hidden="true" className="game-frame-how-q">?</span>
        </button>
      ) : (
        <div
          ref={helpRef}
          className="game-frame-how-wrap"
          data-open={helpOpen ? 'true' : 'false'}
          onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false); }}
        >
          <button
            ref={helpBtnRef}
            type="button"
            className="game-frame-btn game-frame-how"
            aria-label={`how to play ${gameName}`}
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
            data-testid="game-frame-help-button"
            onClick={() => open(GAME_FRAME_HELP_EVENT, helpBtnRef.current)}
          >
            <span aria-hidden="true" className="game-frame-how-q">?</span>
          </button>
          <div className="game-frame-popover" role="region" aria-label={`how to play ${gameName} guide`}>
            <div className="game-frame-popover-title">HOW TO PLAY</div>
            <ol className="game-frame-popover-steps">
              {steps.map((step, index) => <li key={index} className="game-frame-popover-step"><b className="game-frame-step-num" aria-hidden="true">{index + 1}</b><span className="game-frame-step-text">{step}</span></li>)}
            </ol>
            {hasPillLegend && <div className="game-frame-legend">
              <div className="game-frame-legend-item"><span className="game-frame-pill-cap game-frame-pill-green" aria-hidden="true">a</span><span>right letter, right spot</span></div>
              <div className="game-frame-legend-item"><span className="game-frame-pill-cap game-frame-pill-oxblood" aria-hidden="true">a</span><span>right letter, wrong spot</span></div>
              <div className="game-frame-legend-item"><span className="game-frame-pill-cap game-frame-pill-ivory" aria-hidden="true">a</span><span>not in the word</span></div>
            </div>}
          </div>
        </div>
      )}
      {printId && <PrintHint />}
    </div>
    {printId && <div className="game-frame-hint-room" aria-hidden="true" />}
    {/* Game-specific controls (the sudoku difficulty menu) keep their own row above the board, centred on it. */}
    <div className={`game-frame-controls-row${wide ? ' is-wide' : ''}`} data-print-hidden>
      <div className="game-frame-controls-middle">
        {children}
      </div>
    </div>
    {!bridge && <GameSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title={`${gameName} settings`} returnFocusTo={gearRef} />}
    </>
  );
}
