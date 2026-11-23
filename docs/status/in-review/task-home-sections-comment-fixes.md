status: in review. Study-mode vials: the name and its rule now sit around the middle of the label's height, and the time row sits slightly higher (canvas comments 424eb306 and a8d842b0).

Verified on the live-mode build, no other change. Not fixed here: the horizontal bar of the t in the tachyyy wordmark (077a694e) is a hairline inside the artwork file, outside this lane.

Tests changed (look unchanged, starts pinned): the study-mode hover test in pages.spec.ts now holds the ring on video first (the helper already in that file); the reveal test scrolls to the watched block itself; the phone games-card size test waits for the card to stop easing before measuring its height.
