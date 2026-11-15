import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CrumbsDb } from '@/lib/db/db'
import type { WantToGoRecord } from '@/lib/db/schema'
import type { OsmPlace } from '@/lib/osm'

/** What saving a place needs to know about it. */
export type Wantable = Pick<OsmPlace, 'id' | 'name' | 'street' | 'city' | 'state' | 'lat' | 'lng'>

export async function addWantToGo(
  place: Wantable,
  database: CrumbsDb = db,
  now = Date.now(),
): Promise<void> {
  const { id, name, street, city, state, lat, lng } = place
  await database.wantToGo.put({ id, name, street, city, state, lat, lng, addedAt: now })
}

export async function removeWantToGo(id: string, database: CrumbsDb = db): Promise<void> {
  await database.wantToGo.delete(id)
}

/** Saved places, newest first. `undefined` while still being read. */
export function useWantToGo(): WantToGoRecord[] | undefined {
  return useLiveQuery(() => db.wantToGo.orderBy('addedAt').reverse().toArray())
}

/** Whether a place is saved. `undefined` while still being read. */
export function useIsWanted(id: string): boolean | undefined {
  return useLiveQuery(async () => (await db.wantToGo.get(id)) !== undefined, [id])
}
