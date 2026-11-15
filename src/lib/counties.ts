/**
 * U.S. counties: which one a spot on the map is in, and their outlines for
 * drawing. A county is about the right size for "where I've had cookies" —
 * a state is far too big.
 *
 * The shapes are us-atlas's (U.S. Census Bureau data), already projected the
 * same way as the state map. They are a few hundred kilobytes, so they are
 * only fetched when something asks for them.
 */
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { project, type LatLng } from '@/lib/geo'
import { stateByFips } from '@/lib/states'

export interface County {
  /** Census id: two digits for the state, three for the county. */
  fips: string
  /** As people say it: "Centre County", "Orleans Parish". */
  name: string
  /** USPS code of its state. */
  state: string
  /** Outline, as an SVG path in the map's own coordinates. */
  d: string
  /** The box it fits in: left, top, right, bottom. */
  box: [number, number, number, number]
  rings: Position[][][]
}

/** What a county is called depends on where it is. */
function countyName(name: string, fips: string, state: string): string {
  if (state === 'LA') return `${name} Parish`
  // Alaska's boroughs and census areas, and D.C., go by their plain names.
  if (state === 'AK' || state === 'DC') return name
  // Virginia's independent cities are numbered from 510 up, and are not counties.
  if (state === 'VA' && Number(fips.slice(2)) >= 510) return name
  return `${name} County`
}

function inRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number]
    const [xj, yj] = ring[j] as [number, number]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside the outline of one of its pieces, and not in a hole in it. */
function inCounty(x: number, y: number, county: County): boolean {
  const [left, top, right, bottom] = county.box
  if (x < left || x > right || y < top || y > bottom) return false
  return county.rings.some(
    ([outer, ...holes]) => inRing(x, y, outer!) && !holes.some((hole) => inRing(x, y, hole)),
  )
}

export class CountyAtlas {
  private readonly byState = new Map<string, County[]>()
  readonly all: County[]

  constructor(counties: County[]) {
    this.all = counties
    for (const county of counties) {
      const list = this.byState.get(county.state)
      if (list) list.push(county)
      else this.byState.set(county.state, [county])
    }
  }

  /** Every county of a state. */
  in(state: string): County[] {
    return this.byState.get(state) ?? []
  }

  /**
   * The county a spot is in. Naming the state it should be in makes this
   * quick; the search widens to the whole country if the spot turns out to
   * be just over a state line.
   */
  at(point: LatLng, state?: string): County | null {
    const spot = project(point)
    if (!spot) return null
    const [x, y] = spot
    const likely = state ? this.in(state) : []
    return (
      likely.find((county) => inCounty(x, y, county)) ??
      this.all.find((county) => inCounty(x, y, county)) ??
      null
    )
  }
}

let atlas: Promise<CountyAtlas> | null = null

/** Fetch the county shapes (once) and get them ready to use. */
export function loadCounties(): Promise<CountyAtlas> {
  atlas ??= Promise.all([
    import('us-atlas/counties-albers-10m.json'),
    import('topojson-client'),
    import('d3-geo'),
  ]).then(([data, { feature }, { geoPath }]) => {
    const topology = data.default as unknown as Topology<{ counties: GeometryCollection }>
    const path = geoPath()
    const counties: County[] = []
    for (const shape of feature(topology, topology.objects.counties).features as Feature<
      Polygon | MultiPolygon,
      { name?: string }
    >[]) {
      const fips = String(shape.id)
      const state = stateByFips(fips.slice(0, 2))
      const d = path(shape)
      if (!state || !d) continue
      const [[left, top], [right, bottom]] = path.bounds(shape)
      counties.push({
        fips,
        state: state.code,
        name: countyName(shape.properties.name ?? '', fips, state.code),
        d,
        box: [left, top, right, bottom],
        rings:
          shape.geometry.type === 'Polygon'
            ? [shape.geometry.coordinates]
            : shape.geometry.coordinates,
      })
    }
    return new CountyAtlas(counties)
  })
  atlas.catch(() => {
    atlas = null
  })
  return atlas
}
