import { BANDS } from './bands'

/** What the shades on an area map stand for. */
export function BandLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-ink-soft">
      <span className="font-semibold text-ink">Average score</span>
      {BANDS.map((band, i) => (
        <span key={band.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-[4px]"
            style={{ background: `var(--seq-${i + 1})` }}
          />
          {band.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-[4px] border border-line bg-oat" />
        Not yet
      </span>
    </div>
  )
}
