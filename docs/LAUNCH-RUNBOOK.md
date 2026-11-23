# Cueory launch runbook

Use this runbook for the games-and-public-pages launch. Accounts and production database changes stay closed.

## Release handoff

1. Record the starting staging SHA as `fe32826e30eb6c59f2cbee1db753f490853bd922`.
2. Wait for the fallback decision before choosing the release candidate.
3. Merge the approved fallback or carousel fix into `staging`.
4. Merge this runbook into `staging`.
5. Record the new staging SHA after all approved merges finish.
6. Wait for every required check on that new staging SHA to pass.
7. Wait for the approved all-engine browser results on that same SHA.
8. Record the final approved SHA in the actual release pull request and launch checklist.
9. Stop if the SHA in the release record differs from the SHA tested by all engines.

## Christian-only release

10. Open the actual release pull request from `staging` to `main`.
11. Confirm that the release pull request points to the recorded final release SHA.
12. Confirm that every required check on the release pull request is green.
13. Confirm that the all-engine browser checks belong to the recorded final release SHA.
14. Do not merge CI-only #634.
15. Close the CI-only #634 dry-run before opening a separate real `staging` to `main` release pull request for the same branch pair.
16. Open the release pull request's merge menu.
17. Choose `Create a merge commit`.
18. Confirm the merge into `main`.
19. Wait for Cloudflare to start the production deployment.
20. Open the Worker deployment history.
21. Confirm that the new `main` deployment becomes active within ten minutes.
22. Hold the release if the deployment does not become active within ten minutes.
23. Hold the release if Cloudflare reports a build or deployment failure.

## Five-minute production smoke

24. Open `https://cueory.app` in a private window.
25. Confirm that the approved Home version appears over HTTPS.
26. Open `https://cueory.app/play`.
27. Confirm that the public game hub appears.
28. Open `https://cueory.app/play/vialo`.
29. Enter one letter guess and confirm that the Vialo board responds.
30. Open `https://cueory.app/play/sudoku`.
31. Select a level and enter one digit in an empty cell.
32. Confirm that the Sudoku board responds.
33. Open `https://cueory.app/play/piccline`.
34. Select one available word-path action and confirm that the board responds.
35. Open `https://cueory.app/play/crossword`.
36. Confirm that the closed Crossword gate says it is coming soon.
37. Open `https://cueory.app/play/pillo`.
38. Confirm that the retained Pillo address still loads its public game page.
39. Open `https://cueory.app/play/word-path`.
40. Confirm that the retained Word Path address still loads the Piccline page.
41. Open `https://cueory.app/privacy`.
42. Confirm that the privacy page matches the released public behavior.
43. Open `https://cueory.app/launch-runbook-check-404`.
44. Confirm that the unknown address returns HTTP 404.
45. Complete the smoke within five minutes of the active deployment appearing.
46. Hold the release if any smoke check differs from the approved staging result.

## Rollback

47. Open the Worker deployment history if a live release breaks the site.
48. Find the newest version built from `main` that is older than the broken release.
49. Click the three dots beside that version.
50. Click `Rollback`.
51. Open `https://cueory.app` in a private window.
52. Confirm that the previous version is live again.
53. Open the actual merged release pull request.
54. Click its `Revert` button when GitHub can create the source revert.
55. Create a rollback branch from the current `staging` branch when GitHub cannot create that revert safely.
56. Revert the production merge commit with first-parent semantics on that rollback branch.
57. Open the rollback pull request into `staging`.
58. Wait for the rollback pull request checks to pass.
59. Verify the reverted source on the locked staging site.
60. Open the verified `staging` to `main` release pull request.
61. Let Christian merge that verified release pull request into `main`.
62. Do not merge a rollback branch directly into `main`.
63. Do not reset or force-push `main`.
64. Wait for the rollback production deployment to become active.
65. Repeat the home, play, published-game, privacy, and unknown-route smoke checks.
66. Hold the rollback if the deployment or smoke checks fail.
