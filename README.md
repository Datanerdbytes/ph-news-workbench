This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Facebook Page OAuth

The Connect chip in the masthead runs a Facebook Login handshake and stores one Page connection per desk account.

1. Create an app at [developers.facebook.com/apps](https://developers.facebook.com/apps) (type: Business).
2. Add the **Facebook Login** product and register this **Valid OAuth Redirect URI**:
   `http://localhost:3000/api/facebook/callback`
3. Request `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`,
   plus `business_management` — without it `/me/accounts` omits Pages that belong
   to a Business portfolio, and `pages_manage_posts` must be enabled on the app's
   Pages use case before the login dialog offers it.
4. In the login dialog, opt in to all Pages (and all Businesses) when asked.
5. Add the Facebook variables from `.env.example` to `.env.local`:
   `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and optionally `FACEBOOK_GRAPH_VERSION`
   (defaults to `v23.0`). Set `FACEBOOK_PAGE_ID` to pin a Page when the login
   manages several, or `FACEBOOK_REDIRECT_URI` to override the callback URL.
6. Restart `npm run dev`.
7. While the Meta app is in Development mode, only app Admins, Developers, and
   Testers can authorize it. Add your account under App roles, or switch the app
   to Live.

The callback exchanges the code for a long-lived user token, takes the Page
token, encrypts it with AES-256-GCM using a key derived from
`BETTER_AUTH_SECRET`, and writes it to `facebook_connections`. The raw token is
never returned to the browser. Rotating `BETTER_AUTH_SECRET` makes stored
tokens unreadable, so reconnect the Page afterwards.

A Page connected before publishing existed does not carry
`pages_manage_posts`; reconnect it so Publish can post on your behalf. When the
draft has an attached image, it is uploaded with the post. Facebook posts are
plain text, so Markdown is stripped on the way out; the preview and Copy button
show the same plain-text version.

## Image editing

Generation uses the NVIDIA NIM endpoint. Editing needs a provider that exposes an
edits endpoint — the hosted NVIDIA API does not — so set `OPENAI_API_KEY` to use
OpenAI's `gpt-image-1`.

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
   `gpt-image-1` needs a paid account with billing enabled, and some accounts must
   complete organization verification first.
2. Add `OPENAI_API_KEY=...` to `.env.local` and restart `npm run dev`.
3. Upload an image in the Image studio: it attaches to the Facebook preview
   immediately. **Edit upload** replaces that attachment with the edited result.

Without a key, uploads still attach to the post; editing reports that no editing
provider is configured.

## Video downloads

The Downloads page queues video jobs in the shared database; a local worker on
your Mac runs yt-dlp and uploads the finished file to Vercel Blob, so downloads
work from both the live app and local development.

Install it once as a macOS LaunchAgent so queued downloads are picked up
automatically — it starts at login and restarts if it crashes:

```bash
npm run worker:install
```

Or run it manually in a terminal (and keep it open while you download):

```bash
npm run worker
```

It needs `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` in `.env.local`, plus yt-dlp
in the Python environment at `~/python-project/Projects/YT_DLP/my_venv` (override
with `YTDLP_PYTHON`). Check on the installed agent with
`scripts/install-download-worker.sh --status`; logs land in
`~/Library/Logs/ph-news-workbench-download-worker.log`. Videos save to
`~/Downloads/VideoDownloader/<platform>/<job-id>` (override with
`VIDEO_DOWNLOADER_ROOT`) and then sync to the workspace's cloud library, where
the live app previews and serves them.

The worker runs up to two downloads at once. Ctrl+C requeues anything active;
jobs whose worker stops heartbeating for three minutes are requeued
automatically, up to three attempts.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
