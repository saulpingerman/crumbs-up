# The App Store listing

Everything App Store Connect asks for, ready to paste. The screenshots in this folder are the
6.9-inch iPhone size (1320 × 2868), which covers every iPhone. To make them again after the app
changes: `node scripts/app-store-screenshots.mjs`.

## Getting a build up

1. **Xcode → Settings → Accounts → +**, and sign in with the Apple developer account.
2. **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +** → App IDs →
   App. Description `Crumbs Up`, Bundle ID **Explicit** `com.crumbsup.app`. Tick **Sign in with
   Apple** too (the website will use it later).
3. **appstoreconnect.apple.com → Apps → + → New App.** iOS, name `Crumbs Up`, English (U.S.),
   bundle ID `com.crumbsup.app`, SKU `crumbsup`, full access. If the name is taken, try
   `Crumbs Up: Cookie Ratings`.
4. `scripts/ios-release.sh TEAMID` builds, signs and uploads. The Team ID is on
   developer.apple.com → Membership. Build numbers count up by themselves.
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

**Sign-in required:** No.

**Notes:**

> Everything works without an account. To try accounts: Sign in → Create account; a 6-digit code
> is emailed. Account → Delete account removes it. The first time a photo is added, the app
> downloads the files that find the cookie in it (about 40 MB); after that it works offline.
> The Top rated lists show cookie and bakery names with averaged scores. There are no profiles,
> messages or comments.
