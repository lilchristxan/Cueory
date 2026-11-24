import { useMemo, useState } from 'react';
import CuewordGame from './CuewordGame';
import { crosswordLevelLabels as labels, crosswordLevels, type CrosswordLevel, type CuewordPuzzle } from './cueword';
import { dayNumber, puzzleForDay } from './pulse';

interface Props { puzzles: CuewordPuzzle[]; name: string; framed?: boolean; }

export default function CuewordToday({ puzzles, name, framed = false }: Props) {
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
      {/* The same level picker as sudoku's (Christian's brief): pressed buttons with a check mark, not only a fill. */}
      <div className="crossword-no-print mb-4 flex justify-center">
        <div className="segmented" role="group" aria-label="crossword level" data-testid="crossword-levels">
          {crosswordLevels.map(({ level: option, size }) => (
            <button key={option} type="button" className="segmented-option" aria-pressed={level === option} aria-label={`${labels[option]}, ${size} by ${size}`} onClick={() => setLevel(option)}>
              {level === option && <span className="segmented-check" aria-hidden="true">✓</span>}
              {labels[option]}
            </button>
          ))}
        </div>
      </div>
      {puzzle ? <CuewordGame key={level + '-' + puzzle.id} puzzle={puzzle} name={name} framed={framed} /> : <p role="alert">no {labels[level]} sample puzzle today.</p>}
    </section>
  );
}
