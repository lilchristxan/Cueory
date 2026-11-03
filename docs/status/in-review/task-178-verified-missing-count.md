# Task 178 — verified missing anatomy structures in the whole-body summary

status: In review, stacked on anatomy lab PR #290.

problem: The lazy whole-body view previously counted missing structures only from the initial download. A later GLB could have an actually missing labeled mesh, but the summary stayed at zero. Simply appending each file's `LoadResult.missing` would be incorrect because a shared layer passes some IDs to more than one GLB, so an ID missing from one file may exist in another.

fix: Derive the visible missing count from the combined set of structure IDs already found in the 3D scene. A structure is counted only when its required layer model files are all loaded and none contains the expected ID. Unfetched structures remain "not loaded yet", not "not in this model". The regular single-system summary retains its existing loaded-model check.

tests: Pure regression cases cover mixed heart/vessels/organs files, missing IDs in a deeper loaded file and the transition from missing to found. An existing real-model browser test now checks that downloading the vessels and organs layers does not invent missing structures for other files.

safety: No anatomy/clinical facts, 3D binaries, label source data, licensing, content approvals, security, auth, workflows, or deployment settings changed. CI and review are required; publishing draft models remains prohibited pending human review.
