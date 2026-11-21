# Monday launch day — 23 November 2026

Proposed times in **Phoenix (America/Phoenix)**; Christian and the lead can move
them together. This is the **games-and-public-pages launch with accounts closed**.
The [Monday launch checklist](../LAUNCH-2026-11-23.md) controls every go/no-go
decision. The older full-account [go-live guide](../GO-LIVE.md) is a separate launch.

| Time | Owner and action | What must be visible before continuing |
| --- | --- | --- |
| 08:00 | Lead records the chosen staging SHA, its locked preview and the previous production deployment identifier. | One exact candidate and a known previous version; no unreviewed game redesign is added afterward. |
| 09:00 | Lead checks release CI and legal gates. Christian completes the real-iPhone check below. | Required Chromium, WebKit and Firefox checks pass on the chosen candidate. Missing or failing evidence means hold. |
| 10:00 | Christian and lead confirm the Monday checklist, including accounts closed and production database untouched. | Legal approval/release checks permit this candidate. Placeholder legal copy or a bypassed gate means hold. |
| 11:00 | **Only after explicit go:** lead supplies the actual release PR, staging to main; Christian reviews and merges it. | The intended SHA reaches the production deployment successfully. #634 is a CI-only dry run marked do not merge; do not use it as an automatic launch button. |
| 11:15 | Christian opens the live site in a private window and repeats the smoke check. | Home and games work without Cloudflare sign-in; staging still requires its lock; accounts remain closed. |
| 12:00 | Lead checks existing analytics and the approved feedback/report channel. | Record what is actually available. An unconfigured analytics screen is not proof of zero visitors. Keep account/reporting access as approved. |
| 13:00 | Christian tells the launch list and the people he chose, once the live check passes. | Links point to the live home or /play; copy promises games and public pages, not open accounts or unapproved content. |
| 15:00 | Lead checks errors and available reports; Christian reports any new phone problem. | Each issue has route, device, expected result and actual result, without secrets or personal data. Triage before adding features. |
| 18:00 | Lead and Christian repeat a short live check and hand off unresolved issues. | Record the live version, observed failures and who owns each follow-up. No unattended production changes. |

## Smoke check (staging first, then live)

1. Open `/` and `/play`; confirm navigation and links load. Use the routes linked
   by the **chosen candidate**: `/play/pillo`, `/play/sudoku`, `/play/crossword`
   and `/play/word-path` exist at the 17 November source snapshot.
2. Open every game, read its help, use its controls, then close help/settings and
   return to /play. Try keyboard and touch; at 320px and enlarged text, nothing
   essential may be clipped or require sideways page scrolling.
3. Check light/evening themes and reduced motion. On a real iPhone, check letter
   entry, sudoku controls, word-path selection and the crossword. Print the
   supported puzzles if printing is included in the candidate; retain all borders.
4. Open `/signin` directly: it must still say accounts open soon. Opening account
   links or a deployed source change does not authorize enabling production auth.
5. Check `/privacy` and the visible footer links. Hidden unapproved legal links
   must remain hidden; do not treat their absence as approval of draft legal text.

**If a release gate fails, stop before merging.** If a serious live defect appears,
Christian and the lead decide whether to restore the recorded prior production
version using the verified rollback procedure. Report the deployment identifier
and failing route; do not improvise SQL, settings changes or a main-branch push.
