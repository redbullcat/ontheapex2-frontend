import type { LapRead } from '../api/types'
import { formatLapTime, formatSplit } from '../replay/format'

// `laps` expected pre-filtered to one car and pre-sorted by lap_number —
// this is a dumb presentational table, no computation of its own.
export function CarLapHistoryTable({ laps }: { laps: LapRead[] }) {
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
          {laps.map((lap) => (
            <tr key={lap.lap_number} className={lap.crossing_finish_line_in_pit === 'B' ? 'replay-row in-pit' : 'replay-row'}>
              <td className="num">{lap.lap_number}</td>
              <td className="al driver">{lap.driver_name ?? '—'}</td>
              <td className={lap.lap_improvement ? 'num best' : 'num'}>{formatLapTime(lap.lap_time_seconds)}</td>
              <td className="num">{formatSplit(lap.s1_seconds)}</td>
              <td className="num">{formatSplit(lap.s2_seconds)}</td>
              <td className="num">{formatSplit(lap.s3_seconds)}</td>
              <td className="num">{lap.crossing_finish_line_in_pit === 'B' ? 'IN' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
