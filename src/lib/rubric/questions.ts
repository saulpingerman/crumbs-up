import type {
  Category,
  CategoryMeta,
  ContextQuestion,
  FlawQuestion,
  Option,
  Question,
  ScaleQuestion,
} from './types'

/**
 * Bump when questions, weights or anchor scores change. Every saved cookie
 * records the version it was rated with, so old ratings stay explainable.
 */
export const RUBRIC_VERSION = 1

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    verb: 'Look',
    blurb: 'Before the first bite — judge it the way it sat in the case.',
  },
  texture: {
    id: 'texture',
    label: 'Texture',
    verb: 'Bite',
    blurb: 'Break it, bite it, and pay attention to how it eats.',
  },
  taste: {
    id: 'taste',
    label: 'Taste',
    verb: 'Savor',
    blurb: 'Now slow down. What does it actually taste like?',
  },
}

/**
 * Every scored question uses the same six rungs so answers stay comparable:
 * two below the standard, the standard itself, and three above it — bakery
 * cookies mostly live above the line, so that is where the resolution goes.
 */
export const ANCHORS = [1.5, 3.5, 5, 6.5, 8, 10] as const
export const STANDARD_OPTION_INDEX = 2

type Rung = [label: string, detail: string]

function rungs(prefix: string, items: [Rung, Rung, Rung, Rung, Rung, Rung]): Option[] {
  return items.map(([label, detail], i) => ({
    id: `${prefix}.${i + 1}`,
    label,
    detail,
    score: ANCHORS[i] ?? 5,
  }))
}

function scale(
  q: Omit<ScaleQuestion, 'kind' | 'options'> & {
    rungs: [Rung, Rung, Rung, Rung, Rung, Rung]
    notApplicable?: Rung
  },
): ScaleQuestion {
  const { rungs: items, notApplicable, ...rest } = q
  const options = rungs(q.id, items)
  if (notApplicable) {
    options.push({
      id: `${q.id}.na`,
      label: notApplicable[0],
      detail: notApplicable[1],
      score: null,
    })
  }
  return { kind: 'scale', ...rest, options }
}

/* ------------------------------ Appearance ------------------------------ */

const appearance: Question[] = [
  scale({
    id: 'look.appeal',
    category: 'appearance',
    title: 'First impression',
    prompt: 'How did it look sitting in the case?',
    weight: 3,
    rungs: [
      ['Off-putting', 'I almost didn’t buy it'],
      ['A little sad', 'Tired, plain or sloppy'],
      ['A normal cookie', 'Looks like one from the bag recipe'],
      ['Inviting', 'Looked good — I wanted it'],
      ['Gorgeous', 'Caught my eye right away'],
      ['Showstopper', 'The best-looking cookie in any case'],
    ],
  }),
  scale({
    id: 'look.color',
    category: 'appearance',
    title: 'Bake color',
    prompt: 'How’s the color of the bake?',
    hint: 'Judge it for its type — shortbread should be pale, a chocolate chip should be golden.',
    weight: 2,
    rungs: [
      ['Burnt or raw-looking', 'Scorched, or ghostly pale'],
      ['A bit off', 'Too dark or too pale in places'],
      ['Fine', 'Ordinary, acceptable color'],
      ['Evenly baked', 'Consistent, appealing color'],
      ['Beautifully browned', 'Rich color, darker edges, no scorching'],
      ['Flawless', 'Exactly the color this cookie should be'],
    ],
  }),
  scale({
    id: 'look.shape',
    category: 'appearance',
    title: 'Shape & heft',
    prompt: 'What about its shape and size?',
    weight: 2,
    rungs: [
      ['A mess', 'Broken, puddled or badly misshapen'],
      ['Uneven', 'Spread thin, lopsided or skimpy'],
      ['Ordinary', 'Regular shape, regular size'],
      ['Well formed', 'Good thickness, pleasing shape'],
      ['Handsome', 'Generous, confident, clearly made with care'],
      ['Picture-perfect', 'Could be the bakery’s logo'],
    ],
  }),
  scale({
    id: 'look.surface',
    category: 'appearance',
    title: 'Surface & finish',
    prompt: 'Look closely at the surface.',
    hint: 'Crackle, ripples, craggy peaks, gloss, flaky salt, sugar crust, neat icing.',
    weight: 2,
    rungs: [
      ['Unappetizing', 'Greasy, sticky, dried-out or smeared'],
      ['Dull', 'Flat and lifeless'],
      ['Plain', 'Nothing wrong, nothing to notice'],
      ['Nice texture', 'Some crackle, ripple or shine'],
      ['Really attractive', 'Craggy, glossy or finished with care'],
      ['Stunning', 'Every detail is deliberate'],
    ],
  }),
  scale({
    id: 'look.mixins',
    category: 'appearance',
    title: 'Mix-ins on show',
    prompt: 'How do the mix-ins or toppings look?',
    hint: 'Chocolate, nuts, fruit, sprinkles, filling, icing — whatever this cookie is showing off.',
    weight: 2,
    rungs: [
      ['Where are they?', 'Barely any, or a careless pile'],
      ['Skimpy or patchy', 'Some bare stretches'],
      ['As expected', 'A normal scattering'],
      ['Generous', 'Plenty, spread evenly'],
      ['Loaded and artful', 'Pools, chunks or toppings in every bite'],
      ['Jaw-dropping', 'You can see how good it will be'],
    ],
    notApplicable: ['Plain by design', 'No mix-ins or toppings to judge'],
  }),
  {
    kind: 'flaws',
    id: 'look.flaws',
    category: 'appearance',
    title: 'Appearance flaws',
    prompt: 'Anything off about how it looks?',
    hint: 'Tap all that apply — or skip if it’s clean.',
    flaws: [
      { id: 'look.flaw.burnt', label: 'Burnt edges or bottom', penalty: 1 },
      { id: 'look.flaw.pale', label: 'Pale, under-baked look', penalty: 0.5 },
      { id: 'look.flaw.greasy', label: 'Greasy sheen', penalty: 0.5 },
      { id: 'look.flaw.spread', label: 'Spread too thin', penalty: 0.5 },
      { id: 'look.flaw.broken', label: 'Broken or cracked apart', penalty: 0.5 },
      { id: 'look.flaw.sloppy', label: 'Sloppy icing or decoration', penalty: 0.5 },
      { id: 'look.flaw.dried', label: 'Looks dried out', penalty: 0.5 },
    ],
  } satisfies FlawQuestion,
]

/* -------------------------------- Texture ------------------------------- */

export const TEXTURE_STYLE_QUESTION_ID = 'bite.style'

const texture: Question[] = [
  {
    kind: 'context',
    id: TEXTURE_STYLE_QUESTION_ID,
    category: 'texture',
    title: 'Texture style',
    prompt: 'What style is this cookie going for?',
    hint: 'Not scored — it just tells us what “done right” means for this one.',
    options: [
      {
        id: 'bite.style.gooey',
        label: 'Soft & gooey',
        detail: 'Barely set, molten middle',
        score: null,
      },
      { id: 'bite.style.chewy', label: 'Chewy', detail: 'Bendy, with some pull', score: null },
      {
        id: 'bite.style.contrast',
        label: 'Crisp edge, soft center',
        detail: 'The classic bakery style',
        score: null,
      },
      {
        id: 'bite.style.crisp',
        label: 'Thin & crisp',
        detail: 'Snaps when you break it',
        score: null,
      },
      {
        id: 'bite.style.cakey',
        label: 'Thick & cakey',
        detail: 'Puffy, tender crumb',
        score: null,
      },
      {
        id: 'bite.style.sandy',
        label: 'Sandy & buttery',
        detail: 'Shortbread-style, melts away',
        score: null,
      },
    ],
  } satisfies ContextQuestion,
  scale({
    id: 'bite.type',
    category: 'texture',
    title: 'True to style',
    prompt: 'How well does it nail that style?',
    weight: 3,
    rungs: [
      ['Totally misses', 'Nothing like it should be'],
      ['Falls short', 'You can tell what it wanted to be'],
      ['Gets there', 'A fair, ordinary example'],
      ['Does it well', 'Clearly a good version'],
      ['Nails it', 'Exactly what this style should feel like'],
      ['The benchmark', 'I’ll compare every other one to this'],
    ],
  }),
  scale({
    id: 'bite.moisture',
    category: 'texture',
    title: 'Bake & moisture',
    prompt: 'How’s the bake all the way through?',
    weight: 2.5,
    rungs: [
      ['Ruined', 'Rock hard, bone dry — or raw dough'],
      ['Noticeably off', 'Dry and crumbly, or underdone'],
      ['Acceptable', 'A little dry or a little soft, no big deal'],
      ['Baked right', 'Moist where it should be'],
      ['Spot on', 'Tender throughout, nothing to change'],
      ['Perfect', 'Pulled from the oven at the exact second'],
    ],
  }),
  scale({
    id: 'bite.contrast',
    category: 'texture',
    title: 'Interest in the bite',
    prompt: 'Does the texture keep things interesting?',
    hint: 'Edge versus center, melty chocolate, crunchy nuts, a sugar crust, a soft filling.',
    weight: 2,
    rungs: [
      ['Unpleasant', 'Pasty, mushy or like cardboard'],
      ['Monotonous', 'Every bite the same, and dull'],
      ['Even', 'Uniform — fine, unremarkable'],
      ['Some contrast', 'A couple of textures at play'],
      ['Lots going on', 'Distinct layers that work together'],
      ['Every bite different', 'And every one of them great'],
    ],
  }),
  scale({
    id: 'bite.mouthfeel',
    category: 'texture',
    title: 'Mouthfeel',
    prompt: 'How does it feel as you chew?',
    weight: 2,
    rungs: [
      ['Bad', 'Greasy, gritty, waxy or gluey'],
      ['A bit off', 'Slightly oily, grainy or tough'],
      ['Normal', 'Chews like a cookie'],
      ['Pleasant', 'Tender and clean'],
      ['Luxurious', 'Rich, buttery, satisfying'],
      ['Melts away', 'Impossibly tender — unforgettable'],
    ],
  }),
  scale({
    id: 'bite.fresh',
    category: 'texture',
    title: 'Freshness',
    prompt: 'How fresh does it eat?',
    weight: 2,
    rungs: [
      ['Stale', 'Days old'],
      ['Past its best', 'Yesterday’s cookie'],
      ['Fresh enough', 'No complaints'],
      ['Fresh', 'Baked today'],
      ['Very fresh', 'Still soft from this morning’s bake'],
      ['Straight from the oven', 'Warm, at its absolute peak'],
    ],
  }),
  {
    kind: 'flaws',
    id: 'bite.flaws',
    category: 'texture',
    title: 'Texture flaws',
    prompt: 'Anything wrong with how it eats?',
    hint: 'Tap all that apply — or skip if it’s clean.',
    flaws: [
      { id: 'bite.flaw.dry', label: 'Dry or crumbly', penalty: 0.5 },
      { id: 'bite.flaw.tough', label: 'Tough or hard', penalty: 0.5 },
      { id: 'bite.flaw.greasy', label: 'Greasy', penalty: 0.5 },
      { id: 'bite.flaw.raw', label: 'Raw, doughy middle', penalty: 1 },
      { id: 'bite.flaw.stale', label: 'Stale', penalty: 1 },
      { id: 'bite.flaw.gritty', label: 'Gritty or grainy', penalty: 0.5 },
      { id: 'bite.flaw.soggy', label: 'Soggy', penalty: 0.5 },
      { id: 'bite.flaw.falls-apart', label: 'Falls apart', penalty: 0.5 },
    ],
  } satisfies FlawQuestion,
]

/* --------------------------------- Taste -------------------------------- */

const taste: Question[] = [
  scale({
    id: 'taste.depth',
    category: 'taste',
    title: 'Flavor depth',
    prompt: 'How deep does the flavor go?',
    weight: 3,
    rungs: [
      ['Unpleasant', 'Something tastes wrong'],
      ['Flat', 'Sweet and not much else'],
      ['Familiar', 'Classic bag-recipe flavor'],
      ['Richer than usual', 'Real butter and vanilla come through'],
      ['Layered', 'Toffee, caramel, brown-butter or toasty notes'],
      ['Extraordinary', 'Complex — I kept noticing new things'],
    ],
  }),
  scale({
    id: 'taste.balance',
    category: 'taste',
    title: 'Sweetness & balance',
    prompt: 'How well balanced is it?',
    hint: 'Sweetness, salt and richness — does anything shout over the rest?',
    weight: 2,
    rungs: [
      ['Way off', 'Cloying or bland — hard to finish'],
      ['Out of balance', 'Noticeably too sweet, or too flat'],
      ['Typical', 'Ordinary cookie sweetness'],
      ['Well balanced', 'Nothing sticks out'],
      ['Beautifully balanced', 'Salt and richness lift the sweetness'],
      ['Perfect harmony', 'I wouldn’t change a grain'],
    ],
  }),
  scale({
    id: 'taste.ingredients',
    category: 'taste',
    title: 'Ingredient quality',
    prompt: 'What do the ingredients taste like?',
    weight: 2.5,
    rungs: [
      ['Cheap or artificial', 'Fake vanilla, waxy chocolate'],
      ['Budget', 'Shortening-y, a little processed'],
      ['Grocery-store standard', 'Decent, everyday ingredients'],
      ['Good quality', 'Real butter, good chocolate'],
      ['Premium', 'Excellent chocolate, nuts, spices or fruit'],
      ['Best in class', 'Every ingredient is a standout'],
    ],
  }),
  scale({
    id: 'taste.star',
    category: 'taste',
    title: 'Star flavor',
    prompt: 'Does it deliver on what it promised?',
    hint: 'Whatever this cookie is named for — chocolate, peanut butter, cinnamon, lemon…',
    weight: 2,
    rungs: [
      ['Missing', 'Couldn’t tell what it was meant to be'],
      ['Faint', 'Hints of it, mostly sugar'],
      ['It’s there', 'Tastes like what it says'],
      ['Clear and tasty', 'The main flavor comes through well'],
      ['Bold and true', 'Vivid, exactly what I hoped for'],
      ['Definitive', 'The best version of this flavor I’ve had'],
    ],
  }),
  scale({
    id: 'taste.crave',
    category: 'taste',
    title: 'Finish & craving',
    prompt: 'When it was gone, how did you feel?',
    weight: 2.5,
    rungs: [
      ['Glad it was over', 'Didn’t want to finish it'],
      ['One was plenty', 'Already forgetting it'],
      ['Satisfied', 'I’d eat another if offered'],
      ['Wanted another', 'Clean finish, went back for crumbs'],
      ['Still thinking about it', 'I’d go out of my way to get one'],
      ['Obsessed', 'I’d drive across the state for this cookie'],
    ],
  }),
  {
    kind: 'flaws',
    id: 'taste.flaws',
    category: 'taste',
    title: 'Taste flaws',
    prompt: 'Any off notes?',
    hint: 'Tap all that apply — or skip if it’s clean.',
    flaws: [
      { id: 'taste.flaw.burnt', label: 'Burnt or bitter', penalty: 1 },
      { id: 'taste.flaw.artificial', label: 'Artificial aftertaste', penalty: 0.5 },
      { id: 'taste.flaw.stale', label: 'Stale or rancid notes', penalty: 1 },
      { id: 'taste.flaw.raw', label: 'Raw flour taste', penalty: 0.5 },
      { id: 'taste.flaw.salty', label: 'Too salty', penalty: 0.5 },
      { id: 'taste.flaw.soda', label: 'Baking-soda or metallic tang', penalty: 0.5 },
      { id: 'taste.flaw.extract', label: 'Overpowering spice or extract', penalty: 0.5 },
      { id: 'taste.flaw.greasy', label: 'Greasy aftertaste', penalty: 0.5 },
    ],
  } satisfies FlawQuestion,
]

export const QUESTIONS: Record<Category, Question[]> = { appearance, texture, taste }

export const ALL_QUESTIONS: Question[] = [...appearance, ...texture, ...taste]

/* ----------------------------- Quick review ----------------------------- */

/**
 * The short way to rate: one overall question per category instead of five
 * detailed ones. The answers sit on the same six rungs, so a quick 8 and a
 * full 8 mean the same thing — the quick one just comes with less reasoning.
 */
export const QUICK_QUESTIONS: Record<Category, ScaleQuestion> = {
  appearance: scale({
    id: 'quick.look',
    category: 'appearance',
    title: 'Overall look',
    prompt: 'How did it look?',
    hint: 'All things considered: color, shape, finish, toppings.',
    weight: 1,
    rungs: [
      ['Off-putting', 'I almost didn’t buy it'],
      ['A little sad', 'Tired, plain or sloppy'],
      ['A normal cookie', 'Looks like one from the bag recipe'],
      ['Inviting', 'Looked good — I wanted it'],
      ['Gorgeous', 'Caught my eye right away'],
      ['Showstopper', 'The best-looking cookie in any case'],
    ],
  }),
  texture: scale({
    id: 'quick.bite',
    category: 'texture',
    title: 'Overall texture',
    prompt: 'How was the texture?',
    hint: 'Judge it as the kind of cookie it is trying to be.',
    weight: 1,
    rungs: [
      ['Bad', 'Stale, raw in the middle or rock hard'],
      ['Off', 'Dry, tough or greasy'],
      ['Fine', 'Like a decent homemade cookie'],
      ['Good', 'Pleasant all the way through'],
      ['Great', 'Just what this kind of cookie should be'],
      ['Perfect', 'I can’t imagine it eating any better'],
    ],
  }),
  taste: scale({
    id: 'quick.taste',
    category: 'taste',
    title: 'Overall taste',
    prompt: 'How did it taste?',
    weight: 1,
    rungs: [
      ['Bad', 'I couldn’t finish it'],
      ['Disappointing', 'Bland, or something tasted off'],
      ['Fine', 'Like the bag recipe: good, nothing special'],
      ['Good', 'Clearly better than homemade'],
      ['Delicious', 'I’d go out of my way for it'],
      ['Unforgettable', 'One of the best I’ve ever had'],
    ],
  }),
}

export const QUICK_QUESTION_LIST: ScaleQuestion[] = [
  QUICK_QUESTIONS.appearance,
  QUICK_QUESTIONS.texture,
  QUICK_QUESTIONS.taste,
]

/** Is this the id of a quick-review answer rather than a full-tasting one? */
export function isQuickAnswer(questionId: string): boolean {
  return QUICK_QUESTION_LIST.some((q) => q.id === questionId)
}

const BY_ID = new Map([...ALL_QUESTIONS, ...QUICK_QUESTION_LIST].map((q) => [q.id, q]))

export function getQuestion(id: string): Question | undefined {
  return BY_ID.get(id)
}

/** Largest total a category can lose to flaws, however many are flagged. */
export const MAX_FLAW_PENALTY = 2
