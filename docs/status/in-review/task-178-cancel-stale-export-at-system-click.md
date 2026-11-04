# Task 178: discard stale picture exports on system picker clicks

Status: in review, stacked on lead-owned Anatomy Lab PR #290.

## Problem

The picture exporter checks a system generation token before saving, but the generation was invalidated in the React effect that loads a newly selected system. If the student changed systems while the PNG was pending, the browser could finish the old canvas export before that effect ran and download a picture from the previous system.

## Fix

- Advance the generation synchronously in the system-picker click handler whenever a different body system is chosen.
- Leave the existing effect invalidation in place for system changes from other sources.
- Add a synthetic Playwright regression that pauses the PNG canvas callback, switches systems, then releases the callback in the same browser task before the React effect runs. The old picture must not download or show a saved notice.

## Scope and gates

Only the Anatomy Lab picker and its new browser regression are changed, plus this status note. The user's actual models, labels, medical information, source files, publication flags, rights, security settings, dependencies and deployment are untouched.

Based on parent #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`. GitHub diff verified. Full npm/Playwright is unavailable in this GitHub-only workspace, so exact-head CI and a browser preview check are required. The shared isolated-site test-fixture problem tracked by #416 may block the full pipeline until integrated. Do not publish drafts or bypass founder approval.
