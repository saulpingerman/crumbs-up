# Hand-over: where Crumbs Up stands, and what comes next

Written 15 November 2026, at `main` = merge of PR #31. Earlier work was done in a cloud session
that couldn't build iPhone apps; this picks up on a Mac, where Xcode is.

## What is live

| Piece                             | Where                                               | Notes                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app                           | https://crumbs-up.com                               | GitHub Pages, deployed on every merge to `main`. "Enforce HTTPS" is on.                                                                                                                             |
| Domain and DNS                    | Cloudflare                                          | Records for GitHub Pages, Cloudflare Email Routing (`help@crumbs-up.com` forwards to the owner), Resend's sending records, and `_dmarc` (`v=DMARC1; p=none;`). Records are "DNS only", not proxied. |
| Accounts, sync, photos, Top rated | Supabase project `sbukbjxejpuysmsnpwka`             | Migrations 1–4 in `supabase/migrations/` have all been run on the live project.                                                                                                                     |
| Account email                     | Resend, as SMTP for Supabase                        | Sends from `Crumbs Up <help@crumbs-up.com>`.                                                                                                                                                        |
| Google sign-in                    | Google Cloud OAuth client (id in `.env.production`) | Google's own sign-in box first, Supabase's redirect flow as the fallback. Origins and redirect URLs include `https://crumbs-up.com`.                                                                |
| Apple sign-in                     | Not set up yet                                      | The owner now has an Apple developer account. See step 1 below.                                                                                                                                     |

Settings that live only in dashboards (nothing in the repo changes them):

- **Supabase → Authentication → URL Configuration:** Site URL `https://crumbs-up.com/`, plus
  `https://crumbs-up.com/**` in Redirect URLs.
- **Supabase → Authentication → Emails:** custom SMTP (Resend) on, "Confirm email" on, and the
  "Confirm signup" and "Reset password" templates replaced with the ones in
  `supabase/templates/` (subject `{{ .Token }} is your Crumbs Up code`).
- **Supabase → Google provider:** on, with the client id and secret.

## How sign-in works now

- **Email and password:** "Create account" and "Forgot password?" each have their own page
  (`/account/new`, `/account/reset`). Both send a 6-digit code by email that is typed into the
  app; the emails carry no link, so strict mail filters are less likely to hold them. Code:
  `src/features/account/`, `src/lib/cloud/session.ts` (`confirmCode`, `sendCodeAgain`).
- **Google:** `src/features/account/GoogleButton.tsx` gets an ID token from Google's box and
  hands it to `signInWithGoogleToken(token, nonce)` in `session.ts`, which calls Supabase's
  `signInWithIdToken`. **The iPhone app can reuse this exactly** (see step 2).
- **The header** has one button: "Sign in", which reads "Account" once signed in. It opens
  `/account`, which is the Settings page with the account card on top (`/settings` shows the
  same page).

## Recent fixes worth knowing about

- **Cookie finder in Chrome on iPhone** (PR #31): MediaPipe reads the user agent to decide
  whether a worker can have an `OffscreenCanvas`, and anything that says "Safari" without
  "Version/17+" crashed with `document is not defined`. Each MediaPipe task is now given its
  own canvas. A web view inside an iPhone app has the same kind of user agent, so this matters
  for step 2 too. A browser test runs the cut-out with Chrome-on-iPhone's user agent.
- **Old copies of the app getting stuck** (PR #30): the service worker is now `autoUpdate` and
  the page reloads into a new version by itself, except on the rating screens, where it waits
  until they are left.
- **Plain http** (PR #28): `index.html` moves `http:` visits to `https:`; new cookie ids no
  longer need `crypto.randomUUID`.
- **Error detail** (PR #29): when the cookie finder or a save fails, a small grey line under
  the message says which step failed and the error. Ask for a screenshot of it.
- **Top rated** counts everyone with an account. There is no opt-out switch (the owner's call),
  and the privacy page says so.

## Feedback

The app's Settings has "Report a bug or suggest an idea", which opens `/feedback` (Bug, Idea or
Other, a message, and an optional reply address). Reports go into the `feedback` table
(`supabase/migrations/20261116000000_feedback.sql`): anyone can add one, nobody can read them back
through the app. Read them in Supabase → Table Editor → feedback. Where the app can't send one
(no account service, offline), it offers the same report as an email to `help@crumbs-up.com`.

Each report is also emailed to `help@crumbs-up.com` from `feedback@crumbs-up.com`, with Reply-To
set to the sender's address when they gave one
(`supabase/migrations/20261117000000_feedback_email.sql`). A trigger calls Resend's API through
`pg_net`; the Resend key ("Sending access") lives in Supabase Vault as `resend_feedback_key`,
pasted in by the owner, never in the repo. Without the key, or after 30 reports in an hour,
reports are kept but not emailed, and a failed email never stops a report being saved. If emails
stop, the SQL Editor shows Resend's answers:
`select status_code, content from net._http_response order by created desc limit 5;`
`scripts/check-feedback-email.sh` checks all this against the local stack (CI runs it).

## Known loose ends

- **School and work addresses** (Penn State in particular) hold the code emails even though
  Resend delivers them. The domain was registered on 14 November 2026, and new domains are
  treated with suspicion; it should ease over a few weeks. Gmail works. Google sign-in is the
  way round it meanwhile.
- **The owner's Chrome on iPhone** still shows "This device holds a different account's
  journal": that copy of the journal belonged to an account they deleted. It is working as
  designed; they need to pick "Add its cookies to this account" or "Replace this device's
  journal".
- **Smaller review items, not done:** some tap targets are small; arrow keys don't move between
  answer options on a desktop; the welcome screen has no "Sign in" link; "Change the
  weighting" from a rating leaves the rating; a toast can cover the back arrow.

## Next steps

### 1. Sign in with Apple, on the website (do this first)

The app already shows "Continue with Apple" by itself once the Apple provider is switched on in
Supabase (`src/lib/cloud/providers.ts` asks the project which providers are on). It needs the
owner, at a computer, in the Apple Developer site:

1. **App ID** `com.crumbsup.app` with **Sign in with Apple** ticked. The iPhone app will use the
   same id.
2. **Services ID** `com.crumbsup.web`, Sign in with Apple on, primary App ID as above.
   Domain: `sbukbjxejpuysmsnpwka.supabase.co`. Return URL:
   `https://sbukbjxejpuysmsnpwka.supabase.co/auth/v1/callback`.
3. **Key** with Sign in with Apple; download the `.p8` once and keep it safe.
4. **Supabase → Authentication → Providers → Apple:** on, `com.crumbsup.web` **first** in Client
   IDs, and a client secret made with the generator on that page (Team ID, Key ID, `.p8`; the
   generator doesn't work in Safari).
5. Apple makes that secret expire: it has to be regenerated **every 6 months** from the same
   `.p8`, or Apple sign-in stops working. Worth a calendar reminder.

Then check the button appears on https://crumbs-up.com/account and a sign-in completes.
Supabase's guide: https://supabase.com/docs/guides/auth/social-login/auth-apple

### 2. The iPhone app

Built with [Capacitor](https://capacitorjs.com): the built site (`dist/`) in a native shell,
`ios/App`, bundle id `com.crumbsup.app`. Checked in the simulator (Xcode 27.2): it opens, and the
cookie finder works inside it (finds the cookie in the test photo, none in the photo without
one). The app exists in App Store Connect ("Crumbs Up", team `34AL6NWG29`), and build 1.0 was
uploaded on 15 November 2026.

- **Sending a build:** `scripts/ios-release.sh 34AL6NWG29` builds the site, archives, signs and
  uploads to App Store Connect; build numbers count up by themselves. Xcode must be signed in to
  the developer account, and the app must exist in App Store Connect.
- **The listing**, App Privacy answers, review notes and screenshots are in
  [`docs/app-store/`](app-store/README.md), with the steps for the owner.
- **Signing in inside the app** is email and password only: the Google and Apple buttons are
  hidden there (`src/lib/cloud/providers.ts`), because Google refuses its sign-in pages inside an
  app's web view. With no third-party sign-in, App Review doesn't require Sign in with Apple. To
  add them later, use native plugins that return an ID token (an iOS OAuth client for Google; the
  App ID added to Supabase's Apple Client IDs, after the Services ID).
- **No service worker** in the app: `UpdatePrompt` isn't rendered there, so nothing registers
  one. App updates come through the App Store.
- **Once it has an App Store id:** add `<meta name="apple-itunes-app" content="app-id=…">` to
  `index.html` for Safari's "Open in the app" banner.

### 3. Later

- Google Play, the same way, if wanted.
- Import of the owner's old ratings from a spreadsheet (asked for earlier, not started).
- The smaller review items above.

## Running it on the Mac

```bash
npm ci
npm run dev                      # the app, without accounts
npx playwright install chromium  # once, for the browser tests
npx supabase start               # needs Docker Desktop; for account and sync work
npm run dev:cloud                # the app against the local Supabase
```
