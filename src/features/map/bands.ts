/** Average-score bands, lowest to highest, matching --seq-1 … --seq-5. */
export const BANDS = [
  { label: 'Under 5', min: 0 },
  { label: '5 – 5.9', min: 5 },
  { label: '6 – 6.9', min: 6 },
  { label: '7 – 7.9', min: 7 },
  { label: '8 and up', min: 8 },
] as const

export function bandOf(average: number): number {
  let band = 0
  BANDS.forEach((b, i) => {
    if (average >= b.min) band = i
  })
  return band
}

/** The fill for an area with this average. */
export function bandColor(average: number): string {
  return `var(--seq-${bandOf(average) + 1})`
}
