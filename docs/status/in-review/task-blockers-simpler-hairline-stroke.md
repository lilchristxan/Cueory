status: in review · task-blockers/simpler-hairline-stroke · "simpler." gets a hair of outline in its own colour so its thinnest joins are fully inked in Safari.
decision: D-pending · the home headline's accent word carries a 0.012em outline (about 0.7 px at 1440, 0.5 px at 390); Christian can set `--stage-accent-stroke` back to 0 if he sees a difference he dislikes.

What the release run showed (diagnostic added in #1189, run 45666435205, webkit-desktop part 2): the worst "glyph" pixel is the word's own ink at about 35% coverage on the silk (1440: rgb(186,169,156) on rgb(235,227,216); 390: rgb(167,146,131) on rgb(234,222,210), about 47%; Evening 1440: rgb(98,80,63) on rgb(23,19,14)). The ink itself is rgb(92,62,44), 4.6:1 or better on the silk. Nothing is painted over or behind the word: these are half-covered pixels at Bodoni's thinnest joins that WebKit's rasteriser leaves lighter than Chromium's, and the test's interior rule counts them as glyph pixels. The outline is the product-side answer; no assertion or threshold changes.

WebKit cannot run here: proof is the next release run's "worst pixel" line.
