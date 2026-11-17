import '../styles/crossword.css';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { browserStorage } from '../scripts/storage';
import { localDay, reportRound } from './gameresults';
import { printGame } from './gameprint';
import { GameHelpButton, GameHelpCard, useGameHelp } from './GameHelp';
import ResultBrandMark from './ResultBrandMark';
import { dayLabel } from './daily';
import { playSolvedTone } from './solvetone';
import { useSharedGameSettings } from './GameSettings';
import PrintLogo from './PrintLogo';
import {
  announceFirstEntry, arrow, autocheckAll, backspace, check, clueLeavesGrid, countsForStreak, currentWord, deleteLetter, emptyState, enter, getResult,
  isFilledWrong, isLocked, isSolved, loadCrosswordSettings, moveClue, nextWord, numbering, parsePuzzle, previousWord,
  reveal, saveCrosswordSettings, selectCell, selectOrToggleCell, words,
  type CrosswordSettings, type CuewordPuzzle, type CuewordState, type CuewordWord, type Direction, type HelpScope,
} from './cueword';

interface Props { puzzle: CuewordPuzzle; name: string }
const letterButton = 'flex min-h-(--tap-min) min-w-(--tap-min) items-center justify-center rounded-md border border-control bg-page px-3 text-ink';
const quietButton = 'min-h-(--tap-min) min-w-(--tap-min) rounded-md border border-control bg-page px-4 py-2 text-ink';
const SCOPES: readonly HelpScope[] = ['square', 'word', 'puzzle'];
type Help = { kind: 'check' | 'reveal'; scope: HelpScope };
const CHECKBOX_SETTINGS: ReadonlyArray<[Exclude<keyof CrosswordSettings, 'clueSize'>, string]> = [
  ['autocheck', "autocheck: mark each letter right or wrong as you type. this counts as help, so the solve won't extend your streak."],
  ['skipFilled', 'skip squares that already have a letter'],
  ['jumpBack', 'at the end of a word, jump back to its first blank square'],
  ['jumpNext', 'when a word is full, jump to the next clue with a blank square'],
  ['showTimer', 'show the timer'],
  ['playSound', 'play a sound when solved'],
];

function elapsedText(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function cellLabel(state: CuewordState, cell: number, r: number, c: number, word: CuewordWord): string {
  const letter = state.entries[cell];
  let label = 'row ' + (r + 1) + ', column ' + (c + 1) + ', ' + word.number + ' ' + word.direction + ', ' + (letter ? 'letter ' + letter : 'empty');
  if (letter && state.pencil[cell]) label += ', pencil';
  if (state.cued.includes(cell)) label += ', revealed';
  else if (state.checks[cell] === 'right') label += ', checked right';
  else if (state.checks[cell] === 'wrong') label += ', marked wrong';
  return label;
}

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => emptyState(puzzle));
  const [settings, setSettings] = useState<CrosswordSettings>(() => loadCrosswordSettings(browserStorage()));
  const [pencil, setPencil] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [warned, setWarned] = useState(false);
  const [asking, setAsking] = useState<Help | null>(null);
  const [showList, setShowList] = useState(false);
  const [openMenu, setOpenMenu] = useState<'check' | 'reveal' | 'settings' | null>(null);
  const [said, setSaid] = useState('');
  const [today] = useState(() => new Date());
  const [counts, setCounts] = useState(true);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const focusGrid = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  const eraseButton = useRef<HTMLButtonElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const menus = useRef(new Map<string, HTMLDetailsElement>());
  const help = useId();
  const howToPlay = useGameHelp('cueword');
  const { soundAllowed } = useSharedGameSettings();
  const warning = useId();
  const listId = useId();
  const list = useMemo(() => words(puzzle), [puzzle]);
  const numbers = useMemo(() => numbering(puzzle), [puzzle]);
  const width = puzzle.grid[0]!.length;
  const level = puzzle.level ?? 'easy';
  const active = currentWord(state);
  const clue = puzzle.clues[active.direction].find((item) => item.number === active.number)!;
  const solved = isSolved(state);
  const wrongFill = isFilledWrong(state);
  const gameResult = getResult(state, elapsed);
  const helped = state.assists > 0;

  useEffect(() => {
    if (solved || paused) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [solved, paused]);

  useEffect(() => { saveCrosswordSettings(browserStorage(), settings); }, [settings]);

  useEffect(() => {
    if (solved) result.current?.focus();
    else if (focusGrid.current && !paused) {
      const cell = cells.current.get(state.cell);
      cell?.focus();
      // Native focus can leave a partly visible square clipped by the large
      // board's scroll area. Reveal the whole target after keyboard/tap moves.
      if (level === 'hard') cell?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    focusGrid.current = false;
  }, [state, solved, level, paused]);

  useEffect(() => { if (paused) resumeButton.current?.focus(); }, [paused]);
  const anyEntry = state.entries.some(Boolean);
  // Tells /play's daily status that today's crossword has started (#735). Once a day, on the first entry.
  useEffect(() => { if (anyEntry) announceFirstEntry(window, localDay(today)); }, [anyEntry, today]);
  useEffect(() => { if (asking) confirmButton.current?.focus(); }, [asking]);

  const reported = useRef(false);
  useEffect(() => {
    if (!solved || reported.current) return;
    reported.current = true;
    const streak = countsForStreak(today, Date.now(), state.assists);
    setCounts(streak);
    // The shared "game sounds" switch (#734) silences every game, whatever the crossword's own sound setting says.
    if (soundAllowed(settings.playSound)) playSolvedTone();
    reportRound({
      game: 'cueword', day: localDay(today), solved: true, tries: state.assists, streak,
      card: {
        game: 'cueword', name, date: dayLabel(today), level: gameResult.level,
        shareResult: `${gameResult.level} · solved in ${elapsedText(gameResult.seconds)}${helped ? ' with help' : ''}`,
        result: 'solved', summary: helped ? "you completed today's crossword with help." : "you completed today's crossword.",
        stats: [
          { label: 'level', value: gameResult.level },
          { label: 'time', value: elapsedText(gameResult.seconds) },
          { label: 'help', value: helped ? 'used' : 'none' },
        ],
        path: '/play/crossword',
      },
    });
  }, [solved, today, name, gameResult.level, gameResult.seconds, state.assists, helped, settings.playSound, soundAllowed]);

  const update = (next: CuewordState, focus = true) => {
    focusGrid.current = focus;
    setState(next);
  };

  const closeMenus = () => { for (const menu of menus.current.values()) menu.open = false; setOpenMenu(null); };
  const menuRef = (key: string) => (element: HTMLDetailsElement | null) => { if (element) menus.current.set(key, element); else menus.current.delete(key); };

  const applyHelp = ({ kind, scope }: Help) => {
    const next = kind === 'check' ? check(state, scope) : reveal(state, scope);
    const wrong = kind === 'check' ? next.checks.filter((mark) => mark === 'wrong').length : 0;
    setSaid(kind === 'check'
      ? (wrong ? `${wrong} ${wrong === 1 ? 'letter is' : 'letters are'} marked wrong.` : 'no wrong letters found.')
      : `${scope} revealed.`);
    update(next);
  };

  const askHelp = (requested: Help) => {
    closeMenus();
    if (solved || paused) return;
    if (!warned) { setAsking(requested); return; }
    applyHelp(requested);
  };

  const confirmHelp = () => {
    if (!asking) return;
    setWarned(true);
    const requested = asking;
    setAsking(null);
    applyHelp(requested);
  };

  const cancelHelp = () => { setAsking(null); focusGrid.current = true; setState({ ...state }); };

  const changeSetting = <K extends keyof CrosswordSettings>(key: K, value: CrosswordSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === 'autocheck' && value === true && !solved) {
      setWarned(true);
      update(autocheckAll(state), false);
    }
  };

  const togglePause = () => {
    if (solved) return;
    setSaid(paused ? 'puzzle resumed.' : 'puzzle paused. your letters are hidden until you resume.');
    if (paused) focusGrid.current = true;
    setPaused(!paused);
  };

  const typeLetter = (letter: string) => update(enter(state, letter, settings, pencil));

  // The shared print helper (Task 641): marks the page for the crossword's print rules and clears the mark after printing.
  const printPuzzle = () => printGame('crossword');

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (solved || paused || event.ctrlKey || event.metaKey) return;
    let next: CuewordState;
    if (event.altKey && event.key === 'ArrowLeft') next = previousWord(state);
    else if (event.altKey && event.key === 'ArrowRight') next = nextWord(state);
    else if (event.altKey) return;
    else if (/^[a-z]$/i.test(event.key)) next = enter(state, event.key, settings, pencil);
    else if (event.key === 'Backspace') next = backspace(state);
    else if (event.key === 'Delete') next = deleteLetter(state);
    else if (event.key === 'Tab') {
      // Tab on the last clue (Shift+Tab on the first) is left to the browser, so focus leaves the grid: no keyboard trap.
      const delta = event.shiftKey ? -1 : 1;
      if (clueLeavesGrid(state, delta)) return;
      next = moveClue(state, delta);
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') next = arrow(state, event.key);
    else if (event.key === 'Escape') {
      event.preventDefault();
      eraseButton.current?.focus();
      return;
    } else return;
    event.preventDefault();
    update(next);
  };

  const chooseClue = (word: CuewordWord) => {
    const blank = word.cells.find((cell) => !state.entries[cell] && !isLocked(state, cell));
    update(selectCell(state, blank ?? word.cells[0]!, word.direction));
  };

  return (
    <section className="crossword-panel" aria-label={name + ' puzzle'} data-testid="cueword" data-clue-size={settings.clueSize}>
      <div className="crossword-toolbar crossword-no-print">
        <div className="segmented crossword-mode" role="group" aria-label="entry mode">
          <button type="button" className="segmented-option" aria-pressed={!pencil} disabled={solved} onClick={() => setPencil(false)}>{!pencil && <span className="segmented-check" aria-hidden="true">✓</span>}pen</button>
          <button type="button" className="segmented-option" aria-pressed={pencil} disabled={solved} onClick={() => setPencil(true)}>{pencil && <span className="segmented-check" aria-hidden="true">✓</span>}pencil</button>
        </div>
        {/* Check and reveal move to a new row together, never split across two rows (they only stack when even the pair
            is wider than the column, at the largest text on the narrowest screens). */}
        <div className="crossword-help-pair">
        {(['check', 'reveal'] as const).map((kind) => (
          <details key={kind} ref={menuRef(kind)} className="crossword-help" data-testid={'crossword-' + kind}
            onToggle={(event) => { const open = event.currentTarget.open; setOpenMenu((current) => open ? kind : current === kind ? null : current); }}>
            <summary className={quietButton.replace('px-4', 'px-3') + ' crossword-menu-button'}>{kind}</summary>
            {/* Rendered only while open, so closed menus leave no hidden buttons behind. */}
            {openMenu === kind && (
              <div className="crossword-help-panel crossword-menu-panel" role="group" aria-label={kind}>
                {SCOPES.map((scope) => (
                  <button key={scope} type="button" className={quietButton} disabled={solved || paused} onClick={() => askHelp({ kind, scope })}>{kind} {scope}</button>
                ))}
              </div>
            )}
          </details>
        ))}
        </div>
        <details ref={menuRef('settings')} className="crossword-help"
          onToggle={(event) => { const open = event.currentTarget.open; setOpenMenu((current) => open ? 'settings' : current === 'settings' ? null : current); }}>
          <summary className="corner-button corner-button-quiet" aria-label="crossword settings">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
          </summary>
          {/* Rendered only while open, like the check and reveal menus, so a closed menu leaves no unreachable controls. */}
          {openMenu === 'settings' && (
            <div className="crossword-help-panel crossword-settings" data-testid="crossword-settings">
              <h3 className="font-medium">settings</h3>
              {CHECKBOX_SETTINGS.map(([setting, label]) => (
                <label key={setting} className="crossword-setting">
                  <input type="checkbox" checked={settings[setting]} onChange={(event) => changeSetting(setting, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
              <fieldset className="crossword-setting-group">
                <legend>clue text size</legend>
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <label key={size} className="crossword-setting">
                    <input type="radio" name={help + '-clue-size'} value={size} checked={settings.clueSize === size} onChange={() => changeSetting('clueSize', size)} />
                    <span>{size}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </details>
        <button type="button" className="corner-button corner-button-quiet" aria-label="print this puzzle" onClick={printPuzzle}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/></svg>
        </button>
        <GameHelpButton help={howToPlay} name={name} className="corner-button corner-button-quiet" />
      </div>

      <GameHelpCard help={howToPlay} name={name} />

      {asking && (
        <div className="crossword-warning crossword-no-print" role="alertdialog" aria-labelledby={warning + '-title'} aria-describedby={warning} data-testid="crossword-warning">
          <p id={warning + '-title'} className="font-medium">use {asking.kind} {asking.scope}?</p>
          <p id={warning} className="mt-1 text-sm">check and reveal still count as solved, but today's crossword won't extend your streak.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={confirmButton} type="button" className={quietButton} onClick={confirmHelp}>yes, {asking.kind}</button>
            <button type="button" className={quietButton} onClick={cancelHelp}>cancel</button>
          </div>
        </div>
      )}

      <PrintLogo />
      {puzzle.sample && <p className="text-center text-sm text-ink-soft">today's puzzle is a sample</p>}
      <div className="crossword-timer crossword-no-print mt-2">
        {settings.showTimer && <span className="tabular-nums" data-testid="crossword-time">time: {elapsedText(elapsed)}</span>}
        {!solved && (
          <button type="button" className="corner-button corner-button-quiet" aria-label={paused ? 'resume puzzle' : 'pause puzzle'} onClick={togglePause}>
            <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
          </button>
        )}
      </div>
      <p id={help} className="crossword-no-print mt-2 text-center text-sm text-ink-soft">
        type letters. arrows move. space switches direction. tab goes to the next clue, and past the last clue leaves the grid. escape leaves the grid too.
        {level === 'hard' && ' swipe the board sideways to see more squares. keyboard: focus the board scroll area to scroll, or use arrows on a square to move through the grid.'}
      </p>

      {paused ? (
        <div className="crossword-paused mt-4" data-testid="crossword-paused">
          <p className="font-medium">puzzle paused</p>
          <p className="mt-1 text-sm text-ink-soft">your letters are hidden until you resume. the timer is stopped.</p>
          <button ref={resumeButton} type="button" className={quietButton + ' mt-3'} onClick={togglePause}>resume</button>
        </div>
      ) : (
        <div
          className="crossword-board-wrap mt-4"
          data-level={level}
          role={level === 'hard' ? 'region' : undefined}
          aria-label={level === 'hard' ? name + ' board scroll area' : undefined}
          aria-describedby={level === 'hard' ? help : undefined}
          tabIndex={level === 'hard' ? 0 : undefined}
        >
          <div
            role="grid"
            aria-label={name + ' grid'}
            aria-describedby={help}
            aria-keyshortcuts="Tab Shift+Tab Space Escape Alt+ArrowLeft Alt+ArrowRight"
            aria-rowcount={puzzle.grid.length}
            aria-colcount={width}
            className="crossword-board"
            data-level={level}
            onKeyDown={key}
          >
            {puzzle.grid.map((row, r) => (
              <div role="row" aria-rowindex={r + 1} key={r} className="crossword-row">
                {[...row].map((answer, c) => {
                  const cell = r * width + c;
                  if (answer === '.') return <div role="gridcell" aria-colindex={c + 1} aria-label="black square" key={cell} className="crossword-gap" />;
                  const word = list.find((item) => item.direction === state.direction && item.cells.includes(cell)) ?? list.find((item) => item.cells.includes(cell))!;
                  const selected = active.cells.includes(cell);
                  const current = cell === state.cell;
                  const number = numbers[r]![c];
                  const revealed = state.cued.includes(cell);
                  const mark = revealed ? undefined : state.checks[cell];
                  const classes = 'crossword-cell' + (selected ? ' crossword-cell-word' : '') + (current ? ' crossword-cell-current' : '') +
                    (state.entries[cell] && state.pencil[cell] ? ' crossword-cell-pencil' : '') + (revealed ? ' crossword-cell-revealed' : '') +
                    (mark === 'wrong' ? ' crossword-cell-wrong' : '') + (mark === 'right' ? ' crossword-cell-right' : '');
                  return (
                    <div role="gridcell" aria-colindex={c + 1} aria-selected={selected} key={cell}>
                      <button
                        ref={(element) => { if (element) cells.current.set(cell, element); else cells.current.delete(cell); }}
                        type="button"
                        tabIndex={current ? 0 : -1}
                        disabled={solved}
                        aria-label={cellLabel(state, cell, r, c, word)}
                        aria-pressed={current}
                        data-cell={cell}
                        className={classes}
                        onClick={() => update(selectOrToggleCell(state, cell))}
                      >
                        {number !== null && <span className="crossword-number" aria-hidden="true">{number}</span>}
                        <span className="crossword-entry" aria-hidden="true">{state.entries[cell] || ' '}</span>
                        {mark === 'right' && <span className="crossword-mark" aria-hidden="true">✓</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!paused && (
        <p className="crossword-clue-bar" aria-live="polite" aria-atomic="true" data-testid="cueword-clue">
          <strong>{active.number} {active.direction}</strong><span>{clue.text}</span>
        </p>
      )}

      {wrongFill && (
        <p className="crossword-not-right crossword-no-print" role="status" data-testid="cueword-not-right">
          <span aria-hidden="true">△ </span>something's not right yet. every square is filled, but at least one letter is wrong.
        </p>
      )}

      {!solved && !paused && (
        <div className="crossword-no-print">
          <div className="mx-auto mt-6 flex max-w-sm flex-wrap justify-center gap-1" role="group" aria-label="letters">
            {[...'abcdefghijklmnopqrstuvwxyz'].map((letter) => <button type="button" key={letter} className={letterButton} onClick={() => typeLetter(letter)}>{letter}</button>)}
          </div>
          <div className="mt-3 flex justify-center">
            <button ref={eraseButton} type="button" className={quietButton} onClick={() => update(backspace(state))}>erase</button>
          </div>
        </div>
      )}

      {!paused && (
        <div className="crossword-no-print mt-4 flex justify-center">
          <button type="button" className={quietButton} aria-expanded={showList} aria-controls={listId} onClick={() => setShowList((open) => !open)}>
            {showList ? 'hide clue list' : 'show clue list'}
          </button>
        </div>
      )}
      {showList && !paused && (
        <div id={listId} className="crossword-clue-list crossword-no-print" data-testid="crossword-clue-list">
          {(['across', 'down'] as const).map((direction: Direction) => (
            <section key={direction} aria-label={direction + ' clues'}>
              <h3 className="font-medium">{direction}</h3>
              <ol>
                {puzzle.clues[direction].map((item) => {
                  const word = list.find((candidate) => candidate.direction === direction && candidate.number === item.number)!;
                  const isActive = active.direction === direction && active.number === item.number;
                  return (
                    <li key={item.number}>
                      <button type="button" className="crossword-clue-item" aria-current={isActive ? 'true' : undefined} onClick={() => chooseClue(word)}>
                        <span aria-hidden="true" className="crossword-clue-marker">{isActive ? '▸' : ''}</span>
                        <strong>{item.number}</strong> <span>{item.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className="crossword-print-clues">
        {(['across', 'down'] as const).map((direction: Direction) => (
          <section key={direction}>
            <h2>{direction}</h2>
            <ol>
              {puzzle.clues[direction].map((item) => <li key={item.number}><strong>{item.number}.</strong> {item.text}</li>)}
            </ol>
          </section>
        ))}
      </div>

      <footer className="crossword-print-footer">cueory.app</footer>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="crossword-live">{said}</p>

      {solved && (
        <div ref={result} tabIndex={-1} className="crossword-result mt-6 rounded-md border border-control p-4" data-testid="cueword-result" role="status">
          <p className="text-lg font-medium">solved.</p>
          <p className="mt-2">{gameResult.level} · {elapsedText(gameResult.seconds)}</p>
          <p className="crossword-badge mt-2" data-testid="crossword-badge" data-badge={helped ? 'helped' : 'clean'}>
            <span aria-hidden="true">{helped ? '◇' : '◆'} </span>
            {helped ? 'solved with help' : 'solved without help'}
          </p>
          <p className="mt-1 text-sm text-ink-soft" data-testid="crossword-streak-note">
            {counts ? 'this solve extends your streak when stats are on.'
              : helped ? "check or reveal was used, so this solve doesn't extend your streak."
                : "solved more than 48 hours after the puzzle's date, so it doesn't extend your streak."}
          </p>
          <ResultBrandMark path="/play" />
        </div>
      )}
    </section>
  );
}

export default function CuewordGame({ puzzle, name }: Props) {
  try {
    const parsed = parsePuzzle(puzzle);
    return <Board key={JSON.stringify(parsed)} puzzle={parsed} name={name} />;
  } catch {
    return <p role="alert">this puzzle could not be loaded. please try again later.</p>;
  }
}
