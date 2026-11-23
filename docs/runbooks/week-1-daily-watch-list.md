# Week 1 daily watch list

This is a short, aggregate-only check for the first week after launch. It is
documentation only: do not change a tenant, deploy, workflow, form, analytics
rule, or database record while doing this check. Record the Phoenix date/time,
the observed aggregate result, and the owner of any follow-up. Do not copy
addresses, report comments, credentials, tokens, or other personal content.

| Area | Click path | Daily check | Action if it is not healthy |
| --- | --- | --- | --- |
| Cloudflare Web Analytics | Cloudflare dashboard → **Web Analytics** → select the configured Cueory site. | Check the previous 24 hours for page views, visits, and the available path/device breakdown. An empty or unavailable view is **not** proof of zero visitors; record it as unavailable. | Recheck the selected hostname and hand off an absent or unexpectedly changed site. Do not enable, disable, or edit a rule from this watch list. [Cloudflare setup and filters](https://developers.cloudflare.com/web-analytics/get-started/), [dashboard filters](https://developers.cloudflare.com/web-analytics/configuration-options/filters/). |
| Cueory Worker errors | Cloudflare dashboard → **Workers & Pages** → **cueory** → **Observability**. | Check the last day's invocation errors, uncaught exceptions, and failed requests; record the deployment/version shown with the result. | Capture the route, time window, and deployment identifier, then hand off. Do not change the Worker or its observability settings. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). |
| Public flag email intake | In the approved mail provider, open the configured Cueory contact **Inbox** and search for subjects starting with `flag or comment`. | Check only the aggregate count of new flag messages and their timestamps. This is the launch-day public intake while `accountsOpen=false`; do not open, copy, or forward message content. | If the configured contact Inbox or provider routing cannot be verified, record **unverified** and stop. Do not guess an address, change routing, or access an unapproved mailbox. |
| Configured flag inbox | Open Cueory's `/admin/flags` route in the approved administrator session. | Check only the aggregate open/handled counts and the newest report timestamps. The route is private, requires the site's administrator checks, and is not a public feedback mailbox. | If the route refuses access or the configured administrator destination is unknown, record **unverified** and stop. Do not bypass two-factor, export rows, or copy report text. |
| Kit sign-ups | Kit dashboard → **Subscribers** (the repo's configured Kit form/landing page is the source of the destination). | Check the aggregate new-subscriber count and confirmation/bounce status for the day. Do not open individual profiles unless separately authorized. | Record the aggregate result and hand off a change. Do not send, import, delete, tag, or edit subscribers. [Kit dashboard](https://help.kit.com/en/articles/15358051-understanding-the-kit-dashboard), [subscriber charts](https://help.kit.com/en/articles/2502526-understanding-the-subscribers-charts). |

## Daily record

```text
Phoenix date/time:
Candidate/deployment identifier (if shown):
Web Analytics: observed / unavailable / unverified
Worker errors: observed / none / unavailable
Public flag email: new-count and timestamps only, or unverified
Flag inbox: open-count and handled-count only, or unverified
Kit: aggregate new-subscriber result, or unverified
Follow-up owner and handoff:
```

The Cueory-specific destinations above come from the repository setup and
launch runbook: Cloudflare's `cueory` Worker, the configured Cueory contact
Inbox for public `flag or comment` messages, the private `/admin/flags` route,
and the configured Kit signup. The launch candidate keeps `accountsOpen=false`.
If a provider account shows a different name or destination, stop and mark it
**unverified** rather than guessing. An MX record alone does not prove that the
operator can access the mailbox.
