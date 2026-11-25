import '../styles/gamesettings.css';
import '../styles/gamehelp.css';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { dailyGames } from '../config/games';
import { browserStorage } from '../scripts/storage';
import { GAME_HELP, SHARED_SETTINGS_NOTE, helpSeen, markHelpSeen, type GameHelpContent, type HelpTopic } from './gamehelpcontent';
import { trappedFocusIndex } from './gamesettings';

/**
 * How to play, for every daily game (issue #736; text and "seen" logic in gamehelpcontent.ts).
 *
 *   const help = useGameHelp('triage');
 *   <GameHelpButton help={help} name="sudoku" className="sudoku-icon-button" />  // the "?" and its dialog
 *
 * The dialog traps focus, closes with Escape, the × or "got it", and gives focus back to the "?" button.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface GameHelpState {
  content: GameHelpContent;
  /** Kept for callers; the first-visit rules open the "?" dialog itself. */
  firstVisit: boolean;
  open: boolean;
  button: RefObject<HTMLButtonElement | null>;
  show: () => void;
  close: () => void;
  dismiss: () => void;
}

export function useGameHelp(topic: HelpTopic): GameHelpState {
  const content = GAME_HELP[topic];
  const [firstVisit, setFirstVisit] = useState(false);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // First visit to this game on this device (docs/GAMES-PARITY.md, D-177): open the same "?" dialog once. The saved
  // "seen" mark is read here, after hydration, so the first client render matches the server HTML.
  useEffect(() => {
    if (helpSeen(browserStorage(), content.game)) return;
    markHelpSeen(browserStorage(), content.game);
    setFirstVisit(true);
    setOpen(true);
  }, [content.game]);
  const seen = () => {
    markHelpSeen(browserStorage(), content.game);
    setFirstVisit(false);
  };
  return {
    content,
    firstVisit,
    open,
    button,
    show: () => { seen(); setOpen(true); },
    close: () => setOpen(false),
    // The card goes away, so focus moves to the "?" that brings the rules back.
    dismiss: () => { seen(); button.current?.focus(); },
  };
}

/** The game's one-line description (src/config/games.ts), shown at the top of its help. */
function gameLine(content: GameHelpContent): string | undefined {
  return (content.game === 'pulse' ? dailyGames[0] : dailyGames.find((game) => game.id === content.game))?.line;
}

function PlaySteps({ content }: { content: GameHelpContent }) {
  return <ol className="game-help-steps">{content.play.map((step) => <li key={step}>{step}</li>)}</ol>;
}

export function GameHelpDialog({ help, name, extra }: { help: GameHelpState; name: string; extra?: ReactNode }) {
  const overlay = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useRef(help.close);
  close.current = help.close;
  const { open, button, content } = help;

  useEffect(() => {
    if (!open) return;
    // A modal <dialog> sits in the top layer, so the page behind it is inert.
    if (overlay.current && !overlay.current.open) overlay.current.showModal?.();
    // Only buttons here, no radio groups, so every focusable control is its own Tab stop.
    const stops = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
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
      button.current?.focus();
    };
  }, [open, button]);

  if (!open) return null;
  return <dialog
    ref={overlay}
    className="game-settings-overlay game-help-overlay"
    aria-labelledby={`${id}-title`}
    data-testid="game-help"
    onCancel={(event) => { event.preventDefault(); help.close(); }}
    onPointerDown={(event) => { if (event.target === event.currentTarget) help.close(); }}
  >
    {/* The header row stays put and only the body scrolls, so the × never sits on top of any text (Christian's iPhone test). */}
    <div ref={panel} className="game-help">
      {/* Title centred at the top (Christian's brief): an empty 44 px slot on the left balances the × on the right. */}
      <div className="game-help-header">
        <span className="game-help-balance" aria-hidden="true" />
        <h2 id={`${id}-title`} className="game-help-title">how to play {name}</h2>
        <button type="button" className="game-settings-close" aria-label="close how to play" onClick={help.close}><span aria-hidden="true">×</span></button>
      </div>
      <div className="game-help-body" data-testid="game-help-body">
      {gameLine(content) && <p className="game-help-line">{gameLine(content)}</p>}
      {extra}
      <PlaySteps content={content} />
      <h3 className="game-help-subheading">settings</h3>
      <p className="game-help-note">{content.settingsIntro}</p>
      {content.settings.length > 0 && <dl className="game-help-settings">
        {content.settings.map(({ name: setting, detail }) => <div key={setting}><dt>{setting}</dt><dd>{detail}</dd></div>)}
      </dl>}
      <p className="game-help-note">{SHARED_SETTINGS_NOTE}</p>
      <div className="game-help-actions"><button type="button" className="game-help-action" onClick={help.close}>got it</button></div>
      </div>
    </div>
  </dialog>;
}

/** The "?" corner button and its dialog. Each game passes its own corner-button class so it matches its other buttons. */
/** `extra` is game-specific help shown above the steps, such as pillo's legend of marks. */
export function GameHelpButton({ help, name, className, extra }: { help: GameHelpState; name: string; className: string; extra?: ReactNode }) {
  return <>
    <button ref={help.button} type="button" className={className} aria-label={`how to play ${name}`} aria-haspopup="dialog" data-testid="game-help-button" onClick={help.show}>
      <span aria-hidden="true">?</span>
    </button>
    <GameHelpDialog help={help} name={name} extra={extra} />
  </>;
}
