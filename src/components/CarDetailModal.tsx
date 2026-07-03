import { useMemo } from 'react'
import type { LapRead } from '../api/types'
import { getTeamDisplayName } from '../lib/identityColors'
import { computeCarSummary } from '../lib/carDetail'
import { formatLapTime } from '../replay/format'
import { PaceChart } from './PaceChart'
import { LapPositionChart } from './LapPositionChart'
import { PitTimeChart } from './PitTimeChart'
import { CarStintTable } from './CarStintTable'
import { CarLapHistoryTable } from './CarLapHistoryTable'

// `allLaps` is the whole field's laps as of "now" — for Live that's just
// data.laps as-is, for Replay it's data.laps filtered down to
// elapsed_seconds <= the current playback clock (see ReplayApp.tsx /
// LiveNowApp.tsx), which is what makes this panel show only what would
// actually be known at this point in a real live session, matching the
// explicit ask that Replay's car detail "act as if live."
//
// The three reused charts (PaceChart, LapPositionChart, PitTimeChart) are
// the exact same components the main historical app uses — deliberately
// unmodified, just fed a pre-filtered single-car laps array so their own
// internal class/car filters have nothing to filter and they render as a
// focused single-car view for free.
export function CarDetailModal({ carNumber, allLaps, onClose }: { carNumber: string; allLaps: LapRead[]; onClose: () => void }) {
  const carLaps = useMemo(
    () => allLaps.filter((l) => l.car_number === carNumber).sort((a, b) => a.lap_number - b.lap_number),
    [allLaps, carNumber],
  )
  const summary = useMemo(() => computeCarSummary(carNumber, allLaps), [carNumber, allLaps])

  const last = carLaps[carLaps.length - 1]
  const bestLapSeconds = useMemo(() => {
    const times = carLaps.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
    return times.length ? Math.min(...times) : null
  }, [carLaps])
  const pitStopCount = useMemo(() => carLaps.filter((l) => l.crossing_finish_line_in_pit === 'B').length, [carLaps])

  return (
    <>
      <div className="replay-backdrop" onClick={onClose} />
      <div className="car-detail-modal">
        <div className="car-detail-header">
          <div>
            <h2>
              #{carNumber} — {getTeamDisplayName(last?.team ?? null)}
            </h2>
            {last?.class && <span className="class-chip">{last.class}</span>}
          </div>
          <button type="button" className="replay-expand-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-label">Position</span>
            <span className="stat-value">{summary.currentPosition ?? '—'}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Laps</span>
            <span className="stat-value">{carLaps.length}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Best lap</span>
            <span className="stat-value">{formatLapTime(bestLapSeconds)}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">% race led</span>
            <span className="stat-value">{summary.percentLed != null ? `${summary.percentLed.toFixed(1)}%` : '—'}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Pit stops</span>
            <span className="stat-value">{pitStopCount}</span>
          </div>
        </div>

        <p className="replay-panel-label">Position history</p>
        <LapPositionChart laps={carLaps} />

        <p className="replay-panel-label">Pace</p>
        <PaceChart laps={carLaps} />

        <p className="replay-panel-label">Stint history</p>
        <CarStintTable laps={carLaps} />

        <p className="replay-panel-label">Pit stops</p>
        <PitTimeChart laps={carLaps} />

        <p className="replay-panel-label">Full lap history</p>
        <CarLapHistoryTable laps={carLaps} />
      </div>
    </>
  )
}
