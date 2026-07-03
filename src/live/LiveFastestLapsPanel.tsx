import { useMemo } from 'react'
import type { LiveLap, LiveStanding } from '../api/types'
import { formatLapTime } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'

interface CarFastestLap {
  position: number | null
  class_position: number | null
  car_number: string
  class: string | null
  team: string | null
  driverWhoSetIt: string | null
  lap_time_seconds: number
  lap_number: number
}

// Deliberately ordered to match the main leaderboard's position order
// (not resorted by lap time) — the generic FastestLapsTable sorts by time,
// which made this list reshuffle independently of the leaderboard and
// looked like a bug. The driver shown is whoever was in the car for that
// specific lap, which isn't necessarily who's driving now (see
// row.driver_name on the main leaderboard for the current driver).
export function LiveFastestLapsPanel({ laps, standings }: { laps: LiveLap[]; standings: LiveStanding[] }) {
  const rows = useMemo(() => {
    const bestByCarNumber = new Map<string, LiveLap>()
    for (const lap of laps) {
      if (!lap.is_valid || lap.lap_time_seconds == null) continue
      const prev = bestByCarNumber.get(lap.car_number)
      if (!prev || lap.lap_time_seconds < prev.lap_time_seconds!) bestByCarNumber.set(lap.car_number, lap)
    }

    const result: CarFastestLap[] = []
    for (const standing of standings) {
      const best = bestByCarNumber.get(standing.car_number)
      if (!best || best.lap_time_seconds == null) continue
      result.push({
        position: standing.position,
        class_position: standing.class_position,
        car_number: standing.car_number,
        class: standing.class,
        team: standing.team,
        driverWhoSetIt: best.driver_name,
        lap_time_seconds: best.lap_time_seconds,
        lap_number: best.lap_number,
      })
    }
    return result
  }, [laps, standings])

  return (
    <div>
      <p className="replay-panel-label">
        Fastest lap by car
        <span className="hint"> — ordered like the leaderboard; driver shown is whoever set that lap, not necessarily who's driving now</span>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Cls&nbsp;Pos</th>
              <th>Car</th>
              <th>Team</th>
              <th>Time</th>
              <th>Set by</th>
              <th>Lap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.car_number}>
                <td>{row.position ?? '—'}</td>
                <td>{row.class_position ?? '—'}</td>
                <td>#{row.car_number}</td>
                <td>{getTeamDisplayName(row.team)}</td>
                <td>{formatLapTime(row.lap_time_seconds)}</td>
                <td>{row.driverWhoSetIt ?? '—'}</td>
                <td>{row.lap_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="replay-hint">No laps yet.</p>}
      </div>
    </div>
  )
}
