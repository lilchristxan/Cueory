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
15. Open the release pull request's merge menu.
16. Choose the normal merge option.
17. Confirm the merge into `main`.
18. Wait for Cloudflare to start the production deployment.
19. Open the Worker deployment history.
20. Confirm that the new `main` deployment becomes active within ten minutes.
21. Hold the release if the deployment does not become active within ten minutes.
22. Hold the release if Cloudflare reports a build or deployment failure.

## Five-minute production smoke

23. Open `https://cueory.app` in a private window.
24. Confirm that the approved Home version appears over HTTPS.
25. Open `https://cueory.app/play`.
26. Confirm that the public game hub appears.
27. Open `https://cueory.app/play/vialo`.
28. Enter one letter guess and confirm that the Vialo board responds.
29. Open `https://cueory.app/play/sudoku`.
30. Select a level and enter one digit in an empty cell.
31. Confirm that the Sudoku board responds.
32. Open `https://cueory.app/play/piccline`.
33. Select one available word-path action and confirm that the board responds.
34. Open `https://cueory.app/play/crossword`.
35. Confirm that the closed Crossword gate says it is coming soon.
36. Open `https://cueory.app/play/pillo`.
37. Confirm that the retained Pillo address still loads its public game page.
38. Open `https://cueory.app/play/word-path`.
39. Confirm that the retained Word Path address still loads the Piccline page.
40. Open `https://cueory.app/privacy`.
41. Confirm that the privacy page matches the released public behavior.
42. Open `https://cueory.app/launch-runbook-check-404`.
43. Confirm that the unknown address returns HTTP 404.
44. Complete the smoke within five minutes of the active deployment appearing.
45. Hold the release if any smoke check differs from the approved staging result.

## Rollback

46. Open the actual merged release pull request if a rollback is needed.
47. Click its `Revert` button.
48. If GitHub cannot create the revert, create a rollback branch from `main`.
49. Revert the production merge commit with its first parent on that rollback branch.
50. Open the rollback pull request into `main`.
51. Do not reset or force-push `main`.
52. Merge the rollback pull request only after Christian approves it.
53. Wait for the rollback production deployment to become active.
54. Repeat the home, play, published-game, privacy, and unknown-route smoke checks.
55. Hold the rollback if the deployment or smoke checks fail.
