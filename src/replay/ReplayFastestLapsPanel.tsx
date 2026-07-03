import type { RowState } from './replayEngine'
import { formatLapTime } from './format'
import { getTeamDisplayName } from '../lib/identityColors'

// Same idea as the live view's LiveFastestLapsPanel: ordered like the
// leaderboard (rows are already position-sorted by the engine), not
// resorted by lap time, and shows which driver actually set the lap
// (RowState.bestLapDriverName), not just who's driving at the current
// playback position.
export function ReplayFastestLapsPanel({ rows, activeClasses }: { rows: RowState[]; activeClasses: Set<string> }) {
  const visible = rows.filter((r) => activeClasses.has(r.class) && r.bestLap != null)

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
            {visible.map((row) => (
              <tr key={row.car_number}>
                <td>{row.position}</td>
                <td>{row.classPosition}</td>
                <td>#{row.car_number}</td>
                <td>{getTeamDisplayName(row.team)}</td>
                <td>{formatLapTime(row.bestLap)}</td>
                <td>{row.bestLapDriverName ?? '—'}</td>
                <td>{row.bestLapNumber ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="replay-hint">No laps yet.</p>}
      </div>
    </div>
  )
}
