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

The README has always pointed at [Capacitor](https://capacitorjs.com) for this: wrap the built
site (`dist/`) in a native shell. Decisions and traps found so far (check each against current
docs; none of this has been built yet):

- **Bundle id** `com.crumbsup.app`, the same App ID as step 1.
- **Signing in inside the app.** Google refuses its sign-in pages inside an app's web view
  (`disallowed_useragent`), and the redirect flow can't come back into the app without deep
  links. The clean route is native sign-in plugins that return an ID token:
  - Google: a native Google Sign-In plugin (needs an iOS OAuth client in Google Cloud, whose id
    is added to Supabase's Google provider as an authorized client id) → the existing
    `signInWithGoogleToken(token, nonce)`.
  - Apple: native Sign in with Apple → `signInWithIdToken({ provider: 'apple', token, nonce })`;
    add the App ID `com.crumbsup.app` to Supabase's Apple Client IDs, **after** the Services ID.
  - Email and password with codes works inside the app as it is.
- **App Review rules to plan for:** an app with Google sign-in must also offer Sign in with
  Apple (or a similar private option), so step 1 and native Apple sign-in come first. Apps
  with accounts must let people delete them in the app: already there (Account → Delete
  account). Apps that are "just a website" can be rejected under minimum functionality; the
  camera, the on-device cut-out and offline use are the native-feeling parts to lean on. Check
  the current App Store Review Guidelines before submitting.
- **Service worker:** inside the app the files are bundled, so the PWA service worker isn't
  needed, and WKWebView only allows service workers in limited cases. Plan to skip
  registration on native (`Capacitor.isNativePlatform()`) and make `UpdatePrompt` do nothing
  there; app updates come through the App Store.
- **Permissions (Info.plist):** camera (`NSCameraUsageDescription`), photo library
  (`NSPhotoLibraryUsageDescription`), location when in use
  (`NSLocationWhenInUseUsageDescription`, for "Use my location").
- **Origin:** Capacitor serves from `capacitor://localhost`. The http→https script in
  `index.html` only acts on `http:`, so it leaves that alone. Supabase sync and storage work
  from any origin; OAuth redirects are the only part that cares, and native sign-in avoids
  them.
- **Cookie finder:** downloads its models from `storage.googleapis.com` on first use, as on the
  web. Already safe for web-view user agents (see the PR #31 fix).
- **"Open in the app" on the website:** once the app has an App Store id, add
  `<meta name="apple-itunes-app" content="app-id=…">` to `index.html` for Safari's banner.
  This replaces the old "Add to Home Screen" hint, which was removed at the owner's request.
- **Then:** TestFlight build for the owner to try, App Store listing (screenshots: `docs/` has
  some from the web app), privacy details matching the privacy page, submit.

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
