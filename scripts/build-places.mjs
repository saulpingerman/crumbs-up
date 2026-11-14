// Builds src/data/us-places.json: a compact list of U.S. cities and towns
// with coordinates, used for city suggestions and for placing bakeries on
// the map without calling any online service.
//
// Source: GeoNames (https://www.geonames.org, CC BY 4.0) "cities1000", via
// the `all-the-cities` npm package. To refresh:
//
//   npm install --no-save all-the-cities
//   node scripts/build-places.mjs
//
// Output shape, grouped by state and sorted by population (largest first):
//   { "OR": [["Portland", 45.523, -122.676, 652503], …], … }
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const cities = require('all-the-cities')

const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  ),
)

const byState = {}
const seen = new Set()
let kept = 0
for (const city of [...cities].sort((a, b) => b.population - a.population)) {
  if (city.country !== 'US' || !STATES.has(city.adminCode)) continue
  const key = `${city.name.toLowerCase()}|${city.adminCode}`
  if (seen.has(key)) continue // keep the largest of any same-named places in a state
  seen.add(key)
  const [lng, lat] = city.loc.coordinates
  ;(byState[city.adminCode] ??= []).push([
    city.name,
    Math.round(lat * 1000) / 1000,
    Math.round(lng * 1000) / 1000,
    city.population,
  ])
  kept++
}

const sorted = Object.fromEntries(
  Object.keys(byState)
    .sort()
    .map((s) => [s, byState[s]]),
)
const out = fileURLToPath(new URL('../src/data/us-places.json', import.meta.url))
writeFileSync(out, JSON.stringify(sorted))
console.log(`${kept} places in ${Object.keys(sorted).length} states → ${out}`)
