# Cueory launch runbook

Use this runbook for the games-and-public-pages launch. Accounts and production database changes stay closed.

## Release handoff

1. Record the current staging SHA as `fe32826e30eb6c59f2cbee1db753f490853bd922`.
2. Wait for the fallback decision before choosing the release candidate.
3. Merge the approved fallback or carousel fix into `staging`.
4. Merge this runbook into `staging`.
5. Record the new staging SHA after all approved merges finish.
6. Wait for every required check on that new staging SHA to pass.
7. Wait for the approved all-engine browser results on that same SHA.
8. Replace `FINAL_RELEASE_SHA_PENDING` below with that exact approved SHA.
9. Stop if the SHA in the release record differs from the SHA tested by all engines.

Release SHA: `FINAL_RELEASE_SHA_PENDING`

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

## Production smoke

23. Open `https://cueory.app` in a private window.
24. Confirm that the home page loads over HTTPS.
25. Open `https://cueory.app/play`.
26. Confirm that the play hub shows the currently published games.
27. Open each currently published game from the play hub.
28. Confirm that each published game loads and accepts its normal public interaction.
29. Confirm that an expected coming-soon gate remains a coming-soon page where a game is not published.
30. Open `https://cueory.app/privacy`.
31. Confirm that the privacy page matches the released public behavior.
32. Open an unknown address such as `https://cueory.app/launch-runbook-check-404`.
33. Confirm that the unknown address returns HTTP 404.
34. Hold the release if any smoke check is different from the approved staging result.

## Rollback

35. Record the production launch merge commit if a rollback is needed.
36. Open a Christian-owned pull request from a rollback branch into `main`.
37. Revert the launch merge commit in that rollback pull request.
38. Do not reset or force-push `main`.
39. Merge the rollback pull request only after Christian approves it.
40. Wait for the rollback production deployment to become active.
41. Repeat the home, play, published-game, privacy, and unknown-route smoke checks.
42. Hold the rollback if the deployment or smoke checks fail.
