# Home v2: build brief

Christian finished the home page design on 2026-11-20 (concept 3 plus his canvas comments). This folder is the
source of truth for building it:

- `home-v2.dc.html` is the finished design, exported from the design canvas. Image paths point at files in
  `public/`. Treat it as a picture of the target with exact sizes, colours and copy, not as code to paste: it uses
  inline styles, Google Fonts and a design runtime (`support.js`, `sc-for`, `{{…}}`) that the site must not ship.
  Rebuild it with our tokens, self-hosted fonts and Astro components.
- New images: `public/design/home-v2/hero-figure-halo.webp` (the figure with the halo ring) and
  `public/design/home-v2/silk-drape.svg` (the drifting silk folds).

Every rule in `CLAUDE.md` still applies: brand tokens only (add tokens to `src/styles/tokens.css` for any new
value), no inline `style=""` or `<script>` the CSP blocks, self-hosted fonts, Lato body at 1.5 line height,
Bodoni Moda for marketing headings, the cueory logo is the PNG artwork untouched, 44 px targets, keyboard and touch
for everything, visible focus, reduced motion (every animation stops), colour never the only signal, no sideways
scroll at 320, 390, 820, 1440 and 1920, Light and Evening.

## What the page has, top to bottom

1. **Notice bar**: cruet mark plus "we're still building. more coming soon." (existing building notice).
2. **Header**: the cueory logo centred at the top; under it the frosted nav bar (study, anatomy lab, games,
   support, about ▾) centred on the viewport at every width, never pushed off centre by the corner buttons; search
   and sign in at the right on the bar's row. On phones the bar stays centred and compact.
3. **Hero**: eyebrow "by nursing students, for nursing students" between two rules; "nursing school / made
   simpler." with the copper shine on "simpler." and the curved underline; the "start studying for free" button
   with a light travelling around its border; three benefit items; the Ko-fi panel. The text block sits right of
   the old position. The figure image fades out to the left so the text sits on clean background, and a slow
   glisten travels along the halo ring (pinned to the image, see `.halo-glint` in the design).
4. **Explore bar**: frosted panel "start with what you need." and five tiles (lessons, study materials, daily
   games, resources, give us suggestions) with the hover glint.
5. **Daily games** ("nurse's station games" heading, centred, arrows at both ends): six white playing-card style
   cards, 280 × 392, floating on the page: vialo, tachyyy, piccline, crossword, sudoku, hello cards. Each card has
   the game's square icon at the top-left corner and again upside down at the bottom-right, the wordmark (or
   serif name) in the same spot on every card, a one-line description and today's status. The arrows slide the row
   one card at a time (wraps). On hover or keyboard focus the description fades into a short looping demo of the
   game: vialo letter pills filling (CARES, NURSE), tachyyy timer and answers, piccline path spelling NURSE,
   crossword CARE/EATS, sudoku filling, hello cards flipping. Demos only run on hover/focus and stop under reduced
   motion. Swipe on touch, arrow keys when the row has focus.
6. **One lesson, multiple ways to study**: the vial platter carousel with 11 vials (odd count, so the front vial
   has five on each side), labels printed on the vials ("study method:", the mode name, the small table, the
   cueory wordmark up the side). Label text sits a little above the middle of the label.
7. **Coming soon** mailing panel (existing Kit form).
8. **Footer**: the six social marks (Instagram, TikTok, YouTube, X, Facebook, Pinterest) with no circle behind
   them, copper and lifted on hover, 48 px tap area, then the footer links.

## Build lanes (one small PR each into `staging`)

1. Assets and tokens: hero image, silk, any new tokens; thicken the "t" crossbar in
   `public/brand/games/tachyyy-wordmark-{light,dark}.svg` and in `scripts/generate-game-wordmarks.py` (the canvas
   version adds a 560 × 90 bar at x=40, y=572 in the 5729 × 2100 viewBox).
2. Header: logo centred above the nav bar, bar centred on the viewport, with an e2e check that the bar's centre
   equals the viewport centre (±1 px) at 320, 390, 820, 1440 and 1920.
3. Hero: layout shift, figure fade, halo glisten, button border light, Ko-fi panel.
4. Explore bar.
5. Daily games playing cards with the carousel and hover demos (uses the vialo, tachyyy and piccline names from
   the rebrand; wait for #1005 and #1006).
6. Vial platter: 11 vials, labels, centring.
7. Footer social marks without circles.

Each lane: match the design at 1440, make it work at the other widths, add or update e2e tests (never loosen),
`npm run verify`, open ready, `@codex review`, work findings to a clean receipt.
