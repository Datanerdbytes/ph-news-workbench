# UI/UX Design Audit — PH News Workbench

**Date:** 2026-11-05 · **Scope:** all 15 routes, app shell, shared components (~8.4k lines of UI code)
**Goal:** identify everything standing between the current UI and an extremely polished, professional interface.

---

## Executive summary

The design foundation is genuinely good — semantic color tokens, a distinctive ochre/editorial brand, Newsreader + Geist pairing, consistent `focus-visible` discipline, and real accessibility effort in many places (aria-labels, sr-only loading announcements, `role="status"` progress in Downloads). The gap to "extremely polished" is **drift**: every pattern exists in at least 2–4 competing variants, and the variants diverge in exactly the details users notice (elevation, type size, button shape, status colors, verbs).

### Scorecard

| Dimension | Grade | Notes |
|---|---|---|
| Brand & visual identity | B+ | Strong editorial identity; undermined by token bypasses |
| Design tokens & theming | B− | Good token set, heavily bypassed (40+ arbitrary sizes, 20+ hardcoded hex) |
| Layout & consistency | C+ | 4 container widths, 3 surfaces, 3 eyebrows, 3 H1 treatments |
| Component quality | B | Solid primitives; several pages don't use them |
| Interaction & feedback | C | Destructive actions unconfirmed; silent failures; stale state bugs |
| Accessibility | C+ | Good instincts, real gaps (modals, calendar, contrast, focus mgmt) |
| Responsive & touch | C | Several sub-44px targets; calendar unusable on mobile |
| Microcopy | B− | Some excellent copy; terminology drift everywhere |

---

## P0 — Correctness & safety (fix first)

### 1. Destructive actions execute immediately
The single biggest user-risk cluster in the app. One mis-click destroys real work:

- **End stream kills a live broadcast with no confirm** — `app/live/page.tsx:420-423`. Worst instance. Add a confirm dialog (or type-to-confirm).
- **Cancel scheduled post: immediate, no pending guard** (double-click = double DELETE) — `app/calendar/page.tsx:170-183`.
- **Story row trash deletes the draft immediately**, while the compose-pane delete correctly confirms — `app/page.tsx:751-762` vs `:1082-1111`.
- **Invite revoke: immediate DELETE, no confirm, no success toast** — `app/team/page.tsx:240-246`.
- **Facebook disconnect: immediate on all three surfaces** — `app/accounts/page.tsx:188-197`, `app/settings/page.tsx:238-247`, `components/facebook-connection.tsx:180-195`.
- **Downloads record removal: no confirm, no feedback** — `app/downloads/page.tsx:801-809`.

**Fix:** one shared confirm pattern (dialog or two-step button, like the compose-pane delete) + `toast.success` after every destructive mutation. Feed delete in `app/sources/page.tsx:315-354` is the in-app gold standard.

### 2. Errors render as empty states on every page
A failed fetch shows "No stories/drafts/activity" — and on Dashboard, fake zero-filled stat cards that look like real data:

- `app/page.tsx:164-168, 767-777` (queue), `app/status/page.tsx:41-48, 207-224`, `app/dashboard/page.tsx:106-113, 233-293`, `app/calendar/page.tsx:60-64`, `app/settings/page.tsx:41` (`.catch(() => {})`), `app/analytics/page.tsx:84-88` (renders all-zero chart).
- Data layer too: `useManagedPages` swallows fetch failure (`components/publishing/publish-page.tsx:100-113`) → every publish button silently disables with "Posting to the connected Page." shown falsely.

**Fix:** a shared `<ErrorState onRetry>` component + route-level `error.tsx` boundaries. Every page's catch currently only fires a transient toast.

### 3. Stale-state bugs that corrupt the next submission
- Scheduling state persists after publish — second post silently goes out on the old schedule: `app/post/page.tsx:57-58`, `app/photos/page.tsx:105-109`.
- Geo-targeting JSON persists across video publishes: `app/videos/page.tsx:75-78`.
- Reels publish race: Publish is enabled while the file is still normalizing, and `setFile` swaps it mid-flight: `app/reels/page.tsx:41-72, 179-187`. Gate submit on `!normalizing`.
- After scheduling from the queue, the row keeps its old status until an unrelated refresh: `app/page.tsx:392-427` (call `await load()` like `publish()` does at `:501`).

### 4. One-line embarrassments
- `app/downloads/layout.tsx:5-6` — metadata describes a *different product* ("A local-first workspace for saving videos from YouTube…"). Leaks into the tab title.
- `app/sources/page.tsx:527` — `const isOwner = true;` with an apologetic comment; variable unused.
- `app/sources/page.tsx:469-472` — dead `handleDeleteFeed`.
- `app/dashboard/page.tsx:132` — dead `recent` computation.
- Dev-speak in user-facing toasts ("edit `.env.local`, restart the dev server") — `components/facebook-connection.tsx:50-52, 91-92`. Gate on `NODE_ENV`.

---

## P1 — Systemic design-system debt (the "polished" blockers)

### 5. No type scale — the biggest single blocker
Dozens of arbitrary sizes (`text-[9px]` … `text-[32px]`, plus `text-[1.65rem]`, `text-[2rem]`): 11 distinct sizes on Dashboard alone, ~23 in Analytics, densest cluster in `app/downloads/page.tsx`. Three eyebrow implementations (`.eyebrow` class vs hand-rolled `text-[9.5px] tracking-[0.13-0.15em]` on dashboard/calendar/accounts/team), three H1 treatments (`.page-title` 31px vs `text-4xl` in status vs `text-[32px]` in queue).

**Fix:** define named steps in `@theme` (e.g. `--text-micro: 11px`, `--text-caption: 12px`, `--text-body`, `--text-display`) and sweep. Floor body text at 11–12px. `.page-title` and `.eyebrow` everywhere.

### 6. Container widths: four systems
`max-w-[1680px]` (queue) vs `max-w-[1240px]` (dashboard/calendar/analytics/accounts/team/downloads) vs `max-w-[880px]` (sources/settings) vs `max-w-5xl` (status, all publishing flows). Define two: **wide** (data pages) and **narrow** (forms), as a `PageShell` component with a width prop.

### 7. Three competing surface patterns; the shared Card is used by nobody
- `.panel` class (shadowed): accounts, team
- Hand-rolled `rounded-xl border bg-card` (flat): analytics, settings, sources
- shadcn `Card` (components/ui/card.tsx): zero imports

Sibling pages visibly differ in elevation and radius. Also `ComposerCard` in publish-page.tsx is a fourth variant. **Pick one** (recommend `.panel` styling promoted into `Card`) and normalize. Same for radius: `rounded-[7px]` overrides appear on buttons/cards in 5+ files vs the Button's `rounded-lg`.

### 8. Status color system is fragmented and fails WCAG
- `status-pill.tsx:14-38` hardcodes `emerald-600/700`, `amber-600/700/500` while `--success`/`--warning` tokens exist — and Calendar uses a *third* palette for the same "published" status (`app/calendar/page.tsx:309-314`).
- "Drafted" = Facebook blue ≈ 3.6:1 on its own tint at 10px — fails AA on the most-repeated state signal in the app.
- `--faint #98a1ae` ≈ **2.7:1** is used for meaningful text: dashboard planned-channel gate (`:462,466`), 9px labels (`:356`), footer (`:510`), FieldLabel hints for *every field in every publishing flow* (`publish-page.tsx:184`). Darken to ≥4.5:1 or switch to `--muted-foreground`.
- Calendar out-of-month day numbers in `text-faint` (`app/calendar/page.tsx:291`).
- Downloads dark aside: `text-white/45` on `bg-[#171923]` ≈ 4:1 at 11px (`app/downloads/page.tsx:594-634`).

**Fix:** map every status to `--success/--warning/--info/--danger-soft`; add `--brand-strong: #8a4b0f` (currently hardcoded in 6+ files); add `--platform-*` tokens; stop using `--facebook` blue as a workflow color.

### 9. Selected/active & focus vocabulary splits
- Queue list selection = `bg-ink text-paper` dark pill; nav active = `bg-brand-soft text-[#8a4b0f]` (`app/page.tsx:598` vs `app-frame.tsx:315`).
- Focus rings: `ring-3 ring-ring/50` (Button/Input) vs hand-rolled `ring-2 ring-ring/40` (settings inputs, team revoke).
- Input heights: h-8 base, h-9 (sources), h-10 (login). Pick h-9.
- Border tokens: `border-input` vs `border-border` mixed.

### 10. Touch targets below 44px on primary controls
Back-to-queue `size-7` (28px) on mobile (`app/page.tsx:826`); photo-thumbnail remove ×≈ 14–16px (`app/photos/page.tsx:217-226`); filter chips ≈24px (`app/page.tsx:673`); Live copy buttons `size-3.5` icons (`app/live/page.tsx:189-199`); PageSelector rows ≈28px (`publish-page.tsx:277-290`); sources icon buttons 32px; accounts/team summary `grid-cols-3` with no mobile breakpoint (`accounts:152`, `team:134`).

---

## P2 — Component gaps (extract & reuse)

| Missing primitive | Evidence | Extract from |
|---|---|---|
| **Accessible Modal** | Sources' 3 hand-rolled dialogs: no `role="dialog"`, no focus trap, no Escape, no scroll lock (`app/sources/page.tsx:201, 279, 331`); assistant-chat dialog same (`components/assistant-chat.tsx:122-129`) | base-ui Dialog |
| **SegmentedTabs** | 3 divergent hand-rolled tab switchers (`photos:261-283`, `stories:85-106`), none with tablist semantics | Photos version + `aria-pressed` |
| **EmptyState** (icon + message + CTA + **error variant**) | Best: team `:254-262`, sources `:547-559`, downloads `:814-825`. Worst: error-as-empty everywhere | Team/Sources |
| **StatCard** | Dashboard `text-[30px]` vs Calendar `text-[24px]` for the same pattern | Dashboard |
| **FilePicker upgrade** | No drag-and-drop despite dashed dropzone styling; no size display; no upload progress — while Downloads has the gold-standard progress block (`downloads:536-589`) and inline URL validation (`:424-437`) nobody reuses | publish-page.tsx |
| **Confirm-destructive** | See P0-1 | compose-pane delete / sources delete dialog |
| **RefreshButton** | 3 flavors (queue `:576`, status `:116`, dashboard `:212`) | — |

### Calendar needs a rebuild of its interaction layer
`app/calendar/page.tsx:255-333`: the grid is entirely non-interactive divs (chips have only `title` tooltips — posts can't be opened or canceled from the grid), no `role="grid"` semantics (invisible to screen readers), no mobile agenda fallback (7 columns ≈ 46px cells at 375px), header controls don't wrap, "+N more" is an unreachable `<p>`. Make chips buttons, add grid roles or an accessible agenda list, and add a stacked agenda view under `lg`.

### Validation timing is inconsistent across publishing flows
Photos validates at pick ✅; Videos/Reels validate at submit (oversized 1 GB file uploads fully before failing); Stories never validates client-side; Live has **no Page targeting at all** and doesn't say which Page a stream lands on. ScheduleField's "10 min – 75 days" rule is copy-only — no `min`/`max` on the input (`publish-page.tsx:329-332`). ScheduleField's datetime has no accessible label (`:323-328`). ResultList isn't `aria-live` (`:354-396`).

---

## P3 — Polish & delight

- **Preview column everywhere:** Reels is the only flow with a live preview; `components/facebook-preview.tsx` exists and fits Post/Photos. Reels' `FinalReelPreview` is ~80% copy-paste of it with diverged details — extract a shared `FacebookPostShell`. Fake "PH" avatar doesn't derive from the real Page name (`final-reel-preview.tsx:42-43`).
- **Verb unification:** "Publish post / Publish video / Post reel / Publish story / Create stream" → one verb ("Publish") + one noun.
- **Terminology:** "Ready to review" (status) vs "Waiting for review" (dashboard); "Designed" badge for `PLANNED`; "cancelled/canceled/Canceled" three ways; "Live/Active" vs "Off/Not connected/Disabled" for connection states; "…" (settings:246) and `'...'` (sources:88) vs "…" everywhere else.
- **Login:** no `<h1>` on mobile (it's `hidden lg:flex` — `app/login/page.tsx:76`); `autoComplete="current-password"` even in signup mode (`:214` — should be `new-password`); invite-accept failure silently swallowed then navigates to dashboard (`:34-42`); no password visibility toggle; no already-signed-in redirect.
- **Micro-states:** calendar cancel uses neutral `toast(...)` while the rest of the app uses `toast.success`; story-queue rows lack `aria-current` and arrow-key navigation (`app/page.tsx:712-750`); the publish popover has no Escape/focus management (`:1114-1147`); assistant-chat message list needs `role="log" aria-live`; Live status badge shows *scheduled* streams in alarming destructive red (`live:348-356`); wrong `ImagePlus` icon on the video submit button (`videos:201`); char budget displayed as raw "63206" (`photos:305`).
- **Route-level `loading.tsx`:** none exist — every page flashes a client-side skeleton after hydration. The layout files are the natural home for shared chrome + boundaries.
- **Sonner:** `theme="system"` on a light-only app can render dark toasts (`components/ui/sonner.tsx:8`); force `theme="light"`.

---

## Recommended execution order

1. **P0 sweep (≈1 day):** destructive confirms everywhere, error states with retry, stale-state resets, reels race, metadata/dead-code one-liners.
2. **Token & scale pass (≈1–2 days):** type scale steps, `--brand-strong`, `--platform-*`, darken/retire `--faint`, status-color remap, `.eyebrow`/`.page-title` sweep, two container widths, one focus-ring vocabulary. This is 80% of the perceived "polish."
3. **Surface unification (≈1 day):** one card pattern, one RefreshButton, kill `rounded-[7px]` overrides, input h-9.
4. **Component extraction (≈2–3 days):** Modal, SegmentedTabs, EmptyState(+error), StatCard, FilePicker with drag-drop + progress (port Downloads' pattern), Confirm-destructive.
5. **Calendar interaction rebuild + publishing-flow contract (≈2 days):** interactive chips, mobile agenda, a11y semantics; codify the flow contract (submit-bar shape, at-pick validation, PageSelector, preview column) inside `PublishPage`.
6. **Microcopy + login + delight pass (≈1 day).**

After steps 1–3 the app reads as one product designed by one person; steps 4–5 make it feel engineered; step 6 makes it feel finished.
