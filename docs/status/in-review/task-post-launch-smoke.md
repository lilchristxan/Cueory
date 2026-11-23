status: draft-held

# Manual post-launch smoke

This held draft is a read-only Playwright smoke for Christian to run after the approved staging-to-main release is merged and the live deployment is available. It is not a CI check and must not be run against staging or a preview.

From the release checkout, run:

    LIVE_BASE_URL=https://cueory.app node scripts/post-launch-smoke.mjs

The script requires `LIVE_BASE_URL=https://cueory.app` exactly and fails closed for any other origin. It uses one phone viewport (390x844) and one desktop viewport (1440x900). For Home, Daily Games, Vialo, Sudoku, Piccline, Crossword, Tachyyy and Privacy it records HTTP 200, waits for the route-specific visible marker (including the hydrated game island), checks the security response headers and CSP, and reports browser console/page errors. Crossword and Tachyyy must expose their exact production gate markers (`crossword-soon` and `stat-soon`) while their gates are closed; the other game pages use their own visible app markers. It also requests a fresh unknown route, requires HTTP 404, and applies the same security-header contract to that response.

The header contract includes HSTS, nosniff, referrer and permissions policies, `X-Frame-Options: DENY`, and CSP `frame-ancestors 'none'`, `object-src 'none'`, `frame-src`, and `script-src`, with no `unsafe-inline` or `unsafe-eval`. Redirects leaving `https://cueory.app` fail the check.

The script only navigates and reads responses and page text. It does not click, submit, solve, write storage, create an account, or mutate the live site. Record the final release SHA and live URL in the launch checklist before running it; keep this draft held until Christian’s release decision.
