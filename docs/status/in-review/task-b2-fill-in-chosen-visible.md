status: in review: after "check", the fill-in choice the student picked stays clearly visible: its radio dot is drawn in full ink from tokens (not the browser's grey disabled radio), and its row gets an ink edge, in Daytime and Evening (A2 capture after #926).

- Radios use `appearance-none` with border-control / bg-surface, and checked:bg-ink with an inset surface ring for the dot. With forced colours on, the system radio comes back. The global focus outline is unchanged.
- The chosen row gets border-ink plus a 1 px inset ink ring, so the edge reads as 2 px with no layout shift. The selection isn't colour-only: the filled dot is a shape.
- Test: the S6 keyboard and tap spec (phone, tablet and desktop, light and dark) now checks that the chosen radio is disabled and checked, its dot, edge and row border match the ink colour, and the other choices stay unfilled.
