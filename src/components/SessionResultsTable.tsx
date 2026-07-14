import { useMemo, useState } from 'react'
import type { LapRead, PenaltyRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { getDeletedLapOverride } from '../lib/lapOverrides'
import { useDeletedLapsVersion } from '../hooks/useDeletedLapsVersion'
import { FlagLapDeletedModal, type FlaggableLap } from './FlagLapDeletedModal'
import { isLapValid } from '../lib/lapValidity'

interface SessionResultRow {
  position: number
  classPosition: number
  car_number: string
  class: string
  team: string | null
  drivers: string
  fastestLap: number
  lapNumber: number
  sessionId: number
  lapsCompleted: number
  gap: string
  interval: string
  // Non-empty when a faster lap of this car's was skipped for classification
  // because it's flagged deleted — e.g. a pole lap struck down for a
  // sporting infringement, with the next-best time used instead (see
  // lapOverrides.ts). The lap itself is untouched, just excluded here.
  deletedReasons: string[]
  // Every timed lap of this car — lets the flag modal's lap picker target
  // any of them, not just whichever one counts as "fastest" here.
  timedLaps: FlaggableLap[]
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

  const fastestByCar: { lap: LapRead; deletedReasons: string[]; timedLaps: FlaggableLap[] }[] = []
  for (const rows of byCar.values()) {
    let bestValid: LapRead | null = null
    // Fastest among *all* timing-valid laps regardless of manual-deletion
    // status — the fallback classification lap if every one of a car's
    // laps has been flagged deleted, so the row (and its flag button)
    // doesn't disappear entirely.
    let bestAny: LapRead | null = null
    const deletedReasons: string[] = []
    const timedLaps: FlaggableLap[] = []
    for (const r of rows) {
      if (r.lap_time_seconds == null) continue
      timedLaps.push({ lapNumber: r.lap_number, lapTimeSeconds: r.lap_time_seconds })
      if (!isLapValid(r)) continue
      if (!bestAny || r.lap_time_seconds < bestAny.lap_time_seconds!) bestAny = r
      const override = getDeletedLapOverride(r.session_id, r.car_number, r.lap_number)
      if (override) {
        deletedReasons.push(`Lap ${r.lap_number}: ${override.reason}`)
        continue
      }
      if (!bestValid || r.lap_time_seconds < bestValid.lap_time_seconds!) bestValid = r
    }
    const display = bestValid ?? bestAny
    if (display) fastestByCar.push({ lap: display, deletedReasons, timedLaps })
  }
  fastestByCar.sort((a, b) => a.lap.lap_time_seconds! - b.lap.lap_time_seconds!)
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

  const leaderTime = fastestByCar[0].lap.lap_time_seconds!

  return fastestByCar.map(({ lap, deletedReasons, timedLaps }, i) => {
    const cls = lap.class ?? 'Unknown'
    const nextClassPos = (classCounters.get(cls) ?? 0) + 1
    classCounters.set(cls, nextClassPos)
    classPositions.set(lap.car_number, nextClassPos)

    const gap = i === 0 ? '—' : `+${(lap.lap_time_seconds! - leaderTime).toFixed(3)}s`
    const interval =
      i === 0 ? '—' : `+${(lap.lap_time_seconds! - fastestByCar[i - 1].lap.lap_time_seconds!).toFixed(3)}s`

    return {
      position: i + 1,
      classPosition: nextClassPos,
      car_number: lap.car_number,
      class: cls,
      team: lap.team,
      drivers: driversByCar.get(lap.car_number) ?? '',
      fastestLap: lap.lap_time_seconds!,
      lapNumber: lap.lap_number,
      sessionId: lap.session_id,
      lapsCompleted: lapsCompletedByCar.get(lap.car_number) ?? 0,
      gap,
      interval,
      deletedReasons,
      timedLaps,
    }
  })
}

export function SessionResultsTable({
  laps,
  onSelectCar,
  penalties = [],
}: {
  laps: LapRead[]
  onSelectCar?: (carNumber: string) => void
  penalties?: PenaltyRead[]
}) {
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

  const penaltiesByCar = useMemo(() => {
    const m = new Map<string, PenaltyRead[]>()
    for (const p of penalties) {
      const arr = m.get(p.car_number)
      if (arr) arr.push(p)
      else m.set(p.car_number, [p])
    }
    return m
  }, [penalties])

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.car_number}>
                  <td>{row.position}</td>
                  {showClassColumn && <td>{row.classPosition}</td>}
                  <td>
                    {onSelectCar ? (
                      <button type="button" className="car-number-link" onClick={() => onSelectCar(row.car_number)}>
                        #{row.car_number}
                      </button>
                    ) : (
                      `#${row.car_number}`
                    )}
                    {(penaltiesByCar.get(row.car_number) ?? []).map((p) => (
                      <span className="penalty-badge" key={p.id} title={`${p.penalty} — ${p.reason}`}>
                        ⚠ {p.penalty}
                        {p.stewards_doc_url && (
                          <a href={p.stewards_doc_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            doc
                          </a>
                        )}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className="team-key" style={{ background: getTeamColor(row.team) }} />
                    {row.team ? getTeamDisplayName(row.team) : '—'}
                  </td>
                  {showClassColumn && <td>{row.class}</td>}
                  <td>{row.drivers || '—'}</td>
                  <td>
                    {formatLapTime(row.fastestLap)}
                    {row.deletedReasons.length > 0 && (
                      <span className="deleted-lap-badge" title={row.deletedReasons.join('\n')}>
                        🚩 adjusted
                      </span>
                    )}
                  </td>
                  <td>{row.lapNumber}</td>
                  <td>{row.gap}</td>
                  <td>{row.interval}</td>
                  <td>{row.lapsCompleted}</td>
                  <td>
                    <button
                      type="button"
                      className="deleted-lap-flag-btn"
                      title="Flag this lap as deleted (e.g. a steward's decision)"
                      onClick={() =>
                        setFlagging({
                          sessionId: row.sessionId,
                          carNumber: row.car_number,
                          carLaps: row.timedLaps,
                          initialLapNumber: row.lapNumber,
                        })
                      }
                    >
                      Flag lap
                    </button>
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
