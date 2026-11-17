# Restore the previous live version

For Christian, with the lead present. Use this only after an explicit decision to
restore the known-good **production** version. This document performs no rollback.
Cueory uses a Worker named `cueory` with static assets (`wrangler.jsonc`), so use
[Cloudflare's Workers rollback procedure](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
The dashboard labels below were checked in that official guide on 17 November
2026; the live Cueory dashboard was not inspected during this documentation task.

## Before clicking

Ask the lead for the Worker/account, the current production version, the exact
known-good version ID and its release commit, and the failing route. Confirm that
the older version is compatible with the currently connected resources. Do not
choose a preview version or guess from a row's position/date. If a version cannot
be identified, stop and have the lead identify it first.

## Numbered dashboard steps

1. Sign in to the Cloudflare account that owns Cueory using the approved business
   account. You should see that account's dashboard.
2. Open **Workers & Pages**. You should see the account's Workers list.
3. Select **cueory**. You should be looking at that Worker, not another project.
4. Open **Deployments**. You should see the Worker's deployment/version history.
5. Find the exact known-good version ID the lead recorded. Compare it with the
   supplied release commit; do not select the version with the current defect.
6. At the right of that version, open its three-dot menu. You should see
   **Rollback**. If the menu differs or the option is missing, stop and tell the
   lead what is shown.
7. Select **Rollback**. If the dashboard asks for confirmation, recheck the Worker
   and version before confirming. Do not change bindings, secrets or settings to
   make an unavailable rollback proceed.
8. Look at the new deployment. The expected result is the chosen version serving
   **100% of traffic**, including if the previous deployment split traffic between
   two versions. A rollback creates a new deployment; it does not erase history.
9. Tell the lead the selected version, new deployment identifier and time. Network
   propagation takes time, so verify the live site rather than relying on the click.

The documented menu sequence and deployment behavior are from
[Cloudflare's rollback guide](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## Confirm the recovery

Open `https://cueory.app` in a new private window. Check home, /play and the game
routes supported by the restored version; confirm the reported defect is gone,
styles/images load, accounts remain closed for the games-only launch and the
staging preview still requires its existing lock. Tell the lead exactly what
passed or failed. If recovery fails, stop and report it rather than repeatedly
rolling through versions. The lead handles a reviewed source correction so the
next approved deployment does not reintroduce the defect.

## What rollback cannot repair

- Connected resources are not restored. Database data/schema changes and other
  resource changes are separate from Worker code. A rollback can be unavailable
  when bindings/resources changed; do not improvise SQL or recreate resources.
- Cloudflare currently limits rollback targets to the **100 most recently
  published versions**. If the recorded version is unavailable, the lead must
  plan another approved recovery.
- A tab opened before rollback may still request newer asset files. Check both a
  fresh private-window load and an already-open page; missing older/newer assets
  require investigation. See [Cloudflare's static-asset version-skew guide](https://developers.cloudflare.com/workers/versions-and-deployments/version-skew/).

The resource and history limits above are documented in
[Workers rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#limits).
No dashboard operation, deployment, merge, paid service or database change was
performed to prepare this guide.
