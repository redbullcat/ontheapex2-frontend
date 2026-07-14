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
import { TimeLossTrace } from './TimeLossTrace'

// Small header + an optional "add to dashboard" button, shared by every
// section below — only rendered when the caller (a dashboard-capable view)
// actually passed a handler; the modal works standalone without one too.
function SectionLabel({ children, kind, onAdd }: { children: string; kind: string; onAdd?: (kind: string) => void }) {
  return (
    <p className="replay-panel-label car-detail-section-label">
      {children}
      {onAdd && (
        <button type="button" className="car-detail-add-btn" onClick={() => onAdd(kind)} title="Add to dashboard">
          + Add to dashboard
        </button>
      )}
    </p>
  )
}

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
export interface StintContext {
  drivers: string
  startLap: number
  endLap: number
  fastestSeconds: number | null
  avgSeconds: number | null
  placesGainedLost: number | null
}

export function CarDetailModal({
  carNumber,
  allLaps,
  isRaceSession,
  onClose,
  onAddToDashboard,
  stintContext,
}: {
  carNumber: string
  allLaps: LapRead[]
  isRaceSession: boolean
  onClose: () => void
  // Lets each section below be pinned as its own independent, resizable
  // dashboard panel for this car — omit to use the modal as a plain
  // quick-glance popup with no dashboard behind it.
  onAddToDashboard?: (panelKind: string) => void
  // Set when opened from a specific stint (DriverHistoryChart's Gantt
  // blocks) rather than a car-wide "Results" row — the modal still shows
  // the whole car's history below (same as Live's car detail), but this
  // banner calls out which stint was actually clicked.
  stintContext?: StintContext
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

        {stintContext && (
          <p className="stint-context-banner">
            Stint: <strong>{stintContext.drivers}</strong> — Laps {stintContext.startLap}–{stintContext.endLap} · Fastest{' '}
            {formatLapTime(stintContext.fastestSeconds)} · Avg {formatLapTime(stintContext.avgSeconds)}
            {stintContext.placesGainedLost != null && (
              <>
                {' '}
                · Places{' '}
                {stintContext.placesGainedLost === 0
                  ? '±0'
                  : stintContext.placesGainedLost > 0
                    ? `+${stintContext.placesGainedLost}`
                    : stintContext.placesGainedLost}
              </>
            )}
          </p>
        )}

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

        <SectionLabel kind="car-position-history" onAdd={onAddToDashboard}>
          Position history
        </SectionLabel>
        <LapPositionChart laps={allLaps} focusCarNumber={carNumber} rankBy={isRaceSession ? 'elapsed' : 'bestLapSoFar'} />

        <SectionLabel kind="car-time-loss" onAdd={onAddToDashboard}>
          Time-loss trace
        </SectionLabel>
        <TimeLossTrace laps={allLaps} carNumber={carNumber} />

        <SectionLabel kind="car-pace" onAdd={onAddToDashboard}>
          Pace
        </SectionLabel>
        <PaceChart laps={carLaps} hideCarFilter />

        <SectionLabel kind="car-stints" onAdd={onAddToDashboard}>
          Stint history
        </SectionLabel>
        <CarStintTable laps={carLaps} />

        <SectionLabel kind="car-pit-stops" onAdd={onAddToDashboard}>
          Pit stops
        </SectionLabel>
        <PitTimeChart laps={carLaps} />

        <SectionLabel kind="car-lap-history" onAdd={onAddToDashboard}>
          Full lap history
        </SectionLabel>
        <CarLapHistoryTable laps={carLaps} allLaps={allLaps} />
      </div>
    </>
  )
}
