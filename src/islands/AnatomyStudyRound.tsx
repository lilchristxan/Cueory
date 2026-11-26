/**
 * The study round's screens (Task 178, redesign part 3): the "study this group" panel with learn it / test it / find
 * it, and during a round the side panel (switches, streak, timer, round list, location) and the answer cells with
 * their keys. The state lives in anatomyround.ts; this file only draws it and passes presses back.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { answerCells, currentTarget, describeAnswer, formatClock, roundFinished, roundRows, type StudyMode, type StudyRound } from './anatomyround';

export type StudyChoice = StudyMode | 'find';

export const STUDY_CHOICES: { key: StudyChoice; label: string; blurb: string }[] = [
  { key: 'learn', label: 'learn it', blurb: 'a structure lights up with its name. type it to move on.' },
  { key: 'test', label: 'test it', blurb: 'the name is hidden. type it from memory.' },
  { key: 'find', label: 'find it', blurb: 'the name is given. tap the structure in the 3D view.' },
];

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const DIGITS = '1234567890';

/** True on a device whose main pointer is a finger: it gets the letter keys on the screen. */
export function usesTouch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export function StudyEntryPanel({
  choice, onChoice, count, disabled, onBegin, groupName,
}: {
  choice: StudyChoice;
  onChoice: (choice: StudyChoice) => void;
  count: number;
  disabled: boolean;
  onBegin: () => void;
  groupName: string;
}) {
  const blurb = STUDY_CHOICES.find((c) => c.key === choice)!.blurb;
  return (
    <div role="group" className="lab-glass lab-solid mx-3 mb-3 space-y-3 p-4 lg:pointer-events-auto lg:m-0" aria-labelledby="anatomy-study-heading" data-testid="anatomy-study">
      <h2 id="anatomy-study-heading" className="lab-cap">study this group · {groupName}</h2>
      <div role="group" aria-label="how to study" className="lab-seg">
        {STUDY_CHOICES.map((c) => (
          <button key={c.key} type="button" aria-pressed={choice === c.key} onClick={() => onChoice(c.key)}>{c.label}</button>
        ))}
      </div>
      <p className="text-sm text-ink-soft">{blurb}</p>
      <button type="button" className="lab-btn lab-btn-primary w-full" disabled={disabled} onClick={onBegin}>
        begin · {count === 1 ? '1 structure' : `${count} structures`}
      </button>
    </div>
  );
}

function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="lab-btn lab-switch" onClick={onToggle}>
      <span>{label}</span>
      <span className="lab-state" aria-hidden="true">{on ? 'on' : 'off'}</span>
    </button>
  );
}

/** The round's side panel: title, switches, streak, timer, the round list and the location picture. */
export function StudyRoundSide({
  round, names, groupName, startedAt, onClose, onFirstLetters, onNearby, thumb, viewWord, dot,
}: {
  round: StudyRound;
  names: ReadonlyMap<string, string>;
  groupName: string;
  startedAt: number;
  onClose: () => void;
  onFirstLetters: (on: boolean) => void;
  onNearby: (on: boolean) => void;
  thumb: string | undefined;
  viewWord: string | null;
  /** Where the asked structure is on the picture, 0 to 1 across and down; null when it is not loaded. */
  dot: { x: number; y: number } | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const finished = roundFinished(round);
  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [finished]);
  const test = round.mode === 'test';
  const rows = roundRows(round);
  return (
    <div className="lab-glass lab-solid mx-3 mb-3 space-y-3 p-4 lg:pointer-events-auto lg:m-0" data-testid="anatomy-study-side" role="group" aria-labelledby="anatomy-study-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="anatomy-study-title" className="lab-name m-0">{groupName} · {test ? 'test it' : 'learn it'}</h2>
          <p className="lab-cap">{test ? 'type the name from memory' : 'type the name to move on'}</p>
        </div>
        <button type="button" className="lab-btn lab-round shrink-0" aria-label="stop the round" onClick={onClose}>×</button>
      </div>
      {test && (
        <div className="flex flex-wrap gap-2">
          <Switch label="show nearby" on={round.nearby} onToggle={() => onNearby(!round.nearby)} />
          <Switch label="first letters" on={round.firstLetters} onToggle={() => onFirstLetters(!round.firstLetters)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-live="off">
        <p className="lab-stat" data-testid="anatomy-streak"><span className="lab-cap">streak</span> <span>{String(round.streak).padStart(2, '0')}</span></p>
        <p className="lab-stat" data-testid="anatomy-timer"><span className="lab-cap">time</span> <span>{formatClock(now - startedAt)}</span></p>
      </div>
      <section aria-labelledby="anatomy-round-heading">
        <h3 id="anatomy-round-heading" className="lab-cap">this round · {rows.length === 1 ? '1 structure' : `${rows.length} structures`}</h3>
        <ol className="mt-2 space-y-1" data-testid="anatomy-round-list">
          {rows.map((row, index) => (
            <li key={row.id} className="lab-row" data-state={row.state} aria-current={row.state === 'now' ? 'step' : undefined}>
              <span>{row.state === 'done' || (row.state === 'now' && !test) ? (names.get(row.id) ?? row.id) : `structure ${index + 1}`}</span>
              <span className="lab-state">{row.state === 'done' ? 'done' : row.state === 'now' ? 'now' : row.state === 'next' ? 'next' : '· · ·'}</span>
            </li>
          ))}
        </ol>
      </section>
      {thumb && (
        <section aria-labelledby="anatomy-location-heading" className="lab-location" data-testid="anatomy-location">
          <h3 id="anatomy-location-heading" className="lab-cap">location</h3>
          <div className="lab-location-frame">
            <div className="lab-thumb"><img src={thumb} alt="" width={136} height={216} loading="lazy" /></div>
            {dot && (
              <svg className="lab-location-layer" aria-hidden="true" focusable="false">
                <circle className="lab-location-dot" data-testid="anatomy-location-dot" cx={`${dot.x * 100}%`} cy={`${dot.y * 100}%`} />
              </svg>
            )}
          </div>
          {viewWord && <p className="lab-cap">{viewWord}</p>}
        </section>
      )}
    </div>
  );
}

/** The answer cells, the keys and the buttons under them. */
export function StudyCells({
  round, official, touch, boxRef, onLetter, onBackspace, onHint, onShow, onSkip, onNext, onAgain,
}: {
  round: StudyRound;
  official: string | null;
  touch: boolean;
  /** The cells, so a button elsewhere (the switches) can hand the keyboard back to them. */
  boxRef?: RefObject<HTMLDivElement | null>;
  onLetter: (key: string) => void;
  onBackspace: () => void;
  onHint: () => void;
  onShow: () => void;
  onSkip: () => void;
  onNext: () => void;
  onAgain: () => void;
}) {
  const ownBox = useRef<HTMLDivElement>(null);
  const box = boxRef ?? ownBox;
  const nextButton = useRef<HTMLButtonElement>(null);
  const target = currentTarget(round);
  const settled = round.feedback === 'right' || round.feedback === 'shown';
  const test = round.mode === 'test';
  // A new question puts the keyboard on the cells again; a settled one puts it on "next".
  useEffect(() => {
    if (round.feedback === null && target) box.current?.focus();
    else if (settled) nextButton.current?.focus();
  }, [round.seq, target, settled, round.feedback]);
  if (!official || !target) {
    return (
      <div className="lab-glass lab-solid space-y-3 p-4 text-center" data-testid="anatomy-study-done" role="status">
        <p>round done: {round.done.length} answered, {round.rightFirstTime} right on the first try.</p>
        <button type="button" className="lab-btn lab-btn-primary" onClick={onAgain}>start the round again</button>
      </div>
    );
  }
  const cells = answerCells(round, official);
  const total = cells.flat().length;
  const filled = cells.flat().filter((cell) => cell.from !== 'empty').length;
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') { event.preventDefault(); onBackspace(); return; }
    if (event.key === 'Enter' && settled) { event.preventDefault(); onNext(); return; }
    if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) { event.preventDefault(); onLetter(event.key); }
  };
  // What the cells hold so far, in words: the cells themselves are pictures and are hidden from a screen reader.
  const spoken = describeAnswer(cells);
  const nextEmpty = cells.flat().findIndex((cell) => cell.from === 'empty');
  let position = -1;
  return (
    <div className="lab-study-answer space-y-3" data-testid="anatomy-study-answer">
      <p className="lab-cap text-center" data-testid="anatomy-study-position">structure {Math.min(round.done.length + 1, round.done.length + round.queue.length)} of {round.done.length + round.queue.length}</p>
      <div
        ref={box}
        role="group"
        tabIndex={0}
        aria-label={`type the name: ${total} letters in ${cells.length} ${cells.length === 1 ? 'word' : 'words'}. ${spoken}`}
        className="lab-cells"
        onKeyDown={onKey}
        data-testid="anatomy-cells"
      >
        {cells.map((word, w) => (
          <span key={w} className="lab-word">
            {word.map((cell, i) => {
              position += 1;
              return (
                <span
                  key={i}
                  className="lab-cell"
                  data-from={cell.from}
                  data-current={position === nextEmpty ? '' : undefined}
                  data-wrong={round.feedback === 'wrong' ? '' : undefined}
                  aria-hidden="true"
                >
                  {cell.letter}
                </span>
              );
            })}
          </span>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="anatomy-study-status">
        {round.feedback === 'right' ? 'right.' : round.feedback === 'shown' ? `the name is ${official}.` : round.feedback === 'wrong' ? `not quite. take a letter back and try again. ${spoken}` : `${filled} of ${total} letters. ${spoken}`}
      </p>
      <p className="text-center text-sm" data-testid="anatomy-study-feedback">
        {round.feedback === 'right' && <><span aria-hidden="true">✓ </span>right: {official}.</>}
        {round.feedback === 'shown' && <>the name is: {official}. it comes back later in the round.</>}
        {round.feedback === 'wrong' && <><span aria-hidden="true">✗ </span>not quite. take a letter back with backspace and try again.</>}
        {round.feedback === null && (test ? 'a missed name comes back later in the round' : `the name: ${official}`)}
      </p>
      {touch && !settled && (
        <div className="lab-keys" role="group" aria-label="letter keys">
          {[...KEY_ROWS, DIGITS].map((row) => (
            <div key={row} className="lab-key-row">
              {[...row].map((key) => (
                <button key={key} type="button" className="lab-key" onClick={() => onLetter(key)}>{key}</button>
              ))}
            </div>
          ))}
          <div className="lab-key-row">
            <button type="button" className="lab-key lab-key-wide" onClick={onBackspace}>backspace</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {settled ? (
          <button ref={nextButton} type="button" className="lab-btn lab-btn-primary" onClick={onNext}>next</button>
        ) : (
          <>
            {test && <button type="button" className="lab-btn" onClick={() => { onHint(); box.current?.focus(); }}>hint: next letter</button>}
            {test && <button type="button" className="lab-btn" onClick={onShow}>show answer</button>}
            {test && <button type="button" className="lab-btn" onClick={onSkip}>skip</button>}
          </>
        )}
      </div>
    </div>
  );
}
