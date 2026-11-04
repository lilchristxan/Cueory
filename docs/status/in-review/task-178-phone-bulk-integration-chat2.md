# Task 178: phone confirmation before many new whole-body GLB downloads

status: in review. Direct integration-stack port of the focused phone guard in #409, based on #414 at e32701d4b00769ddf866e25b127ef96e4769935b.

## Student safety and performance
On a viewport below 768 CSS px, the whole-body "show all" action asks before starting two or more unique uncached GLB files. The prompt names the extra file count and warns of possible slowdown. Confirmation explicitly starts the existing lazy loader, while cancellation and Escape leave the current view unchanged. Keyboard focus goes to the confirmation and returns to "show all" when finished. A system switch discards the prompt. Single-file actions, cached files and larger viewports keep normal behavior.

## Tests
Pure tests cover 0/1/2+ files, desktop behavior, invalid counts, shared URL deduplication and cached files. The phone browser regression verifies no requests on cancel or Escape and requests after explicit confirmation. It aborts those later requests instead of loading the full ~1.3m-triangle body during CI.

## Integration
Focused changes to AnatomyLab.tsx, anatomylazy.ts, anatomy unit tests, anatomy browser tests, and this note only. Ported to the active #414 integration branch to avoid manual conflict resolution with the older #409 patch. Do not apply #409 again if this patch is used. The confirmation is not a total GPU/triangle budget and does not prove that a fully loaded body performs well on phones.

Exact-head CI, independent review, browser checks and the #416 isolated-fixture prerequisite remain required. No anatomy models, medical facts, source labels, attribution, content approvals, accounts, dependencies or deployment settings changed. Preserve Christian's separate release and staging gates.
