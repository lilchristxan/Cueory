# Anatomy lab: advanced features proposal (Task 178)

Research and plan only. No feature code is part of this document. Prepared for Christian and the lead engineer.
Every structure name below comes from `content/visuals/anatomy-*.json`; no anatomy or clinical fact is written here.
Where a feature needs content (names, text), the content comes from Christian's reviewed batches, never from this file.

Source note: the learning-research links below were checked as live search results; only their titles and abstracts-level
claims are relied on. Anything I could not open is marked "not verified".

## (a) What exists now

Code is on the unmerged branch `task-178/anatomy-lab-full-page` (PR #1273).

- **Systems (11 draft model files, about 6.0 MB of `.glb` in total, each 45 KB to 960 KB):** digestive, heart, kidneys, lungs,
  muscle, nerves, nervous, skeleton-axial, skeleton-limbs, skin, vessels. Each has a `content/visuals/anatomy-<system>.json`
  with `labels` (id, text, group, layer, source), a `hierarchyTree`, `model` (file, release, via), `sources`, `depictions`, status `draft`.
- **Scene (`anatomyscene.ts`, three.js, lazy-loaded):** one mesh node per structure named by its id, one neutral material,
  colours applied by the viewer (`anatomycolours.ts`), ID-pass picking (`anatomyidpass.ts`), frame-to-fit (`anatomyframe.ts`),
  spread/explode (`anatomyspread.ts`), "nearby" structures (`anatomynearby.ts`).
- **Layers and hierarchy:** peel the whole body skin, muscle, nerves, vessels, organs, skeleton (`anatomylayers.ts`); structure
  hierarchy and group headings (`anatomyhierarchy.ts`); search (`anatomysearch.ts`); windowed list for large catalogues
  (`anatomy-list-window.ts`); show only this / show all.
- **Loading:** per-system lazy files, lazy whole-body layers (`anatomylazy.ts`), model size notes (`anatomymodelsize.ts`), a
  triangle note per file (150,000 phone limit, `anatomybudget.ts`), a click-to-open cover (`AnatomyLabCover.tsx`,
  `AnatomyLabOpen.tsx`), no engine or model before the tap.
- **Controls:** preset views 1 to 5 and 0, reset/Home, arrows, plus/minus, modifier shortcuts (`anatomyshortcuts.ts`), a "keys"
  panel, tap buttons for every move, speech of names (`anatomyspeech.ts`).
- **Study tools:** Find It, Name It (`anatomyround.ts`, `AnatomyStudyRound.tsx`), text recall (`anatomyrecall.ts`,
  `AnatomyTextRecall.tsx`), printable worksheet and picture export in three sizes with credit (`anatomyworksheet.ts`),
  lesson deep links (`?system=&structure=`), text-only page (`anatomy-text.astro`) for students who cannot use 3D.
- **Pages:** `src/pages/preview/anatomy-lab.astro`, `anatomy-text.astro`, a test fixture page.
- **Tests:** about 55 unit test files and 17 browser specs (`tests/e2e/anatomy-lab-*.spec.ts`), and the release checklist
  `docs/ANATOMY-LAB-QA.md`.
- **Limits today:** no cross-sections, no fade (only show/hide), no saved state across visits, no notes or pins, no spaced
  review of structures, no link from lab answers to the adaptive engine, one model only (see section F).

## (b) Ranked feature list

Ranking weighs learning value, accuracy safety, and effort. S is under a day, M is a few days, L is a week or more of
small pull requests. "Needs Christian" is only listed where something applies.

### 1. Spaced review of structures (M)
- **Student gets:** the Find It and Name It rounds bring back structures they missed or have not seen lately, with plain
  status words (not started, learning, getting there, got it) and counts only.
- **Why it helps:** testing yourself beats rereading ([Roediger and Karpicke, 2006](https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/)); spreading reviews out improves retention ([Cepeda and colleagues, 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/)).
- **Accuracy risk:** none new; it only schedules ids already in the label files. Control: the scheduler reads ids from the JSON, never free text.
- **Needs Christian:** a database table for per-structure evidence if saved across devices (RLS, approval needed); the default is local storage first.
- **Accessibility:** same keyboard and tap paths as the existing rounds; status is words plus symbol, never colour alone; no motion.

### 2. Fade and isolate (S)
- **Student gets:** a slider (and step buttons) that fades everything except the chosen structure, so context stays visible.
- **Why:** keeping the whole in view while attending to a part supports building a spatial picture ([3D visualization meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11055294/)).
- **Risk:** low; presentation only. Control: opacity never hides the name card or changes selection.
- **Accessibility:** buttons for 0, 25, 50, 75, 100 percent; the state is spoken as words; transitions skipped under reduced motion.

### 3. Cross-section plane (M)
- **Student gets:** one movable slicing plane (front-to-back, side-to-side, or top-to-bottom) with step buttons, to look inside a system.
- **Why:** inside-out views build the 3D relationships that flat pictures hide (same [meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11055294/)); three.js supports per-material clipping planes ([discussion and examples](https://discourse.threejs.org/tag/clipping/416.md)).
- **Risk:** medium: a cut shows hollow meshes with no interior fill, which could be misread. Control: label the cut view "model is open inside, not a real cut surface"; capping optional later.
- **Effort note:** a cut-surface cap is extra work; ship uncapped first.
- **Accessibility:** arrow keys and plus/minus buttons move the plane (satisfies the no-dragging rule, [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)); text readout of plane position.

### 4. Guided tours (M)
- **Student gets:** short, stepwise sequences (camera move, show these ids, one sentence) that a student advances with Next and Back.
- **Why:** splitting content into learner-paced segments and pointing attention to what matters reduces overload ([multimedia learning principles](https://u.osu.edu/multimedialearning/?p=11)).
- **Risk:** the sentence text is clinical content. Control: tours are data (JSON), written only from Christian's reviewed batches; the tour engine ships with sample text marked as sample.
- **Needs Christian:** the tour wording itself; a content schema addition under `content/visuals`.
- **Accessibility:** each step is text first, camera second; reduced motion jumps instead of flies; keyboard Next/Back.

### 5. Bookmarks and my notes (M)
- **Student gets:** a star on any structure and a short private note, listed in a "my structures" panel.
- **Why:** self-generated cues and self-selected review lists support later retrieval; bookmarks also feed feature 1. (General retrieval-practice basis: [Roediger and Karpicke](https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/).)
- **Risk:** privacy: notes are personal data. Control: store locally by default; syncing needs a table with RLS, included in export-my-data and delete-my-account, plain-language privacy page update; length limit and input validation.
- **Needs Christian:** database change and privacy page wording if synced.
- **Accessibility:** a plain text field and list, no drag; focus returns to the structure after saving.

### 6. Label-it link and a "lab round" (S to M)
- **Student gets:** from the lab, a "practise this in label it" button for the structures currently showing, and the reverse.
- **Why:** moving between exploring and retrieving combines both effects above. Details in section (d).
- **Risk:** low; ids are the shared key.
- **Accessibility:** ordinary links; no new gestures.

### 7. Compare views (M)
- **Student gets:** two synchronized panels, for example the same camera on two layers (skin and skeleton) side by side, with one camera control.
- **Why:** side-by-side comparison with aligned views lowers the effort of holding one image in mind while viewing another ([multimedia principles](https://u.osu.edu/multimedialearning/?p=11)); evidence for this specific lab pattern is general, not tested here.
- **Risk:** low accuracy risk, high performance risk on phones (two renderers). Control: tablet and desktop only by default; phones get a toggle-between instead of two panels.
- **Needs Christian:** a page JS budget entry if the second panel adds code (likely small, shared with the scene chunk).
- **Accessibility:** one shared set of keys; both panels announced in text.

### 8. Measurements and distance ruler (S to M)
- **Student gets:** tap two structures to read a model-space distance (relative sizes), with a clear scale note.
- **Why:** concrete quantities help relate parts to each other; this is a convenience, not a proven learning lever (not verified).
- **Risk:** high if read as clinical: the model is a single reference body. Control: show "model units, one reference body, not a patient value"; omit by default if Christian prefers.
- **Accessibility:** two-step tap or keyboard pick; value in text.

### 9. Better search and "what is next to it" (S)
- **Student gets:** search that tolerates typos and shows hierarchy breadcrumbs from the existing `hierarchyTree`, plus a jump to neighbours (already partly present via `anatomynearby.ts`).
- **Risk:** none new; names only from the JSON.
- **Accessibility:** results are a labelled list; Escape clears.

### 10. Pins and labels the student can place (M)
- **Student gets:** pin a short label on a structure for a worksheet or screenshot.
- **Risk:** student text could be wrong and then exported. Control: pins carry the official name by default; custom text is flagged "your note" in the picture.
- **Needs Christian:** none if local only.
- **Accessibility:** pins are list items with the same focus order.

### 11. Saved view state and share link (S)
- **Student gets:** the current system, layers, selected id and camera encoded in the URL so they can resume or send the exact view to a classmate.
- **Risk:** low; extend the existing validated query parameters, ignore malformed values.
- **Accessibility:** a "copy link" button with a spoken confirmation.

### 12. Performance for phones (M to L, in the background)
- Smaller downloads: the pipeline already uses meshopt compression (`gltfpack`). Next steps are lower-detail copies for the first view
  with the full file loaded on demand, instancing only where parts repeat, and frame-time checks on a low-end phone.
- Offline: cache the opened system files with a service worker so a student can revisit without a network. Needs Christian
  (a new worker file, cache size on devices, and a check that it never caches a draft on production).
- No cost; no new dependency is required for the first two steps.

### 13. Augmented reality and 3D headsets (L, recommended: defer)
- A browser-based placement of the model on a table is possible on some phones, but support varies and it needs an extra
  permission (camera). Not verified for our target phones. Recommend deferring until features 1 to 6 are done.
- Needs Christian: a privacy page change (camera) and an approval for any new dependency.

### Cross-cutting accessibility rules (every feature)
Keyboard and tap alternatives for every drag; visible focus; `prefers-reduced-motion` respected (jump, do not animate); colour is never the
only signal (word plus symbol); a text-only route for every feature (the existing text page grows with it); live-region announcements in plain words.

## (c) Recommended build order (small pull requests)

1. Fade and isolate (feature 2). Small, visible, low risk, no data change.
2. Saved view state and share link (feature 11). Prepares tours and bookmarks.
3. Label-it link buttons (feature 6, links only, no evidence recording yet).
4. Evidence recording behind a local-only adapter (section d), then spaced review (feature 1) reading that evidence.
5. Search improvements (feature 9).
6. Cross-section plane, uncapped (feature 3).
7. Bookmarks and notes, local only (feature 5); sync later after Christian approves the table.
8. Tour engine with sample data (feature 4); real tour text only from Christian's batches.
9. Compare view (feature 7), tablet and desktop first.
10. Phone performance and offline (feature 12).
11. Measurements and pins only if Christian wants them (features 8 and 10).

Each pull request follows the repo rules: branch from `staging`, `npm run verify`, a status note in `docs/status/in-review/`,
and the `needs-christian` label when it touches the database, workflows or deployment.

## (d) Connecting the lab to "label it" and the adaptive engine

Today the module path (`src/islands/adaptive-learning/module-path.ts`, on `staging`; it is not on this branch) tracks per-concept
evidence by thinking level (remember, understand, apply, analyze, evaluate), has "label it" as one of its techniques, and
exposes `recordModuleAnswer(progress, concept, level, correct)`. Statuses are words (not started, learning, getting there, got
it); there is no score prediction and this proposal adds none.

Proposed shape, kept deliberately small:

- **Concept key:** `anatomy:<structure id>` using the id in the label file. The id is the only join key between the lab,
  label it and the engine, so no new names are ever written.
- **Evidence a lab interaction can record (all counts, no prediction):**
  - Find It answered right or wrong, first try or after a hint: level `remember`.
  - Name It answered right or wrong: level `remember` (recall by name); typed text recall: also `remember`.
  - Show me / reveal used: counts as a miss for that attempt (the hint was needed), recorded as "shown".
  - Viewing a structure in a tour step, or opening it from search: exposure count only, never marks "got it".
  - A student starring a structure: a "wants to review" flag that raises its review priority.
  - Level `understand` and above stay out of the lab until Christian supplies reviewed item types (for example, "which layer is it in" using the existing `layer` field).
- **Where it goes:** an adapter file beside `anatomyround.ts` that converts a round result to the engine's call. Storage starts as
  local-only; saving to the account needs a table and RLS, which is a Christian approval.
- **Label it handoff:** the lab can open label it on the same system with the same ids; label it results flow back through the same adapter.
- **Guard rails:** no "chance of passing"; no score shown; evidence is a count of right, wrong and shown per id.

## (e) Open questions for Christian (each with a default)

1. Save lab progress and notes to the account, or keep them on the device only? Default: device only first; sync after the privacy page is updated.
2. Do you want measurements at all? Default: leave out.
3. Cross-section cap (a filled cut face)? Default: uncapped first.
4. Who writes the tour text, and from which reviewed batch? Default: engine ships with sample text; you supply real tours later.
5. AR now or later? Default: later.
6. Offline use: wanted? Default: yes for already opened systems, after the first six pull requests.
7. Compare view on phones? Default: tablet and desktop only.
8. Page JS budget: allow one new lazy chunk for the lab features, kept under the same lazy-load rule as `anatomyscene`? Default: yes, one lazy chunk, checked in `docs/PERFORMANCE.md`.
9. A female model (section F): default is to approve research and a small staging experiment, not publication.

## F. A female model

### Where the current model comes from

The current meshes are from the BodyParts3D database, Release 4.0, official download retrieved 2026-11-02, converted by
`scripts/build-anatomy.mjs` into one compressed `.glb` per system (`public/models/anatomy/*.glb`). Provenance is recorded in each
`content/visuals/anatomy-*.json` (`model.release`, `model.via`, `sources[].license` = CC BY 4.0, `retrieved`), in `docs/VISUALS.md`
(section "3D body"), and in D-80 and D-161 (`docs/DECISIONS.md`). The database's own description says its model is of an adult
male ([description page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html)), and decision D-161 already approves
visible wording that says reference model, adult male. I found no female data in that database and its licence page does not
mention one ([licence page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)). So a female model must come from a different source.

### Candidates

I could not open every official page; each limit is stated. No model files were downloaded and nothing was added to the repo.

**Candidate 1: 3D organ reference library (CC BY 4.0), female organ set**
- Link: [library page](https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html).
- Licence (my words): the page says every object in the library is released under Attribution 4.0 International, so reuse and
  redistribution of changed copies is allowed with credit. Licence text: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). I read the library page; I did not read the licence text on this visit beyond that standard link.
- Scope: a set of single organs and structures in `.glb` (the format the lab already loads), with a female version for most, and a
  combined all-organs female model. It does not describe a whole-body model with muscle, skeleton or skin as ours has, so it is **partial**, not a replacement.
- Level of detail and sizes: not stated on the page; not verified.
- Id mapping: the page mentions a mapping table from each model to a published ontology table, but I could not confirm which
  identifiers it uses. Whether they match our `FMA...` ids is **not verified**; assume a naming map has to be built.
- What we would do: download, check licence per release, convert/decimate with the existing pipeline idea, build a naming map file
  (id to official label) that Christian reviews, add attribution text.
- Attribution: the page gives a release-specific citation that names its authors and funders and other data providers; if we
  use it we must reproduce it. **Flag for Christian:** that citation names people and organisations; he must approve the exact wording.
- Risks: partial coverage, so the lab would have mixed male-whole-body and female-organ sets; names may not match; version churn.
- Effort: L (converter, id map, review).

**Candidate 2: Z-Anatomy atlas**
- Link: [repository](https://github.com/LluisV/Z-Anatomy).
- Licence (my words): the repository page states CC BY-SA 4.0, so changed copies must be shared under the same licence, which
  affects our derived meshes and the videos made from them. `docs/VISUALS.md` already records that its readme lists two parts under a NonCommercial licence, which stay out. Licence text: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Whether it has a female model: **not verified**. The repository page I read does not mention one.
- Formats: Blender files (linked from a file-sharing page) and FBX in the repository; file sizes not stated.
- Naming: not verified. It is built on the same database we already use, so many ids might line up, but that is unconfirmed.
- Risks: share-alike would apply to our derived meshes (Christian's choice D-80 already preferred the attribution-only option), unclear female content.
- Effort: L, plus a licence decision.

**Candidate 3: Open lower-body bone meshes from a research toolkit**
- Link: [paper](https://arxiv.org/abs/1804.03655), hosted in a public toolkit repository with a DOI.
- Licence: **cannot be verified**. The paper says the data are free to use for research and other applications but names no licence. Do not use until the owner confirms a licence in writing.
- Scope: bones of the lower body only; not a complete model.
- Effort: not worth estimating until a licence exists.

**Excluded:** commercial marketplaces and engine-vendor asset stores returned in search. Their licences are per-asset, usually
bar redistribution of the files themselves, and I did not verify any; a public site serving the raw meshes needs redistribution rights.

### Recommendation

**Recommended: Candidate 1, as a female organ add-on beside the male reference body, not a replacement.** It is the only one with a verified
attribution-only licence on its own page and a format (`.glb`) our viewer loads directly. Present it honestly in the interface:
"female reference organs" next to "male reference body", never as a full female body.

**Fallback:** Candidate 2, only if Christian accepts share-alike and only after confirming a female model really exists in it;
until then, keep the male reference model and add a clear label that it is a male reference model (already D-161).

If neither is acceptable, the honest alternative is to keep one model and say so.

### Needs Christian

1. Licence acceptance for the chosen source (attribution-only or share-alike), after he reads the licence page himself.
2. The exact attribution wording. For the current source the licence page asks for a fixed credit line that names the database's owner
   ([licence page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)); Candidate 1's page also supplies citation text naming creators. Both name organisations, and that is a legal requirement of the licence, flagged here once.
3. A page JS and asset budget entry: new `.glb` files fall under the existing 3 MB per-file check; confirm the extra total download and keep them lazy.
4. His review of every label name before any structure appears, since names for new structures that do not exist in our current JSON must come from reviewed batches, never from this proposal.
5. Approval of how the two bodies are named in the interface and whether a student can switch between them.

Effort overall: L, at least five small pull requests (source check, converter, naming map, loader and switch, attribution and tests).
