import { useMemo } from 'react'
import type { LapRead } from '../api/types'
import { getTeamDisplayName } from '../lib/identityColors'
import { computeCarSummary, computeCurrentBestLapRank } from '../lib/carDetail'
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
// `isRaceSession` matters because "position"/"laps led" only mean anything
// against a real running order — practice/qualifying sessions are
// classified by best lap instead (see LapPositionChart's rankBy and
// computeCurrentBestLapRank), same distinction the main app's own tabs
// already make (App.tsx's NON_RACE_TABS excludes its Position tab
// entirely for this exact reason).
//
// The three reused charts (PaceChart, LapPositionChart, PitTimeChart) are
// the exact same components the main historical app uses. PitTimeChart is
// unmodified; PaceChart/LapPositionChart gained small opt-in props
// (hideCarFilter / focusCarNumber+rankBy) so this panel can feed them
// pre-filtered/focused data without duplicating either chart.
export function CarDetailModal({
  carNumber,
  allLaps,
  isRaceSession,
  onClose,
}: {
  carNumber: string
  allLaps: LapRead[]
  isRaceSession: boolean
  onClose: () => void
}) {
  const carLaps = useMemo(
    () => allLaps.filter((l) => l.car_number === carNumber).sort((a, b) => a.lap_number - b.lap_number),
    [allLaps, carNumber],
  )
  const raceSummary = useMemo(
    () => (isRaceSession ? computeCarSummary(carNumber, allLaps) : null),
    [carNumber, allLaps, isRaceSession],
  )
  const bestLapRank = useMemo(
    () => (isRaceSession ? null : computeCurrentBestLapRank(carNumber, allLaps)),
    [carNumber, allLaps, isRaceSession],
  )
  const currentPosition = isRaceSession ? raceSummary?.currentPosition ?? null : bestLapRank

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
            <span className="stat-label">{isRaceSession ? 'Position' : 'Rank (best lap)'}</span>
            <span className="stat-value">{currentPosition ?? '—'}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Laps</span>
            <span className="stat-value">{carLaps.length}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Best lap</span>
            <span className="stat-value">{formatLapTime(bestLapSeconds)}</span>
          </div>
          {isRaceSession && (
            <div className="stat-tile">
              <span className="stat-label">% race led</span>
              <span className="stat-value">
                {raceSummary?.percentLed != null ? `${raceSummary.percentLed.toFixed(1)}%` : '—'}
              </span>
            </div>
          )}
          <div className="stat-tile">
            <span className="stat-label">Pit stops</span>
            <span className="stat-value">{pitStopCount}</span>
          </div>
        </div>

        <p className="replay-panel-label">Position history</p>
        <LapPositionChart laps={allLaps} focusCarNumber={carNumber} rankBy={isRaceSession ? 'elapsed' : 'bestLapSoFar'} />

        <p className="replay-panel-label">Pace</p>
        <PaceChart laps={carLaps} hideCarFilter />

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
