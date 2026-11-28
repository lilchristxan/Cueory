# Saving a signed-in student's module path

Proposal for [#1281](https://github.com/lilchristxan/Cueory/issues/1281). Christian's approval is required before a database change. The [module path](module-mastery-path.md) chooses what to practise and the [adaptive engine](adaptive-learning.md) schedules review. This document describes how a student could resume that path on another device.

## Who can use it

Visitors can use the video, reading and guest practice allowed by D-130. Checking a question from the question bank already requires a confirmed Cueory account under D-86. The diagnostic, calibrated practice, deeper track, module exam and personal course map would require that same account. A Cloudflare Access session admits a tester to the staging site. The study service still has to check the Cueory account before serving or saving personal progress.

Public accounts are closed. The new service and browser saving stay off. A signed-out visitor's work stays on their device under today's rules. Signing in starts from the signed-in account's own record. There is no automatic import from a shared browser. Signing out, changing accounts or losing the session clears the personal view and any pending writes held in memory. A failed write is shown as unsaved.

## Proposed records

| Record | What it keeps | Why |
| --- | --- | --- |
| One entry per accepted activity | Owner, opaque submission ID, published item and content version, objective and thinking tier, stage, method, observed outcome or self-report, cue use, and server acceptance time and order. For a question, a reference to its existing checked attempt. | Rebuild the student's path, identify genuinely fresh items and explain what counted. A self-marked flip stays distinguishable from a server-checked answer. |
| One checkpoint per student and module | Content and model versions, input and activity completion, current stage, session cap usage, and the last processed entry. A practice-exam checkpoint also records the issued item versions and which submissions were accepted. | Resume interrupted work without issuing the same exam item as fresh or charging twice for the same answer. |
| One derived row per student, objective and thinking tier | Versioned model state sufficient to resume the approved estimator, direct evidence counts, last direct practice, and the last processed entry. | Show status and evidence counts. Recompute staleness when reading the map, even if the student has been away. |

Use the existing exam date in [`exam_plans`](../../supabase/migrations/20261101110000_review_state_and_exam_plans.sql). Keep the existing card-review ladder compatible. The source for graded question outcomes is [the checked attempt](../../supabase/migrations/20261101100000_attempts_and_check_answer.sql). The existing [study-event stream](../../supabase/migrations/20261102100000_study_events.sql) describes study activity and alone cannot certify a correct answer.

Store progress references, fixed categories and outcomes. Leave out prompts, answer keys, rationales, typed responses, email, names, device identifiers and pointer or navigation histories. Derive course cells from the same owner’s module evidence, including the separately tagged cross-module cases required for real-world application. Show words, icons and counts. D-36 prohibits displaying an exam-score or pass prediction.

## How a write would work

1. Bind an in-memory submission to the account that started it. On arrival the service derives the owner from the verified session and checks it against that binding. Apply the [existing confirmed-account checks](../../supabase/migrations/20261102135000_confirmed_accounts_only.sql), and the existing [MFA policy for enrolled accounts](../../supabase/migrations/20261104170500_enforce_opt_in_mfa.sql).
2. Resolve the item, version, objective, tier and allowed method from trusted content. For graded work accept the server's checked attempt for that same owner and item version. An ungraded observation can earn only the evidence allowed for its method. A client cannot submit a status, model weight or readiness claim.
3. Assign a stable submission ID before sending. Accept it once per owner. Returning the result for an identical repeat and rejecting a conflicting reuse makes a retry safe if the network fails after commit. Bind a checked attempt uniquely to a single contribution as well, so a new submission ID cannot count it twice.
4. Commit the evidence and both projections together. Serialize updates for the same student's module, including the fresh-item reservation at exam start. Accept simultaneous work from two devices once each in server order. A slow response from a former session must never update the new student's screen.
5. Rebuild versioned projections from the accepted entries when a model changes. Use the recorded content version when a lesson is revised. Mark an unmapped or retired objective explicitly so missing content cannot produce a ready status. Keep one version of the model per projection during a rebuild.

## Isolation, export and erasure

Every student-owned row should reference the account with cascading deletion. Give confirmed students read access to their own rows through row-level security and limit writes to the checked operation. Apply the same owner checks to aggregates, exports and any future background jobs. A privileged key belongs only on the server. Database grants and row policies both matter. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Supabase user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data)

Extend the existing [paged export reader](../../src/islands/exportload.ts) and [export format](../../src/islands/exportdata.ts) before enabling writes. Include the student's accepted entries and current checkpoints and tier records, with a plain-language field guide and stable ordering. A failed page must fail the export visibly. An export must never imply completeness after an interrupted read.

Proposed retention is the life of the account or until the student explicitly forgets adaptive progress. Forgetting removes its entries, derived rows and outstanding reservations atomically and invalidates pending submissions from the old study session. A forgotten history must stay forgotten after rebuild, including when ordinary checked attempts still exist under their own policy. Deleting the account uses the [existing recent-sign-in and identity-bound flow](../../supabase/migrations/20261116235000_delete_account_recent_amr_proof.sql). Verify actual backup retention and restore procedures, and obtain approval for the privacy notice, before enabling collection.

## Checks before enabling saving

- On a shared device, guest, unconfirmed and signed-out sessions cannot read or create adaptive rows. Account B cannot see A’s entries, change A’s checkpoint or finish A’s pending exam. Test sign-out during an in-flight save and export.
- A duplicated submission, an altered replay, two simultaneous answers and an interrupted exam each leave an explainable record. Self-rated work cannot acquire a graded outcome. Rebuilding from the accepted entries reproduces the same counts and stages.
- The owner’s export includes its last page. Forget, then run a rebuild and send a stale queued submission. Progress stays empty. Delete one test account and confirm its records disappear while the second account's records remain.
- Verify the existing Learn flow with the new switches off. Sample previews can demonstrate the layout without writing data. Include no real content in fixtures, public builds or logs.

## Needs Christian

1. Approve this account-only storage boundary and a separately reviewed migration proposal, with public accounts and collection kept off until the checks above pass?
2. Approve keeping minimal adaptive evidence until the student forgets it or deletes the account, subject to a verified backup policy and approved disclosure before rollout?
