import { useMemo, useState } from 'react'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { getTeamDisplayName } from '../lib/identityColors'

const TOP_N = 20

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

// Narrowed to just the fields this table actually uses (rather than the
// full LapRead) so both historical laps and live laps (which have no
// id/session_id — see api/types.ts's LiveLap) can be passed in directly.
export interface FastestLapsTableLap {
  car_number: string
  lap_number: number
  lap_time_seconds: number | null
  driver_name: string | null
  class: string | null
  team: string | null
}

export function FastestLapsTable({ laps }: { laps: FastestLapsTableLap[] }) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const fastestLaps = useMemo(() => {
    return laps
      .filter((l) => l.lap_time_seconds != null && activeClasses.has(l.class ?? 'Unknown'))
      .sort((a, b) => a.lap_time_seconds! - b.lap_time_seconds!)
      .slice(0, TOP_N)
  }, [laps, activeClasses])

  const fastestByCar = useMemo(() => {
    const best = new Map<string, LapRead>()
    for (const lap of laps) {
      if (lap.lap_time_seconds == null) continue
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      const prev = best.get(lap.car_number)
      if (!prev || lap.lap_time_seconds < prev.lap_time_seconds!) best.set(lap.car_number, lap)
    }
    return [...best.values()].sort((a, b) => a.lap_time_seconds! - b.lap_time_seconds!)
  }, [laps, activeClasses])

  // Cars sharing driving duties can have a car-level fastest lap set by only
  // one of them — this breaks the fastest lap out per individual driver
  // instead, so every driver's best lap is visible even if a teammate is
  // quicker overall.
  const fastestByDriver = useMemo(() => {
    const best = new Map<string, LapRead>()
    for (const lap of laps) {
      if (lap.lap_time_seconds == null || !lap.driver_name) continue
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      const prev = best.get(lap.driver_name)
      if (!prev || lap.lap_time_seconds < prev.lap_time_seconds!) best.set(lap.driver_name, lap)
    }
    return [...best.values()].sort((a, b) => a.lap_time_seconds! - b.lap_time_seconds!)
  }, [laps, activeClasses])

  return (
    <div className="fastest-laps">
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      <div className="race-stats-tables">
        <div>
          <h3>Top {TOP_N} fastest laps</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Time</th>
                  <th>Car</th>
                  <th>Driver</th>
                  <th>Lap</th>
                  <th>Class</th>
                </tr>
              </thead>
              <tbody>
                {fastestLaps.map((lap, i) => (
                  <tr key={`${lap.car_number}-${lap.lap_number}`}>
                    <td>{i + 1}</td>
                    <td>{formatLapTime(lap.lap_time_seconds!)}</td>
                    <td>#{lap.car_number}</td>
                    <td>{lap.driver_name ?? '—'}</td>
                    <td>{lap.lap_number}</td>
                    <td>{lap.class ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Fastest lap by car</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Team</th>
                  <th>Time</th>
                  <th>Driver</th>
                  <th>Lap</th>
                </tr>
              </thead>
              <tbody>
                {fastestByCar.map((lap) => (
                  <tr key={lap.car_number}>
                    <td>#{lap.car_number}</td>
                    <td>{lap.team ? getTeamDisplayName(lap.team) : '—'}</td>
                    <td>{formatLapTime(lap.lap_time_seconds!)}</td>
                    <td>{lap.driver_name ?? '—'}</td>
                    <td>{lap.lap_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Fastest lap by driver</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Car</th>
                  <th>Team</th>
                  <th>Time</th>
                  <th>Lap</th>
                </tr>
              </thead>
              <tbody>
                {fastestByDriver.map((lap) => (
                  <tr key={lap.driver_name}>
                    <td>{lap.driver_name}</td>
                    <td>#{lap.car_number}</td>
                    <td>{lap.team ? getTeamDisplayName(lap.team) : '—'}</td>
                    <td>{formatLapTime(lap.lap_time_seconds!)}</td>
                    <td>{lap.lap_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
