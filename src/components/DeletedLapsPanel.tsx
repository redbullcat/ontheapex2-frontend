import { useMemo, useState } from 'react'
import type { LapRead } from '../api/types'
import { formatLapTime } from '../replay/format'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { isLapValid } from '../lib/lapValidity'

// Every lap Griiip's live feed itself flagged not a valid timed lap
// (track-limit deletions, pit-in laps, red-flag/driver-change out-laps —
// see lib/lapValidity.ts) — distinct from the user-entered "flag lap
// deleted" overrides (lapOverrides.ts), which need a real historical
// session_id and so can't apply to a live/replay lap yet (see
// CarLapHistoryTable's `flaggable` check). Griiip doesn't report *why* a
// lap was invalidated beyond the one boolean, so there's no reason text
// to show here — only which lap, and whose.
export function DeletedLapsPanel({ laps }: { laps: LapRead[] }) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const allClasses = useMemo(() => [...new Set(laps.map((l) => l.class ?? 'Unknown'))].sort(), [laps])
  const activeClasses = useMemo(() => resolveClassSelection(classSelection, allClasses), [classSelection, allClasses])

  const rows = useMemo(
    () =>
      laps
        .filter((l) => !isLapValid(l) && activeClasses.has(l.class ?? 'Unknown'))
        .sort((a, b) => b.lap_number - a.lap_number || a.car_number.localeCompare(b.car_number)),
    [laps, activeClasses],
  )

  return (
    <div className="replay-board-wrap deleted-laps-panel">
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      {rows.length === 0 ? (
        <p className="replay-hint">No deleted laps yet.</p>
      ) : (
        <table className="replay-board">
          <thead>
            <tr>
              <th className="al">Car</th>
              <th className="al">Driver</th>
              <th>Lap</th>
              <th>Time</th>
              <th className="al">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={`${l.car_number}:${l.lap_number}`} className="replay-row lap-invalid">
                <td className="al">
                  <span className="car-num">#{l.car_number}</span>
                </td>
                <td className="al driver">{l.driver_name ?? '—'}</td>
                <td className="num">{l.lap_number}</td>
                <td className="num">{formatLapTime(l.lap_time_seconds)}</td>
                <td className="al">Not a valid timed lap (pit-in, track limits, etc)</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
