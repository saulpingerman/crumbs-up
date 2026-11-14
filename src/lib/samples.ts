/**
 * Demo cookies for a first look around. Everything here is invented — the
 * bakeries are fictional — and every record is flagged `sample` so the whole
 * batch can be removed in one tap. None of them has a photo, so they also
 * show off the illustrations the app draws from a cookie's type and review.
 * This module is loaded on demand so it costs nothing until it is asked for.
 */
import { saveCookie, type SaveCookieInput } from '@/lib/db/cookies'
import { db } from '@/lib/db/db'
import { todayIso } from '@/lib/format'
import { QUESTIONS, assessAll, type Answers, type Category, type Scores } from '@/lib/rubric'

/* ------------------------------- Cookies -------------------------------- */

interface Sample {
  cookieType: string
  bakery: string
  city: string
  state: string
  price: number
  daysAgo: number
  notes: string
  /** Rung (1–6) chosen for each scored question, in rubric order. */
  taste: number[]
  texture: number[]
  appearance: number[]
  style: 'gooey' | 'chewy' | 'contrast' | 'crisp' | 'cakey' | 'sandy'
  flaws?: string[]
  nudge?: Partial<Scores>
}

const SAMPLES: Sample[] = [
  {
    cookieType: 'Brown Butter Chocolate Chip',
    bakery: 'Butter & Ember',
    city: 'Portland',
    state: 'OR',
    price: 4.75,
    daysAgo: 6,
    notes:
      'Still warm at 9am. Toffee edges, three kinds of chocolate, and flaky salt that makes the whole thing sing. The one to beat.',
    taste: [6, 5, 6, 5, 6],
    texture: [6, 5, 6, 5, 6],
    appearance: [5, 5, 5, 6, 6],
    style: 'contrast',
  },
  {
    cookieType: 'Snickerdoodle',
    bakery: 'Half Moon Bakehouse',
    city: 'Santa Fe',
    state: 'NM',
    price: 3.5,
    daysAgo: 19,
    notes: 'Tangy, proper cinnamon crust, soft all the way through. Looks plain, eats beautifully.',
    taste: [5, 5, 4, 5, 5],
    texture: [5, 5, 4, 5, 4],
    appearance: [4, 4, 4, 4, 7],
    style: 'chewy',
  },
  {
    cookieType: 'Oatmeal Raisin',
    bakery: 'The Proofing Room',
    city: 'Madison',
    state: 'WI',
    price: 3.25,
    daysAgo: 33,
    notes: 'Plump raisins and plenty of oats, but baked a touch long — dry around the rim.',
    taste: [4, 4, 4, 4, 3],
    texture: [3, 2, 4, 3, 3],
    appearance: [4, 3, 4, 4, 4],
    style: 'chewy',
    flaws: ['bite.flaw.dry'],
  },
  {
    cookieType: 'Double Chocolate',
    bakery: 'Salt Flat Bakery',
    city: 'Salt Lake City',
    state: 'UT',
    price: 4.25,
    daysAgo: 47,
    notes:
      'Like the corner piece of a brownie. Deep cocoa, molten middle, almost too rich. Almost.',
    taste: [5, 4, 5, 6, 5],
    texture: [5, 5, 4, 5, 5],
    appearance: [5, 4, 4, 5, 5],
    style: 'gooey',
  },
  {
    cookieType: 'Birthday Cake',
    bakery: 'Sunday Sugar',
    city: 'Austin',
    state: 'TX',
    price: 5,
    daysAgo: 58,
    notes: 'Gorgeous in the case. Tastes mostly of sugar and imitation vanilla — all show.',
    taste: [2, 2, 2, 3, 2],
    texture: [3, 4, 3, 3, 4],
    appearance: [6, 4, 5, 5, 6],
    style: 'cakey',
    flaws: ['taste.flaw.artificial'],
  },
  {
    cookieType: 'Molasses Ginger',
    bakery: 'Little Owl Baking Co.',
    city: 'Burlington',
    state: 'VT',
    price: 3.75,
    daysAgo: 74,
    notes:
      'Real bite from fresh ginger, sparkling sugar crust, chew for days. A cold-weather classic done right.',
    taste: [5, 5, 5, 6, 5],
    texture: [6, 5, 4, 5, 5],
    appearance: [5, 5, 5, 6, 7],
    style: 'chewy',
  },
  {
    cookieType: 'Chocolate Chip',
    bakery: 'Corner Mart Bakery Case',
    city: 'Columbus',
    state: 'OH',
    price: 2,
    daysAgo: 90,
    notes: 'The baseline. This is what a 5 tastes like: perfectly fine, instantly forgotten.',
    taste: [3, 3, 3, 3, 3],
    texture: [3, 3, 3, 3, 3],
    appearance: [3, 3, 3, 3, 3],
    style: 'chewy',
  },
  {
    cookieType: 'White Chocolate Macadamia',
    bakery: 'Driftwood Ovens',
    city: 'Charleston',
    state: 'SC',
    price: 4.5,
    daysAgo: 104,
    notes: 'Toasted, buttery macadamias. Sweet, but the browned edges keep it honest.',
    taste: [4, 4, 5, 5, 4],
    texture: [5, 4, 5, 4, 4],
    appearance: [4, 5, 4, 4, 5],
    style: 'contrast',
  },
  {
    cookieType: 'Peanut Butter',
    bakery: 'Butter & Ember',
    city: 'Portland',
    state: 'OR',
    price: 4,
    daysAgo: 121,
    notes:
      'Sandy and rich, roasted-peanut flavor front and center. A little greasy by the last bite.',
    taste: [4, 4, 5, 6, 4],
    texture: [5, 4, 3, 3, 4],
    appearance: [4, 4, 4, 4, 7],
    style: 'sandy',
    flaws: ['bite.flaw.greasy'],
    nudge: { taste: 0.5 },
  },
  {
    cookieType: 'Lemon Crinkle',
    bakery: 'Tin Roof Sweets',
    city: 'Asheville',
    state: 'NC',
    price: 3.5,
    daysAgo: 139,
    notes: 'Bright and zesty with a soft, cake-like middle. Pretty, but a bit one-note.',
    taste: [3, 4, 4, 5, 3],
    texture: [4, 4, 3, 4, 4],
    appearance: [5, 4, 4, 5, 7],
    style: 'cakey',
  },
]

function answersFor(sample: Sample): Answers {
  const answers: Answers = { 'bite.style': `bite.style.${sample.style}` }
  const fill = (category: Category, rungs: number[]) => {
    const scored = QUESTIONS[category].filter((q) => q.kind === 'scale')
    scored.forEach((q, i) => {
      const rung = rungs[i] ?? 3
      // Rung 7 stands for the question's "doesn't apply" option.
      answers[q.id] = rung === 7 ? `${q.id}.na` : `${q.id}.${rung}`
    })
    const flawQuestion = QUESTIONS[category].find((q) => q.kind === 'flaws')
    if (flawQuestion) {
      answers[flawQuestion.id] = (sample.flaws ?? []).filter((f) =>
        f.startsWith(flawQuestion.id.split('.')[0]!),
      )
    }
  }
  fill('taste', sample.taste)
  fill('texture', sample.texture)
  fill('appearance', sample.appearance)
  return answers
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return todayIso(date)
}

export async function addSampleCookies(): Promise<number> {
  const batch: SaveCookieInput[] = []
  for (const sample of SAMPLES) {
    const answers = answersFor(sample)
    const assessed = assessAll(answers)
    const suggested: Scores = {
      taste: assessed.taste.score,
      texture: assessed.texture.score,
      appearance: assessed.appearance.score,
    }
    const scores: Scores = {
      taste: suggested.taste + (sample.nudge?.taste ?? 0),
      texture: suggested.texture + (sample.nudge?.texture ?? 0),
      appearance: suggested.appearance + (sample.nudge?.appearance ?? 0),
    }
    batch.push({
      details: {
        eatenOn: isoDaysAgo(sample.daysAgo),
        cookieType: sample.cookieType,
        bakery: sample.bakery,
        city: sample.city,
        state: sample.state,
        price: sample.price,
      },
      notes: sample.notes,
      answers,
      suggested,
      scores,
      photo: 'none',
      sample: true,
      createdAt: Date.now() - sample.daysAgo * 86_400_000,
    })
  }
  // One transaction, so the journal fills in all at once and an interruption
  // can't leave half a batch behind.
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, db.originals, async () => {
    for (const input of batch) await saveCookie(input)
  })
  return batch.length
}
