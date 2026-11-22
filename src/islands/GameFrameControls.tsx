import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameSettingsDialog } from './GameSettings.tsx';

interface Props {
  gameName: string;
  steps: readonly string[];
  hasPillLegend?: boolean;
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

/** The shared Frame owns the visible controls; the framed island retains its established dialog content and state. */
export default function GameFrameControls({ gameName, steps, hasPillLegend = false, bridge = false, wide = false, children }: Props) {
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

  const open = (type: typeof GAME_FRAME_SETTINGS_EVENT | typeof GAME_FRAME_HELP_EVENT, trigger: HTMLButtonElement | null) => {
    if (bridge) {
      if (trigger) window.dispatchEvent(new CustomEvent(type, { detail: { gameName, trigger } }));
      return;
    }
    if (type === GAME_FRAME_SETTINGS_EVENT) setSettingsOpen(true);
    else setPinned((current) => !current);
  };

  return (
    <div className={`game-frame-controls-row${wide ? ' is-wide' : ''}`} data-print-hidden>
      {/* Settings (gear) sits at top-left of the board */}
      <button
        ref={gearRef}
        type="button"
        className="game-frame-btn game-frame-gear"
        aria-label={`${gameName} settings`}
        aria-haspopup="dialog"
        data-testid="game-frame-gear"
        onClick={() => open(GAME_FRAME_SETTINGS_EVENT, gearRef.current)}
      >
        <svg viewBox="0 0 24 24" className="game-frame-gear-icon" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      </button>

      {/* Middle slot for game-specific controls (e.g. crossword slider, hello-cards dots) */}
      <div className="game-frame-controls-middle">
        {children}
      </div>

      {/* The ? sits at top-right of the board */}
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
      {!bridge && <GameSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title={`${gameName} settings`} returnFocusTo={gearRef} />}
    </div>
  );
}
