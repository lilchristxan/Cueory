import { useEffect, useMemo, useRef, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { printGame } from './gameprint';
import { GameHelpButton, GameHelpCard, useGameHelp } from './GameHelp';
import { gameName } from '../config/games';
import { localDay, showResultCard, sudokuResultCard } from './gameresults';
import { GameSettingsDialog } from './GameSettings.tsx';
import { GAME_SETTINGS_EVENT, GAME_SETTINGS_STORAGE_KEY, gameSoundAllowed, loadGameSettings, parseGameSettings, type SharedGameSettings } from './gamesettings';
import { sudokuCellClasses } from './sudokuhighlight';
import { DEFAULT_SUDOKU_SETTINGS, GAME_PROGRESS_EVENT, LEVEL_LABELS, sudokuProgressDetail, LEVEL_RULES, advanceSudokuSeconds, autoCandidateNotes, checkSudoku, conflictIndices, dailySudokuSeed, editSudokuBoard, effectiveSudokuMode, generateSudoku, getResult, loadSudokuSettings, newSudokuBoard, noteDigits, pushSudokuHistory, saveSudokuSettings, sudokuCellPresentation, sudokuKeyAction, sudokuWrongCells, undoSudoku, type SudokuBoard, type SudokuBoardAction, type SudokuLevel, type SudokuMode, type SudokuSettings } from './sudoku';
import { reportRound, SUDOKU_STATS_STORAGE_KEY, sudokuRoundResult } from './gameresults';
import { keepSudokuSolve, loadSudokuStats, sudokuLevelStats, sudokuTime, type SavedSudokuStats } from './sudokustats';
import PrintLogo from './PrintLogo';

const LEVELS: SudokuLevel[] = ['easy', 'medium', 'hard'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const where = (index: number) => `row ${Math.floor(index / 9) + 1}, column ${index % 9 + 1}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** A board with auto candidates filled in, keeping x marks (a marked square shows its mark, not notes). */
function withAutoNotes(board: SudokuBoard): SudokuBoard {
  const notes = autoCandidateNotes(board.entries).map((mask, index) => (board.marks.has(index) ? 0 : mask));
  return { entries: [...board.entries], notes, marks: new Set(board.marks) };
}

function firstOpen(puzzle: readonly number[]): number {
  const index = puzzle.findIndex((value) => value === 0);
  return index < 0 ? 0 : index;
}
function playSolvedTone(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 523;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch { /* Sound is optional. */ }
}

export default function SudokuGame() {
  const today = useMemo(() => new Date(), []);
  const day = useMemo(() => localDay(today), [today]);
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const puzzle = useMemo(() => generateSudoku(dailySudokuSeed(day, level), level), [day, level]);
  const [board, setBoard] = useState<SudokuBoard>(() => newSudokuBoard(puzzle.puzzle));
  const [history, setHistory] = useState<SudokuBoard[]>([]);
  const [mode, setMode] = useState<SudokuMode>('normal');
  const [shiftHeld, setShiftHeld] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [statsOpen, setStatsOpen] = useState(false);
  const [kept, setKept] = useState<SavedSudokuStats>({ on: false, solves: [] });
  const [selected, setSelected] = useState(() => firstOpen(puzzle.puzzle));
  const [seconds, setSeconds] = useState(0);
  const [errors, setErrors] = useState(0);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(false);
  const [settings, setSettings] = useState<SudokuSettings>(() => loadSudokuSettings(browserStorage()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const help = useGameHelp('triage');
  const howOpen = help.open;
  const [said, setSaid] = useState('');
  const settingsButton = useRef<HTMLButtonElement>(null);
  const solvedResult = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const { entries, marks, notes } = board;
  const solved = entries.every((value, index) => value === puzzle.solution[index]);
  const conflicts = useMemo(() => new Set(conflictIndices(entries)), [entries]);
  const wrong = useMemo(() => sudokuWrongCells(entries, puzzle.puzzle, puzzle.solution, settings.checkGuesses, checked),
    [entries, puzzle, settings.checkGuesses, checked]);
  const noted = useMemo(() => new Set(notes.flatMap((mask, index) => (mask ? [index] : []))), [notes]);
  const activeMode = effectiveSudokuMode(mode, shiftHeld);
  const reported = useRef(false);
  /** Read by the auto-pause listeners, which outlive a render. */
  const pausedNow = useRef(paused);
  pausedNow.current = paused;
  /** The player's own candidates from before auto candidates filled the board, restored when auto is turned off. */
  const ownNotes = useRef<number[]>([]);
  /** The daily status hears about the first move once per page (it keys by game and day). */
  const started = useRef(false);

  useEffect(() => {
    const fresh = newSudokuBoard(puzzle.puzzle);
    ownNotes.current = [...fresh.notes];
    setBoard(settings.autoCandidates ? withAutoNotes(fresh) : fresh); setHistory([]); setChecked(new Set());
    setSelected(firstOpen(puzzle.puzzle));
    setSeconds(0); setErrors(0); setPaused(false); setAuto(settings.autoCandidates);
    setSaid(`${LEVEL_LABELS[level]} puzzle ready. ${LEVEL_RULES[level].givens} given numbers.`); reported.current = false;
  }, [puzzle]);

  useEffect(() => {
    if (paused || solved) return;
    const timer = window.setInterval(() => setSeconds((value) => advanceSudokuSeconds(value, paused, solved)), 1000);
    return () => window.clearInterval(timer);
  }, [paused, solved]);

  // The latest shared settings (theme, motion, contrast, sound), followed live like useSharedGameSettings does: from the
  // same-page event (so a change still counts when browser storage refuses to save it) and from other tabs. Kept in a
  // ref, so following it never re-renders the board.
  const shared = useRef<SharedGameSettings | null>(null);
  useEffect(() => {
    shared.current = loadGameSettings(browserStorage());
    const onChange = (event: Event) => { shared.current = parseGameSettings(JSON.stringify((event as CustomEvent<unknown>).detail ?? null)); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === GAME_SETTINGS_STORAGE_KEY) shared.current = loadGameSettings(browserStorage());
    };
    window.addEventListener(GAME_SETTINGS_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(GAME_SETTINGS_EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (!solved || reported.current) return;
    reported.current = true;
    solvedResult.current?.focus();
    // The shared "game sounds" switch silences every game, sudoku's solve sound too: its latest value, as followed above.
    if (gameSoundAllowed(shared.current ?? loadGameSettings(browserStorage()), settings.playSound)) playSolvedTone();
    const result = getResult({ day, level, seconds, errors, solved: true });
    // Queue the display result even if the separate host island has not hydrated yet.
    showResultCard(sudokuResultCard(result));
    // Keep the existing public completion event for other observers. The host no longer consumes it.
    window.dispatchEvent(new CustomEvent('cueory:sudoku-solved', { detail: result }));
    // The shared stats record (and /play's daily status) count sudoku like every other game.
    reportRound(sudokuRoundResult(result));
    // Per-level stats are kept only while the shared stats switch is on (./sudokustats).
    const now = keepSudokuSolve(browserStorage(), day, { level, day, seconds });
    setKept(now);
    setSaid(`solved in ${result.time} with ${errors} ${errors === 1 ? 'error' : 'errors'}.${now.on ? ' added to your sudoku stats.' : ''}`);
  }, [solved, day, level, seconds, errors, settings.playSound]);

  useEffect(() => { saveSudokuSettings(browserStorage(), settings); }, [settings]);


  const togglePause = () => {
    setPaused((current) => !current);
    setSaid(paused ? 'puzzle resumed.' : 'puzzle paused. every number is hidden until you press play.');
  };

  // Leaving the game (another app or tab, or another window) pauses it, and it stays paused until the player presses
  // play, so the clock never runs while nobody is looking.
  useEffect(() => {
    if (solved) return;
    const leave = () => {
      if (pausedNow.current) return;
      setPaused(true);
      setSaid('puzzle paused while you were away. press play to go on.');
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', leave);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', leave); };
  }, [solved]);

  /** Every edit goes through the one pure rule and is pushed to the undo history when it changes something. */
  const apply = (action: SudokuBoardAction): SudokuBoard | undefined => {
    if (paused || solved) return;
    const next = editSudokuBoard(board, puzzle.puzzle, selected, action, auto);
    if (!next) {
      if (puzzle.puzzle[selected]) setSaid('given numbers cannot be changed.');
      return;
    }
    setHistory((past) => pushSudokuHistory(past, board));
    setBoard(next);
    if (!started.current) {
      started.current = true;
      window.dispatchEvent(new CustomEvent(GAME_PROGRESS_EVENT, { detail: sudokuProgressDetail(day) }));
    }
    // A square that was checked and then changed waits for the next check.
    if (checked.has(selected)) setChecked((current) => { const copy = new Set(current); copy.delete(selected); return copy; });
    return next;
  };

  const enter = (value: number) => {
    if (activeMode === 'candidate') {
      if (entries[selected] && !puzzle.puzzle[selected]) { setSaid('clear the square first to add cues.'); return; }
      const next = apply({ kind: 'note', value });
      if (next) setSaid(noteDigits(next.notes[selected]!).includes(value) ? `cue ${value} added.` : `cue ${value} removed.`);
      return;
    }
    if (!apply({ kind: 'enter', value })) return;
    const isWrong = value !== puzzle.solution[selected];
    if (isWrong && settings.checkGuesses) setErrors((count) => count + 1);
    setSaid(isWrong && settings.checkGuesses ? `${value} is not right for ${where(selected)}. error added.` : `${value} entered.`);
  };
  const mark = () => {
    const next = apply({ kind: 'mark' });
    if (next) setSaid(next.marks.has(selected) ? 'x mark added.' : 'mark removed.');
  };
  const clearCell = () => {
    if (paused || solved) return;
    if (apply({ kind: 'clear' })) setSaid(`${where(selected)} cleared.`);
    else if (!puzzle.puzzle[selected]) setSaid('that square is already empty.');
  };
  const undo = () => {
    if (paused || solved) return;
    const step = undoSudoku(history);
    if (!step) { setSaid('nothing to undo.'); return; }
    setBoard(step.board); setHistory(step.history);
    setSaid('last move undone.');
  };
  const switchMode = (next?: SudokuMode) => {
    if (paused || solved) return;
    const chosen = next ?? (mode === 'normal' ? 'candidate' : 'normal');
    setMode(chosen);
    setSaid(chosen === 'candidate' ? 'cue mode. numbers add or remove small cues.' : 'normal mode. numbers fill the square.');
  };
  const toggleAuto = (on: boolean) => {
    if (on === auto) return;
    setAuto(on);
    if (!paused && !solved) {
      setHistory((past) => pushSudokuHistory(past, board));
      if (on) {
        ownNotes.current = [...notes];
        setBoard(withAutoNotes(board));
      } else {
        // Turning auto off takes its candidates away and brings back the player's own, on squares still empty.
        setBoard({ entries: [...entries], marks: new Set(marks), notes: ownNotes.current.map((mask, index) => (entries[index] || marks.has(index) ? 0 : mask)) });
      }
    }
    setSaid(on ? 'auto cues on. every empty square shows its possible numbers.' : 'auto cues off. your own cues are back, and undo brings the auto ones back.');
  };
  const checkPuzzle = () => {
    if (paused || solved) return;
    const result = checkSudoku(entries, puzzle.puzzle, puzzle.solution);
    setChecked(new Set(result.wrong));
    setSaid(result.wrong.length
      ? `${plural(result.wrong.length, 'square is', 'squares are')} wrong, marked with a slash. ${plural(result.empty, 'square', 'squares')} still empty.`
      : `no mistakes so far. ${plural(result.empty, 'square', 'squares')} still empty.`);
  };
  const openStats = () => {
    setKept(loadSudokuStats(browserStorage(), day));
    setStatsOpen((open) => !open);
  };
  const forgetSudokuStats = () => {
    try { browserStorage()?.removeItem(SUDOKU_STATS_STORAGE_KEY); } catch { /* blocked storage keeps nothing new */ }
    setKept(loadSudokuStats(browserStorage(), day));
    setSaid('sudoku stats forgotten.');
  };

  // Holding Shift flips the mode for that moment; letting go (or leaving the page) flips it back.
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftHeld(true); };
    const up = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftHeld(false); };
    const reset = () => setShiftHeld(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsOpen || howOpen || paused || solved || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Ctrl+Z (Cmd+Z on a Mac) undoes anywhere in the game, except while typing in a form field.
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && target?.closest('.sudoku-game') && !target.closest('input, textarea')) {
        event.preventDefault(); undo(); return;
      }
      if (event.metaKey || event.ctrlKey || !target?.closest('.sudoku-board')) return;
      const action = sudokuKeyAction(event.key, selected, event.code);
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'enter') enter(action.value);
      else if (action.kind === 'mark') mark();
      else if (action.kind === 'clear') clearCell();
      else if (action.kind === 'toggle-mode') switchMode();
      else {
        setSelected(action.index);
        const cell = cells.current.get(action.index);
        cell?.focus();
        cell?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const updateSetting = (key: keyof SudokuSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    if (key === 'autoCandidates') toggleAuto(next.autoCandidates);
  };
  // The shared print helper (Task 641): marks the page for sudoku's print rules and clears the mark after printing.
  const printPuzzle = () => printGame('sudoku');
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return <section className="sudoku-game" data-testid="sudoku">
    <div className="sudoku-panel">
      <PrintLogo />
      <div className="segmented sudoku-levels" aria-label="difficulty">{LEVELS.map((choice) => <button key={choice} type="button" className="segmented-option" aria-pressed={level === choice} disabled={paused} onClick={() => { if (!paused) setLevel(choice); }}>{level === choice && <span className="segmented-check" aria-hidden="true">✓</span>}{LEVEL_LABELS[choice]}</button>)}</div>
      <div className="sudoku-status" data-testid="sudoku-status">
        <span className="sudoku-time">{settings.showTimer && <>time: <strong>{elapsed}</strong></>}</span>
        <span className="sudoku-errors">{settings.showErrors ? <>error: <strong>{errors}</strong></> : null}</span>
      </div>
      {/* Five equal icon buttons spread across the board's width: settings, pause or play, print, stats, how to play. */}
      <div className="sudoku-toolbar" role="group" aria-label="sudoku tools" data-testid="sudoku-toolbar">
        <button ref={settingsButton} type="button" className="sudoku-icon-button" aria-label="sudoku settings" aria-haspopup="dialog" data-testid="game-settings-button" onClick={() => setSettingsOpen(true)}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
        <button type="button" className="sudoku-icon-button sudoku-pause-button" aria-label={paused ? 'resume puzzle' : 'pause puzzle'} disabled={solved} onClick={togglePause}>{paused
          ? <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M8.5 6.5v11l9-5.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          : <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M9 6.5v11M15 6.5v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}</button>
        <button type="button" className="sudoku-icon-button print-control" aria-label="print this puzzle" onClick={printPuzzle}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M7 9V4h10v5M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-3A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H17M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <button type="button" className="sudoku-icon-button" aria-label="sudoku stats" aria-expanded={statsOpen} onClick={openStats}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
        <GameHelpButton help={help} name={gameName('triage')} className="sudoku-icon-button" />
        {statsOpen && <div className="sudoku-how sudoku-stats" role="region" aria-label="sudoku stats" data-testid="sudoku-stats">
          <p className="font-medium">your sudoku stats</p>
          {kept.on ? <>
            <table>
              <caption className="sr-only">solved, best time, average time and streak for each level</caption>
              <thead><tr><th scope="col">level</th><th scope="col">solved</th><th scope="col">best</th><th scope="col">average</th><th scope="col">streak</th></tr></thead>
              <tbody>{LEVELS.map((choice) => {
                const stats = sudokuLevelStats(kept.solves, choice, day);
                return <tr key={choice}><th scope="row">{LEVEL_LABELS[choice]}</th><td>{stats.solved}</td><td>{stats.bestSeconds === null ? '–' : sudokuTime(stats.bestSeconds)}</td><td>{stats.averageSeconds === null ? '–' : sudokuTime(stats.averageSeconds)}</td><td>{plural(stats.streak, 'day', 'days')}</td></tr>;
              })}</tbody>
            </table>
            <p className="text-sm text-ink-soft">your first solve of each level each day counts. they stay in this browser and never reach us.</p>
            {kept.solves.length > 0 && <button type="button" className="sudoku-text-button" onClick={forgetSudokuStats}>forget sudoku stats</button>}
          </> : <p>this browser won't keep stats (private browsing or blocked site data), so your sudoku times and streaks can't be shown.</p>}
        </div>}
      </div>
      <GameHelpCard help={help} name={gameName('triage')} />
      <div className="sudoku-board-scroll" role="region" aria-label="sudoku grid scroll area" tabIndex={0}>
        <div className={`sudoku-board${paused ? ' is-paused' : ''}`} role="grid" aria-label="sudoku grid" aria-rowcount={9} aria-colcount={9}>
        {Array.from({ length: 9 }, (_, row) => <div key={row} className="sudoku-row" role="row">
          {entries.slice(row * 9, row * 9 + 9).map((_, column) => {
          const index = row * 9 + column;
          const display = sudokuCellPresentation(entries, puzzle.puzzle, marks, index, paused);
          const { given, value } = display;
          const options = !paused && !value && !display.marked ? noteDigits(notes[index] ?? 0) : [];
          // Each candidate digit ends in a space, so the visible text reads "6 8", not "68", and matches the label
          // ("candidates 6, 8") for speech-input users (WCAG 2.5.3). The space never shows in the 3 by 3 layout.
          // Keep all styling in the pure highlighter; its pause guard must fail closed for private entries.
          const classes = sudokuCellClasses(index, { selected, entries, givens: puzzle.puzzle, conflicts, paused, settings, wrong, noted }).join(' ');
          const flags = paused || given ? '' : `${wrong.has(index) ? ', wrong' : ''}${settings.highlightConflicts && conflicts.has(index) ? ', conflict' : ''}`;
          const spoken = display.hidden ? 'hidden until resumed' : display.marked ? 'x mark' : value ? `${value}${flags}` : options.length ? `empty, cues ${options.join(', ')}` : 'empty';
          return <button ref={(element) => { if (element) cells.current.set(index, element); else cells.current.delete(index); }} key={index} type="button" role="gridcell" tabIndex={paused ? -1 : selected === index ? 0 : -1} className={classes} aria-rowindex={row + 1} aria-colindex={column + 1} aria-selected={!paused && selected === index} aria-label={`row ${row + 1}, column ${column + 1}, ${spoken}${given && !paused ? ', given' : ''}`} data-given={given ? 'true' : 'false'} onClick={() => { if (!paused) setSelected(index); }}>
            {paused ? <span className="sudoku-paused-mark" aria-hidden="true" /> : display.marked ? <span className="sudoku-mark" aria-hidden="true">x</span> : value ? <span>{value}{!paused && wrong.has(index) && <span className="sudoku-wrong-mark" aria-hidden="true" />}</span> : options.length ? <span className="sudoku-candidates" aria-hidden="true">{NUMBERS.map((number) => <i key={number}>{options.includes(number) ? `${number} ` : ''}</i>)}</span> : null}
          </button>;
          })}
        </div>)}
        </div>
      </div>
      <div className="sudoku-pad-wrap">
        <button type="button" className="sudoku-setting-button sudoku-hints" role="checkbox" aria-checked={auto} disabled={paused} onClick={() => { if (!paused) toggleAuto(!auto); }}><span aria-hidden="true">{auto ? '☑' : '☐'}</span> auto cues</button>
        <div className="sudoku-tools">
          <div className="segmented" role="group" aria-label="entry mode" data-testid="sudoku-mode">{(['normal', 'candidate'] as const).map((choice) => <button key={choice} type="button" className="segmented-option" aria-pressed={activeMode === choice} disabled={paused || solved} onClick={() => switchMode(choice)}>{activeMode === choice && <span className="segmented-check" aria-hidden="true">✓</span>}{choice === 'candidate' ? 'cue' : choice}</button>)}</div>
          <button type="button" className="sudoku-tool-button" onClick={undo} disabled={paused || solved || history.length === 0}>undo</button>
          <button type="button" className="sudoku-tool-button" onClick={clearCell} disabled={paused || solved}>clear cell</button>
          <button type="button" className="sudoku-tool-button" onClick={checkPuzzle} disabled={paused || solved}>check puzzle</button>
        </div>
        <div className="sudoku-number-row" aria-label={activeMode === 'candidate' ? 'cue numbers' : 'numbers'}>{NUMBERS.map((number) => <button key={number} type="button" onClick={() => enter(number)} disabled={paused || solved}>{number}</button>)}<button type="button" onClick={mark} aria-label="add or remove x mark" disabled={paused || solved}>x</button></div>
      </div>
    </div>
    {solved && <div ref={solvedResult} className="sudoku-solved" tabIndex={-1} role="status" data-testid="sudoku-result"><p className="text-lg font-medium">solved.</p><p>{elapsed} · {errors} {errors === 1 ? 'error' : 'errors'}</p><p className="text-sm text-ink-soft">a new sudoku comes out tomorrow.</p></div>}
    {/* The same settings dialog as the other games (#823): the shared settings first, then sudoku's own. */}
    <GameSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="sudoku settings" returnFocusTo={settingsButton}>
      <fieldset>
        <legend>gameboard settings</legend>
        {(Object.keys(DEFAULT_SUDOKU_SETTINGS) as Array<keyof SudokuSettings>).map((key) => {
          const labels: Record<keyof SudokuSettings, string> = { checkGuesses: 'check guesses when entered', autoCandidates: 'start in auto cue mode', showErrors: 'show error counter', showTimer: 'show timer', highlightConflicts: 'highlight conflicts', highlightRowColumn: 'highlight row and column', highlightBox: 'highlight box', highlightIdentical: 'highlight identical numbers', playSound: 'play sound on solve' };
          return <label key={key} className="game-settings-option"><span>{labels[key]}</span><input type="checkbox" checked={settings[key]} onChange={() => updateSetting(key)} /></label>;
        })}
      </fieldset>
    </GameSettingsDialog>
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="sudoku-live">{said}</p>
    <p className="sudoku-print-footer">cueory.app</p>
  </section>;
}
