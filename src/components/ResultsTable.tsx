import { useMemo, useState } from 'react'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { getDeletedLapOverride } from '../lib/lapOverrides'
import { useDeletedLapsVersion } from '../hooks/useDeletedLapsVersion'
import { FlagLapDeletedModal, type FlaggableLap } from './FlagLapDeletedModal'
import { isLapValid } from '../lib/lapValidity'

interface ResultsRow {
  position: number
  car_number: string
  class: string
  team: string | null
  drivers: string
  laps: number
  totalTime: string | null
  gap: string
  interval: string
  fastest: LapRead | null
  deletedReasons: string[]
  pits: number
  sessionId: number | null
  timedLaps: FlaggableLap[]
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

function buildResults(laps: LapRead[], activeClasses: Set<string>): ResultsRow[] {
  const filtered = laps.filter(
    (l) => l.elapsed_seconds != null && l.lap_number != null && activeClasses.has(l.class ?? 'Unknown'),
  )
  if (filtered.length === 0) return []

  const byCar = new Map<string, LapRead[]>()
  for (const lap of filtered) {
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  // Final classification: most laps completed, ties broken by earliest elapsed time.
  const lastLaps: LapRead[] = []
  for (const rows of byCar.values()) {
    let best = rows[0]
    for (const r of rows) if (r.lap_number > best.lap_number) best = r
    lastLaps.push(best)
  }
  lastLaps.sort((a, b) => b.lap_number - a.lap_number || a.elapsed_seconds! - b.elapsed_seconds!)

  const leaderLap = lastLaps[0].lap_number
  const leaderTime = lastLaps[0].elapsed_seconds!

  const driversByCar = new Map<string, string>()
  const fastestByCar = new Map<string, LapRead>()
  const deletedReasonsByCar = new Map<string, string[]>()
  const pitsByCar = new Map<string, number>()
  const sessionIdByCar = new Map<string, number>()
  const timedLapsByCar = new Map<string, FlaggableLap[]>()
  for (const [car, rows] of byCar) {
    const names = [...new Set(rows.map((r) => r.driver_name).filter((n): n is string => !!n))].sort()
    driversByCar.set(car, names.join(' / '))

    let fastest: LapRead | null = null
    const deletedReasons: string[] = []
    // Every timed lap of this car, valid or not, flagged or not — lets the
    // flag modal's lap picker target any of them, not just whichever one is
    // currently fastest (see FlagLapDeletedModal.tsx).
    const timedLaps: FlaggableLap[] = []
    for (const r of rows) {
      if (r.lap_time_seconds == null) continue
      timedLaps.push({ lapNumber: r.lap_number, lapTimeSeconds: r.lap_time_seconds })
      if (sessionIdByCar.get(car) === undefined) sessionIdByCar.set(car, r.session_id)
      if (!isLapValid(r)) continue
      // A lap flagged deleted (e.g. a steward's decision) is skipped for
      // "fastest lap" purposes — the lap itself still counts towards laps
      // completed/car order above, only its time is excluded here, same
      // as SessionResultsTable.
      const override = getDeletedLapOverride(r.session_id, r.car_number, r.lap_number)
      if (override) {
        deletedReasons.push(`Lap ${r.lap_number}: ${override.reason}`)
        continue
      }
      if (!fastest || r.lap_time_seconds < fastest.lap_time_seconds!) fastest = r
    }
    if (fastest) fastestByCar.set(car, fastest)
    deletedReasonsByCar.set(car, deletedReasons)
    timedLapsByCar.set(car, timedLaps)

    pitsByCar.set(car, rows.filter((r) => r.crossing_finish_line_in_pit === 'B').length)
  }

  return lastLaps.map((lastLap, i) => {
    const car = lastLap.car_number
    const lapsDown = leaderLap - lastLap.lap_number
    const gap =
      i === 0
        ? '—'
        : lapsDown >= 1
          ? `${lapsDown} lap${lapsDown > 1 ? 's' : ''}`
          : `${(lastLap.elapsed_seconds! - leaderTime).toFixed(3)}s`

    let interval = '—'
    if (i > 0) {
      const prev = lastLaps[i - 1]
      const prevLapsDown = prev.lap_number - lastLap.lap_number
      interval =
        prevLapsDown >= 1
          ? `${prevLapsDown} lap${prevLapsDown > 1 ? 's' : ''}`
          : `${(lastLap.elapsed_seconds! - prev.elapsed_seconds!).toFixed(3)}s`
    }

    return {
      position: i + 1,
      car_number: car,
      class: lastLap.class ?? 'Unknown',
      team: lastLap.team,
      drivers: driversByCar.get(car) ?? '',
      laps: lastLap.lap_number,
      totalTime: lastLap.elapsed,
      gap,
      interval,
      fastest: fastestByCar.get(car) ?? null,
      deletedReasons: deletedReasonsByCar.get(car) ?? [],
      pits: pitsByCar.get(car) ?? 0,
      sessionId: sessionIdByCar.get(car) ?? null,
      timedLaps: timedLapsByCar.get(car) ?? [],
    }
  })
}

export function ResultsTable({ laps, onSelectCar }: { laps: LapRead[]; onSelectCar?: (carNumber: string) => void }) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [flagging, setFlagging] = useState<{ sessionId: number; carNumber: string; carLaps: FlaggableLap[]; initialLapNumber: number } | null>(
    null,
  )
  const deletedLapsVersion = useDeletedLapsVersion()

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const rows = useMemo(
    () => buildResults(laps, activeClasses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laps, activeClasses, deletedLapsVersion],
  )
  const showClassColumn = classSelection === null || classSelection.size > 1

  return (
    <div className="results-table">
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      {rows.length === 0 ? (
        <p className="hint">No results for this selection.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>Car</th>
                <th>Team</th>
                {showClassColumn && <th>Class</th>}
                <th>Drivers</th>
                <th>Laps</th>
                <th>Total time</th>
                <th>Gap</th>
                <th>Interval</th>
                <th>Fastest lap</th>
                <th>Pits</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.car_number}>
                  <td>{row.position}</td>
                  <td>
                    {onSelectCar ? (
                      <button type="button" className="car-number-link" onClick={() => onSelectCar(row.car_number)}>
                        #{row.car_number}
                      </button>
                    ) : (
                      `#${row.car_number}`
                    )}
                  </td>
                  <td>
                    <span className="team-key" style={{ background: getTeamColor(row.team) }} />
                    {row.team ? getTeamDisplayName(row.team) : '—'}
                  </td>
                  {showClassColumn && <td>{row.class}</td>}
                  <td>{row.drivers || '—'}</td>
                  <td>{row.laps}</td>
                  <td>{row.totalTime ?? '—'}</td>
                  <td>{row.gap}</td>
                  <td>{row.interval}</td>
                  <td>
                    {row.fastest ? `${formatLapTime(row.fastest.lap_time_seconds!)} (${row.fastest.driver_name ?? '—'})` : '—'}
                    {row.deletedReasons.length > 0 && (
                      <span className="deleted-lap-badge" title={row.deletedReasons.join('\n')}>
                        🚩 adjusted
                      </span>
                    )}
                  </td>
                  <td>{row.pits}</td>
                  <td>
                    {row.sessionId != null && row.timedLaps.length > 0 && (
                      <button
                        type="button"
                        className="deleted-lap-flag-btn"
                        title="Flag a lap of this car as deleted (e.g. a steward's decision)"
                        onClick={() =>
                          setFlagging({
                            sessionId: row.sessionId!,
                            carNumber: row.car_number,
                            carLaps: row.timedLaps,
                            initialLapNumber: row.fastest?.lap_number ?? row.timedLaps[0].lapNumber,
                          })
                        }
                      >
                        Flag lap
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {flagging && (
        <FlagLapDeletedModal
          sessionId={flagging.sessionId}
          carNumber={flagging.carNumber}
          carLaps={flagging.carLaps}
          initialLapNumber={flagging.initialLapNumber}
          onClose={() => setFlagging(null)}
        />
      )}
    </div>
  )
}
