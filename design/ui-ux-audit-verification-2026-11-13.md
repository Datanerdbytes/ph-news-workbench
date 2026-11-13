# UI/UX Audit Verification — 2026-11-13 audit vs current tree

**Date:** 2026-11-13 (same day, post-fix) · **Branch:** `feature/consistency-sweeps` @ `e0eee45`
**Method:** four parallel code sweeps (publishing flows, shell/shared, data pages, auth/OAuth/tokens), one row per audit claim, each verdict backed by current `file:line` evidence; headline claims re-checked independently.
**Baseline:** the fix commits are PRs #19–#26 merged to `main` (destructive confirms `9acdb6e`, focus `fcb9c6e`, contrast `049f23d`, calendar `ae741e9`, touch `df2c7c1`, auth/OAuth `665ac2f`, consistency `676b443`, plus publishing-correctness fixes from #21).
**Since the report:** all 8 remaining-work steps have landed on this branch — step 1 `8335802` (pick-time validation), step 2 `533c482` (P1-H live-data reliability), step 3 `2fa45f8` (publishing a11y), step 4 `c640c16` (sources modals), step 5 `ea8159b` (blob cleanup), step 6 `a769a28` (shell odds), step 7 `9e774de` (token hygiene), step 8 `e0eee45` (copy sweep) — see "Fixes applied after this report" below.

## Verdict summary

117 audited claims: **63 implemented · 18 partial · 31 not implemented · 5 fixed-differently** (1 of those = audit misdiagnosis, see below).

| Audit section | Status |
|---|---|
| P0-1 Destructive confirms | ✅ Done (all 7 paths + shared `ConfirmButton`/`ConfirmIconButton`) |
| P0-2 Error vs empty + boundaries | 🟡 Mostly done (ErrorState in 10 files, `error.tsx`/`not-found.tsx` exist; gaps below) |
| P0-3 Publish races | 🟡 Mostly done (reels/photos gates fixed; pick-time size validation cluster untouched) |
| P0-4 Stale state | ✅ Done (targeting, schedule toggles, post-schedule reload) |
| P0-5 Shell accessibility | ✅ Fixed this branch (`c640c16` modals, `2fa45f8` radiogroup/arrows; `inert`, traps, skip link, `useDismissable`) |
| P0-6 Auth signup | ✅ Done |
| P0-7 Schedule datetime | ✅ Done (label, min/max, centralized cleared-value guard) |
| P1-A Contrast | 🟡 Mostly done on tokens; hex regression trimmed this branch (`9e774de`: panels/brand marks tokenized; downloads badge tints stay hand-picked) |
| P1-B Focus & semantics | 🟡 Mostly done (Sonner, pills, timestamps, `aria-live` regions, one ring alpha `a769a28`, dead `dark:` removed `9e774de`; capability-table semantics remain) |
| P1-C Calendar | ✅ Done (buttons, day list, mobile agenda, wrapping header) |
| P1-D Consistency drift | 🟡 Partial (verbs/refresh/copy unified; `text-[` 513→544, `rounded-[` 32→34 regressed) |
| P1-E Touch targets | ✅ Done (`.tap-target` system; assistant chips grown to the chip recipe in `a769a28`) |
| P1-F Validation timing | ✅ Fixed this branch (`8335802`): shared `mediaFileError` + FilePicker `validate` across Stories/YT/TT/Reels/Videos-thumb |
| P1-G Auth/OAuth details | ✅ Done (one gap: `/accounts` connect buttons lack "Redirecting…" state) |
| P1-H Live-data reliability | ✅ Fixed this branch (`533c482`): downloads backoff, /status cursor pagination + load-more, live-comments polling |
| P2 Microcopy & small bugs | 🟡 Mostly fixed (dev-speak, composer mechanics, "63206", /status identity done in `e0eee45`; dead GIF branch, `ImagePlus` icon, `grid-cols-3` rows remain) |
| Motion & theming hygiene | ❌ Mostly not done (reduced-motion still 1 hit; `themeColor` hardcoded; dead `dark:` variants removed in `9e774de`) |

## Audit claims that were misdiagnosed

1. **Videos "Chunked upload… 4 MB chunks… 1 GB" copy is factually true** — the chunking happens on the server→Facebook leg (`lib/publishing/videos.ts:10` `CHUNK_BYTES = 4 * 1024 * 1024`, transfer loop `:57-111`); only the browser→workbench leg is a single POST. No fix needed; copy left as-is.
2. **YouTube/TikTok "honest indeterminate" upload copy predates the audit** — it was already there; not a post-audit change (still fair to want real progress, see P0-3/F gaps).

---

## ✅ Verified implemented (highlights, by area)

**Destructive confirms (P0-1)** — shared two-step pattern `components/ui/confirm-button.tsx:73,176` used in 8 files:
- End stream `app/live/page.tsx:519-530` ("Confirm end"/"Ending…"/"Keep streaming") + toast `:414`
- Cancel scheduled post `app/calendar/page.tsx:97-104,553-562`; "canceled" spelling now consistent everywhere incl. `app/api/schedule/[id]/route.ts:63,122,132,153-154` (one non-user-facing var `cancelled` remains)
- Queue-row draft delete `app/page.tsx:782-791` (pending guard `:457-486`)
- Revoke invite `app/team/page.tsx:280-289` + toast `:106`
- Disconnect Facebook — accounts `app/accounts/page.tsx:214-224`, settings `app/settings/page.tsx:529-538`, header `components/app-frame.tsx:805-817` (toast-action shortcut removed entirely); provider `components/facebook-connection.tsx:188-203`
- Delete download `app/downloads/page.tsx:969-979` (+ `tap-target`)
- Gold standards intact: sources dialog `app/sources/page.tsx:315-354`, drafts/[id] `:166-190`, compose pane `app/page.tsx:1135-1166`

**Error vs empty (P0-2)** — shared `components/ui/error-state.tsx` used in 10 files; "—" placeholders replace fake zeros (queue stats `app/page.tsx:593-595`, dashboard StatCards `:346-360,696`, analytics `app/analytics/page.tsx:272,198`, status `:146`); saved-draft load failure banner `app/page.tsx:143,246-270,968-976`; insights error surfaced `app/analytics/page.tsx:157,450-453`; boundaries `app/error.tsx:20-24` (ErrorState + reset) and `app/not-found.tsx:16-25`.

**Publishing correctness (P0-3/4/7)** — reels `normalizing` gate `app/reels/page.tsx:323` + `pickGeneration` race guard `:50,68-108`; photos staging gate + indicator `app/photos/page.tsx:108,131-133,160,264-267,379-389`; targeting reset `app/videos/page.tsx:192`; schedule toggles reset post/videos (reels/photos too) `app/post/page.tsx:77-79`, `app/videos/page.tsx:193-194`; queue reload after schedule `app/page.tsx:444-446`; ScheduleField `aria-label` + `min`/`max` + centralized cleared-value guard `components/publishing/publish-page.tsx:449-453,479-484,492-507`.

**Shell (P0-5)** — closed mobile sidebar `inert` `components/app-frame.tsx:295`; drawer focus trap `:246-266`; skip link `:275-280`; popovers re-modeled as `role="dialog"` with focus-in/return (account/quick-nav `app-frame.tsx:459,652`, notifications `components/notifications.tsx:256`); AssistantChat trap/return `components/assistant-chat.tsx:61-85`; shared `useDismissable` `lib/dialog-a11y.ts:36` (4 call sites); Sonner forced light `components/ui/sonner.tsx:9-13`.

**Calendar (P1-C)** — chips are buttons with full aria-labels `app/calendar/page.tsx:423-447`; "+N more" opens day panel `:448-457,464-503`; mobile agenda `:351-373`; header `flex-wrap` `:281,294`; shared clock intact `:126,152-156`.

**Auth/OAuth (P0-6, P1-G)** — invite `res.ok` checked, failure blocks redirect with honest copy `app/login/page.tsx:58-82`; h1 on all three auth pages (`login:230-234`, `forgot:40-42`, `reset form:80-82`); `new-password` `:300`; `minLength` signup-only `:305`; `one-time-code` gone; visibility toggles `components/auth-password-input.tsx:28-54`; already-signed-in handling `:241-265`; error focus `:33,52-56,327-329`; shared `lib/auth-client.ts`; IG reconnect feedback `components/instagram-connection.tsx:65-69`; YT/TT `unconfigured` parity `:69-73`/`:72-76`; IG connect guard `:142-151`; "Redirecting…" on /platforms `app/platforms/page.tsx:472-473`.

**Contrast (P1-A core)** — `--faint` demoted to decorative-only (`text-faint` = 0 meaningful-text hits); status pills on `--success`/`--warning`/`--destructive`/`--brand` `components/status-pill.tsx:16-47`; "Drafted" on `--facebook-strong` (#0d63d8) `:10-11`; placeholders `/70` removed and FieldLabel hints on `text-muted-foreground` `publish-page.tsx:280,286,289`; timestamps/nav titles/eyebrow moved off faint.

**Consistency (P1-D)** — one verb "Publish" across all 8 publishing CTAs (with deliberate "Add photos"/"Create stream"); refresh affordances unified ("Refresh"/"Refreshing…" + `aria-busy`) on dashboard/status/team/sources/analytics/queue/live; "Waiting for review" unified; "…" in sources; toast taxonomy fixed (`app/calendar/page.tsx:275`, `facebook-connection.tsx:58-63`).

**P2 fixes verified** — downloads layout metadata `app/downloads/layout.tsx:3-7`; XCircle→X in sources `:206,284,336`; team "—" role fallback `app/team/page.tsx:165-175`; review wording; ellipsis; XCircle disable-status icons fine.

---

## 🟡 Partially implemented

| Item | What landed | What remains |
|---|---|---|
| Status page (P0-2/H) | ErrorState `app/status/page.tsx:211-217`, "—" stats, skeleton | ✅ Cursor pagination + Load more landed (uncommitted, see P1-H below) |
| Downloads error state | ErrorState rendered `app/downloads/page.tsx:875-879` | Only usage with **no `onRetry`** |
| Photos albums | inline error + retry `app/photos/page.tsx:436-447` | No loading indicator on first Albums load (`:58,80-81`) |
| app-frame workspace load | settings now surfaces failures (`app/settings/page.tsx:290-295,416-421,172-176`) | `components/app-frame.tsx:216` still `.catch(() => {})` |
| Route boundaries | `error.tsx` + `not-found.tsx` | No `loading.tsx` anywhere (dashboard/analytics/accounts recommended) |
| Photos staging | busy gate + indicator | URLs still batch-append only after ALL uploads finish `:110-123` |
| Inline errors (P1-F) | schedule errors inline + `role="alert"` in 4 composers | No `aria-invalid` anywhere in publishing forms; YT/TT/IG submit failures still toast-only |
| Upload progress (P1-F) | Reels real %; YT/TT honest indeterminate | Videos still static "Uploading…" on multi-minute 1 GB transfer `app/videos/page.tsx:311`; IG spinner-only |
| Popover semantics | `role="dialog"` + focus management | No arrow keys/roving tabindex (accepted trade-off for non-modal) |
| Facebook toast action | removed; header is a ConfirmButton | — (counts as done) |
| Touch targets (P1-E) | `.tap-target`/`.tap-target-tight` pseudo-element system `app/globals.css:299-329` | Assistant chips still ~26px `components/assistant-chat.tsx:225-233`; FilePicker Clear ≈33-36px; photo-remove ≈36px; page chips ≈30px; schedule label ≈24px |
| `rounded-[` (P1-D) | `ui/button.tsx:28-35` now token-derived | 34 raw overrides across 12 files (up from 32/11) |
| Settings password form | Disconnect busy label fixed `:535` | Inputs still placeholder-only, no `<label>` `app/settings/page.tsx:360-392`; `bg-[#1877f2]` still `:511` |
| /status identity (P2) | CTA converged ("Open story queue") | ~~Third name "Publishing desk"~~ — ✅ eyebrow now "Publishing" (`e0eee45`); nav "Drafts" ↔ `pageLabel` "Drafts" agree, H1 describes both sections; `text-4xl` vs `.page-title` and 1024px vs 1240px container remain |
| Refresh model (P1-D) | consistent Refresh buttons on 7 pages | Downloads has none; accounts/platforms use icon-only refresh |
| aria-current (P1-B) | 4 nav uses | No row/list selection marking (downloads previewed row, etc.) |
| OAuth pending state | /platforms shows "Redirecting…" | /accounts connect buttons (`:233,305,461,525`) never consume `connecting` — double-click double-fires redirect |
| Dev-speak (P2) | login/forgot, connection components, platforms setup copy replaced | ~~accounts env-var/unreachable notes, platforms unreachable notes, downloads `npm run worker:install`~~ — ✅ fixed (`e0eee45`, step 8) |
| Auth error focus | login moves focus | forgot-password/reset rely on `role="alert"` alone |
| Worker copy | reworded framing | command string still rendered in-UI |

## ❌ Not implemented

**Publishing validation & lifecycle (P0-3 / P1-F)**
- ✅ Fixed (`8335802`): pick-time validation on Stories photo+video (types/size/extension fallback), YT/TT video (type+size), Reels video (before the normalizing gate), Videos main+thumbnail — shared `mediaFileError` + FilePicker `validate` prop with inline `role="alert"` rejection (`components/publishing/publish-page.tsx:283-321,363-394`); unit tests in `publish-page.test.tsx`
- ~~Staged-blob orphans: Remove on YT/TT/IG nulls state without `DELETE /api/blob`~~ — ✅ fixed (`ea8159b`, step 5): all four removal sites now call the shared `deleteStagedBlob`
- ~~Publish `ResultList` has no `aria-live`~~ / ~~no `aria-invalid`~~ / ~~PageSelector has no arrow keys~~ — ✅ fixed (uncommitted, see "Fixes applied" step 3)
- Composer `inputClass`/`textareaClass` still drift from `ui/input.tsx` (h-9/text-sm vs h-8/text-base md:text-sm → iOS zoom) (`publish-page.tsx:285-289`)
- `ConnectGate`/`PlatformConnectGate` still ~35 duplicated lines (`publish-page.tsx:126-206`)

**Live-data reliability (P1-H)** — fixed (uncommitted): downloads poll survives transient errors with exponential backoff and gives up after 4 (`app/downloads/page.tsx:280-306`); live comments poll every 10s while a stream is live, stop on 3 straight failures or VOD, `aria-live="polite"` on the panel (`app/live/page.tsx:378-411,647`); /status cursor pagination replaces the silent 100 cap (`app/api/drafts/route.ts:8-31`, load-more + footer in `app/status/page.tsx:60-108,220-242`), dashboard consumer updated to the new shape (`app/dashboard/page.tsx:60`).

**Sources & tables a11y (P1-B)**
- ~~Three hand-rolled modals lack `role="dialog"`/`aria-modal`/trap/Escape~~ — ✅ fixed (uncommitted): all three now use the shared `Modal` (see "Fixes applied" step 4)
- Capability table `<th>` no `scope="col"`; bare `<svg>` aria-label without `role="img"`; disabled buttons title-only (`app/accounts/page.tsx:590-595,737-739,522`, `app/platforms/page.tsx:464-469`)

**Shell leftovers (P1-B / P2)** — ✅ all fixed (`a769a28`, step 6)
- ~~Four focus-ring recipes persist verbatim~~ — one alpha everywhere (`ring-ring/50` on hand-rolled + primitives; white variant on the inverted downloads surface; `ring-inset` kept as a placement form)
- ~~`signOut` no pending guard~~ / ~~notifications "Load more" no pending guard + silent `catch {}`~~ — both guarded, failures toast
- ~~Assistant send label / busy bubble live region / ~26px chips~~ — mode-aware label, `role="status"`, chips at the house chip recipe
- ~~"Retrying" vs "Canceled" identical~~ — retrying is now the info recipe (unit-tested)
- "Soon" nav item still non-focusable `<span aria-disabled title>` (`app-frame.tsx:355-372`; dormant — all items currently have hrefs, deliberately skipped)

**Tokens & hygiene (P1-D / motion)** — hex + `dark:` halves fixed (`9e774de`, step 7)
- `text-[` arbitrary sizes: **544** (up from 513); no `--text-*` scale tokens added — deliberately out of scope for this sweep
- `rounded-[`: 34 (up from 32)
- ~~Hardcoded hex: 31 lines / 14 files~~ — preview panels, brand marks, and the `#79d2ae` marks tokenized; the downloads source-badge tint family stays hand-picked on purpose
- `prefers-reduced-motion`: still 1 non-CSS hit; `download-sweep` + 49 spin/pulse animations ungated
- `aria-live` regions: was exactly 1 (downloads `:572`); steps 2–3 added the publish ResultList (8 composers) and the live-comments panel
- `viewport.themeColor` still hardcoded `#ffffff` (`app/layout.tsx:37`)
- ~~Dead `dark:` variants in all four ui primitives~~ — removed; no `.dark` class ever set

**P2 small bugs untouched**
- Dead GIF branch `app/page.tsx:337`; ~~raw "63206" budget + counter-less album caption~~ (✅ fixed `e0eee45`); `ImagePlus` on "Publish video" `app/videos/page.tsx:310`
- ~~Dev-speak in composers: `app/post/page.tsx:100-108`, `app/photos/page.tsx:329-339`, token I/O strings `app/page.tsx:1051-1063`~~ — ✅ fixed (`e0eee45`; videos "4 MB chunks" stays — factually true)
- Fixed `grid-cols-3` summary rows, no mobile breakpoint (`app/accounts/page.tsx:173`, `app/team/page.tsx:162`, `app/platforms/page.tsx:310`)

## Fixes applied after this report

**Step 1 — Pick-time media validation sweep** (commit `8335802`)
- Shared `mediaFileError()` helper + `validate` prop on FilePicker; rejection renders inline `role="alert"` and the file is never staged (`components/publishing/publish-page.tsx`).
- Wired on: Stories photo (JPEG/PNG/WebP, 20 MB) + video (MP4/MOV with extension fallback, 100 MB); YouTube + TikTok video (1 GB, toast); Reels video (1 GB, validated before the normalizing-generation bump); Videos main (1 GB) + thumbnail (JPEG/PNG/WebP, 20 MB, toast + input reset).
- Unit tests: `mediaFileError` (accept / type copy / size copy / extension fallback) + FilePicker (invalid → alert, `onPick` untouched; valid → staged). Typecheck, lint count unchanged, 576/576 tests green.

**Step 2 — P1-H live-data reliability** (commit `533c482`)
- `GET /api/drafts` now returns `{ drafts, nextCursor, hasMore }` with `before` cursor and clamp(1–200) limit; new route tests cover first page, last page, cursor, and clamp (`app/api/drafts/route.ts`, `route.test.ts`).
- /status renders load-more with dedupe and an "All records loaded" footer; stat hint "Last 100 records" → "Loaded so far" (`app/status/page.tsx`). Dashboard consumer updated to the object shape (`app/dashboard/page.tsx`).
- Downloads polling: exponential backoff (2s→16s), resets on success, stops with one toast after 4 straight failures; 404 stays an immediate terminal short-circuit (`app/downloads/page.tsx`).
- Live comments: 10s polling while a stream is live, stops on VOD/end/3 straight failures (with a toast), `aria-live="polite"` on the comments panel (`app/live/page.tsx`).
- Gates: typecheck clean, 576/576 tests pass, lint count unchanged (46 pre-existing warnings, 0 errors).

**Browser verification status (2026-11-13, signed-in Chrome)**
- Verified live: /status with real data — 4 records render under the new API shape, "Loaded so far" hint, "All records loaded" footer; dashboard renders against the new drafts shape; /downloads and /live render with the polling changes in place (no regressions).
- Not browser-verified: pick-time rejections. The Qoder browser extension refuses scripted file-choice uploads on agent-driven tabs (`chooser.setFiles` → "Not allowed"), and oversized fixtures can't be handed to the OS picker from automation. The validation logic is unit-tested; the manual pick test (105 MB video + .txt on /stories, 1.1 GB on /youtube) remains for the user's local pass, as does live-comments polling (needs a real stream).

**Step 3 — Publishing a11y: ResultList live region, aria-invalid, PageSelector arrows** (commit `2fa45f8`)
- `ResultList` always renders `<ul aria-live="polite">` so per-page publish outcomes are announced; the five callers that gated it on `null` now render it unconditionally with `results ?? []` (`components/publishing/publish-page.tsx:575`, `app/{post,videos,stories,photos,reels}/page.tsx`).
- `aria-invalid` + `aria-describedby` wired to the inline errors: ScheduleField datetime input (id `schedule-error`) and FilePicker inputs (`${id}-error`) — covers all composers using them.
- PageSelector radiogroup: roving tabindex (selected radio is the only tab stop) + Arrow/Up/Down/Left/Right with wrap and Home/End, selection following focus (`publish-page.tsx:405-470`).
- Verified live in Chrome on /stories: selected radio `tabindex="0"`, ArrowRight moved selection + tab stop to the second Page, ArrowLeft moved back.
- Gates: typecheck clean, 582/582 tests pass (6 new), lint count unchanged.

**Step 4 — Sources modals onto shared dialog primitives** (commit `c640c16`)
- New `components/ui/modal.tsx`: true modal on the `lib/dialog-a11y` helpers — `role="dialog"` + `aria-modal` + `aria-labelledby`, Escape and outside-pointerdown close (replacing the hand-rolled backdrop `onClick` dance), Tab trapped, focus moves to the initial-focus element (or first focusable) on open and returns to the trigger on close. 6 unit tests (`components/ui/modal.test.tsx`).
- All three sources dialogs (Add / Edit / Delete feed) migrated onto it; `autoFocus` attributes replaced by `initialFocusRef`.
- Verified live in Chrome on /sources: dialog opens with `aria-modal="true"` and the title as its accessible name, Escape closes it, and it reopens cleanly afterwards; focus-return to the trigger is covered by unit tests (this browser surface's focus reporting is too coarse to observe).
- Gates: typecheck clean, 588/588 tests pass (6 new), lint count unchanged.

**Step 5 — Blob cleanup on staged-file removal** (commit `ea8159b`)
- New `lib/blob-cleanup.ts` `deleteStagedBlob()` — best-effort `DELETE /api/blob` with the same `{url}` payload the route guards via `assertStagedBlob` (2 unit tests).
- Photos' `removeImage` now cleans up the staged blob, and the YouTube/TikTok/Instagram Remove buttons delete the staged blob before nulling state — no more orphaned blobs on any of the five flows.
- Gates: typecheck clean, 590/590 tests pass (2 new), lint count unchanged.

**Step 6 — Shell odds and ends** (commit `a769a28`)
- Pending guards: `signOut` disables itself and shows "Signing out…" (honest toast on failure); notifications "Load more" gets the same treatment plus a toast on failure instead of the silent `catch {}`.
- Assistant: suggestion chips grow to the house chip recipe (~30px, matching PageSelector/queue chips — wrapped chips can't use `.tap-target` overlap), the busy bubble announces via `role="status"`, and the send button is labeled "Send message" in chat mode vs "Send revision request" in revise mode.
- Retrying pill moves to the info-blue recipe (`bg-info`/`text-info`) so an in-progress retry no longer looks identical to the terminal amber Canceled; unit test pins the split (`status-pill.test.tsx`).
- Focus rings unified on one alpha: every `focus-visible:ring-ring/40` (45 sites, 13 files) → `ring-ring/50`, matching the ui primitives' recipe; the inverted downloads surface keeps its white ring at the same alpha; `ring-inset` stays where full-width rows must not overflow.
- "Soon" nav item left as-is (dormant — every nav item currently has an href).
- Gates: typecheck clean, 591/591 tests pass (1 new), lint count unchanged (41 pre-existing warnings, 0 errors).

**Step 7 — Token hygiene (opportunistic)** (commit `9e774de`)
- The five dark preview panels (stories, videos, live, downloads, final-reel) `#171923` → `bg-ink`; their `#79d2ae` success marks → new `--success-bright` token (on-dark bright variant of the AA-on-white `--success`) with the `@theme` mapping.
- Facebook "f" tiles `#1877f2` → `bg-facebook` (settings, analytics) and the YouTube badge `#cc0000` → `bg-youtube`, both now matching `PlatformMark`.
- Downloads' source-site badge tints stay hand-picked hexes on purpose — a deliberate multi-platform set like the Instagram gradient.
- All `dark:` variants removed from the four ui primitives (badge, button, input, textarea) — the app ships light per-account themes only, so they never applied.
- Deliberately skipped: the `text-[`/`rounded-[` mass scale (544+34 instances, no `--text-*` tokens exist; a restyle is out of scope for this sweep).
- Gates: typecheck clean, 591/591 tests pass, lint count unchanged.

**Step 8 — Copy sweep** (commit `e0eee45`)
- "Dev server" unreachable notes → "the server or database may be down" (platforms ×4, accounts ×2); the Meta credentials hints say "the server's `.env.local` and restart it" instead of "restart the dev server".
- Downloads worker hint no longer prints `npm run worker:install` — it points at the one-time setup without the command string.
- Composer asides describe behavior instead of Graph mechanics: post aside drops the `/feed`-edge/access-token talk; photos aside drops `/photos` and `published=false with scheduled_publish_time`.
- Photo message budget reads "63,206"; the album caption gains the same counter and `maxLength` it was missing.
- Token stats read "Input/Output N tokens" instead of "tok"; /status eyebrow "Publishing desk" → "Publishing" (nav "Drafts" ↔ `pageLabel` "Drafts" already agreed).
- Left alone on purpose: the videos "4 MB chunks" copy (factually true — the chunking happens on the server→Facebook leg; see misdiagnosis §1).
- Gates: typecheck clean, 591/591 tests pass, lint count unchanged (41 warnings, 0 errors).

## Remaining order

3. ~~ResultList `aria-live` + `aria-invalid` + PageSelector arrows~~ — ✅ done (`2fa45f8`).
4. ~~Sources modals onto the existing dialog primitives~~ — ✅ done (`c640c16`).
5. ~~Blob cleanup on staged-file removal~~ — ✅ done (`ea8159b`).
6. ~~Shell odds and ends: signOut/load-more guards, assistant chips + send label + live bubble, ring unification, Retrying/Canceled differentiation~~ — ✅ done (`a769a28`).
7. ~~Token hygiene: hex → tokens, `dark:` removal~~ — ✅ done (`9e774de`; `text-[` scale deliberately skipped).
8. ~~Copy sweep: accounts/platforms/downloads dev-speak, composer API-mechanics strings, "63206", /status identity~~ — ✅ done (`e0eee45`).

All eight remaining-work steps are complete on this branch. Still open (outside the ordered work): pick-time rejection browser pass (manual, see browser-verification status), live-comments polling against a real stream, capability-table semantics, ConnectGate dedup, reduced-motion gating, `themeColor`, dead GIF branch, `ImagePlus` icon, `grid-cols-3` rows.
