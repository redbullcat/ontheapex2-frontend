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
import { TopSpeedChart } from '../components/TopSpeedChart'
import { SectorLeaderboardTicker } from '../components/SectorLeaderboardTicker'
import { BattleZones } from '../components/BattleZones'
import { RaceNotesPanel } from '../components/RaceNotesPanel'
import type { PendingNoteLink } from '../lib/raceNotes'
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
  // A stable id for this session's notes to be stored under (see
  // hooks/useRaceNotes) — distinct from `title` since titles aren't
  // guaranteed unique/stable the way a session id is.
  sessionKey: string
  // Set when a chart's hover tooltip was clicked to link a race note to
  // that exact car/lap (see ReplayTrendChart/LapPositionChart's
  // onRequestNoteLink) — consumed by the race-notes panel once it's
  // adopted the link into a draft note.
  pendingNoteLink: PendingNoteLink | null
  onRequestNoteLink: (carNumber: string, lapNumber: number) => void
  onConsumeNoteLink: () => void
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
  'top-speed': { kind: 'top-speed', title: 'Top speed', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'pit-stops': { kind: 'pit-stops', title: 'Pit stops', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'sector-ticker': { kind: 'sector-ticker', title: 'Sector leaderboard', category: 'field', defaultSize: { w: 6, h: 6 } },
  'battle-zones': { kind: 'battle-zones', title: 'Battle zones', category: 'field', defaultSize: { w: 6, h: 6 } },
  'race-notes': { kind: 'race-notes', title: 'Session notes', category: 'field', defaultSize: { w: 12, h: 12 } },
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
      return (
        <ReplayTrendChart
          data={ctx.data}
          mode="gap"
          currentLap={ctx.leaderLap}
          title="Gap evolution"
          compactFilters={compactFilters}
          onRequestNoteLink={ctx.onRequestNoteLink}
        />
      )
    case 'lap-position':
      return (
        <ReplayTrendChart
          data={ctx.data}
          mode="position"
          currentLap={ctx.leaderLap}
          title="Lap-by-lap position"
          compactFilters={compactFilters}
          onRequestNoteLink={ctx.onRequestNoteLink}
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
    case 'top-speed':
      return <TopSpeedChart laps={ctx.visibleLaps} compactFilters={compactFilters} />
    case 'pit-stops':
      return <PitTimeChart laps={ctx.visibleLaps} compactFilters={compactFilters} />
    case 'sector-ticker':
      return <SectorLeaderboardTicker laps={ctx.visibleLaps} />
    case 'battle-zones':
      return (
        <BattleZones
          rows={ctx.rows
            .filter((r) => ctx.activeClasses.has(r.class))
            .map((r) => ({ car_number: r.car_number, team: r.team, class: r.class, position: r.position, intervalSeconds: r.interval }))}
        />
      )
    case 'race-notes':
      return (
        <RaceNotesPanel
          sessionKey={ctx.sessionKey}
          title={ctx.title}
          // "As if live" — a caution/restart (or anything derived from laps)
          // that hasn't actually happened yet at the current scrub position
          // shouldn't be visible, same principle every other panel here
          // already follows (see ctx.visibleLaps/RaceLogPanel's own time
          // filter above). Using the full unfiltered data would show the
          // whole session's incidents even while scrubbed back to the start.
          laps={ctx.visibleLaps}
          classes={ctx.data.classes}
          raceLog={ctx.data.raceLog.filter((e) => e.elapsedTimeMillis / 1000 <= ctx.currentTime)}
          currentElapsedSeconds={ctx.currentTime}
          currentRemainingSeconds={Math.max(0, ctx.data.maxTime - ctx.currentTime)}
          carOptions={ctx.data.cars
            .map((c) => ({ id: c.car_number, label: `#${c.car_number} — ${c.team ?? 'Unknown'}` }))
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))}
          pendingLink={ctx.pendingNoteLink}
          onConsumeLink={ctx.onConsumeNoteLink}
          isRaceSession={ctx.isRaceSession}
          // A replay isn't happening in real time at all (it can be scrubbed
          // to any point, played back days later, etc), and LapRead has no
          // recorded real-world wall-clock field to fall back on — so there's
          // no meaningful "race's own local time" here, unlike Live.
          getRaceLocalTimestamp={() => null}
        />
      )
    case 'car-position-history':
      return panel.carNumber ? (
        <LapPositionChart
          laps={ctx.visibleLaps}
          focusCarNumber={panel.carNumber}
          rankBy={ctx.isRaceSession ? 'elapsed' : 'bestLapSoFar'}
          compactFilters={compactFilters}
          onRequestNoteLink={ctx.onRequestNoteLink}
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
