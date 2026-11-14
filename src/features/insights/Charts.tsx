import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, plural } from '@/lib/format'
import { formatScore, type OverallPrecision } from '@/lib/rubric'
import type { RatedCookie } from '@/lib/stats'

const axisTick = { fill: 'var(--ink-soft)', fontSize: 12, fontFamily: 'var(--font-sans)' }

function TooltipCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3 py-2 shadow-pop">
      <p className="numerals text-lg leading-tight font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  )
}

interface DistributionProps {
  data: { band: number; count: number }[]
}

/** How many cookies landed in each whole-point band. */
export function DistributionChart({ data }: DistributionProps) {
  const rows = data.map((d) => ({
    ...d,
    name: String(d.band),
    range: d.band === 10 ? 'A perfect 10' : `${d.band} – ${d.band}.9`,
  }))
  return (
    <>
      <div className="h-52" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 4, bottom: 0, left: -24 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              tick={axisTick}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--oat)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined
                return row ? (
                  <TooltipCard value={plural(row.count, 'cookie')} label={`Scored ${row.range}`} />
                ) : null
              }}
            />
            <Bar
              dataKey="count"
              fill="var(--crust)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              activeBar={{ fillOpacity: 0.78 }}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Number of cookies by overall score</caption>
        <thead>
          <tr>
            <th scope="col">Score</th>
            <th scope="col">Cookies</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.band}>
              <th scope="row">{r.range}</th>
              <td>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

interface TrendProps {
  cookies: RatedCookie[]
  precision: OverallPrecision
}

/** Overall score of every cookie, oldest to newest. */
export function TrendChart({ cookies, precision }: TrendProps) {
  const rows = cookies.map((c, i) => ({
    i,
    overall: c.overall,
    date: formatDate(c.eatenOn, 'short'),
    label: `${c.cookieType} · ${c.bakery}`,
  }))
  return (
    <>
      <div className="h-52" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, Math.max(1, rows.length - 1)]}
              ticks={rows.length > 1 ? [0, rows.length - 1] : [0]}
              tickFormatter={(i: number) => rows[i]?.date ?? ''}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              tick={axisTick}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              domain={[1, 10]}
              ticks={[1, 5, 10]}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              width={48}
            />
            <ReferenceLine
              y={5}
              stroke="var(--ink-faint)"
              strokeWidth={1}
              label={{
                value: 'Standard',
                position: 'insideBottomRight',
                fill: 'var(--ink-soft)',
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--ink-faint)', strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined
                return row ? (
                  <TooltipCard
                    value={formatScore(row.overall, precision)}
                    label={`${row.label} · ${row.date}`}
                  />
                ) : null
              }}
            />
            <Line
              dataKey="overall"
              type="linear"
              stroke="var(--crust)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: 'var(--crust)', stroke: 'var(--paper)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--crust)', stroke: 'var(--paper)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Overall score of each cookie, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Cookie</th>
            <th scope="col">Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i}>
              <td>{r.date}</td>
              <th scope="row">{r.label}</th>
              <td>{formatScore(r.overall, precision)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
