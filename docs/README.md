# Cueory documentation

Use this page to find the right guide. The main [project README](../README.md) explains what Cueory does. If you're helping build the site, read [Contributing](../CONTRIBUTING.md) for the branch, status-note and local-test steps.

Each link has a one-line summary and says whether Christian needs to read it. Guides for builders are mostly for people working on the site.

## For Christian

- [This index](README.md) — Find the right guide without searching every folder. **Christian:** Read when you need directions.
- [Current status](STATUS.md) — See finished work, work in review, and blockers. **Christian:** Read for project updates.
- [Roadmap](ROADMAP.md) — See the planned features and their order. **Christian:** Read when deciding priorities.
- [Setup](SETUP.md) — Follow step-by-step instructions for accounts and site setup. **Christian:** Read when setting up a service.
- [Go-live steps](GO-LIVE.md) — Check what to do before launch, on launch day, and if a release fails. **Christian:** Read before launch.
- [Games launch checklist](LAUNCH.md) — Check every gate before the games-only launch, the launch-day clicks, and the first week. **Christian:** Read before the games launch.
- [Monday launch checklist](LAUNCH-2026-11-23.md) — The click-by-click plan for the Monday 23 November games launch. **Christian:** Read before the games launch.
- [Games parity spec](GAMES-PARITY.md) — See the approved shared gameplay, accessibility, and sharing rules for daily games. **Christian:** Read when approving game work.
- [Brand guide](BRAND.md) — See approved colors, fonts, the logo, and design rules. **Christian:** Read when approving designs.
- [Content formats](CONTENT-FORMAT.md) — See the JSON fields and sample rules for lessons and study activities. **Christian:** Read when preparing content.
- [Editing content](EDITING-CONTENT.md) — Choose the right content file, edit fields or columns, and understand the checks before review. **Christian:** Read before changing content.
- [Content map](CONTENT-MAP.md) — Find where public samples, lessons, and study-game files belong. **Christian:** Read when preparing content.
- [Content handoff](CONTENT-HANDOFF.md) — See the file format for each daily game, where real puzzles live, and how to check them. **Christian:** Read before loading puzzles.
- [Content batches](BATCHES.md) — Learn how private question batches are checked, reviewed, and imported. **Christian:** Read before submitting a batch.
- [Visuals kit](VISUALS.md) — See the plan for teaching pictures, sources, and approval checks. **Christian:** Read when approving visuals.
- [Anatomy lab checks](ANATOMY-LAB-QA.md) — See the release checklist for anatomy models and interactions. **Christian:** Read before approving the anatomy lab.
- [Admin console plan](ADMIN-CONSOLE.md) — Review the proposed admin account, safety rules, and build phases. **Christian:** Read before approving admin features.
- [Database backups](BACKUPS.md) — Compare proposed backup choices and recovery steps. **Christian:** Read before choosing a backup plan.
- [Break suggestions plan](BREAKS.md) — Review the proposal for students to suggest breaks safely. **Christian:** Read if approving this feature.
- [Study together plan](TOGETHER.md) — Review ideas for leaderboards, profiles, and shared studying. **Christian:** Read before deciding on social features.
- [Operations](OPERATIONS.md) — Find recovery and rollback instructions if something stops working. **Christian:** Read when handling an incident.

Game guides for videos: the [games folder](games/) has one plain page per daily game ([pillo](games/pillo.md), [sudoku](games/sudoku.md), [crossword](games/crossword.md), [word path](games/word-path.md)) with how to play, every setting and how scoring works. **Christian:** Read before recording a game video.

- [19 November candidate release](RELEASE-2026-11-19.md) — Compare the pinned candidate with main and inspect all commit IDs. **Christian:** Read before selecting a release.


## For builders

- [Architecture](ARCHITECTURE.md) — Find the site’s pages, data flow, and code locations. **Christian:** Usually not needed.
- [Accessibility](ACCESSIBILITY.md) — See keyboard, screen-reader, and accessibility test coverage. **Christian:** Read when reviewing accessibility.
- [Offline behavior](OFFLINE.md) — Learn what the service worker stores for offline use. **Christian:** Usually not needed.
- [Performance budget](PERFORMANCE.md) — See the per-page size limits and how to run the size check after a build. **Christian:** Usually not needed.
- [Testing](TESTING.md) — Find commands for type checks, builds, unit tests, and browser tests. **Christian:** Usually not needed.
- [Launch report](LAUNCH-CHECK.md) — Learn how builders check built pages for placeholders and launch gaps. **Christian:** Read if checking the launch report.

## Plans and history

- [Decisions](DECISIONS.md) — Look up recorded product and technical decisions. **Christian:** Read when checking why something was chosen.
- [GitLab migration](GITLAB-MIGRATION.md) — Read the proposed move from GitHub processes to GitLab. **Christian:** Read if reviewing migration decisions.

Only approved, public information belongs in these files. Keep account secrets, private student details, question keys, reviewer results, and unreleased lessons out of this repository.

Audit follow-up: [account-isolation leftovers](audits/lane1-remaining.md) — Remaining #741 findings and the status of the fixes.
Review note: [isolation audit status](status/in-review/lane1-isolation-leftovers.md) — Source-only follow-up; no application change.

Review note: [reset account binding](status/in-review/task-754-reset-bound-account.md) — Review status for the password reset account guard. **Christian:** Approval required.
Review note: [answer account binding](status/in-review/task-756-answers-stop-on-switch.md) — Stops stale players after a sign-in change.

Inventory: [all candidate commit IDs](RELEASE-2026-11-19-COMMITS.tsv) — Complete pinned comparison supporting the release notes.
Review note: [release inventory status](status/in-review/lane4-release-notes.md) — Source inventory only.

Review note: [merged-note sweep](status/in-review/lane12-status-sweep-1.md) — Fourteen verified merged PRs folded into the central status and decisions.

Runbook: [Monday launch day](runbooks/launch-day.md) — Proposed Phoenix-time schedule and smoke checks for the games-only launch.
Review note: [launch-day status](status/in-review/lane4-launch-day.md) — Planning only; every release gate still applies.

Review note: [go-live corrections](status/in-review/lane12-go-live-followup.md) — Date, repository migration inventory and unmet legal release gates; documentation only.
