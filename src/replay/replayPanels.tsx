import { useMemo, useState } from 'react'
import type { ReplayData } from './replayData'
import type { RowState } from './replayEngine'
import type { PanelDef, PanelInstance } from '../dashboard/types'
import { ReplayLeaderboard } from './ReplayLeaderboard'
import { ClassFilter } from '../components/ClassFilter'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { RaceLogPanel } from '../live/RaceLogPanel'
import { REPLAY_RACE_LOG_TYPES } from './raceLogSynth'
import { ReplayFastestLapsPanel } from './ReplayFastestLapsPanel'
import { ReplayTrendChart } from './ReplayTrendChart'
import { CircleOfDoom } from '../components/CircleOfDoom'
import { TrackMap } from '../components/TrackMap'
import { findTrackMapUrl } from '../lib/trackMaps'
import { computeSectorFractions } from '../lib/trackFraction'
import { LapPositionChart } from '../components/LapPositionChart'
import { PaceChart } from '../components/PaceChart'
import { PitTimeChart } from '../components/PitTimeChart'
import { CarStintTable } from '../components/CarStintTable'
import { CarLapHistoryTable } from '../components/CarLapHistoryTable'
import { TimeLossTrace } from '../components/TimeLossTrace'
import { formatClock } from './format'
import type { RaceLogType } from '../api/types'

export interface ReplayPanelContext {
  data: ReplayData
  rows: RowState[]
  activeClasses: Set<string>
  currentTime: number
  leaderLap: number
  title: string
  isRaceSession: boolean
  // Field-wide laps masked to the current playback clock — "as if live",
  // same principle as the car detail modal's own carDetailLaps. Computed
  // once per (floored) second by the caller, not per-panel.
  visibleLaps: ReplayData['laps']
}

export const REPLAY_PANEL_DEFS: Record<string, PanelDef> = {
  leaderboard: { kind: 'leaderboard', title: 'Leaderboard', category: 'field', defaultSize: { w: 12, h: 11 }, hasSettings: true },
  'race-log': { kind: 'race-log', title: 'Race log', category: 'field', defaultSize: { w: 6, h: 8 } },
  'fastest-laps': { kind: 'fastest-laps', title: 'Fastest laps', category: 'field', defaultSize: { w: 6, h: 8 } },
  'gap-evolution': { kind: 'gap-evolution', title: 'Gap evolution', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'lap-position': {
    kind: 'lap-position',
    title: 'Lap-by-lap position',
    category: 'field',
    defaultSize: { w: 6, h: 8 },
    hasSettings: true,
  },
  'track-map': { kind: 'track-map', title: 'Track map', category: 'field', defaultSize: { w: 4, h: 13 } },
  'circle-of-doom': { kind: 'circle-of-doom', title: 'Circle of doom', category: 'field', defaultSize: { w: 4, h: 13 } },
  'car-position-history': {
    kind: 'car-position-history',
    title: 'Position history',
    category: 'car',
    defaultSize: { w: 6, h: 7 },
    hasSettings: true,
  },
  'car-time-loss': { kind: 'car-time-loss', title: 'Time-loss trace', category: 'car', defaultSize: { w: 6, h: 6 } },
  'car-pace': { kind: 'car-pace', title: 'Pace', category: 'car', defaultSize: { w: 6, h: 7 }, hasSettings: true },
  'car-stints': { kind: 'car-stints', title: 'Stint history', category: 'car', defaultSize: { w: 6, h: 6 } },
  'car-pit-stops': { kind: 'car-pit-stops', title: 'Pit stops', category: 'car', defaultSize: { w: 6, h: 7 }, hasSettings: true },
  'car-lap-history': { kind: 'car-lap-history', title: 'Full lap history', category: 'car', defaultSize: { w: 5, h: 9 } },
}

export const REPLAY_DEFAULT_PANELS: PanelInstance[] = [
  { id: 'leaderboard', kind: 'leaderboard' },
  { id: 'race-log', kind: 'race-log' },
]

function replayTimestampFormatter(elapsedTimeMillis: number): string {
  return formatClock(elapsedTimeMillis / 1000)
}

function LeaderboardPanel({
  ctx,
  onRowClick,
  compactFilters,
}: {
  ctx: ReplayPanelContext
  onRowClick?: (car: string) => void
  compactFilters?: boolean
}) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const activeClasses = useMemo(() => resolveClassSelection(classSelection, ctx.data.classes), [classSelection, ctx.data.classes])
  const filterControls = (
    <div className="replay-trend-controls">
      <ClassFilter classes={ctx.data.classes} selection={classSelection} onChange={setClassSelection} />
    </div>
  )
  return (
    <div>
      <p className="replay-panel-label">
        Updates on every sector crossing
        <span className="hint">
          {' '}
          — blank = split not recorded · violet row = in the pits · purple time = session best in class · green time = personal best
        </span>
      </p>
      {compactFilters ? <PanelSettingsPopover>{filterControls}</PanelSettingsPopover> : filterControls}
      <ReplayLeaderboard rows={ctx.rows} activeClasses={activeClasses} onRowClick={onRowClick} />
    </div>
  )
}

function carLapsFor(ctx: ReplayPanelContext, carNumber: string) {
  return ctx.visibleLaps.filter((l) => l.car_number === carNumber).sort((a, b) => a.lap_number - b.lap_number)
}

// The single place that maps a panel instance to its rendered content —
// every chart here is the exact same component the sidebar/car-detail
// modal already use, just fed from this shared context instead.
export function renderReplayPanel(
  panel: PanelInstance,
  ctx: ReplayPanelContext,
  onRowClick?: (car: string) => void,
  // Set true only from the dashboard grid (DashboardGrid/PanelFrame gives
  // every panel a gear-icon settings popup there) — left false for pop-out
  // windows, which have a whole browser window to themselves and keep
  // showing these same filters inline like before this dashboard existed.
  compactFilters = false,
) {
  switch (panel.kind) {
    case 'leaderboard':
      return <LeaderboardPanel ctx={ctx} onRowClick={onRowClick} compactFilters={compactFilters} />
    case 'race-log':
      return (
        <RaceLogPanel
          entries={ctx.data.raceLog.filter((e) => e.elapsedTimeMillis / 1000 <= ctx.currentTime)}
          availableTypes={REPLAY_RACE_LOG_TYPES as unknown as RaceLogType[]}
          formatTimestamp={(entry) => replayTimestampFormatter(entry.elapsedTimeMillis)}
        />
      )
    case 'fastest-laps':
      return <ReplayFastestLapsPanel rows={ctx.rows} activeClasses={ctx.activeClasses} />
    case 'gap-evolution':
      return <ReplayTrendChart data={ctx.data} mode="gap" currentLap={ctx.leaderLap} title="Gap evolution" compactFilters={compactFilters} />
    case 'lap-position':
      return (
        <ReplayTrendChart
          data={ctx.data}
          mode="position"
          currentLap={ctx.leaderLap}
          title="Lap-by-lap position"
          compactFilters={compactFilters}
        />
      )
    case 'circle-of-doom': {
      const sectorFractions = computeSectorFractions(ctx.data.laps)
      return (
        <CircleOfDoom
          cars={ctx.rows
            .filter((r) => ctx.activeClasses.has(r.class))
            .map((r) => ({ car_number: r.car_number, team: r.team, fraction: r.trackFraction }))}
          sectorFractions={sectorFractions}
        />
      )
    }
    case 'track-map': {
      const trackMapUrl = findTrackMapUrl(ctx.title)
      if (!trackMapUrl) return <p className="replay-hint">No track map available for this circuit.</p>
      return (
        <TrackMap
          trackUrl={trackMapUrl}
          cars={ctx.rows
            .filter((r) => ctx.activeClasses.has(r.class))
            .map((r) => ({ car_number: r.car_number, team: r.team, fraction: r.trackFraction }))}
        />
      )
    }
    case 'car-position-history':
      return panel.carNumber ? (
        <LapPositionChart
          laps={ctx.visibleLaps}
          focusCarNumber={panel.carNumber}
          rankBy={ctx.isRaceSession ? 'elapsed' : 'bestLapSoFar'}
          compactFilters={compactFilters}
        />
      ) : null
    case 'car-time-loss':
      return panel.carNumber ? <TimeLossTrace laps={ctx.visibleLaps} carNumber={panel.carNumber} /> : null
    case 'car-pace':
      return panel.carNumber ? (
        <PaceChart laps={carLapsFor(ctx, panel.carNumber)} hideCarFilter compactFilters={compactFilters} />
      ) : null
    case 'car-stints':
      return panel.carNumber ? <CarStintTable laps={carLapsFor(ctx, panel.carNumber)} /> : null
    case 'car-pit-stops':
      return panel.carNumber ? (
        <PitTimeChart laps={carLapsFor(ctx, panel.carNumber)} compactFilters={compactFilters} />
      ) : null
    case 'car-lap-history':
      return panel.carNumber ? <CarLapHistoryTable laps={carLapsFor(ctx, panel.carNumber)} /> : null
    default:
      return null
  }
}
