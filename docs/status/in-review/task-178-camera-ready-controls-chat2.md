# Task 178: wait for the model before enabling camera controls

status: in review. Stacked on lead-owned Anatomy Lab PR #290 at 09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b.

## Problem
The six camera movement/zoom buttons and "reset view" remained clickable while a model was downloading or after its load failed. They appeared usable even though a ready model was unavailable. Switching systems could also leave controls enabled during the next model's load.

## Fix
All seven view buttons now use the same `ready` state that already gates "show all", labels, quizzes, and picture exports. Disabled buttons receive the existing muted appearance treatment. The three-dimensional view, model data, and normal controls after load are unchanged.

## Regression
The browser test deliberately holds the synthetic fixture GLB request, checks all seven controls are disabled while loading, then releases the request and confirms all seven are enabled after a real successful load.

## Review and integration
Only the React lab UI, its fixture-based browser test, and this status note change. No anatomical names, clinical content, GLB files, licensing/approval flags, authentication, CSP, deployments, workflows, or dependencies change. This branch is a reviewable assist for Claude, not a direct update to #290.

Require exact-head type check, build, unit tests, Playwright, and independent review before integration. The separately tracked isolated fixture-copy fix is PR #416. Keep the lead's staging-first merge sequence and Christian's approval gate for any anatomy publication. Do not merge to main or publish unapproved models.
