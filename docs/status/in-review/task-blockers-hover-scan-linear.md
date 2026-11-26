# task-blockers/hover-scan-linear

STATUS: in review. The unit test "never uses :hover to show, hide or size content" (tests/unit/touch-affordances.test.ts)
scanned the stylesheets with one regular expression whose time grew with the square of the CSS size. It took about
3.8 seconds locally and passed the 5 second limit on CI (5.2 to 5.3 seconds on #1222 and #1223). It now walks each
stylesheet once (about 7 ms) and checks the same rules for the same properties. The limit is unchanged. A new case
proves the scan finds :hover rules at any nesting depth; old and new scans were compared on every stylesheet and agree.
