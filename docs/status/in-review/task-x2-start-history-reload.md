status: in review. adds a browser test for /start: reload or browser back/forward mid-setup restarts at question 1 with only saved answers; no app code changed.

Pins the current behaviour so it can't change by accident: unsaved answers on question 2 are dropped when the browser back button leaves /start and forward returns, and on reload; saved answers prefill after a reload, and "skip for now" keeps them. Not a decision: the questions are not browser-history entries, so the browser back button leaves /start.
