import { useMemo } from 'react'
import type { LapRead } from '../api/types'
import { formatLapTime, formatSplit } from '../replay/format'
import { computeLapHighlights, type HighlightTier } from '../lib/lapHighlights'
import { isLapValid } from '../lib/lapValidity'

function tierClass(tier: HighlightTier): string {
  if (tier === 'session') return 'num badge-session'
  if (tier === 'car') return 'num car-best'
  if (tier === 'personal') return 'num badge-personal'
  return 'num'
}

// `laps` expected pre-filtered to one car and pre-sorted by lap_number.
// `allLaps` (the whole session) is needed to work out the class session-best
// reference — everything else is computed from `laps` alone.
export function CarLapHistoryTable({ laps, allLaps }: { laps: LapRead[]; allLaps: LapRead[] }) {
  const carClass = laps[0]?.class ?? null
  const highlights = useMemo(() => computeLapHighlights(laps, allLaps, carClass), [laps, allLaps, carClass])

  if (laps.length === 0) {
    return <p className="replay-hint">No completed laps yet.</p>
  }

  return (
    <div className="replay-board-wrap car-lap-history">
      <table className="replay-board">
        <thead>
          <tr>
            <th>Lap</th>
            <th className="al">Driver</th>
            <th>Time</th>
            <th>S1</th>
            <th>S2</th>
            <th>S3</th>
            <th>Pit</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => {
            const h = highlights.get(lap.lap_number)
            const valid = isLapValid(lap)
            const rowClass = [
              'replay-row',
              lap.crossing_finish_line_in_pit === 'B' ? 'in-pit' : '',
              valid ? '' : 'lap-invalid',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr key={lap.lap_number} className={rowClass} title={valid ? undefined : 'Flagged not a valid timed lap (pit-in, track limits, etc)'}>
                <td className="num">{lap.lap_number}</td>
                <td className="al driver">{lap.driver_name ?? '—'}</td>
                <td className={tierClass(h?.lap ?? null)}>{formatLapTime(lap.lap_time_seconds)}</td>
                <td className={tierClass(h?.s1 ?? null)}>{formatSplit(lap.s1_seconds)}</td>
                <td className={tierClass(h?.s2 ?? null)}>{formatSplit(lap.s2_seconds)}</td>
                <td className={tierClass(h?.s3 ?? null)}>{formatSplit(lap.s3_seconds)}</td>
                <td className="num">{lap.crossing_finish_line_in_pit === 'B' ? 'IN' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
