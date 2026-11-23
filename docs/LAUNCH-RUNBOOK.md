# Cueory launch runbook

Use this runbook for the games-and-public-pages launch. Accounts and production database changes stay closed.

## Monday, November 23, 2026 — staging freeze

1. Freeze `staging` at 6:00 p.m. Phoenix on Monday, November 23 (01:00 UTC on Tuesday, November 24).
2. Copy the full commit SHA at the tip of frozen `staging` into the launch checklist.
3. Immediately after the freeze, open the Checks tab on CI-only dry-run PR #634.
4. Start the all-engine release run for the frozen SHA if GitHub has not already started one for it.
5. Have Christian approve the workflow if GitHub requests approval.
6. Wait for the release run on the frozen SHA to finish.
7. Confirm the `Type check, build and test` aggregate is green.
8. Confirm every Chromium browser shard is green.
9. Confirm every WebKit browser shard is green.
10. Confirm every Firefox browser shard is green.
11. Confirm CodeQL is green.
12. Confirm Database is green.
13. Confirm the Workers build is green.
14. Confirm any additional check required by branch protection is green.
15. Stop the handoff if any required result is missing or red.
16. Confirm that the staging head tested by the successful run matches the full SHA recorded at the freeze.
17. Record the completed #634 dry-run link in the launch checklist.
18. Mark that frozen SHA as approved in the launch checklist.
19. Have Christian close the CI-only #634 dry run before opening the actual release pull request.

## Tuesday morning, November 24, 2026 — Christian-only release

20. Open the actual release pull request from `staging` to `main`.
21. Copy the approved SHA and completed #634 dry-run link into the release pull request description.
22. Confirm that the release pull request points to the recorded approved release SHA.
23. Confirm that every required check on the release pull request is green.
24. Confirm that the all-engine browser checks belong to the recorded approved release SHA.
25. Do not merge CI-only #634.
26. Confirm that CI-only #634 is closed before continuing.
27. Open the release pull request's merge menu.
28. Choose `Create a merge commit`.
29. Have Christian confirm the merge into `main`.
30. Wait for Cloudflare to start the production deployment.
31. Open the Worker deployment history.
32. Confirm that the new `main` deployment becomes active within ten minutes.
33. Hold the release if the deployment does not become active within ten minutes.
34. Hold the release if Cloudflare reports a build or deployment failure.

## Five-minute production smoke

35. Open `https://cueory.app` in a private window.
36. Confirm that the approved Home version appears over HTTPS.
37. Open `https://cueory.app/play`.
38. Confirm that the public game hub appears.
39. Open `https://cueory.app/play/vialo`.
40. Enter one letter guess and confirm that the Vialo board responds.
41. Open `https://cueory.app/play/sudoku`.
42. Select a level and enter one digit in an empty cell.
43. Confirm that the Sudoku board responds.
44. Open `https://cueory.app/play/piccline`.
45. Select one available word-path action and confirm that the board responds.
46. Open `https://cueory.app/play/crossword`.
47. Confirm that the closed Crossword gate says it is coming soon.
48. Open `https://cueory.app/play/pillo`.
49. Confirm that the retained Pillo address still loads its public game page.
50. Open `https://cueory.app/play/word-path`.
51. Confirm that the retained Word Path address still loads the Piccline page.
52. Open `https://cueory.app/privacy`.
53. Confirm that the privacy page matches the released public behavior.
54. Open `https://cueory.app/launch-runbook-check-404`.
55. Confirm that the unknown address returns HTTP 404.
56. Complete the smoke within five minutes of the active deployment appearing.
57. Hold the release if any smoke check differs from the approved staging result.

## Rollback

58. Open the Worker deployment history if a live release breaks the site.
59. Find the newest version built from `main` that is older than the broken release.
60. Click the three dots beside that version.
61. Click `Rollback`.
62. Open `https://cueory.app` in a private window.
63. Confirm that the previous version is live again.
64. Open the actual merged release pull request.
65. Record its production launch merge commit.
66. Create a rollback branch from the current `staging` branch.
67. Run `git revert -m 1 <production-launch-merge-commit>` on that rollback branch.
68. Open the rollback pull request into `staging`.
69. Wait for the rollback pull request checks to pass.
70. Verify the reverted source on the locked staging site.
71. Open the verified `staging` to `main` release pull request.
72. Let Christian merge that verified release pull request into `main`.
73. Do not merge a rollback branch directly into `main`.
74. Do not reset or force-push `main`.
75. Wait for the rollback production deployment to become active.
76. Repeat the home, play, published-game, privacy, and unknown-route smoke checks.
77. Hold the rollback if the deployment or smoke checks fail.
