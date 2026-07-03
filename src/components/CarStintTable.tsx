import { useMemo } from 'react'
import type { LapRead } from '../api/types'
import { computeCarStints } from '../lib/stints'
import { formatLapTime } from '../replay/format'

// Reuses computeCarStints (already built for the long-run pace charts) —
// `laps` is expected to already be filtered to one car, so every stint
// this returns belongs to it.
export function CarStintTable({ laps }: { laps: LapRead[] }) {
  const stints = useMemo(() => computeCarStints(laps), [laps])

  if (stints.length === 0) {
    return <p className="replay-hint">No completed stints yet.</p>
  }

  return (
    <div className="replay-board-wrap">
      <table className="replay-board">
        <thead>
          <tr>
            <th>Stint</th>
            <th className="al">Driver</th>
            <th>Laps</th>
            <th>Lap count</th>
            <th>Avg pace</th>
            <th>Best lap</th>
          </tr>
        </thead>
        <tbody>
          {stints.map((stint, i) => {
            const times = stint.laps.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
            const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
            const best = times.length ? Math.min(...times) : null
            const first = stint.laps[0]
            const last = stint.laps[stint.laps.length - 1]
            return (
              <tr key={i} className="replay-row">
                <td className="num">{i + 1}</td>
                <td className="al driver">{first.driver_name ?? '—'}</td>
                <td className="num">
                  {first.lap_number}–{last.lap_number}
                </td>
                <td className="num">{stint.laps.length}</td>
                <td className="num">{formatLapTime(avg)}</td>
                <td className="num best">{formatLapTime(best)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
