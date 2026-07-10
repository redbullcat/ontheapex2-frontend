import { useMemo, useState } from 'react'
import type { LapRead } from '../api/types'
import { formatLapTime, formatSplit } from '../replay/format'
import { computeLapHighlights, isLapExcluded, type HighlightTier } from '../lib/lapHighlights'
import { isLapValid } from '../lib/lapValidity'
import { useDeletedLapsVersion } from '../hooks/useDeletedLapsVersion'
import { FlagLapDeletedModal } from './FlagLapDeletedModal'
import { tyreSummary } from '../lib/carTyres'

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
  const [flagging, setFlagging] = useState<{ sessionId: number; carNumber: string; lapNumber: number; lapTimeSeconds: number } | null>(null)
  const deletedLapsVersion = useDeletedLapsVersion()
  const carClass = laps[0]?.class ?? null
  const highlights = useMemo(
    () => computeLapHighlights(laps, allLaps, carClass),
    // deletedLapsVersion isn't read directly here, but computeLapHighlights
    // reads the same module-level deleted-lap store via isLapExcluded — this
    // dependency is what makes flagging/restoring a lap actually update the
    // table, same pattern as SessionResultsTable/ResultsTable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laps, allLaps, carClass, deletedLapsVersion],
  )

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
            <th className="al">Tyre</th>
            <th>Age</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => {
            const h = highlights.get(lap.lap_number)
            const tyre = tyreSummary(lap)
            const timingInvalid = !isLapValid(lap)
            const excluded = isLapExcluded(lap)
            // Live/replay laps have no real session_id yet (see
            // liveLapAdapter.ts) — a lap can only be flagged once it
            // belongs to a persisted historical session.
            const flaggable = lap.session_id > 0 && lap.lap_time_seconds != null
            const rowClass = [
              'replay-row',
              lap.crossing_finish_line_in_pit === 'B' ? 'in-pit' : '',
              excluded ? 'lap-invalid' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={lap.lap_number}
                className={rowClass}
                title={timingInvalid ? 'Flagged not a valid timed lap (pit-in, track limits, etc)' : undefined}
              >
                <td className="num">{lap.lap_number}</td>
                <td className="al driver">{lap.driver_name ?? '—'}</td>
                <td className={tierClass(h?.lap ?? null)}>{formatLapTime(lap.lap_time_seconds)}</td>
                <td className={tierClass(h?.s1 ?? null)}>{formatSplit(lap.s1_seconds)}</td>
                <td className={tierClass(h?.s2 ?? null)}>{formatSplit(lap.s2_seconds)}</td>
                <td className={tierClass(h?.s3 ?? null)}>{formatSplit(lap.s3_seconds)}</td>
                <td className="num">{lap.crossing_finish_line_in_pit === 'B' ? 'IN' : ''}</td>
                <td className="al">{tyre.compound ?? '—'}</td>
                <td className="num">{tyre.age ?? '—'}</td>
                <td>
                  {flaggable && (
                    <button
                      type="button"
                      className="deleted-lap-flag-btn"
                      title={excluded ? 'Restore or edit this deleted-lap flag' : "Flag this lap as deleted (e.g. a steward's decision)"}
                      onClick={() =>
                        setFlagging({
                          sessionId: lap.session_id,
                          carNumber: lap.car_number,
                          lapNumber: lap.lap_number,
                          lapTimeSeconds: lap.lap_time_seconds!,
                        })
                      }
                    >
                      {excluded ? 'Flagged' : 'Flag lap'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {flagging && (
        <FlagLapDeletedModal
          sessionId={flagging.sessionId}
          carNumber={flagging.carNumber}
          lapNumber={flagging.lapNumber}
          lapTimeSeconds={flagging.lapTimeSeconds}
          onClose={() => setFlagging(null)}
        />
      )}
    </div>
  )
}
