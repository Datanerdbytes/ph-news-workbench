# SaaS Product Plan — Multi-User News Workbench

Goal: turn the single-user news workbench into a multi-tenant SaaS where a
content team manages one workspace, connects social channels, drafts with AI,
schedules posts and reviews performance.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Session-guarded APIs, user-scoped drafts | Done |
| 1 | Workspaces, membership, roles, invite-gated signup | Done |
| 2 | Workspace-scoped Facebook Page connection and publishing | Done |
| 3 | Scheduled publishing (composer → calendar → cron worker) | Done |
| 4 | Analytics, Settings, Team polish | Done |
| 5 | Additional channel adapters (Instagram, X, LinkedIn, TikTok) | Planned |
| 6 | Plans, billing, usage limits, audit log, rate limiting | Planned |

## What exists now

- **Tenancy**: `workspaces`, `workspace_members` (owner/editor),
  `workspace_invites`. Every read/write API resolves the caller's workspace via
  `lib/session.ts` (`requireUser`, `requireWorkspace`); no route is public except
  cron-authenticated ingest and `/login`.
- **Signup**: closed by default. The better-auth `before` hook accepts
  `SIGNUP_INVITE_CODE` or a valid `workspace_invites` token (14-day expiry).
  Invites are accepted at `/login?invite=<token>`.
- **Publishing**: `facebook_connections` is keyed by `workspace_id`; tokens are
  encrypted at rest. Publishing and scheduling both go through
  `publishPagePost`.
- **AI drafting**: `/api/draft` uses the workspace's NIM model
  (`workspaces.ai_model`, picked in Settings → AI model) and falls back to
  `NIM_MODEL`. `lib/models.ts` only lists ids that answered on the live account;
  calls time out after 120s and upstream failures return 502, not 429.
- **Scheduling**: `scheduled_posts` with `FOR UPDATE SKIP LOCKED` claiming in
  `/api/schedule/run` (Vercel cron, every 5 minutes). Composer has a Schedule
  panel; `/calendar` shows the month grid, upcoming list and cancel. Every
  lifecycle step (`scheduled`, `canceled`, `claimed`, `published`, `failed`) is
  appended to `scheduled_post_events` with its source (composer, calendar,
  scheduler, manual, cron) and actor; audit writes never fail publishing.
- **Analytics**: `/api/analytics` + `/analytics` — published, scheduled, drafts,
  AI tokens/spend, 14-day activity chart, channel readiness. A "Page audience"
  card pulls live Facebook data through `/api/facebook/insights`
  (`fan_count`/`followers_count`, 7-day `page_post_engagements` and
  `page_media_view`); retired metrics degrade to "—" instead of failing.
- **Settings**: `/api/workspace` PATCH (owner-only rename) and `/settings` —
  workspace rename, account, publishing connection, team shortcut.
- **Team**: `/team` — members, invite creation/revocation, copyable invite links.

## Verified

- Scheduling: composer → row in `scheduled_posts` → calendar chip, upcoming
  entry and monthly count → cancel removes the row.
- Analytics: real workspace data (2,089 tokens, $0.002, Facebook live).
- AI model: Settings persisted Nano, a draft for news item 713 was generated
  with it and recorded `drafts.model`, then the workspace was switched back to
  Bolt. The previous Ultra model exceeded undici's 5-minute headers timeout,
  which is why drafts failed with "fetch failed".
- Facebook insights: `/analytics` shows LIVE with followers 141, fans 141,
  7-day engagements/media views from the Graph API.
- Settings: owner form enabled, member count 1, Page connected.
- `npx tsc --noEmit` clean; dev log has no hydration errors after a clean
  rebuild.
- `/api/analytics`, `/api/workspace`, `/api/schedule` return 401 without a
  session.

## Configuration

- Locally, `instrumentation.ts` starts a one-minute scheduler in development
  that calls the shared worker (`lib/schedule-worker.ts`), so due posts publish
  without a deployment. The Calendar also has a "Publish due now" button for
  overdue rows.
- In production, Vercel cron (`vercel.json`, every 5 minutes) calls
  `/api/schedule/run`. `CRON_SECRET` must be set in `.env.local` for manual
  `Bearer` calls and in Vercel so the platform attaches it to cron requests.
  Scheduled posts remain untouched if no worker runs.
- Migrations live at the repo root (`migrate-*.mjs`) and run with
  `node --env-file=.env.local <script>`.

## Next

1. **Channel adapters**: define a `channels` interface (connect, publish,
   capabilities) and add Instagram Graph first; keep unsupported networks gated
   in the UI.
2. **Billing**: Stripe subscriptions per workspace, plan entitlements (seats,
   scheduled posts/month, AI tokens), usage metering from `usage_daily`.
3. **Hardening**: per-workspace rate limits on LLM routes, audit log table for
   membership/publishing events, role checks on mutations, `/api/schedule/run`
   idempotency keys.
4. **Onboarding**: first-run checklist (name workspace, invite editor, connect
   Page, schedule first post).
