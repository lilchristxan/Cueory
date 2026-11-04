# Task 178 — readable structure names when WebGL cannot start

Status: in review. Clean stacked assist on the lead's Anatomy Lab PR #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`.

## Problem
On a device with no working WebGL context, the Anatomy Lab shows only a startup error. Structure names and source credits are present in the source data, but learners cannot use them without 3D.

## Changes
- Replace only the failed-3D screen with a searchable, keyboard-usable structure catalog.
- Display 40 items at first, with a "show more" control for large systems and a full-catalog search.
- Preserve the original source-provided names, official model credit, CC BY license link for real models, release note and draft warning. Synthetic fixtures remain explicitly synthetic.
- Make retry available and move keyboard focus to the error heading.
- Avoid exposing raw WebGL errors that could contain internal paths.
- Add three pure tests and one browser test simulating unavailable WebGL using synthetic shapes.

## Integration
This is a focused replacement for the *intended anatomy functionality* of broad PRs #429/#430 (60+ unrelated file changes). It does not replace separate #436's static no-JavaScript route, which is needed when React cannot hydrate at all. Reconcile with #414 when integrating. Independent exact-head CI, Codex review, staging verification and Christian's explicit clinical/rights publication approval remain mandatory. No model, clinical, source, license, auth, dependency, workflow, hosting or security-header edits made.
