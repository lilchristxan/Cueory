import { useEffect, useMemo, useRef, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { FORFEIT_EVENT, sendPrint } from '../scripts/printgate';
import { GameHelpButton, GameHelpDialog, useGameHelp } from './GameHelp';
import { gameName } from '../config/games';
import { deleteStats, forgetHeldRounds, localDay, reportStatsChanged, showResultCard, sudokuResultCard } from './gameresults';
import { GameSettingsDialog } from './GameSettings.tsx';
import { announceFrameListening, frameHelpButton, GAME_FRAME_HELP_EVENT, GAME_FRAME_HELP_READY_EVENT, GAME_FRAME_SETTINGS_EVENT } from './GameFrameControls';
import { playGameCue, type GameCue } from './gamesound';
import { GAME_SETTINGS_EVENT, GAME_SETTINGS_STORAGE_KEY, gameSoundAllowed, loadGameSettings, parseGameSettings, type SharedGameSettings } from './gamesettings';
import { sudokuCellClasses } from './sudokuhighlight';
import { DEFAULT_SUDOKU_SETTINGS, GAME_PROGRESS_EVENT, LEVEL_LABELS, sudokuProgressDetail, LEVEL_RULES, advanceSudokuSeconds, autoCandidateNotes, checkSudoku, conflictIndices, placedDigits, dailySudokuSeed, editSudokuBoard, effectiveSudokuMode, generateSudoku, getResult, loadSudokuSettings, newSudokuBoard, noteDigits, pushSudokuHistory, saveSudokuSettings, sudokuCellPresentation, sudokuKeyAction, sudokuWrongCells, undoSudoku, type SudokuBoard, type SudokuBoardAction, type SudokuLevel, type SudokuMode, type SudokuSettings } from './sudoku';
import { reportRound, SUDOKU_STATS_STORAGE_KEY, sudokuRoundResult } from './gameresults';
import { keepSudokuSolve, loadSudokuStats, sudokuLevelStats, sudokuTime, type SavedSudokuStats } from './sudokustats';
import PrintLogo from './PrintLogo';

const LEVELS: SudokuLevel[] = ['easy', 'medium', 'hard'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PAD_GROUPS = [NUMBERS.slice(0, 5), NUMBERS.slice(5)];

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
export default function SudokuGame({ framed = false }: { framed?: boolean } = {}) {
  const today = useMemo(() => new Date(), []);
  const day = useMemo(() => localDay(today), [today]);
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const requestedFrameLevel = useRef<SudokuLevel>('easy');
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
  const [confirmingForgetAll, setConfirmingForgetAll] = useState(false);
  const help = useGameHelp('triage');
  const howOpen = help.open;
  const [said, setSaid] = useState('');
  const settingsButton = useRef<HTMLButtonElement>(null);
  const forgetAllStatsButton = useRef<HTMLButtonElement>(null);
  const confirmForgetAllButton = useRef<HTMLButtonElement>(null);
  const restoreForgetAllFocus = useRef(false);
  const solvedResult = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const { entries, marks, notes } = board;
  const solved = entries.every((value, index) => value === puzzle.solution[index]);
  // "print anyway" on an unfinished level (usegameprint.ts) ends that level on screen as lost. Not saved: a reload starts the
  // level fresh, and the stored first result of the day stands.
  const [lostLevels, setLostLevels] = useState<ReadonlySet<SudokuLevel>>(() => new Set());
  const lost = lostLevels.has(level);
  const over = solved || lost;
  const conflicts = useMemo(() => new Set(conflictIndices(entries)), [entries]);
  const wrong = useMemo(() => sudokuWrongCells(entries, puzzle.puzzle, puzzle.solution, settings.checkGuesses, checked),
    [entries, puzzle, settings.checkGuesses, checked]);
  const donePad = useMemo(() => placedDigits(entries), [entries]);
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
    if (framed) setKept(loadSudokuStats(browserStorage(), day));
  }, [framed, day]);

  useEffect(() => {
    if (!framed) return;
    const detailFor = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const { gameName, trigger } = detail as { gameName?: unknown; trigger?: unknown };
      return gameName === 'sudoku' && trigger instanceof HTMLButtonElement ? trigger : undefined;
    };
    const openSettings = (event: Event) => {
      if (!detailFor(event)) return;
      // Re-read on every open so a solve or forget from another tab is reflected in the framed dialog.
      setKept(loadSudokuStats(browserStorage(), day));
      setSettingsOpen(true);
    };
    const setHelpReturnTarget = (trigger = frameHelpButton('sudoku')) => {
      if (trigger) help.button.current = trigger;
    };
    const openHelp = (event: Event) => {
      const trigger = detailFor(event);
      if (!trigger) return;
      setHelpReturnTarget(trigger);
      help.show();
    };
    const setHelpWhenReady = (event: Event) => { setHelpReturnTarget(detailFor(event)); };
    // The Frame control may have hydrated before this island, or may announce itself afterwards.
    setHelpReturnTarget();
    window.addEventListener(GAME_FRAME_SETTINGS_EVENT, openSettings);
    window.addEventListener(GAME_FRAME_HELP_EVENT, openHelp);
    window.addEventListener(GAME_FRAME_HELP_READY_EVENT, setHelpWhenReady);
    const stopListening = announceFrameListening('sudoku');
    return () => {
      stopListening();
      window.removeEventListener(GAME_FRAME_SETTINGS_EVENT, openSettings);
      window.removeEventListener(GAME_FRAME_HELP_EVENT, openHelp);
      window.removeEventListener(GAME_FRAME_HELP_READY_EVENT, setHelpWhenReady);
    };
  }, [framed, help, day]);

  // A player can change the native picker before either the route script or the board is ready.
  useEffect(() => {
    if (!framed) return;
    const picker = document.querySelector<HTMLSelectElement>('#game-frame-sudoku-difficulty');
    if (!picker) return;
    const requestLevel = (value: unknown) => {
      const next = LEVELS.find(choice => choice === value);
      if (!next || pausedNow.current || next === requestedFrameLevel.current) return;
      requestedFrameLevel.current = next;
      setLevel(next);
    };
    const readPicker = () => requestLevel(picker.value);
    const readEvent = (event: Event) => requestLevel((event as CustomEvent<unknown>).detail);
    picker.addEventListener('change', readPicker);
    window.addEventListener('cueory:game-frame-sudoku-level', readEvent);
    readPicker();
    return () => {
      picker.removeEventListener('change', readPicker);
      window.removeEventListener('cueory:game-frame-sudoku-level', readEvent);
    };
  }, [framed]);

  useEffect(() => {
    // On first mount, the initial Easy render may precede the selection just adopted above.
    if (framed && level === requestedFrameLevel.current) {
      window.dispatchEvent(new CustomEvent('cueory:game-frame-sudoku-level-change', { detail: level }));
    }
  }, [framed, level]);

  useEffect(() => {
    if (framed) window.dispatchEvent(new CustomEvent('cueory:sudoku-paused', { detail: paused }));
  }, [framed, paused]);

  useEffect(() => {
    const fresh = newSudokuBoard(puzzle.puzzle);
    ownNotes.current = [...fresh.notes];
    setBoard(settings.autoCandidates ? withAutoNotes(fresh) : fresh); setHistory([]); setChecked(new Set());
    setSelected(firstOpen(puzzle.puzzle));
    setSeconds(0); setErrors(0); setPaused(false); setAuto(settings.autoCandidates);
    setSaid(`${LEVEL_LABELS[level]} puzzle ready. ${LEVEL_RULES[level].givens} given numbers.`); reported.current = false;
  }, [puzzle]);

  useEffect(() => {
    const onForfeit = (event: Event) => {
      const detail = (event as CustomEvent<{ game?: string; day?: string; level?: string }>).detail;
      if (detail?.game !== 'triage' || detail.day !== day) return;
      if (detail.level === 'easy' || detail.level === 'medium' || detail.level === 'hard') {
        const forfeited = detail.level;
        setLostLevels((current) => new Set(current).add(forfeited));
        // A paused level must not stay paused: nothing could resume it, and the picker stays locked while paused.
        setPaused(false);
      }
    };
    window.addEventListener(FORFEIT_EVENT, onForfeit);
    return () => window.removeEventListener(FORFEIT_EVENT, onForfeit);
  }, [day]);

  useEffect(() => {
    if (paused || over) return;
    const timer = window.setInterval(() => setSeconds((value) => advanceSudokuSeconds(value, paused, over)), 1000);
    return () => window.clearInterval(timer);
  }, [paused, over]);

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
    if (gameSoundAllowed(shared.current ?? loadGameSettings(browserStorage()), settings.playSound)) playGameCue('solved');
    const result = getResult({ day, level, seconds, errors, solved: true });
    // Queue the display result even if the separate host island has not hydrated yet.
    showResultCard(sudokuResultCard(result));
    // Keep the existing public completion event for other observers. The host no longer consumes it.
    window.dispatchEvent(new CustomEvent('cueory:sudoku-solved', { detail: result }));
    // The shared stats record (and /play's daily status) count sudoku like every other game.
    reportRound(sudokuRoundResult(result));
    // Per-level stats are kept only while the shared stats switch is on (./sudokustats).
    const now = keepSudokuSolve(browserStorage(), day, { level, day, seconds });
    reportStatsChanged();
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
    if (over) return;
    const leave = () => {
      if (pausedNow.current) return;
      setPaused(true);
      setSaid('puzzle paused while you were away. press play to go on.');
    };
    const hidden = () => { if (document.visibilityState === 'hidden') leave(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', leave);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', leave); };
  }, [over]);

  /** Short cues for entries and erasing: only the shared "game sounds" switch applies (the solve sound has its own setting). */
  const cue = (name: GameCue) => playGameCue(name, gameSoundAllowed(shared.current ?? loadGameSettings(browserStorage())));

  /** Every edit goes through the one pure rule and is pushed to the undo history when it changes something. */
  const apply = (action: SudokuBoardAction): SudokuBoard | undefined => {
    if (paused || over) return;
    const next = editSudokuBoard(board, puzzle.puzzle, selected, action, auto);
    if (!next) {
      if (puzzle.puzzle[selected]) { setSaid('given numbers cannot be changed.'); cue('invalid'); }
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
    // A digit already on the board nine times has nowhere left to go: the pad and the keyboard both ignore it.
    if (donePad.has(value)) { setSaid(`${value} is all placed.`); cue('invalid'); return; }
    if (activeMode === 'candidate') {
      if (entries[selected] && !puzzle.puzzle[selected]) { setSaid('clear the square first to add pencil marks.'); return; }
      const next = apply({ kind: 'note', value });
      if (next) { cue('place'); setSaid(noteDigits(next.notes[selected]!).includes(value) ? `pencil mark ${value} added.` : `pencil mark ${value} removed.`); }
      return;
    }
    if (!apply({ kind: 'enter', value })) return;
    const isWrong = value !== puzzle.solution[selected];
    cue(isWrong && settings.checkGuesses ? 'invalid' : 'place');
    if (isWrong && settings.checkGuesses) setErrors((count) => count + 1);
    setSaid(isWrong && settings.checkGuesses ? `${value} is not right for ${where(selected)}. error added.` : `${value} entered.`);
  };
  const mark = () => {
    const next = apply({ kind: 'mark' });
    if (next) setSaid(next.marks.has(selected) ? 'x mark added.' : 'mark removed.');
  };
  const clearCell = () => {
    if (paused || over) return;
    if (apply({ kind: 'clear' })) { cue('remove'); setSaid(`${where(selected)} cleared.`); }
    else if (!puzzle.puzzle[selected]) setSaid('that square is already empty.');
  };
  const undo = () => {
    if (paused || over) return;
    const step = undoSudoku(history);
    if (!step) { setSaid('nothing to undo.'); return; }
    setBoard(step.board); setHistory(step.history);
    setSaid('last move undone.');
  };
  const switchMode = (next?: SudokuMode) => {
    if (paused || over) return;
    const chosen = next ?? (mode === 'normal' ? 'candidate' : 'normal');
    setMode(chosen);
    setSaid(chosen === 'candidate' ? 'pencil mode. numbers add or remove small pencil marks.' : 'normal mode. numbers fill the square.');
  };
  const toggleAuto = (on: boolean) => {
    if (on === auto) return;
    setAuto(on);
    if (!paused && !over) {
      setHistory((past) => pushSudokuHistory(past, board));
      if (on) {
        ownNotes.current = [...notes];
        setBoard(withAutoNotes(board));
      } else {
        // Turning auto off takes its candidates away and brings back the player's own, on squares still empty.
        setBoard({ entries: [...entries], marks: new Set(marks), notes: ownNotes.current.map((mask, index) => (entries[index] || marks.has(index) ? 0 : mask)) });
      }
    }
    setSaid(on ? 'auto pencil marks on. every empty square shows its possible numbers.' : 'auto pencil marks off. your own pencil marks are back, and undo brings the automatic ones back.');
  };
  const checkPuzzle = () => {
    if (paused || over) return;
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
  const forgetAllStats = () => {
    const forgotten = deleteStats(browserStorage());
    forgetHeldRounds();
    reportStatsChanged();
    setKept(loadSudokuStats(browserStorage(), day));
    restoreForgetAllFocus.current = true;
    setConfirmingForgetAll(false);
    setSaid(forgotten ? 'all your stats are forgotten. new games are kept from now on.' : "this browser didn't let us delete your stats, so they are still kept.");
  };

  useEffect(() => {
    if (confirmingForgetAll) confirmForgetAllButton.current?.focus();
    else if (restoreForgetAllFocus.current) {
      forgetAllStatsButton.current?.focus();
      restoreForgetAllFocus.current = false;
    }
  }, [confirmingForgetAll]);

  const openForgetAllConfirmation = () => setConfirmingForgetAll(true);
  const cancelForgetAllConfirmation = () => {
    restoreForgetAllFocus.current = true;
    setConfirmingForgetAll(false);
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
      if (settingsOpen || howOpen || paused || over || event.altKey) return;
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
  // Both print buttons ask the page's print sheet (src/islands/SudokuPrint.tsx), which warns first when the level is not finished.
  const printPuzzle = () => sendPrint('triage');
  const runFromSettings = (action: () => void) => {
    setSettingsOpen(false);
    action();
  };
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return <section className="sudoku-game" data-testid="sudoku" data-paused={paused ? 'true' : 'false'}>
    <div className="sudoku-panel">
      <PrintLogo />
      {!framed && <div className="segmented sudoku-levels" aria-label="difficulty">{LEVELS.map((choice) => <button key={choice} type="button" className="segmented-option" aria-pressed={level === choice} disabled={paused} onClick={() => { if (!paused) setLevel(choice); }}>{level === choice && <span className="segmented-check" aria-hidden="true">✓</span>}{LEVEL_LABELS[choice]}</button>)}</div>}
      <div className="sudoku-status" data-testid="sudoku-status">
        <span className="sudoku-time">{settings.showTimer && <>time: <strong>{elapsed}</strong></>}</span>
        <span className="sudoku-errors">{settings.showErrors ? <>error: <strong>{errors}</strong></> : null}</span>
      </div>
      {/* Five equal icon buttons spread across the board's width: settings, pause or play, print, stats, how to play. */}
      <div className="sudoku-toolbar" role="group" aria-label="sudoku tools" data-testid="sudoku-toolbar">
        {!framed && <button ref={settingsButton} type="button" className="sudoku-icon-button" aria-label="sudoku settings" aria-haspopup="dialog" data-testid="game-settings-button" onClick={() => setSettingsOpen(true)}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>}
        <button type="button" className="sudoku-icon-button sudoku-pause-button" aria-label={paused ? 'resume puzzle' : 'pause puzzle'} disabled={over} onClick={togglePause}>{paused
          ? <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M8.5 6.5v11l9-5.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          : <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M9 6.5v11M15 6.5v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}</button>
        <button type="button" className="sudoku-icon-button print-control" aria-label="print this puzzle" onClick={printPuzzle}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M7 9V4h10v5M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-3A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H17M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        {!framed && <button type="button" className="sudoku-icon-button" aria-label="sudoku stats" aria-expanded={statsOpen} onClick={openStats}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>}
        {!framed && <GameHelpButton help={help} name={gameName('triage')} className="sudoku-icon-button" />}
        {!framed && statsOpen && <div className="sudoku-how sudoku-stats" role="region" aria-label="sudoku stats" data-testid="sudoku-stats">
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
          const spoken = display.hidden ? 'hidden until resumed' : display.marked ? 'x mark' : value ? `${value}${flags}` : options.length ? `empty, pencil marks ${options.join(', ')}` : 'empty';
          return <button ref={(element) => { if (element) cells.current.set(index, element); else cells.current.delete(index); }} key={index} type="button" role="gridcell" tabIndex={paused ? -1 : selected === index ? 0 : -1} className={classes} aria-rowindex={row + 1} aria-colindex={column + 1} aria-selected={!paused && selected === index} aria-label={`row ${row + 1}, column ${column + 1}, ${spoken}${given && !paused ? ', given' : ''}`} data-given={given ? 'true' : 'false'} onClick={() => { if (!paused) setSelected(index); }}>
            {paused ? <span className="sudoku-paused-mark" aria-hidden="true" /> : display.marked ? <span className="sudoku-mark" aria-hidden="true">x</span> : value ? <span>{value}{!paused && wrong.has(index) && <span className="sudoku-wrong-mark" aria-hidden="true" />}</span> : options.length ? <span className="sudoku-candidates" aria-hidden="true">{NUMBERS.map((number) => <i key={number}>{options.includes(number) ? `${number} ` : ''}</i>)}</span> : null}
          </button>;
          })}
        </div>)}
        </div>
      </div>
      <div className="sudoku-pad-wrap">
        <div className="sudoku-number-row" role="group" aria-label={activeMode === 'candidate' ? 'pencil numbers' : 'numbers'}>
          {PAD_GROUPS.map((digits) => (
            <div className="sudoku-pad-digits" key={digits[0]}>
              {digits.map((number) => (
                <button type="button" key={number} onClick={() => enter(number)} disabled={paused || over} aria-disabled={donePad.has(number) ? 'true' : undefined} aria-label={donePad.has(number) ? `${number}, all placed` : undefined} className={donePad.has(number) ? 'is-done' : undefined}>{number}</button>
              ))}
            </div>
          ))}
        </div>
        <div className="sudoku-tools" role="group" aria-label="board tools" data-testid="sudoku-mode">
          <button type="button" className="sudoku-tool-button" aria-pressed={activeMode === 'candidate'} aria-keyshortcuts="P" disabled={paused || over} onClick={() => switchMode()}>
            {activeMode === 'candidate' && <span className="sudoku-toggle-mark" aria-hidden="true">✓ </span>}Pencil <span aria-hidden="true">· P</span>
          </button>
          <button type="button" className="sudoku-tool-button" onClick={undo} disabled={paused || over || history.length === 0}>Undo</button>
          <button type="button" className="sudoku-tool-button" aria-pressed={auto} onClick={() => toggleAuto(!auto)} disabled={paused || over}>
            {auto && <span className="sudoku-toggle-mark" aria-hidden="true">✓ </span>}Hint
          </button>
        </div>
      </div>
    </div>
    {lost && !solved && <p className="sudoku-solved" role="status" data-testid="sudoku-forfeit-note">you printed before finishing, so this level counts as not solved today.</p>}
    {solved && <div ref={solvedResult} className="sudoku-solved" tabIndex={-1} role="status" data-testid="sudoku-result"><p className="text-lg font-medium">solved.</p><p>{elapsed} · {errors} {errors === 1 ? 'error' : 'errors'}</p><p className="text-sm text-ink-soft">a new sudoku comes out tomorrow.</p></div>}
    {/* The same settings dialog as the other games (#823): the shared settings first, then sudoku's own. */}
    {framed && <GameHelpDialog help={help} name={gameName('triage')} />}
    <GameSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="sudoku settings" returnFocusTo={framed ? undefined : settingsButton}>
      <fieldset>
        <legend>this puzzle</legend>
        <label className="game-settings-option">
          <span>difficulty</span>
          <select value={level} disabled={paused} onChange={(event) => {
            const next = LEVELS.find((choice) => choice === event.currentTarget.value);
            if (next) {
              requestedFrameLevel.current = next;
              setLevel(next);
            }
          }}>
            {LEVELS.map((choice) => <option key={choice} value={choice}>{LEVEL_LABELS[choice]}</option>)}
          </select>
        </label>
        <label className="game-settings-option">
          <span>automatic pencil marks for this puzzle</span>
          <input type="checkbox" checked={auto} disabled={paused || over} onChange={() => toggleAuto(!auto)} />
        </label>
        <div className="sudoku-tools">
          <button type="button" className="sudoku-tool-button" onClick={() => runFromSettings(mark)} aria-label="add or remove x mark" disabled={paused || over}>x mark</button>
          <button type="button" className="sudoku-tool-button" onClick={() => runFromSettings(clearCell)} disabled={paused || over}>clear cell</button>
          <button type="button" className="sudoku-tool-button" onClick={() => runFromSettings(checkPuzzle)} disabled={paused || over}>check puzzle</button>
          <button type="button" className="sudoku-tool-button" onClick={() => runFromSettings(togglePause)} disabled={over}>{paused ? 'resume puzzle' : 'pause puzzle'}</button>
          <button type="button" className="sudoku-tool-button" onClick={() => runFromSettings(() => requestAnimationFrame(printPuzzle))}>print this puzzle</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>gameboard settings</legend>
        {(Object.keys(DEFAULT_SUDOKU_SETTINGS) as Array<keyof SudokuSettings>).map((key) => {
          const labels: Record<keyof SudokuSettings, string> = { checkGuesses: 'check guesses when entered', autoCandidates: 'start in auto pencil mode', showErrors: 'show error counter', showTimer: 'show timer', highlightConflicts: 'highlight conflicts', highlightRowColumn: 'highlight row and column', highlightBox: 'highlight box', highlightIdentical: 'highlight identical numbers', playSound: 'play sound on solve' };
          return <label key={key} className="game-settings-option"><span>{labels[key]}</span><input type="checkbox" checked={settings[key]} disabled={paused && key === 'autoCandidates'} onChange={() => updateSetting(key)} /></label>;
        })}
      </fieldset>
      {framed && <fieldset>
        <legend>your sudoku stats</legend>
        {kept.on ? <>
          <table data-testid="sudoku-stats" className="sudoku-stats-table">
            <caption className="sr-only">solved, best time, average time and streak for each level</caption>
            <thead><tr><th scope="col">level</th><th scope="col">solved</th><th scope="col">best</th><th scope="col">average</th><th scope="col">streak</th></tr></thead>
            <tbody>{LEVELS.map((choice) => {
              const stats = sudokuLevelStats(kept.solves, choice, day);
              return <tr key={choice}><th scope="row">{LEVEL_LABELS[choice]}</th><td>{stats.solved}</td><td>{stats.bestSeconds === null ? '–' : sudokuTime(stats.bestSeconds)}</td><td>{stats.averageSeconds === null ? '–' : sudokuTime(stats.averageSeconds)}</td><td>{plural(stats.streak, 'day', 'days')}</td></tr>;
            })}</tbody>
          </table>
          <p className="text-sm text-ink-soft">your first solve of each level each day counts. they stay in this browser and never reach us.</p>
        </> : <p>this browser won't keep stats (private browsing or blocked site data), so your sudoku times and streaks can't be shown.</p>}
        {kept.solves.length > 0 && <button type="button" className="sudoku-text-button" onClick={forgetSudokuStats}>forget sudoku stats</button>}
      </fieldset>}
      {framed && <fieldset>
        <legend>your data</legend>
        {!confirmingForgetAll ? <button ref={forgetAllStatsButton} type="button" className="game-settings-data-button" onClick={openForgetAllConfirmation}>forget all my stats</button> : <div role="group" aria-labelledby="forget-stats-question" className="game-settings-confirm">
          <p id="forget-stats-question">forget all game stats on this device? this can’t be undone.</p>
          <button ref={confirmForgetAllButton} type="button" className="game-settings-data-button" onClick={forgetAllStats}>yes, forget all my stats</button>
          <button type="button" className="game-settings-data-button" onClick={cancelForgetAllConfirmation}>keep my stats</button>
        </div>}
      </fieldset>}
    </GameSettingsDialog>
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="sudoku-live">{said}</p>
    <p className="sudoku-print-footer">cueory.app</p>
  </section>;
}
