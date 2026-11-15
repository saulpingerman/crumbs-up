# Crumbs Up: notes for Claude

A cookie-rating app, live at https://crumbs-up.com. Local-first PWA (Vite, React, TypeScript,
Tailwind, Dexie) with optional Supabase accounts and sync. The README explains the product and
the code; **docs/HANDOFF.md** has the current state of things and what to do next. Read both
before starting.

## Working here

- **Checks before any PR:** `npm run lint`, `npm run typecheck`, `npm run format:check`,
  `npm test`, `npm run test:e2e`. Anything touching accounts or sync also needs the local
  Supabase stack (Docker): `npx supabase start`, then `npm run test:cloud` and
  `npm run test:e2e:cloud`. Its ports are 24320–24329; emails it "sends" land in Mailpit at
  http://127.0.0.1:24324.
- **Shipping:** every merge to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).
  CI (`ci.yml`, jobs `check` and `accounts`) must be green first. The owner has said PRs can be
  merged without asking. One branch, one PR at a time; never force-push.
- **Database changes** go in a new file in `supabase/migrations/`; never edit one that has been
  applied. The live project is not linked to the CLI: the owner pastes new migrations into the
  Supabase SQL Editor, so hand them the SQL and say so.
- **Email wording** lives in `supabase/templates/` and `supabase/config.toml` for the local
  stack. The live project's copies are pasted by hand into Supabase → Authentication → Emails →
  Templates, so a change there needs the owner too.
- **Secrets never go in the repo.** `.env.production` holds only public values (Supabase URL
  and publishable key, Google OAuth client id).

## Writing for the owner and in the app

- The owner reads on a phone: short answers, plain words, the result first.
- On-screen text must not read as machine-written. No long dashes (—) in UI strings, no
  explanatory filler or captions that restate the obvious. They will ask for it to be removed.
- Areas default to towns and counties, not states.

## Things that bit before

- The cookie finder runs MediaPipe in a module worker. Always give each MediaPipe task its own
  `OffscreenCanvas` through the `canvas` option: left to itself, MediaPipe sniffs the user agent
  and crashes in any WebKit browser without "Version/" in its name (Chrome on iOS, app web
  views).
- The service worker is `autoUpdate`; `src/app/UpdatePrompt.tsx` reloads into a new version
  unless the person is on `/rate`.
- `index.html` moves any `http:` visit (other than localhost or an IP) to `https:` before
  anything runs; the app needs a secure page.
