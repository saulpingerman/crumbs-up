import { neighbors } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'
import { stateByFips } from '@/lib/states'

/** Which states share a border, worked out from the map shapes themselves. */
export const STATE_NEIGHBORS: Record<string, string[]> = (() => {
  const topology = usAtlas as unknown as Topology<{ states: GeometryCollection }>
  const shapes = topology.objects.states.geometries
  const codes = shapes.map((shape) => stateByFips(String(shape.id))?.code)
  const adjacency: Record<string, string[]> = {}
  neighbors(shapes).forEach((touching, i) => {
    const code = codes[i]
    if (!code) return
    adjacency[code] = touching
      .map((j) => codes[j])
      .filter((c): c is string => Boolean(c))
      .sort()
  })
  return adjacency
})()
