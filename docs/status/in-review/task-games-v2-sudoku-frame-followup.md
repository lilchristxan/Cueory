# Sudoku Frame follow-up

status: implementation in progress

Base: staging `a8e5bf1b3c1da24041a0331700caaf75ceb4c005` after #1027 merge.

This follow-up opts only `/play/sudoku` into the landed GameFrame and keeps the existing Sudoku island controls and settings behavior without duplicate gear, help, stats, or difficulty controls. The focused regression scope is the paused auto-cue setting seam from #634 review r4654239051: the setting is disabled while paused so board notes cannot drift from the selected mode. The E2E follow-up also covers Frame picker synchronization, settings focus return, control target sizes, and no sideways scroll at 390/820/1440 in Light and Evening.

Shared GameFrame files remain unchanged; this branch owns only the Sudoku route, Sudoku island, focused Sudoku E2E coverage, and this status note.
