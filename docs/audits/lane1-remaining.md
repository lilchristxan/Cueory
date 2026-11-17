# Account-isolation leftovers from issue #741

Source review on 2026-11-17 of staging at
`b3a54349d8cbf9d3ac70d619dea0dafc14917f4d`. No application code or SQL was
changed. This does not claim a production check or a new two-account browser test.

## Fixes already covered

- PR #810 is merged: recovery keeps the link's account and binds password writes
  to a private client for that session.
- PR #811 at `27bc113af08b85084d6c85aff85c2b8bcfd23e20` stops stale question
  players, discards late feedback and binds answer writes to the original token.
  **Pending merge at this snapshot**, so it is not in the staging SHA above.
- Export now has permanent identity/unmount cancellation:
  `AccountSettings.tsx:161`, `accountsettings.ts:311`.
- Review sync now has a permanent owner watch (`reviewsync.ts:232`, `:380`).
  The original missing-listener finding is superseded; the dispatch gap below
  is a separate concern.
- Exam-plan reads, updates and deletes filter by the captured account id
  (`examplansync.ts:335`). This protects row selection, but does not invalidate
  a late response or bind the insert's authorization token.
- Account deletion retains its server expected-account check. Admin flags and
  two-factor screens retain their identity epochs. None was changed here.

## Remaining findings

| Priority | Location | Trigger and consequence | Follow-up |
| --- | --- | --- | --- |
| P1 | `src/islands/AccountSettings.tsx:65`, `:83`, `:127`; `src/islands/accountsettings.ts:135` | Switch A to B during A's profile load: the listener ignores changes while `shownUser` is null, and the late result can open A's form. Name save has no displayed-owner argument, so A's typed name can be sent with B's token. | Invalidate loads with an identity epoch, key the form by owner, and bind the name write at dispatch/server level; test a deferred-load A to B switch. |
| P2 | `src/islands/ProgressPanel.tsx:56`, `:64`; `src/islands/Onboarding.tsx:98` | A's plan response can arrive after switching to B and update the shared device record or screen. Owner-filtered reads do not discard an already returned response from A. | Watch identity changes throughout the load and check the epoch before updating the device or screen; cover A to B to A. |
| P2 | `src/islands/AccountSettings.tsx:245` | Deletion-summary loading has no local identity guard; A's summary relies on the outer account reload to disappear. This does not defeat the guarded delete RPC. | Discard the summary on identity change or section unmount. |
| P2 | `src/islands/flagconnect.ts:95`, `:105` | The form watch reports only whether somebody is signed in. A's draft can be submitted as B because sending has no original owner. | Capture the owner when opening the form, invalidate the draft on change, and bind `submit_flag` to that owner. |
| P2 | `src/components/AccountCorner.astro:162`; `src/scripts/accountcorner.ts:99`, `:107` | Profile hydration has no identity epoch or ongoing auth listener. A's late profile or initials can remain visible under B. | Invalidate pending hydration on identity change and redraw for the new owner. |
| P2 | `src/islands/guestimportoffer.ts:129`, `:141`, `:145`; `src/islands/guestimportrun.ts:83` | Point-in-time identity checks do not bind the final card insert. A switch during request setup can select the shared client's new token; the UI generation check does not bind the write. | Use an owner-bound transport or server expected-owner check, and invalidate the entire import on identity change. |
| P2 | `src/islands/examplansync.ts:288`, `:337`; `src/islands/reviewsync.ts:279`; `src/islands/studyrecorder.ts:101` | Browser checks and aborts leave a dispatch boundary: the shared client selects authorization separately. Plan/review inserts omit `user_id`, which the database fills from the token. | Bind authorization to the captured owner or add a server expected-owner check. Test a switch between the browser check and token selection; keep existing filters and cancellation watches. |

The latest tracked definitions of `check_answer`, `record_study_events`,
`update_display_name` and `submit_flag` in
`supabase/migrations/20261104170500_enforce_opt_in_mfa.sql:70`, `:277`, `:445`
and `:175` do not accept `expected_user_id`. The delete-account migration does.
Server changes belong to the assigned migration owners and need Christian's
approval; this audit does not author or apply a migration.

These findings require an account change in the same browser. They do not
assert that a token bypasses database ownership policies: a policy alone cannot
identify which account originally opened a browser form.

## Review limits

Compared the original #741 findings with current component lifetimes, adapters,
identity listeners and tracked migration signatures. Locations are from the
staging snapshot except the explicitly pending #811 disposition. Recheck merge
state and line numbers before follow-up work. No tests were weakened or skipped.
