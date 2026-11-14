import { ExternalLink } from 'lucide-react'
import { mapsUrl } from '@/lib/geo'

/** Hands a bakery to the phone's own maps app for hours and directions. */
export function OpenInMaps({
  bakery,
  city,
  state,
}: {
  bakery: string
  city: string
  state: string
}) {
  return (
    <a
      href={mapsUrl(bakery, city, state)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-paper px-3.5 text-sm font-semibold transition hover:bg-oat"
    >
      <ExternalLink className="size-4" />
      Open in Maps
    </a>
  )
}
