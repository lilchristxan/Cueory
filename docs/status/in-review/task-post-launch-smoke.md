status: draft-held

# Manual post-launch smoke

This held draft is a read-only Playwright smoke for Christian to run after the approved staging-to-main release is merged and the live deployment is available. It is not a CI check and must not be run against staging or a preview.

From the release checkout, run:

    LIVE_BASE_URL=https://cueory.app node scripts/post-launch-smoke.mjs

The script requires an HTTPS live host and fails closed without `LIVE_BASE_URL`. It uses one phone viewport (390x844) and one desktop viewport (1440x900). For Home, Daily Games, Vialo, Sudoku, Piccline, Crossword, Tachyyy and Privacy it records HTTP 200, checks the security response headers and CSP, and reports browser console/page errors. Crossword and Tachyyy must show the production `coming soon` fallback while their gates are closed; the other game pages must not show that fallback. It also requests a fresh unknown route and requires HTTP 404.

The script only navigates and reads responses and page text. It does not click, submit, solve, write storage, create an account, or mutate the live site. Record the final release SHA and live URL in the launch checklist before running it; keep this draft held until Christian’s release decision.
