import { useMemo, useState } from 'react'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'

interface SessionResultRow {
  position: number
  classPosition: number
  car_number: string
  class: string
  team: string | null
  drivers: string
  fastestLap: number
  lapNumber: number
  lapsCompleted: number
  gap: string
  interval: string
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

// Practice and qualifying sessions have no fixed race distance, so a
// classification by laps-completed/elapsed-time (like the race Results
// table) doesn't apply — ranking by each car's fastest lap is the
// meaningful "results" for these session types, mirroring
// practice_fastest_laps_table.py.
function buildResults(laps: LapRead[], activeClasses: Set<string>): SessionResultRow[] {
  const filtered = laps.filter((l) => activeClasses.has(l.class ?? 'Unknown'))
  if (filtered.length === 0) return []

  const byCar = new Map<string, LapRead[]>()
  for (const lap of filtered) {
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const fastestByCar: LapRead[] = []
  for (const rows of byCar.values()) {
    let best: LapRead | null = null
    for (const r of rows) {
      if (r.lap_time_seconds == null) continue
      if (!best || r.lap_time_seconds < best.lap_time_seconds!) best = r
    }
    if (best) fastestByCar.push(best)
  }
  fastestByCar.sort((a, b) => a.lap_time_seconds! - b.lap_time_seconds!)
  if (fastestByCar.length === 0) return []

  const driversByCar = new Map<string, string>()
  const lapsCompletedByCar = new Map<string, number>()
  for (const [car, rows] of byCar) {
    const names = [...new Set(rows.map((r) => r.driver_name).filter((n): n is string => !!n))].sort()
    driversByCar.set(car, names.join(' / '))
    lapsCompletedByCar.set(car, new Set(rows.map((r) => r.lap_number)).size)
  }

  const classPositions = new Map<string, number>()
  const classCounters = new Map<string, number>()

  const leaderTime = fastestByCar[0].lap_time_seconds!

  return fastestByCar.map((lap, i) => {
    const cls = lap.class ?? 'Unknown'
    const nextClassPos = (classCounters.get(cls) ?? 0) + 1
    classCounters.set(cls, nextClassPos)
    classPositions.set(lap.car_number, nextClassPos)

    const gap = i === 0 ? '—' : `+${(lap.lap_time_seconds! - leaderTime).toFixed(3)}s`
    const interval =
      i === 0 ? '—' : `+${(lap.lap_time_seconds! - fastestByCar[i - 1].lap_time_seconds!).toFixed(3)}s`

    return {
      position: i + 1,
      classPosition: nextClassPos,
      car_number: lap.car_number,
      class: cls,
      team: lap.team,
      drivers: driversByCar.get(lap.car_number) ?? '',
      fastestLap: lap.lap_time_seconds!,
      lapNumber: lap.lap_number,
      lapsCompleted: lapsCompletedByCar.get(lap.car_number) ?? 0,
      gap,
      interval,
    }
  })
}

export function SessionResultsTable({ laps }: { laps: LapRead[] }) {
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

  const rows = useMemo(() => buildResults(laps, activeClasses), [laps, activeClasses])
  const showClassColumn = classSelection === null || classSelection.size > 1

  return (
    <div className="results-table">
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      {rows.length === 0 ? (
        <p className="hint">No lap time data for this selection.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                {showClassColumn && <th>Class Pos</th>}
                <th>Car</th>
                <th>Team</th>
                {showClassColumn && <th>Class</th>}
                <th>Drivers</th>
                <th>Fastest Lap</th>
                <th>Lap</th>
                <th>Gap</th>
                <th>Interval</th>
                <th>Laps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.car_number}>
                  <td>{row.position}</td>
                  {showClassColumn && <td>{row.classPosition}</td>}
                  <td>#{row.car_number}</td>
                  <td>
                    <span className="team-key" style={{ background: getTeamColor(row.team) }} />
                    {row.team ? getTeamDisplayName(row.team) : '—'}
                  </td>
                  {showClassColumn && <td>{row.class}</td>}
                  <td>{row.drivers || '—'}</td>
                  <td>{formatLapTime(row.fastestLap)}</td>
                  <td>{row.lapNumber}</td>
                  <td>{row.gap}</td>
                  <td>{row.interval}</td>
                  <td>{row.lapsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
