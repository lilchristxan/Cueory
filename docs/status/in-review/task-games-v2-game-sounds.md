status: in review · task-games-v2/game-sounds · soft generated sound cues in all six games, unlocked on the first tap or key press
decision: D-pending · soft generated sound cues in all six games, unlocked on first tap, silenced by the game sounds switch (Christian, 2026-11-25)

Why the games were silent: each solve tone made a new audio context at solve time, outside a tap, so browsers left it suspended. One shared module (src/islands/gamesound.ts) now makes one context and resumes it inside the first real tap or key press. Cues are generated (no audio files, no network, no new storage). Every cue goes through the shared "game sounds" switch; sudoku's and the crossword's "sound on solve" settings still gate their finish tone. With the switch off, no audio context is made.
