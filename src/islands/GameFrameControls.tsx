import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameSettingsDialog } from './GameSettings.tsx';

interface Props {
  gameName: string;
  steps: readonly string[];
  hasPillLegend?: boolean;
  children?: ReactNode;
}

export default function GameFrameControls({ gameName, steps, hasPillLegend = false, children }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);

  const helpOpen = pinned || hovered;

  // Close popover on Escape or click outside
  useEffect(() => {
    if (!helpOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setHovered(false);
        helpBtnRef.current?.focus();
      }
    };
    const handleClickOutside = (e: PointerEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setPinned(false);
        setHovered(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [helpOpen]);

  const toggleHelp = () => {
    if (pinned) {
      setPinned(false);
      setHovered(false);
    } else {
      setPinned(true);
    }
  };

  return (
    <div className="game-frame-controls-row" data-print-hidden>
      {/* Settings (gear) sits at top-left of the board */}
      <button
        ref={gearRef}
        type="button"
        className="game-frame-btn game-frame-gear"
        aria-label={`${gameName} settings`}
        aria-haspopup="dialog"
        data-testid="game-frame-gear"
        onClick={() => setSettingsOpen(true)}
      >
        <span aria-hidden="true" className="game-frame-gear-icon">⚙</span>
      </button>

      {/* Middle slot for game-specific controls (e.g. crossword slider, hello-cards dots) */}
      <div className="game-frame-controls-middle">
        {children}
      </div>

      {/* The ? sits at top-right of the board */}
      <div
        ref={helpRef}
        className="game-frame-how-wrap"
        data-open={helpOpen ? 'true' : 'false'}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHovered(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHovered(false);
        }}
      >
        <button
          ref={helpBtnRef}
          type="button"
          className="game-frame-btn game-frame-how"
          aria-label={`how to play ${gameName}`}
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          data-testid="game-frame-help-button"
          onClick={toggleHelp}
        >
          <span aria-hidden="true" className="game-frame-how-q">?</span>
        </button>

        {/* Popover showing the game's steps */}
        <div
          className="game-frame-popover"
          role="region"
          aria-label={`how to play ${gameName} guide`}
        >
          <div className="game-frame-popover-title">HOW TO PLAY</div>
          <ol className="game-frame-popover-steps">
            {steps.map((step, idx) => (
              <li key={idx} className="game-frame-popover-step">
                <b className="game-frame-step-num" aria-hidden="true">{idx + 1}</b>
                <span className="game-frame-step-text">{step}</span>
              </li>
            ))}
          </ol>

          {/* Vialo pill states legend */}
          {hasPillLegend && (
            <div className="game-frame-legend">
              <div className="game-frame-legend-item">
                <span className="game-frame-pill-cap game-frame-pill-green" aria-hidden="true">a</span>
                <span>right letter, right spot</span>
              </div>
              <div className="game-frame-legend-item">
                <span className="game-frame-pill-cap game-frame-pill-oxblood" aria-hidden="true">a</span>
                <span>right letter, wrong spot</span>
              </div>
              <div className="game-frame-legend-item">
                <span className="game-frame-pill-cap game-frame-pill-ivory" aria-hidden="true">a</span>
                <span>not in the word</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <GameSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={`${gameName} settings`}
        returnFocusTo={gearRef}
      />
    </div>
  );
}
