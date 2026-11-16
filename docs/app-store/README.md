# The App Store listing

Everything App Store Connect asks for, ready to paste. The screenshots in this folder are the
size App Store Connect requires, "iPhone with Dynamic Island (medium display)", 1206 × 2622.
Apple scales them for the other iPhone sizes. (The large size, 1320 × 2868, was turned away by
that box in November 2026.) To make them again after the app
changes: `node scripts/app-store-screenshots.mjs`.

## Getting a build up

Steps 1–3 were done on 15 November 2026, and the first build (1.0) was uploaded that day.

1. **Xcode → Settings → Accounts → +**, and sign in with the Apple developer account (team
   `34AL6NWG29`).
2. **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +** → App IDs →
   App. Description `Crumbs Up`, Bundle ID **Explicit** `com.crumbsup.app`, with **Sign in with
   Apple** ticked (the website will use it later).
3. **appstoreconnect.apple.com → Apps → + → New App.** iOS, name `Crumbs Up`, English (U.S.),
   bundle ID `com.crumbsup.app`, SKU `crumbsup`, full access.
4. `scripts/ios-release.sh 34AL6NWG29` builds, signs and uploads. Build numbers count up by
   themselves. No iPhone needs registering: the archive is signed for the App Store only.
5. **TestFlight** (in App Store Connect), once Apple has processed the build: Internal Testing →
   add a group with yourself in it, then install with the TestFlight app on the iPhone.

## The listing

**Name:** Crumbs Up

**Subtitle** (30 at most): Rate cookies, find the best

**Category:** Food & Drink. Second: Lifestyle.

**Promotional text:**

> Give every cookie a number out of 10 for looks, texture and taste, and keep them all in one
> place.

**Description:**

> Crumbs Up is a journal for every cookie you eat.
>
> Take a photo, give the cookie a number out of 10 for how it looks, its texture and its taste,
> and it gets an overall score. Each number comes with words, so a 7 means the same thing every
> time.
>
> • Keep every cookie in one place, with its photo, notes, price and where you bought it
> • Rank them all, or by taste, texture or looks alone
> • Choose what counts most in the overall score, and every cookie is re-scored at once
> • See where you've been on a map of bakeries, towns, counties and states
> • Find the top rated cookies near you, from everyone's scores
> • Lift the cookie out of your photo with one tap. It happens on your phone.
> • Works offline, and without an account
>
> An account is optional. Sign in to keep your journal in step between your phone and your
> computer. No ads and no tracking.

**Keywords:** `cookie,cookies,bakery,bakeries,dessert,rating,review,journal,food,baking,sweets,treats,score,map`

**Support URL:** https://crumbs-up.com/feedback

**Marketing URL:** https://crumbs-up.com

**Privacy Policy URL:** https://crumbs-up.com/privacy

**Copyright:** 2026 and your name

**Price:** Free

**Age rating:** answer None / No to everything, which gives 4+.

## App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

Each of these is **linked to the user**, **not used for tracking**, and used only for **App
Functionality**. (Without an account nothing leaves the phone; these are what an account keeps.)

| Type                              | Why                                                     |
| --------------------------------- | ------------------------------------------------------- |
| Contact Info → Email Address      | The account, and a reply address on feedback if given   |
| Location → Precise Location       | The bakery's spot, saved with a cookie when it's pinned |
| User Content → Photos or Videos   | Cookie photos kept in the account                       |
| User Content → Customer Support   | Feedback messages                                       |
| User Content → Other User Content | Scores, notes and cookie details                        |
| Identifiers → User ID             | The account's id                                        |

## App Review information

Apple asked for more on 16 November 2026 (Guideline 2.1, Information Needed). Everything below
goes in App Store Connect → the version → **App Review Information**.

**Sign-in information:** leave "Sign-in required" unticked; the app works without an account. The
demo account goes in the Notes. Make it in Supabase → Authentication → Users → Add user, with
"Auto Confirm User" on, then sign in with it on a phone and rate two or three cookies so its
journal isn't empty.

**Attachment:** the screen recording (see below).

**Notes** (paste as is, filling in the two blanks):

> Crumbs Up is a cookie-rating journal. People who like trying cookies at bakeries photograph a
> cookie, give it a score for taste, texture and appearance, and keep a journal of everything
> they've tried. It solves "which was the good one, and where?": the journal, a map of bakeries,
> suggestions of what to try next, and Top rated (everyone's scores added up per cookie) make it
> easy to remember favorites and find new ones. It's for anyone who enjoys cookies; there is
> nothing to buy.
>
> Getting started: no account is needed. Tap + to rate a cookie: add a photo (the app finds the
> cookie in it and cuts it out, on the device), type the cookie and bakery, give the three scores
> and save. The first photo downloads the cut-out model files (about 40 MB) once.
>
> Accounts (optional, to back the journal up and sync it between devices): tap Sign in → Create
> account, enter an email and a password twice, then the 6-digit code that is emailed. Demo
> account: ________ / ________ (already confirmed, with cookies in its journal). Account → Delete
> account… deletes the account and everything in it, at once.
>
> User-generated content: the only thing one person sees from others is Top rated (Discover → Top
> rated), which lists cookie, bakery and town names with averaged scores. There are no profiles,
> names of people, messages, comments or photos from others. Every entry has a flag button:
> "Report and hide" sends a report to us and hides it at once; "Just hide it" hides it.
> Names containing offensive words are filtered out automatically, and reported entries are
> removed for everyone, usually within a day. Feedback and reports can also be sent from Settings
> → Report a bug or suggest an idea, or to help@crumbs-up.com.
>
> External services: Supabase (accounts, sync and the Top rated totals; servers in the United
> States), Resend (sends the sign-up and password codes), OpenStreetMap data through Photon
> (photon.komoot.io, bakery and town search) and OpenFreeMap (map tiles). Finding the cookie in
> a photo uses Google's MediaPipe machine-learning models, downloaded once from Google and run on
> the device; photos are never uploaded for it. No payments or advertising.
>
> Regions: the app works the same in every region. Bakery search and the county and state maps
> cover the United States; outside it, cookies can still be rated and kept in the journal.
>
> No regulated industry or third-party protected material.

**The screen recording**, on an iPhone running the latest iOS, from the newest TestFlight build
(Settings → Control Center → Screen Recording). Start on the Home Screen and keep it to about
three minutes:

1. Tap the Crumbs Up icon to open the app.
2. Tap + : choose a photo, let the cookie be cut out, type the cookie and bakery (pick the
   bakery from the list), give the three scores, save. The cookie's page opens.
3. The journal, the map (tap a bakery; the heart saves it to Want to go), Discover → For you →
   Top rated → Want to go.
4. In Top rated, tap the flag on an entry → Report and hide, then "Show 1 hidden entry".
5. Sign in → Create account: email, password twice, the code from the email; signed in.
6. Sign out, then sign in again with the same account.
7. Account → Delete account… → confirm.
8. Settings → Report a bug or suggest an idea.
