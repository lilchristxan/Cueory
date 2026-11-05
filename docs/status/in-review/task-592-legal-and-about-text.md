# task-592/legal-and-about-text

STATUS: In review. Real text for `/terms`, `/disclaimer` and `/about`, and a published "Last updated" date on
`/privacy`, replacing every founder placeholder. `PlaceholderBlock.astro` is removed (no remaining users). The
about/legal browser test now asserts there are no placeholders or draft markers and that each legal page shows a
last-updated date. The release gate (`scripts/check-legal-release.mjs`) passes with `CUEORY_LEGAL_RELEASE_AUDIT=1`.

Needs Christian: this is the public legal and about wording. Written in plain language from what the site actually
does (privacy page, site config, CLAUDE.md), with no clinical facts. Have a qualified person review the terms and
disclaimer before the first release to `main` (Task 590's blocker is cleared by this PR only once he approves).

D-pending: governing law for the terms is written as the State of Arizona, United States. Christian confirms or
changes it.
D-pending: the about page says Cueory "was started by a nursing student" and that "the code is public" (D-75).
Christian confirms the wording or rewrites it in his own voice.
