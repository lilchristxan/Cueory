status: in review · task-blockers/safari-simpler-contrast · "simpler." fails the 3:1 contrast check in WebKit only (release blocker).
decision: D-pending · none yet; this note carries the diagnosis so far for whoever fixes it.

What fails: `tests/e2e/home-modern.spec.ts:374` and `:390` ("the copper shine on \"simpler.\"") on `webkit-desktop` and `webkit-phone`, in every release run since Home v3 merged. Cases: 390 wide Light, 1440 wide Light, 1440 wide Evening (390 wide Evening passes). Chromium and Firefox pass.

Values WebKit reports, identical to the last decimal on every run: 2.2418453630244177 (390 Light), 1.7863811046626188 (1440 Light), 2.410882956934577 (1440 Evening). So it is deterministic, not animation or timing.

Ruled out: the copper curve under the word. #1187 moved it clear of the "p" (`--stage-underline-drop`) and the values did not change at all.

What the test does: screenshots the `.hero-accent` box, hides the letters (`color` and `-webkit-text-fill-color` transparent, `background-image: none`), screenshots again, treats pixels that differ by more than 150 as glyph, and takes the worst contrast between a glyph pixel and the pixel behind it.

Leading suspect (unconfirmed, no WebKit available to the lead): `.stage-photo` in `src/components/HomeHero.astro`. It is absolutely positioned inside `.stage-scene` with `top: var(--stage-photo-top)` (`max(-22.9vw, -20.625rem)`), so it reaches up behind (and, being positioned, paints above) the non-positioned headline in `.stage-copy`. It is meant to vanish there through two mask layers (`--stage-photo-mask`, `--stage-photo-mask-x`, gradients that use `currentColor`) combined with `-webkit-mask-composite: source-in; mask-composite: intersect`. If WebKit combines or resolves those masks differently from Chromium, part of the photo sits over or behind the word in Safari only. The three values match no pair of brand colour tokens, which fits a photo. Christian also reported, in real Safari, a "failed color blend and transition" at the top of the home page before the mask prefixes were added.

Wanted: reproduce in WebKit (`npx playwright test tests/e2e/home-modern.spec.ts --project=webkit-desktop -g "copper shine"`), find the real cause, fix the product (tokens only, no raw values, do not edit the test), and keep the Chromium look unchanged.
