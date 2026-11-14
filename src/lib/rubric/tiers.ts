export interface Tier {
  min: number
  name: string
  line: string
}

/**
 * Plain-language verdicts for a score. Everything hangs off the anchor the
 * whole system is built on: 5 is a standard Toll House cookie.
 */
export const TIERS: Tier[] = [
  { min: 10, name: 'Perfect', line: 'The cookie all others get measured against.' },
  { min: 9, name: 'Legendary', line: 'Worth planning a trip around.' },
  { min: 8, name: 'Outstanding', line: 'Go out of your way for this one.' },
  { min: 7, name: 'Excellent', line: 'A seriously good cookie.' },
  { min: 6, name: 'Above standard', line: 'Clearly better than the bag recipe.' },
  { min: 5, name: 'Standard', line: 'Toll House territory — good, nothing special.' },
  { min: 4, name: 'Below standard', line: 'You could do better at home.' },
  { min: 3, name: 'Disappointing', line: 'Not worth the calories.' },
  { min: 0, name: 'Skip it', line: 'Save your appetite.' },
]

export function tierFor(score: number): Tier {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]!
}
