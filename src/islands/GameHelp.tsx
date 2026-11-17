import '../styles/gamesettings.css';
import '../styles/gamehelp.css';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_HELP, SHARED_SETTINGS_NOTE, helpSeen, markHelpSeen, type GameHelpContent, type HelpTopic } from './gamehelp';
import { trappedFocusIndex } from './gamesettings';

/**
 * How to play, for every daily game (issue #736; text and "seen" logic in gamehelp.ts).
 *
 *   const help = useGameHelp('triage');
 *   <GameHelpButton help={help} name="sudoku" className="sudoku-icon-button" />  // the "?" and its dialog
 *   <GameHelpCard help={help} name="sudoku" />                                    // the rules, on the first visit only
 *
 * The dialog traps focus, closes with Escape, the × or "got it", and gives focus back to the "?" button.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface GameHelpState {
  content: GameHelpContent;
  /** True until the rules are dismissed or the "?" is used, on this device. */
  firstVisit: boolean;
  open: boolean;
  button: RefObject<HTMLButtonElement | null>;
  show: () => void;
  close: () => void;
  dismiss: () => void;
}

export function useGameHelp(topic: HelpTopic): GameHelpState {
  const content = GAME_HELP[topic];
  const [firstVisit, setFirstVisit] = useState(() => !helpSeen(browserStorage(), content.game));
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
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

function PlaySteps({ content }: { content: GameHelpContent }) {
  return <ol className="game-help-steps">{content.play.map((step) => <li key={step}>{step}</li>)}</ol>;
}

function GameHelpDialog({ help, name }: { help: GameHelpState; name: string }) {
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
    className="game-settings-overlay"
    aria-labelledby={`${id}-title`}
    data-testid="game-help"
    onCancel={(event) => { event.preventDefault(); help.close(); }}
    onPointerDown={(event) => { if (event.target === event.currentTarget) help.close(); }}
  >
    <div ref={panel} className="game-settings game-help">
      <div className="game-settings-heading">
        <h2 id={`${id}-title`}>how to play {name}</h2>
        <button type="button" className="game-settings-close" aria-label="close how to play" onClick={help.close}><span aria-hidden="true">×</span></button>
      </div>
      <PlaySteps content={content} />
      <h3 className="game-help-subheading">settings</h3>
      <p className="game-help-note">{content.settingsIntro}</p>
      {content.settings.length > 0 && <dl className="game-help-settings">
        {content.settings.map(({ name: setting, detail }) => <div key={setting}><dt>{setting}</dt><dd>{detail}</dd></div>)}
      </dl>}
      <p className="game-help-note">{SHARED_SETTINGS_NOTE}</p>
      <button type="button" className="game-help-action" onClick={help.close}>got it</button>
    </div>
  </dialog>;
}

/** The "?" corner button and its dialog. Each game passes its own corner-button class so it matches its other buttons. */
export function GameHelpButton({ help, name, className }: { help: GameHelpState; name: string; className: string }) {
  return <>
    <button ref={help.button} type="button" className={className} aria-label={`how to play ${name}`} aria-haspopup="dialog" data-testid="game-help-button" onClick={help.show}>
      <span aria-hidden="true">?</span>
    </button>
    <GameHelpDialog help={help} name={name} />
  </>;
}

/** The rules above the board on a game's first visit. "got it" (or the "?") puts them away for good on this device. */
export function GameHelpCard({ help, name }: { help: GameHelpState; name: string }) {
  const id = useId();
  if (!help.firstVisit) return null;
  return <section className="game-help-first" aria-labelledby={`${id}-title`} data-testid="game-help-first">
    <h3 id={`${id}-title`} className="game-help-subheading">new to {name}? here's how to play</h3>
    <PlaySteps content={help.content} />
    <p className="game-help-note">the ? button shows this again, with every setting.</p>
    <button type="button" className="game-help-action" onClick={help.dismiss}>got it</button>
  </section>;
}
