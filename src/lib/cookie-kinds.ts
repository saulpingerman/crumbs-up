/**
 * What the app knows about kinds of cookie: how to recognize one from
 * whatever was typed, and what it tends to taste and eat like. This is what
 * lets recommendations reason from "you loved these" to "so try that".
 */

export type Trait =
  // flavor
  | 'chocolate'
  | 'caramel'
  | 'butter'
  | 'spice'
  | 'fruit'
  | 'citrus'
  | 'nutty'
  | 'oat'
  | 'peanut'
  | 'salty'
  | 'playful'
  | 'coffee'
  // texture
  | 'chewy'
  | 'crisp'
  | 'soft'
  | 'gooey'
  | 'sandy'

export const TEXTURE_TRAITS: readonly Trait[] = ['chewy', 'crisp', 'soft', 'gooey', 'sandy']

/** How a trait reads in a sentence: "you go for …". */
export const TRAIT_LABEL: Record<Trait, string> = {
  chocolate: 'deep chocolate',
  caramel: 'caramel and toffee notes',
  butter: 'pure butter flavor',
  spice: 'warm spice',
  fruit: 'fruit',
  citrus: 'bright citrus',
  nutty: 'toasted nuts',
  oat: 'oats',
  peanut: 'peanut butter',
  salty: 'salty-sweet',
  playful: 'candy and sprinkles',
  coffee: 'coffee',
  chewy: 'a good chew',
  crisp: 'a crisp snap',
  soft: 'soft, cakey middles',
  gooey: 'gooey centers',
  sandy: 'a sandy, melting crumb',
}

export interface CookieKind {
  id: string
  name: string
  /** Recognizes this kind in a typed cookie name. */
  match: RegExp
  traits: Trait[]
  /** A widely loved classic — a sensible suggestion before the app knows your taste. */
  classic?: boolean
  /** What a great one is like, so you know what you're looking for. */
  lookFor: string
}

/** Checked in order, so the specific kinds sit above the general ones. */
export const COOKIE_KINDS: CookieKind[] = [
  {
    id: 'pb-chocolate',
    name: 'Peanut Butter Chocolate',
    match: /(peanut|\bpb\b).*(choc|chip)|(choc|chip).*(peanut|\bpb\b)|reese/,
    traits: ['peanut', 'chocolate', 'salty', 'chewy'],
    lookFor: 'Roasted-peanut depth with real chocolate, not just sweetness.',
  },
  {
    id: 'tahini-chocolate',
    name: 'Tahini or Miso Chocolate Chip',
    match: /tahini|miso|sesame/,
    traits: ['nutty', 'salty', 'chocolate', 'chewy'],
    lookFor: 'A savory, nutty edge that makes the chocolate taste darker.',
  },
  {
    id: 'brown-butter',
    name: 'Brown Butter Chocolate Chip',
    match: /brown(ed)? butter/,
    traits: ['chocolate', 'caramel', 'salty', 'chewy'],
    classic: true,
    lookFor: 'Nutty, toffee-like depth, puddles of chocolate and flaky salt on top.',
  },
  {
    id: 'oatmeal-chocolate',
    name: 'Oatmeal Chocolate Chip',
    match: /oat.*(choc|chip)|(choc|chip).*oat/,
    traits: ['oat', 'chocolate', 'chewy'],
    lookFor: 'Hearty chew from whole oats, with the chocolate cutting through.',
  },
  {
    id: 'oatmeal-raisin',
    name: 'Oatmeal Raisin',
    match: /oat/,
    traits: ['oat', 'fruit', 'spice', 'chewy'],
    classic: true,
    lookFor: 'Plump raisins, a whisper of cinnamon, and a bend-don’t-break chew.',
  },
  {
    id: 'red-velvet',
    name: 'Red Velvet',
    match: /red velvet/,
    traits: ['chocolate', 'soft', 'playful'],
    lookFor: 'A gentle cocoa tang and a tender, cake-like crumb.',
  },
  {
    id: 'cookies-cream',
    name: 'Cookies & Cream',
    match: /cookies?\s*(&|and|n|’n’|'n')\s*cream|oreo/,
    traits: ['chocolate', 'playful', 'soft'],
    lookFor: 'Big shards of sandwich cookie and a vanilla-rich dough.',
  },
  {
    id: 'smores',
    name: 'S’mores',
    match: /s[’']?mores?|marshmallow|rocky road/,
    traits: ['chocolate', 'playful', 'gooey'],
    lookFor: 'Toasted, stretchy marshmallow, graham crunch and melted chocolate.',
  },
  {
    id: 'espresso',
    name: 'Espresso Chocolate',
    match: /espresso|mocha|coffee/,
    traits: ['coffee', 'chocolate', 'chewy'],
    lookFor: 'Coffee that deepens the chocolate rather than fighting it.',
  },
  {
    id: 'lemon',
    name: 'Lemon',
    match: /lemon|citrus|lime|yuzu|orange/,
    traits: ['citrus', 'butter', 'soft'],
    classic: true,
    lookFor: 'Real zest, a bright finish, and just enough sweetness to carry it.',
  },
  {
    id: 'crinkle',
    name: 'Chocolate Crinkle',
    match: /crinkle/,
    traits: ['chocolate', 'soft', 'gooey'],
    lookFor: 'A crackled sugar crust over a brownie-soft middle.',
  },
  {
    id: 'double-chocolate',
    name: 'Double Chocolate',
    match: /double choc|triple choc|chocolate chocolate|brownie|fudge|cocoa|death by/,
    traits: ['chocolate', 'gooey', 'chewy'],
    classic: true,
    lookFor: 'Like the corner of a brownie: dark, fudgy and just barely set.',
  },
  {
    id: 'stuffed',
    name: 'Stuffed Cookie',
    match: /stuffed|nutella|filled/,
    traits: ['gooey', 'chocolate', 'playful'],
    lookFor: 'A molten center that is a surprise, not a gimmick.',
  },
  {
    id: 'kitchen-sink',
    name: 'Kitchen Sink',
    match: /kitchen sink|compost|everything|loaded|trash|garbage/,
    traits: ['salty', 'playful', 'caramel', 'chewy'],
    lookFor: 'Pretzel, chip, toffee and chocolate somehow agreeing with each other.',
  },
  {
    id: 'monster',
    name: 'Monster or M&M',
    match: /m\s*&\s*m|m and m|monster|candy|smartie/,
    traits: ['playful', 'chocolate', 'chewy'],
    lookFor: 'Candy shells that crack against a soft, buttery dough.',
  },
  {
    id: 'peanut-butter',
    name: 'Peanut Butter',
    match: /peanut|\bpb\b/,
    traits: ['peanut', 'salty', 'sandy'],
    classic: true,
    lookFor: 'Roasted peanut front and center, with a tender, sandy bite.',
  },
  {
    id: 'gingersnap',
    name: 'Gingersnap',
    match: /ginger\s*snap/,
    traits: ['spice', 'crisp'],
    lookFor: 'A clean snap and enough ginger to warm the back of your throat.',
  },
  {
    id: 'biscoff',
    name: 'Biscoff or Speculoos',
    match: /biscoff|speculoos/,
    traits: ['spice', 'caramel', 'crisp'],
    lookFor: 'Caramelized spice and a crunch that melts.',
  },
  {
    id: 'molasses',
    name: 'Molasses Ginger',
    match: /molasses|ginger|spice|chai/,
    traits: ['spice', 'caramel', 'chewy'],
    classic: true,
    lookFor: 'Dark, bittersweet molasses, real ginger heat and a sparkling sugar crust.',
  },
  {
    id: 'snickerdoodle',
    name: 'Snickerdoodle',
    match: /snicker|cinnamon|churro/,
    traits: ['spice', 'butter', 'soft'],
    classic: true,
    lookFor: 'A crackly cinnamon-sugar shell, a little tang, and a soft middle.',
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    match: /pumpkin|sweet potato/,
    traits: ['spice', 'soft'],
    lookFor: 'Spice you can taste and a crumb that is tender, not gummy.',
  },
  {
    id: 'white-macadamia',
    name: 'White Chocolate Macadamia',
    match: /white choc|macadamia/,
    traits: ['nutty', 'butter', 'chewy'],
    classic: true,
    lookFor: 'Toasted, buttery nuts and white chocolate that tastes of vanilla.',
  },
  {
    id: 'salted-caramel',
    name: 'Salted Caramel or Toffee',
    match: /caramel|toffee|butterscotch|dulce/,
    traits: ['caramel', 'salty', 'chewy'],
    lookFor: 'Chewy pockets of caramel and salt that keeps you coming back.',
  },
  {
    id: 'florentine',
    name: 'Florentine or Lace',
    match: /florentine|lace/,
    traits: ['caramel', 'nutty', 'crisp'],
    lookFor: 'Glass-thin, shattering caramel studded with almonds.',
  },
  {
    id: 'alfajor',
    name: 'Alfajor',
    match: /alfajor/,
    traits: ['caramel', 'butter', 'sandy'],
    lookFor: 'Crumbly shortbread that dissolves around thick dulce de leche.',
  },
  {
    id: 'wedding',
    name: 'Mexican Wedding Cookie',
    match: /wedding|snowball|polvor|russian tea/,
    traits: ['nutty', 'butter', 'sandy'],
    lookFor: 'Toasted pecans and a powdered-sugar crumb that melts on the tongue.',
  },
  {
    id: 'thumbprint',
    name: 'Jam Thumbprint or Linzer',
    match: /thumbprint|jam|linzer|raspberr|strawberr|cherry|apricot/,
    traits: ['fruit', 'butter', 'sandy'],
    lookFor: 'Sharp, real-fruit jam against a short, buttery base.',
  },
  {
    id: 'macaroon',
    name: 'Coconut Macaroon',
    match: /macaroon|coconut/,
    traits: ['nutty', 'chewy'],
    lookFor: 'Toasted golden tips and a moist, chewy heart.',
  },
  {
    id: 'pecan',
    name: 'Pecan Sandie',
    match: /pecan|walnut|almond|hazelnut|pistachio|\bnut/,
    traits: ['nutty', 'butter', 'sandy'],
    lookFor: 'Deeply toasted nuts and a crumb that falls apart politely.',
  },
  {
    id: 'birthday',
    name: 'Birthday Cake',
    match: /birthday|funfetti|confetti|sprinkle|cake batter|frosted|unicorn/,
    traits: ['playful', 'butter', 'soft'],
    lookFor: 'Proper vanilla and butter under the sprinkles, not just sugar.',
  },
  {
    id: 'black-white',
    name: 'Black & White',
    match: /black\s*(&|and)\s*white|half moon/,
    traits: ['butter', 'soft', 'chocolate'],
    lookFor: 'A tender, cakey base and two icings that each taste of something.',
  },
  {
    id: 'shortbread',
    name: 'Shortbread',
    match: /shortbread|sabl[eé]|butter cookie/,
    traits: ['butter', 'sandy', 'crisp'],
    classic: true,
    lookFor: 'Nothing to hide behind: great butter, a pinch of salt, a clean snap.',
  },
  {
    id: 'sugar',
    name: 'Sugar Cookie',
    match: /sugar/,
    traits: ['butter', 'soft'],
    classic: true,
    lookFor: 'Vanilla and butter you can actually taste, soft with crisp edges.',
  },
  {
    id: 'chocolate-chip',
    name: 'Chocolate Chip',
    match: /choc|chip|chunk|toll\s*house/,
    traits: ['chocolate', 'butter', 'chewy'],
    classic: true,
    lookFor: 'Caramelized edges, a soft center and chocolate in every bite.',
  },
]

const BY_ID = new Map(COOKIE_KINDS.map((k) => [k.id, k]))

export function kindById(id: string): CookieKind | undefined {
  return BY_ID.get(id)
}

/** The kind a typed cookie name belongs to, if it is one we recognize. */
export function kindOf(cookieType: string): CookieKind | undefined {
  const typed = cookieType.toLowerCase()
  return COOKIE_KINDS.find((kind) => kind.match.test(typed))
}

/** Texture-style answers from the questionnaire, as traits. */
export const STYLE_TRAITS: Record<string, Trait[]> = {
  gooey: ['gooey'],
  chewy: ['chewy'],
  contrast: ['chewy', 'crisp'],
  crisp: ['crisp'],
  cakey: ['soft'],
  sandy: ['sandy'],
}
