status: Held-script print tests now navigate with waitUntil 'domcontentloaded' so WebKit and Firefox (which do not fire load while a routed script is held) no longer time out in page.goto. No assertion, timeout or retry changed.

Tests: sudoku-print (4 held-script gotos), vialo-print (forfeit-before-load and BOTH-delayed), word-path-print (3 held PicclineForfeit gotos). Other held-script specs (game-print-hint, game-island-reserve, play-hub-reserve) already avoid waiting for load or hold something other than a script.
