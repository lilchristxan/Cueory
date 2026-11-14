# Anatomy lab — release QA checklist

This is the acceptance checklist for the anatomy models (Task 177) and interactive lab (Task 178). It is **not** approval to publish. The lab is a draft until its source data, interaction, accessibility and release gates are checked by a human.

The product plan and source restrictions remain in [VISUALS.md](VISUALS.md). The current implementation and its open review are in [PR #290](https://github.com/lilchristxan/Cueory/pull/290).

## Release rule

- **Staging first.** A preview can show draft models with a visible draft notice. Never publish a draft model, label or fixture on the production site.
- **No new clinical facts.** Every real structure name must come from its reviewed BodyParts3D source file. The interface must not invent a name or interpretation.
- **Accessible without gestures.** Selecting, turning, zooming and exploring a model must have keyboard and tap paths. A student unable to use 3D must still have a usable text route.
- **Founder review before publication.** Model and label review, licensing, CI, an actual staging check and the required approval are separate gates. A green build does not grant content approval.

## 1. Data and publication checks

| Check | Pass condition | Evidence to record |
| --- | --- | --- |
| Model-to-label integrity | Every model node has exactly one official label, with no missing or repeated IDs. | `tests/unit/anatomy-models.test.ts`, `tests/unit/anatomy-release4.test.ts` |
| Rights and attribution | The model's release, source and CC BY 4.0 credit are visible under the model and on every exported picture. | Source-file review and screenshots of all three export sizes |
| Draft isolation | A `main` build contains no unapproved `.glb` under `dist/models/anatomy/`, no draft labels in page HTML and no test fixture endpoint. | Inspect actual built `dist/`, not just the unit-test gate |
| Unknown build isolation | A build without preview variables also excludes drafts and fixtures by default. | Production-style build and actual artifact inspection |
| Preview transparency | A staging or explicitly opted-in local preview marks draft models as drafts. | Preview screenshot and build variables |
| Human content sign-off | Every model and its source names are reviewed before changing its status to `approved`. | Review sheet and explicit approval, not just a test result |

The code paths to check are `src/visuals/prunedrafts.ts`, `src/islands/anatomylab.ts` and `src/pages/preview/anatomy-lab.astro`. The test fixture is not anatomy and must never be labeled as real anatomy.

## 2. Student flows

Each case needs a browser test **and** a manual check on the locked staging preview. Use the actual BodyParts3D data for whole-body cases and the fixture for repeatable interaction cases.

| Case | Steps | Required result |
| --- | --- | --- |
| Open the lab | Visit the page, then tap **open the anatomy lab**. | No 3D engine or model download before the tap. An explicit loading state appears afterward. |
| Change systems | Open one system, switch while its model is downloading, then switch again. | The old system is cleared immediately. Late files cannot appear in the new system. |
| Recover from failed model load | Make the first `.glb` request fail, then restore the network. | The same system can be retried without refreshing the page. A clear error is announced. |
| Recover from unavailable 3D | Simulate failure to initialize WebGL. | The student can still search and read structure names and has a clear retry option for 3D. |
| Search and select | Search for a name, select it with a tap, then repeat by keyboard. | Both paths choose the same structure and show its original, source-provided name. |
| Open deeper layers | Enter **whole body**, open a deeper layer and then return to skin. | Missing files are fetched only when requested. Loaded files are not downloaded again. |
| Mixed-file layers | Load a file containing structures from more than one layer, then open another partially loaded layer. | All remaining required files load. A partly visible layer is not treated as complete. |
| Load-state wording | Open the whole body before deeper layers finish downloading. | Unfetched structures say **not loaded yet**. Only a fetched file with no matching mesh may say **not in this model**. |
| A failed layer request | Fail one file while another in the same layer succeeds, then retry. | Successful structures remain available, and retry fetches only failed files. |
| Conflicting actions | Start **show all**, then select **show only this** while downloads remain pending. | The newer visibility choice remains in effect when the older downloads finish. |
| Find It guided practice | Answer incorrectly, answer correctly using the labeled list and keyboard, then use **show me** and **next**. | Right/wrong/reveal feedback is clear in words, keyboard and tap paths work, and no score or first-try assessment claim appears. The requested target becomes visible and stays selected when revealed. |
| Picture export | Export phone, wide and square formats, then change systems during a delayed export. | Dimensions, visible credits and names are correct. No stale-system picture is downloaded after switching. |

Do not mark these as passed merely because an existing fixture test succeeds. Network races and mixed-file layers require their own assertions.

## 3. Access and performance

| Check | Pass condition |
| --- | --- |
| Phone layout | At 320 px and 390 px, no horizontal page scrolling, clipped controls or unreachable structure names. |
| Large structure catalog | The entire source catalog remains searchable, but the first view does not force navigation through every structure button at once. Group expansion, bounded results or an equivalent accessible design is acceptable. |
| Keyboard and tap | Search, structure selection, layer toggle, peel and restore, orbit, zoom, reset and quiz can be operated without dragging. |
| Reduced motion | There is no forced animation when `prefers-reduced-motion: reduce` is set. |
| Screen reader | Names, loading, errors, quiz outcomes and hidden/not-yet-loaded states are distinguishable in words, not color alone. |
| No JavaScript or WebGL | A meaningful fallback is shown. Failed 3D initialization must not hide the available study text. |
| Single-system budget | Each published model stays within 3 MB and 150,000 triangles, as defined in `src/islands/bodyviewer-logic.ts`. |
| Whole-body budget | Only the outer layer loads initially. Test a full **show all** on a mid-range phone before accepting its cumulative size and triangle cost. |
| Browser coverage | Chromium phone, tablet and desktop. Include WebKit and Firefox at the release gate when supported by the repository configuration. |


### Automated coverage map (not release approval)

These are **test references**, not a claim that the current head passed CI or a locked-staging manual check. The real-model tests require a **draft-enabled preview build**. No test here approves a BodyParts3D label, permits a model to ship to `main`, or replaces the founder's review. When additional lab flows land from an in-flight branch, add corresponding rows here before declaring its QA complete.

| Section | Checklist case or check | Automated evidence | Still required before release |
| --- | --- | --- | --- |
| 2 | Open the lab | `tests/e2e/anatomy-lab.spec.ts`: "loads nothing from three.js before the tap" and "keeps camera controls disabled until the fixture GLB finishes loading" | Locked-preview tap and loading-state check |
| 2 | Change systems | `tests/e2e/anatomy-lab.spec.ts`: "the old model is not shown after switching" and "clears previous-layer progress"; `tests/e2e/anatomy-stale-initial-error.spec.ts` | Locked-preview repeated system changes under slow network |
| 2 | Recover from failed model load | `tests/e2e/anatomy-lab.spec.ts`: "recovers from a failed first anatomy model request without refreshing" and "does not count a pending or failed first GLB" | Retry after restoring the connection on staging |
| 2 | Recover from unavailable 3D | `tests/e2e/anatomy-lab.spec.ts`: "keeps a searchable, keyboard-accessible text catalog if WebGL is unavailable" and "retains searchable structure names after WebGL context loss" | Test on a device without working WebGL |
| 2 | Search and select | `tests/e2e/anatomy-lab.spec.ts`: "keyboard path: search, select from the list" and "tapping the structure in the middle of the view selects it" | Touch and keyboard on staging |
| 2 | Open deeper layers | `tests/e2e/anatomy-lab.spec.ts`: "only the outer layer is requested at first; a deeper layer only when peeled to" and "layers: buttons show and hide each layer" | Peel and restore all available layers |
| 2 | Mixed-file layers | `tests/e2e/anatomy-lab.spec.ts`: "a completed shared GLB becomes searchable" and "the organs button loads missing files when only the heart is visible"; `tests/unit/anatomylazy.test.ts`: "still fetches the organs layer when only the heart" | Check mixed-owner structure names on staging |
| 2 | Load-state wording | `tests/e2e/anatomy-lab.spec.ts`: "the organs button loads missing files" (pending wording); `tests/unit/anatomylazy.test.ts`: "on-demand structure status"; `tests/unit/anatomy-missing-count.test.ts` | Check spoken "not loaded yet" versus "not in this model" after a real missing mesh |
| 2 | A failed layer request | `tests/e2e/anatomy-network-races.spec.ts`: "a partly failed mixed-file layer keeps its completed GLB and retries only the failed GLB"; `tests/unit/anatomy-loader-concurrency.test.ts` | Retry a genuine failed partial download on staging |
| 2 | Conflicting actions | `tests/e2e/anatomy-network-races.spec.ts`: "a late successful show-all GLB cannot override a newer show-only choice"; `tests/unit/anatomylazy.test.ts`: "a delayed layer must not undo newer visibility choices" | Repeat show-all versus show-only race on staging |
| 2 | Find It guided practice | `tests/e2e/anatomy-lab.spec.ts`: "find it: unscored feedback, next, and show me", "a named-list keyboard answer is guided practice", and "show me restores a hidden quiz target" | Keyboard, tap, focus and spoken result check |
| 2 | Picture export | `tests/e2e/anatomy-lab.spec.ts`: "exports a phone picture"; `tests/e2e/anatomy-picture-credit.spec.ts`: "exported anatomy picture credit"; `tests/e2e/anatomy-export-switch.spec.ts` | Examine actual saved PNGs in all three sizes and after switching |
| 3 | Phone layout | `tests/e2e/anatomy-lab.spec.ts`: "fits a 320 px screen"; `tests/e2e/anatomy-list-window.spec.ts`; `tests/e2e/reflow-640.spec.ts` | Visual and horizontal-scroll checks at 320 and 390 px, Light and Evening |
| 3 | Large structure catalog | `tests/e2e/anatomy-list-window.spec.ts`: "whole-body catalog shows a bounded list"; `tests/unit/anatomy-list-window.test.ts` | Search the full released-source catalog with a screen reader |
| 3 | Keyboard and tap | `tests/e2e/anatomy-lab.spec.ts`: "keyboard path" and "layers: buttons show and hide each layer"; `tests/e2e/anatomy-touch-css.spec.ts` | Verify every action on real phone and with keyboard only |
| 3 | Reduced motion | `tests/unit/anatomyframe.test.ts` (frame scheduling); `tests/e2e/anatomy-lab.spec.ts` exercises direct keyboard turns | **Direct reduced-motion browser assertion still required for the 3D controls** |
| 3 | Screen reader | `tests/e2e/anatomy-lab.spec.ts`: "has no accessibility violations" and error/feedback tests; `tests/unit/anatomylazy.test.ts`: "on-demand structure status" | Spoken labels, errors, hidden and pending states with a real screen reader |
| 3 | No JavaScript or WebGL | `tests/e2e/anatomy-no-javascript.spec.ts`: "anatomy structure names remain reachable"; `tests/e2e/anatomy-lab.spec.ts`: "keeps a searchable, keyboard-accessible text catalog if WebGL is unavailable" | No-JS keyboard and no-WebGL acceptance on staging |
| 3 | Single-system budget | `tests/unit/anatomy-models.test.ts`: checks checked-in GLB sizes and triangles against `MAX_SIZE_BYTES` and `MAX_TRIANGLES`; `tests/unit/bodyviewer.test.ts` | Verify proposed *published* files and device memory on a mid-range phone |
| 3 | Whole-body budget | `tests/e2e/anatomy-lab.spec.ts`: "only the outer layer is requested at first" and "phone show all asks before fetching"; `tests/unit/anatomybudget.test.ts` | **Full show-all performance, memory and frame-rate measurements still outstanding** |
| 3 | Browser coverage | `tests/e2e/projects.ts` and `.github/workflows/ci.yml` define browser projects and PR/release execution | Confirm Chromium phone/tablet/desktop and WebKit/Firefox release runs at exact approved head |

**No complete QA sign-off is recorded in this table.** New network-race tests specifically cover successful partial GLB integration, failed-file-only retry and a successful older download settling after show-only. Remaining manual gates, full show-all performance and direct reduced-motion evidence must be completed separately.

## 4. Verification and handoff

From an environment with the repository's pinned Node version and installed dependencies:

```sh
npm ci
npm run check
npm run build
npm test
npm run test:e2e -- tests/e2e/anatomy-lab.spec.ts
```

For the **production gate**, run a separate build using `WORKERS_CI=1` and `WORKERS_CI_BRANCH=main`, then inspect the generated HTML and model files. For the **draft preview**, run a separate build with `CUEORY_ANATOMY_DRAFTS=1`; do not reuse the other build's `dist/` as evidence. The preview browser tests require a build that includes their fixture.

Before approving a release, record:

1. Exact commit SHA and staging preview link.
2. CI, CodeQL, unit-test and browser-test results for that SHA.
3. Actual production-build artifact inspection showing no draft material.
4. Screenshots or recordings for the phone, keyboard, unavailable-3D and export cases.
5. The reviewed model-source sheets and the founder's publication approval.

**Until all release conditions are met, keep the anatomy lab in preview and the anatomy data marked draft.**
