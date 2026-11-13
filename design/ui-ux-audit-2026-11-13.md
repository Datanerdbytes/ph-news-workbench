# UI/UX Best-Practices Audit — PH News Workbench

**Date:** 2026-11-13 · **Scope:** all 20+ routes, app shell, shared components (full UI surface re-verified against current code)
**Method:** four parallel code reviews (shell/shared, publishing flows, data pages, auth + cross-cutting sweeps), headline claims spot-checked. Every finding cites `file:line` in the current working tree.
**Relationship to the 2026-11-05 audit (`design/ui-ux-audit.md`):** that pass's fixes were reverted, so most of its findings are re-verified here against today's code — the app has since been re-themed (Ink & White + Manrope + 6 per-account themes) and gained new surfaces (notifications, analytics cards, downloads preview, YouTube/Instagram/TikTok, Ask AI). This audit deliberately proposes **no restyle**: everything below is behavioral, semantic, or token-level. The visual identity is not the problem.

---

## Executive summary

The foundation is solid — real token system, consistent `aria-label`/`Escape` discipline, honest loading states in most places, and several genuinely well-built flows (theme picker, downloads progress, reset-password). The app's weaknesses are concentrated in four themes that cut across every page:

1. **Destructive actions execute on one click.** Seven paths permanently destroy real work (a live stream, scheduled posts, drafts, invites, OAuth connections, download records) with no confirmation, no undo, and in most cases no pending guard against double-fire.
2. **Failure looks like emptiness.** Every data page catches fetch errors with a toast and then renders its "nothing here yet" empty state — on Dashboard/Analytics/Status, as confident zero-filled stats. There is no `error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere in the app tree.
3. **The publishing core has correctness races.** Publish buttons enable while media is still normalizing/uploading; schedule/targeting state leaks into the next submission; cleared files resurrect mid-flight.
4. **Focus management and contrast fall below standards.** Modals/popovers don't trap or move focus, the mobile sidebar stays in the tab order while hidden, the least-visible color in the system (`--faint`, 2.6:1) carries timestamps, hints, and nav labels, and there is exactly **one** `aria-live` region in the entire app.

### Scorecard

| Dimension | Grade | Notes |
|---|---|---|
| Safety of destructive actions | **D** | 7 unconfirmed destructive paths, incl. end-stream and Facebook disconnect |
| Error vs empty vs loading | **D+** | failure renders as "no data" everywhere; zero route boundaries |
| Accessibility | **C+** | excellent naming/Escape discipline; focus traps, live regions, contrast gaps |
| Publishing-flow correctness | **C** | races, stale state, split validation timing |
| Calendar | **D** | non-interactive grid, title-only tooltips, unusable at phone widths |
| Visual consistency | **B−** | retheme helped; drift lives in the newest code (rings, radii, hex) |
| Responsive & touch | **C−** | sub-40px targets on must-hit controls; fixed 3-col grids on 3 pages |
| Microcopy | **C+** | good voice, but dev-speak ships to users in 6+ surfaces |

---

## P0 — Correctness & safety

### 1. Destructive actions fire immediately (7 paths)

| Action | Evidence | Notes |
|---|---|---|
| **End live stream** | `app/live/page.tsx:396-411` (`end()`), triggered at `:507-510` | Irreversible; kills a broadcast mid-flight on one click |
| **Cancel scheduled post** | `app/calendar/page.tsx:180-193`, X button `:393-400` | ~22px target, no pending guard → double-tap = double DELETE; also mixes "cancelled"/"canceled" in the same function (`:187` vs `:192`) |
| **Delete draft from queue row** | `app/page.tsx:759-770` | The compose-pane delete of the *same* draft correctly uses a two-step confirm (`app/page.tsx:1099-1130`) — the fastest path is the unguarded one |
| **Revoke team invite** | `app/team/page.tsx:87-94`, button `:239-247` | No confirm, no pending state, silent on success |
| **Disconnect Facebook** | `app/accounts/page.tsx:212-221`, `app/settings/page.tsx:502-511`, and from an auto-dismissing **toast action** `components/app-frame.tsx:696-711` → `components/facebook-connection.tsx:182-197` | Drops the connection the whole product depends on; the toast variant is unreachable by keyboard users before it disappears |
| **Delete download record** | `app/downloads/page.tsx:355-375`, button `:954-965` | No confirm, 28px target, no pending state |

**In-app gold standards to copy:** sources delete dialog with consequence-stating copy (`app/sources/page.tsx:313-352`); two-step inline Confirm/Cancel (`app/drafts/[id]/page.tsx:166-195`, `app/page.tsx:1099-1130`).
**Fix:** one shared confirm-destructive pattern (dialog or two-step button) + `toast.success` after every destructive mutation + `disabled`/spinner while in flight.

### 2. Fetch failure renders as "no data" on every page

Each page catches with a one-shot toast, leaves state `[]`, and renders its empty state:

- Story queue: `app/page.tsx:170-174` → "The desk is quiet" (`:848-852`) + fake "0 pending · 0 drafted · 0 total" (`:204-211`, `:571-574`)
- Calendar: `app/calendar/page.tsx:63-68` → "Nothing scheduled" (`:406-415`)
- Status: `app/status/page.tsx:41-48` → "No drafts yet" (`:207-224`); stat cards render values with no loading/error guard at all (`:141-143`)
- Dashboard: `app/dashboard/page.tsx:173-180` → "No activity yet" (`:494-512`), StatCards fall to `0` (`:683`)
- Sources: `app/sources/page.tsx:372-378` → "No sources yet" (`:538-551`)
- Team: `app/team/page.tsx:55-61` → empty member list (`:166-197`); role even falls back to a real-looking "Editor" (`:54`, rendered `:147`)
- Downloads: `app/downloads/page.tsx:222-228` → "Your saved videos will show up here" (`:969-981`)
- Live: `app/live/page.tsx:74-80` → "No live streams yet" (`:327-331`)
- Photos: `app/photos/page.tsx:59-71` → album select shows nothing about the failure
- **Analytics fabricates metrics:** cards compute `totals?.published ?? 0` … `$0.000` after failure (`app/analytics/page.tsx:168-193`), and the insights fetch is swallowed by `.catch(() => {})` (`:149`)

Also silent: settings workspace/preferences loads (`app/settings/page.tsx:125,138` — theme silently reverts), `components/app-frame.tsx:202`, and a saved-draft load failure that indistinguishably starts an empty editor (`app/page.tsx:243,254-256`).

**And there are zero route boundaries:** `app/` contains no `error.tsx`, `loading.tsx`, `global-error.tsx`, or `not-found.tsx` (verified by find). An uncaught exception shows the framework crash screen.
**Fix:** a shared `<ErrorState onRetry>` used everywhere empty-vs-error matters, "—" placeholders instead of zeros, plus `app/error.tsx` / `app/not-found.tsx` at minimum. The only existing inline error state (`app/drafts/[id]/page.tsx:114-131`) is the pattern.

### 3. Publish races — button enabled while media is in flight

- **Reels:** Publish disabled is `!file || busy || !pages.selected.length` (`app/reels/page.tsx:286`) but `normalizing` (`:38`) isn't included; picking a file starts async normalization (`:61-88`) and swaps the file mid-flight. Worse, clearing the file during normalization (`onClear={() => setFile(null)}`, `:229`) is undone when the async continuation runs `setFile(normalized)` (`:72`) — the deleted file resurrects.
- **Photos:** `addFiles` (`:77-123`) has no busy gate; staged URLs append only after ALL blob uploads finish (`:114`), with no uploading indicator (`:234-243`). Publishing mid-batch silently posts without the just-picked images.

### 4. Stale state corrupts the next submission

- Geo-targeting JSON persists after a successful video publish (`app/videos/page.tsx:174-177` leaves `targeting` set) — next video silently inherits it.
- The schedule toggle stays ON after publish in Post (`app/post/page.tsx:31`, not reset at `:58-63`) and Videos (`:33`) while Live resets it (`app/live/page.tsx:104`) — the next "publish now" silently becomes a scheduled post.
- After scheduling from the queue, the row keeps its old status forever: `schedulePost` never reloads (`app/page.tsx:398-434`; compare `publish()` at `:509`) and the API only inserts into `scheduled_posts`.
- Publishing mid-batch photos (see #3) can post zero images.

### 5. Shell accessibility failures

- **Mobile sidebar stays in the tab order while hidden:** the `<aside>` is hidden only via `-translate-x-full` — no `inert`/`aria-hidden`/conditional mount (`components/app-frame.tsx:267-271`). Below `lg`, keyboard users tab through ~25 invisible links before page content.
- **All three `role="menu"` popovers break their own contract** — account menu, publish quick-nav, notifications panel (`app-frame.tsx:446-464`, `:625-665`; `components/notifications.tsx:267-357`): no arrow keys/roving tabindex, no focus-in on open, no focus-return on Escape. The notifications panel is a scrollable list mis-modeled as a menu.
- **AssistantChat dialog** has `role="dialog"` + Escape but no focus move/trap/return — Tab escapes into the page behind (`components/assistant-chat.tsx:141-176`).
- **Mobile drawer** scroll-locks and Escapes but doesn't contain focus (`app-frame.tsx:235-246`).
- **PageSelector radiogroup** declares `role="radio"` chips but each is an independent Tab stop with no arrow-key handling (`components/publishing/publish-page.tsx:373-408`).
- **No skip-to-content link** past the ~25-item sidebar (`app/layout.tsx`, `app-frame.tsx:513-522`).

### 6. Auth: the only signup path can fail invisibly

Invite acceptance POSTs `/api/workspace/accept` with `.catch(() => {})`, never checks `res.ok`, then unconditionally redirects to `/platforms` (`app/login/page.tsx:38-48`). An expired invite produces a completed-feeling signup with no workspace membership and no way to recover. Additionally: the only `<h1>` on login lives in a `hidden lg:flex` block (`:143`) — no h1 on mobile — and forgot/reset have **no** `<h1>` at all (`app/forgot-password/page.tsx:40`, `app/reset-password/form.tsx:80`).

### 7. Schedule datetime: unnamed input, no bounds, crash on clear

The shared `ScheduleField` datetime-local has no accessible label (the wrapping `<label>` contains only the checkbox — `components/publishing/publish-page.tsx:444-449`) and no `min` despite copy promising "10 minutes to 75 days" (`:450-453`). All three flows call `new Date(scheduledFor).toISOString()` (`app/post/page.tsx:51-53`, `app/videos/page.tsx:164`, `app/reels/page.tsx:183-185`) — a cleared field throws `RangeError` surfaced as a cryptic "Post failed" toast.

---

## P1 — Systemic

### A. Contrast below WCAG on meaningful text

- **`--faint` (#98a1ae, ≈2.6:1 on white)** carries real information: nav group titles (9.5px, `app-frame.tsx:320`), clickable card eyebrow (`:379`), "Soon" badge (`:340`), notification timestamps (`components/notifications.tsx:336`), and the FieldLabel hints on *every publishing field* (`publish-page.tsx:280`). `--muted-foreground` (#6b7482) passes at 4.7:1 — move meaningful text there; keep `--faint` decorative.
- **"Drafted" pill:** `text-facebook` (#1877f2, ≈4.2:1) at 10px — below AA on the most-repeated status signal (`components/status-pill.tsx:8-10,61`).
- **Placeholders:** `placeholder:text-muted-foreground/70` ≈ 2.7:1 (`publish-page.tsx:286,288`).
- **Status pills bypass tokens:** hardcoded `emerald-600/700`, `amber-600/700/500` (`status-pill.tsx:14-39`) while `--success`/`--warning` tokens exist — and "Retrying" (amber-500) vs "Canceled" (amber-600) are nearly indistinguishable.
- **Hardcoded hex:** 13 lines / 9 files — worst `app/downloads/page.tsx` (5 lines, `#171923` panel + gradient hexes `:627-767`, duplicated 4× across the app including `final-reel-preview.tsx:77`); `bg-[#1877f2]` despite an existing `bg-facebook` token (`app/settings/page.tsx:485`, `app/analytics/page.tsx:507`); `#cc0000` despite `bg-youtube` (`components/youtube-preview.tsx:55`).

### B. Focus management & semantics

- **Four focus-ring recipes:** `ring-3 ring-ring/50` (Button/Input/Textarea) vs `ring-[3px]` (Badge) vs `ring-2 ring-ring/50` (AssistantChat) vs `ring-2 ring-ring/40` (app-frame ×12, notifications ×4). The *softest* ring sits on the components keyboard users touch most.
- **Sonner follows the OS theme while the app is light-only:** `sonner.tsx:8-12` reads next-themes, but no `ThemeProvider` is mounted → dark-OS users get dark toasts on an unambiguously light app.
- **Sources' three hand-rolled modals:** no `role="dialog"`, no `aria-modal`, no focus trap, no Escape — only click-outside (`app/sources/page.tsx:199,277,329`).
- **Selected rows lack `aria-current`** anywhere (grep: zero hits) — downloads marks the previewed row with background tint only (`app/downloads/page.tsx:874`); accounts capability table `<th>`s lack `scope="col"` (`app/accounts/page.tsx:585-594`).
- **Settings password form uses placeholder-only labels** — three inputs, no `<label>` (`app/settings/page.tsx:340-373`), while other fields on the same page correctly use sr-only labels.
- **aria-live count: 1 in the whole app** (`app/downloads/page.tsx:565`). Silent async surfaces: publish `ResultList` (`publish-page.tsx:475-517` — the app's core action), assistant busy bubble (`assistant-chat.tsx:235-246`), analytics chart (values exposed only via `title`, `app/analytics/page.tsx:265-306`).

### C. Calendar interaction layer (worst single surface)

`app/calendar/page.tsx:286-341`: cells and chips are plain divs; chips expose content only via `title` (`:316`, desktop-hover-only); "+N more" is a static `<p>` (`:334-338`) so posts beyond 2/day are invisible; no `role="grid"`, no keyboard access. The 7-column grid (`:278`, `min-h-[104px]` cells `:289`) gives ~46px cells at 375px — unusable on phones — and the header control row (`:211-262`, no wrap) totals ≈430px, overflowing 360–390px viewports.
**Fix:** chips as buttons, "+N more" opens a day list, grid roles or an accessible agenda list, stacked agenda view under `sm`, wrapping header.

### D. Consistency drift (mostly in the newest code)

- **Composer inputs duplicate — and drift from — the ui primitives:** `inputClass`/`textareaClass` (`publish-page.tsx:285-289`) differ from `components/ui/input.tsx:11` in height (h-9 vs h-8), ring strength, and the missing `text-base md:text-sm` pattern → composer inputs render 14px on mobile and trigger **iOS Safari auto-zoom** on focus.
- **32 `rounded-[…]` overrides across 11 files** — including the design-system `Button` itself (`components/ui/button.tsx` ×4) and 8 in app-frame.
- **513 arbitrary `text-[…]` sizes**; worst: accounts 71, downloads 63, analytics 39, settings 34, dashboard 33. No `--text-*` scale tokens exist (verified: `tailwind.config.ts` and `@theme` define none; `text-2xs`/`text-2sm` are used nowhere).
- **Duplicated implementations:** `ConnectGate` vs `PlatformConnectGate` (~35 near-identical lines, `publish-page.tsx:126-206`); `PublishPage` vs `PlatformPublishPage` skeleton (`:10-124`); the outside-click+Escape popover effect copy-pasted 3× (`app-frame.tsx:211-227`, `564-580`; `notifications.tsx:177-193`); `#171923` dark panel duplicated 4×.
- **Container widths:** 3 tiers now — 1240px (dashboard/calendar/downloads/accounts/analytics/platforms/team), 1024px (status, drafts/[id]), 880px (sources, settings). Mostly converged; `/status` is the odd one out and carries its own heading scale (`text-4xl` vs `page-title`).
- **Refresh model is a grab-bag:** manual-only (dashboard, status), silent 60s poll with no stale indicator (calendar), 2s poll only during jobs (downloads), navigation-triggered (accounts/platforms), none at all (team, sources, analytics).
- **Verb drift:** "Publish post / Publish video / Post reel / Publish story / Add photos / Create stream / Upload to YouTube / Post to TikTok" for the same mental action.

### E. Touch targets below 40px on must-hit controls

`Button` itself ships `xs` = 24px and `sm` = 28px (`components/ui/button.tsx:28-29`). Worst offenders: schedule checkbox 14px (`publish-page.tsx:438`), photo-thumbnail remove ×≈14px (`app/photos/page.tsx:224-231`), stream-key/server-URL copy buttons 14px icons (`app/live/page.tsx:271-281`), calendar cancel X ≈22px, revoke invite ≈24px, page chips ≈26px (`publish-page.tsx:388`), FilePicker "Clear" ≈20px (`:334-340`), header bell/facebook 32px, drawer close 28px, assistant chips ≈26px. Enforce ≥40px (or padded hit areas) on all of these.

### F. Forms & validation timing (split across flows)

| Flow | Validation | Evidence |
|---|---|---|
| Story queue, Photos, Instagram | ✅ type+size at pick, before any network | `app/page.tsx:361-369`, `app/photos/page.tsx:84-94`, `app/instagram/page.tsx:68-77` |
| YouTube, TikTok, Reels | type only (or `accept` attr) at pick; size at submit | `app/youtube/page.tsx:45-48`, `app/tiktok/page.tsx:42-45`, `app/reels/page.tsx:124-128` |
| Videos | size checked only at submit; thumbnail never client-side | `app/videos/page.tsx:135-140`, `:222-232` |
| Stories | **never** client-side (2 GB upload possible before 100 MB server limit rejects) | `app/stories/page.tsx:51-81` |

Related: field errors are toast-only with no inline placement or `aria-invalid` anywhere; upload progress is real only in Reels (Videos shows static "Uploading…", YT/IG/TT spinner-only for GB-scale transfers); `type="url"` on the post link does nothing (not a form submit — `app/post/page.tsx:125`).

### G. Auth & OAuth details

- Signup mode uses `autoComplete="current-password"` (`app/login/page.tsx:237`) — should be `new-password`; password managers offer no generation.
- `minLength={8}` applies to sign-in too (`:242`) — a legacy shorter password becomes an unexplainable client block.
- `autoComplete="one-time-code"` on the invite-code field (`:252`) — invites aren't OTPs.
- No already-signed-in handling on `/login`; no password visibility toggles on any auth form; focus isn't moved to the error on failed submit (errors do use `role="alert"` — good).
- **OAuth outcomes silently ignored:** Instagram `reconnect` outcome produces no feedback at all (`components/instagram-connection.tsx:64`); YouTube/TikTok `unconfigured` is silent while Facebook notifies the same case (`components/youtube-connection.tsx:68`, `components/tiktok-connection.tsx:71` vs `facebook-connection.tsx:69-71`). Instagram's `connect()` also skips the loading guard the other three have (`:134-138`), and no provider shows a "Redirecting…" pending state.

### H. Live-data reliability

- Downloads polling **dies permanently on the first transient error** — one toast, `setActiveJobId(null)`, no retry/backoff for a still-running job (`app/downloads/page.tsx:275-282`).
- `/status` silently caps at 100 records (`app/api/drafts/route.ts:17`, hint at `app/status/page.tsx:68`) with no load-more — the audit trail truncates invisibly (dashboard's cursor pagination is the in-app pattern to port).
- "Live comments" is a one-shot fetch labeled live — no polling while a stream is LIVE, results not `aria-live` (`app/live/page.tsx:498-506`, `:413-427`).

---

## P2 — Polish

**Microcopy**
- Dev-speak ships to users in 6+ surfaces: "Add FACEBOOK_APP_ID… restart the dev server" (`components/facebook-connection.tsx:49-52`, `app/accounts/page.tsx:281-285`, `app/platforms/page.tsx:140,182,219,259`), "The link appears in the server console" (`app/login/page.tsx:76,97`, `app/forgot-password/page.tsx:50-52`), raw `Outcome: ${outcome}` (`youtube-connection.tsx:69-71`), raw API-mechanics strings (`app/post/page.tsx:84-92`, `app/photos/page.tsx:303-309`, `app/videos/page.tsx:263-265`, `app/page.tsx:1017-1022`), `npm run worker:install` instruction (`app/downloads/page.tsx:613-619`).
- "cancelled"/"canceled" split — including both spellings inside one function (`app/calendar/page.tsx:187` vs `:192`, API errors `app/api/schedule/[id]/route.ts:63,122,132,153-154`).
- Review wording: "Waiting for review" vs "Ready to review" vs "ready for review" (dashboard `:336,295`, status `:73`).
- `/status` identity drift: nav "Drafts" vs H1 "Drafts & activity" vs eyebrow "Publishing desk"; CTA "Back to story queue" vs dashboard's "Open story queue".
- ASCII `'...'` in sources (`:86`) vs "…" everywhere else; bare "…" as the entire Disconnect busy label (`app/settings/page.tsx:510`).
- False copy: Videos claims "Chunked upload… 4 MB chunks… 1 GB" but `/api/videos` takes one `formData()` body (`app/videos/page.tsx:123-127,292-296` vs `app/api/videos/route.ts:38`); raw "63206" char budget (`app/photos/page.tsx:315`) while the album caption has no counter/maxLength at all (`:398-405`).

**Small correctness bugs**
- `app/downloads/layout.tsx:5-6` — metadata describes a *different product* ("A local-first workspace for saving videos…") and leaks into the tab title.
- Wrong icons: `ImagePlus` on the "Publish video" button (`app/videos/page.tsx:289`); `XCircle` (an error icon) as the dialog close glyph ×3 (`app/sources/page.tsx:203,281,333`).
- Toast taxonomy: success shown as neutral — "Scheduled post canceled" (`app/calendar/page.tsx:192`), "…connected" (`app-frame.tsx:698` vs `toast.success` in `facebook-connection.tsx:58`).
- Removing a staged file orphans the Blob (no cleanup) on YouTube/TikTok/Instagram and FilePicker clear (`app/youtube/page.tsx:191`, `app/tiktok/page.tsx:193`, `app/instagram/page.tsx:216`, `publish-page.tsx:333-341`) — Photos does best-effort delete (`app/photos/page.tsx:125-138`).
- Dead GIF branch in `compressImage` (`app/page.tsx:324`) — `ALLOWED_IMAGE_TYPES` (`:70-74`) excludes GIF, so it never runs.
- Albums tab first load shows an empty select with no loading indicator (`app/photos/page.tsx:73-75`).
- Team renders a real-looking "Editor" role after a failed load (`app/team/page.tsx:36,147`).
- Disabled buttons explain themselves only via `title` tooltips (`app/platforms/page.tsx:459-464`, `app/accounts/page.tsx:519`) — invisible on touch/keyboard.
- "Soon" nav item isn't focusable, so its "Coming soon" reason is unreachable (`app-frame.tsx:327-345`).
- Sources status badge rendered as a clickable `<Button>` that does nothing (`app/sources/page.tsx:79-87`).
- Assistant send button hard-labeled "Send revision request" even in general-chat mode (`assistant-chat.tsx:277-278`).
- `aria-label` on bare `<svg>` without `role="img"` (`app/accounts/page.tsx:734,737`).
- `signOut` and notifications "Load more" lack pending guards; load-more failure swallowed silently (`app-frame.tsx:229-233`, `notifications.tsx:201-216`).
- `app/login/page.tsx:15` instantiates its own auth client instead of the shared `lib/auth-client.ts`.
- Fixed `grid-cols-3` summary rows with no mobile breakpoint on accounts/team/platforms (`app/accounts/page.tsx:172`, `app/team/page.tsx:134`, `app/platforms/page.tsx:305`).

**Motion & theming hygiene**
- `prefers-reduced-motion`: exactly 1 use repo-wide (`lib/reels/presets.preview.ts:26`). The `download-sweep` keyframe (`app/globals.css:333-340`) and all 40 `animate-spin`/`animate-pulse` usages are ungated.
- Dead `dark:` variants in all ui primitives — `@custom-variant dark` requires a `.dark` class nothing ever sets; every theme is a light `data-theme` override.
- `viewport.themeColor: "#ffffff"` hardcodes the default theme only (`app/layout.tsx:37`).

---

## What's done well (keep)

- **A11y naming discipline:** every icon-only control carries an `aria-label`; popovers set `aria-expanded`/`aria-haspopup`; `aria-current="page"` is consistent across sidebar/header/menus; decorative icons are consistently `aria-hidden`; Escape-to-close exists on every overlay; TimeAgo is hydration-safe.
- **Reset-password flow is the model auth flow:** typed error codes → human copy, distinct states for missing token/invalid link, each with recovery CTA.
- **Theme picker:** proper `role="radiogroup"`/`aria-checked`, optimistic apply with revert + toast on failure; Save disabled until dirty.
- **Downloads progress block:** real `role="progressbar"` with `aria-valuenow`/`aria-valuetext` inside an `aria-live` region — the only correct live region in the app, and the pattern to generalize.
- **Dashboard load-more:** cursor pagination, dedupe, disabled+`aria-busy`, "All activity loaded" end marker.
- **Pick-time validation gold standard** in story queue/Photos/Instagram with per-file reasons; honest "No generation yet" instead of fake zeros in the composer; publish buttons disabled with real explanations wired via `aria-describedby`.
- **Double-submit guards** (`busy` flags) on every submit button; graceful media-preview degradation ("it can still be published as-is"); settings inline errors via `role="alert"`; no paste blocking anywhere.
- **Notification logic:** max-id watermark prevents history replay on first load, toast cap of 3, optimistic mark-all with rollback.
- **Calendar's 60s auto-poll** shares one clock for all due-date math (no flicker).

---

## Recommended execution order

1. **Destructive-confirm sweep (~1 day, biggest risk reduction):** one shared confirm pattern + pending guards + success toasts across the 7 paths in P0-1.
2. **Error-vs-empty separation + route boundaries (~1 day):** shared `<ErrorState onRetry>`, "—" placeholders, `app/error.tsx` + `app/not-found.tsx` (+ `loading.tsx` on dashboard/analytics/accounts).
3. **Publishing correctness (~1–2 days):** gate Publish on `normalizing`/staging, reset targeting + schedule toggle on success, reload after schedule, reels clear-race guard, ScheduleField label + `min` + cleared-value guard.
4. **Shell focus management (~1–2 days):** one dialog/popover primitive (or a `useDismissable` + focus-trap hook), `inert` the closed mobile drawer, fix the fake `role="menu"`s, skip link.
5. **Contrast token pass (~half day, no visual restyle):** `--faint` → `muted-foreground` for meaningful text, status pills onto `--success`/`--warning`, placeholder `/70` removal, darken "Drafted" text, force `theme="light"` on Sonner.
6. **Calendar interaction + mobile agenda (~2 days).**
7. **Touch-target pass (mechanical).**
8. **Auth/OAuth copy + autocomplete fixes (half day).**
9. **Consistency sweeps (mechanical):** verbs, canceled, ellipsis, refresh model, extract `useDismissable`/`ConnectGate`/`PageShell`, retirement plan for `text-[…]` sizes (new named tokens, sweep opportunistically — no mass restyle).

Steps 1–5 remove every safety and correctness failure; 6–8 close the worst UX gaps; 9 is ongoing hygiene.
