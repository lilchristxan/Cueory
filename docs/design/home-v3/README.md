# Home v3 — build reference

Christian approved this design on his canvas on 2026-11-23 ("the updated homepage looks soooo much better! lets get them
built"). These files are the hand-off for building it. The canvas stays the source of truth if anything here disagrees.

## Files

| File | What it is |
| --- | --- |
| `home-light-1440.webp`, `home-evening-1440.webp` | Full-page pictures of the approved Light and Evening boards at 1440 px wide. Build to match these. |
| `home-light.dc.html`, `home-evening.dc.html` | The board sources. Read them for exact sizes, spacing, gradients, the halo animation and the vial layout script. They are design files, not page code: rebuild with our components, tokens and layout. |
| `home-phone-light-390.webp`, `home-phone-evening-390.webp`, `home-phone-*.dc.html` | Phone portrait boards at 390 wide (the logo is centred on the screen, the bottom two explore tiles are centred, and the vial dots sit in one row under the platter with an arrow at each end). The header gets a menu button, with search and sign in as icons; the hero puts the button and points above the stage; the explore dock uses 3 + 2 tiles; game cards swipe; the vial platter shows the front vial plus one each side (D-192), with the arrows under the platter. |
| `home-landscape-light-844.webp`, `home-landscape-evening-844.webp`, `home-landscape-*.dc.html` | Phone landscape boards (844 × 390). This is the desktop layout at about 60%: the logo centred with the menu bar under it, the hero stacked and centred over the stage, the explore dock overlapping the stage, four game cards, all 11 vials on the platter, and the email form on one row. |
| `/public/design/home-v3/stage-light.webp`, `stage-evening.webp` | Hero background photo (glove characters on the round pedestal inside the glowing ring), 2880 × 1607. |
| `/public/design/home-v3/silk-band.svg`, `pip-vialo.svg`, `pip-piccline.svg`, `icon-games.webp` | Small pieces the boards use. |
| `/public/vials/v2/vial-*.webp` | Rebuilt study-method vials, 912 px wide (clean outlines, curved label edges). They replace `/public/vials/*.webp` once the new carousel ships. The method name, table and logo stay live text and official logo artwork laid over the blank label, as today. |

The tachyyy stopwatch tile and bar wordmark are in their own pull request (`task-brand/tachyyy-stopwatch`).

## Sections, top to bottom

1. **Building notice**: one short line, small cruet icon each side.
2. **Header**: the logo centred on its own row, the menu bar (study, anatomy lab, games, support, about ▾) centred under it, and search plus sign in on the right. This is a site-header change, so it needs Christian's approval.
3. **Hero**: the eyebrow line, the headline "nursing school made *simpler.*" with a hand-drawn underline under "simpler.", the copper button "start studying for free →", and three points with icons (structured learning · multiple ways to study · adhd friendly). Behind them is the stage photo, masked to fade at its top and bottom edges. A light travels round the halo ring every 7 s and stops under reduced motion. The Ko-fi pill sits on the left of the stage and uses the tip link from `src/config/site.ts`. The gaps between the halo top, the button, the points line and the characters' heads are even (about 38 px at 1440).
4. **Explore dock**: a frosted panel overlapping the bottom of the stage, with "explore / start with what you need." and five tiles.
5. **Nurse's station games**: a row of game cards with arrows and dots, each with its wordmark, one line, a status pill and corner pips.
6. **One lesson, multiple ways to study**: 11 vials on a wide round platter. The front vial is largest and the rest get smaller and sit further back along the front half of the platter only, with even gaps between them. The board script has the exact numbers (scales `1, .82, .68, .57, .48, .41`; 16 px gaps; arc radius 600 px). On hover or keyboard focus the vial lifts 8 px with a soft copper glow, the label text stays dark, and reduced motion keeps only the glow.
7. **Coming soon**: the Kit email form (Mental Health I and Med Math).
8. **Social icons, then footer links.**

Evening uses the same layout with the Evening palette and `stage-evening.webp`. It follows the device unless the visitor picks Light or Dark in the footer, as today.

## Brand rules that win over the boards

The boards came partly from an outside mock-up, so a few values are off-brand. Build with the brand version and list
each swap in your status note as `D-pending` for Christian:

- **Fonts:** Playfair Display → Bodoni Moda for the headline and section headings. The italic serif eyebrow → plain upright Lato (BRAND.md: accent lines are plain upright Lato, never italic). Body text stays Lato.
- **Colours:** every colour comes from the Daytime or Evening palette in `src/styles/tokens.css`. Map each board value to the nearest token and add no new hex values.
- **Contrast:** "simpler." must pass the contrast tests on the photo in every engine. The last hero failed in WebKit with a 1.7–2.6 ratio.
- **No third-party fonts or CDNs.** The board drafts used Google-hosted fonts (those links are removed here); we self-host.
