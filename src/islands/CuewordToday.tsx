import { useMemo, useState } from 'react';
import CuewordGame from './CuewordGame';
import { crosswordLevels, type CrosswordLevel, type CuewordPuzzle } from './cueword';
import { dayNumber, puzzleForDay } from './pulse';

interface Props { puzzles: CuewordPuzzle[]; name: string; }
const labels: Record<CrosswordLevel, string> = { easy: 'mini', mid: 'midi', hard: 'full' };
const sizeValues: readonly CrosswordLevel[] = ['easy', 'mid', 'hard'];

export default function CuewordToday({ puzzles, name }: Props) {
  const [level, setLevel] = useState<CrosswordLevel>('easy');
  const choices = useMemo(
    () => Object.fromEntries(crosswordLevels.map(({ level: option }) => [
      option,
      puzzleForDay(puzzles.filter((puzzle) => puzzle.level === option), dayNumber(new Date())),
    ])) as Record<CrosswordLevel, CuewordPuzzle | undefined>,
    [puzzles],
  );
  const puzzle = choices[level];

  return (
    <section aria-label={name + ' level'}>
      <div className="crossword-no-print mb-4 flex justify-center">
        <div className="crossword-size-picker" data-level={level} data-testid="crossword-levels">
          <label className="sr-only" htmlFor="crossword-size">puzzle size</label>
          <input
            id="crossword-size"
            className="crossword-size-input"
            type="range"
            min="0"
            max="2"
            step="1"
            value={sizeValues.indexOf(level)}
            aria-valuetext={`${labels[level]}, ${crosswordLevels.find((option) => option.level === level)!.size} by ${crosswordLevels.find((option) => option.level === level)!.size}`}
            onChange={(event) => setLevel(sizeValues[Number(event.target.value)] ?? 'easy')}
          />
          <span className="crossword-size-thumb" aria-hidden="true" />
          <span className="crossword-size-labels" aria-hidden="true">
            {crosswordLevels.map(({ level: option }) => <span key={option}>{labels[option]}</span>)}
          </span>
        </div>
      </div>
      {puzzle ? <CuewordGame key={level + '-' + puzzle.id} puzzle={puzzle} name={name} /> : <p role="alert">no {level} sample puzzle today.</p>}
    </section>
  );
}
