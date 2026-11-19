status: Task redesign P9 (Pillo) redesign: approved artwork, QWERTY keyboard and help-flow updates (the first-visit help card is removed for pillo; its rules and legend open from the "?"). The keyboard keeps three rows on phones (keys 44 px tall, at least 24 px wide), and the wordmark loads eagerly. Not for merge until Christian decides the D-pending below.

D-pending, needs Christian: keys are narrower than 44 px on phones to keep three rows as drawn; this replaces the 2026-11-18 lead decision if he agrees. Either choice is one line: `--pillo-key-min` in src/styles/tokens.css is 1.5rem (24 px keys, three rows); setting it to `var(--tap-min)` gives 44 px wide keys in wrapped rows.

Needs Christian: the pillo wordmark (/design/logo-pillo.webp) has no Evening (light) version anywhere in brand-source/ or public/, and the logo rule forbids recolouring it, so it is nearly invisible on the Evening page until he supplies a light copy.
