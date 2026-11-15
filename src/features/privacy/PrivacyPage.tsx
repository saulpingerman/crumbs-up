import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card, Page, SectionTitle } from '@/components/Page'
import { cloudConfigured } from '@/lib/cloud/client'

const UPDATED = 'November 14, 2026'
const CONTACT = 'help@crumbs-up.com'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-soft [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </Card>
  )
}

/** The privacy policy, in plain words. Keep it true to what the app actually does. */
export function PrivacyPage() {
  return (
    <Page
      title="Privacy"
      kicker="The plain version"
      lede="What Crumbs Up keeps, where it keeps it, and what it never does."
      className="max-w-2xl"
      action={
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Settings
        </Link>
      }
    >
      <div className="space-y-5">
        <Section title="In short">
          <p>
            Your cookie journal lives on your own device.
            {cloudConfigured &&
              ' If you sign in, a copy is kept in your account so it can follow you between your phone and your computer. Your scores are also counted, without your name, in the app’s Top rated lists, unless you switch that off.'}
          </p>
          <p>
            <strong>There are no ads, no tracking, and nothing is sold.</strong>
          </p>
        </Section>

        <Section title="What is kept, and where">
          <p>
            <strong>On your device.</strong> Your ratings, notes, photos and settings are stored in
            your browser.{' '}
            {cloudConfigured ? 'Without an account, they never leave it.' : 'They never leave it.'}
          </p>
          {cloudConfigured && (
            <>
              <p>
                <strong>In your account, if you sign in.</strong> Signing in is optional. If you do,
                these are stored so the app can sync them:
              </p>
              <ul>
                <li>
                  your email address, and a password if you chose one (stored scrambled, never
                  readable)
                </li>
                <li>
                  if you sign in with Google or Apple: the name, email address and profile picture
                  they pass along
                </li>
                <li>
                  your journal: each cookie’s details, scores, notes and photos, and the spot on the
                  map where you pinned its bakery, if you did
                </li>
              </ul>
              <p>
                Accounts are hosted by Supabase, on servers in the United States. Your journal is
                private to your account: nobody else using the app can see it.
              </p>
              <p>
                <strong>Top rated.</strong> What other people can see is the Top rated lists, which
                add everyone’s scores together: for each cookie at each bakery, the town it is in,
                how many people rated it, and their average scores. Your scores are part of those
                totals while you are signed in, unless you switch it off on the Account page. The
                totals never include your name or email, your notes, your photos, or when you rated
                something. Where only one person has rated a cookie, its total is that person’s
                scores, still with nothing to say whose they are.
              </p>
            </>
          )}
        </Section>

        <Section title="When the app goes online">
          <p>A few features fetch things from other services. None of them is sent your ratings.</p>
          <ul>
            <li>
              <strong>The street map</strong> loads its map pictures from OpenFreeMap, which sees
              the area you are looking at.
            </li>
            <li>
              <strong>Finding a bakery</strong> by name asks Photon (built on OpenStreetMap), which
              sees what you typed and the town you entered. The map also asks it for bakeries you
              haven’t tried, by itself, whenever you stop on a close-up view or pick a county or a
              state: it sees the area the map is showing, or the county or state, which is your own
              area if you centred the map on yourself. You can switch both off in Settings.
            </li>
            <li>
              <strong>Your location</strong> is only read when you tap a button for it. In the
              rating form it is used on your device to fill in the town, and the spot is saved with
              that cookie so it can be shown on your map
              {cloudConfigured && '; like the rest of the journal, it syncs if you are signed in'}.
            </li>
            <li>
              <strong>Cutting the cookie out of a photo</strong> happens on your device. The first
              time, the app downloads the tools for it from Google’s servers; your photos are not
              uploaded to do it.
            </li>
            {cloudConfigured && (
              <li>
                <strong>Signing in.</strong> Opening the sign-in form, or using the app while signed
                in, contacts the account service (Supabase). The sign-in form also loads Google’s
                “Continue with Google” button from Google, which can see that the form was opened.
                Signing in with Google or Apple tells that company you signed in to Crumbs Up.
              </li>
            )}
            <li>
              <strong>Loading the app itself.</strong> Like any website, the company hosting it can
              see the internet address of devices that load it.
            </li>
          </ul>
        </Section>

        <Section title="Your choices">
          <ul>
            {cloudConfigured && (
              <li>
                <strong>Use it without an account.</strong> Everything works; nothing is stored
                anywhere but your device.
              </li>
            )}
            <li>
              <strong>Take a copy.</strong> Settings → Back up journal saves everything, photos
              included, as a file you keep.
            </li>
            {cloudConfigured && (
              <li>
                <strong>Stay out of Top rated.</strong> Account → Count my ratings in Top rated.
                Switched off, your scores are left out of every total.
              </li>
            )}
            {cloudConfigured && (
              <li>
                <strong>Sign out</strong> and, if you like, remove the journal from that device.
              </li>
            )}
            <li>
              <strong>Delete your journal.</strong> Settings → Delete everything removes it from
              this device
              {cloudConfigured &&
                ' and, if you are signed in, from your account and your other devices'}
              .
            </li>
            {cloudConfigured && (
              <li>
                <strong>Delete your account.</strong> Account → Delete account removes the account
                and everything kept in it, straight away.
              </li>
            )}
          </ul>
        </Section>

        <Section title="The rest">
          <p>Crumbs Up is not meant for children under 13.</p>
          <p>If this page changes, the date here changes with it. Last updated {UPDATED}.</p>
          <p>
            Questions, or want something removed? Write to{' '}
            <a
              href={`mailto:${CONTACT}`}
              className="font-semibold text-crust underline underline-offset-4"
            >
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </Page>
  )
}
