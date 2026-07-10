import { useMemo, useRef, useState, type MouseEvent } from 'react'
import type { LiveLap, LiveStanding, LiveState } from '../api/types'
import type { PanelDef, PanelInstance } from '../dashboard/types'
import { formatGap, formatLapTime, formatSplit } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from '../components/ClassFilter'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { colorBadgeClass } from './liveColors'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'
import { ReplayTrendChart } from '../replay/ReplayTrendChart'
import { useLiveTrendData } from './liveTrendData'
import { liveLapToLapRead } from '../lib/liveLapAdapter'
import { PaceChart } from '../components/PaceChart'
import { PitTimeChart } from '../components/PitTimeChart'
import { StintLengthDistribution } from '../components/StintLengthDistribution'
import { RaceStats } from '../components/RaceStats'
import { CircleOfDoom } from '../components/CircleOfDoom'
import { TrackMap } from '../components/TrackMap'
import { findTrackMapUrl } from '../lib/trackMaps'
import { computeSectorFractions } from '../lib/trackFraction'
import { buildCarRoster } from '../lib/carRoster'
import { computeLiveTrackPositions } from './liveTrackPosition'
import { LapPositionChart } from '../components/LapPositionChart'
import { CarStintTable } from '../components/CarStintTable'
import { CarLapHistoryTable } from '../components/CarLapHistoryTable'
import { TimeLossTrace } from '../components/TimeLossTrace'
import { usePositionArrow } from './usePositionArrow'
import { PositionChangeArrow } from '../components/PositionChangeArrow'
import { isLiveRaceSession } from './liveSessionType'
import { TopSpeedChart } from '../components/TopSpeedChart'
import { SectorLeaderboardTicker } from '../components/SectorLeaderboardTicker'
import { BattleZones } from '../components/BattleZones'
import { RaceNotesPanel } from '../components/RaceNotesPanel'
import type { PendingNoteLink } from '../lib/raceNotes'
import { TyresPanel } from '../components/TyresPanel'

export interface LivePanelContext {
  data: LiveState
  title: string
  delaySeconds: number
  // A stable id for this session's notes to be stored under (see
  // hooks/useRaceNotes).
  sessionKey: string
  clock: { elapsedSeconds: number | null; remainingSeconds: number | null }
  // Set when a chart's hover tooltip was clicked to link a race note to
  // that exact car/lap (see ReplayTrendChart/LapPositionChart's
  // onRequestNoteLink) — consumed by the race-notes panel once it's
  // adopted the link into a draft note.
  pendingNoteLink: PendingNoteLink | null
  onRequestNoteLink: (carNumber: string, lapNumber: number) => void
  onConsumeNoteLink: () => void
  isRaceSession: boolean
}

export const LIVE_PANEL_DEFS: Record<string, PanelDef> = {
  leaderboard: { kind: 'leaderboard', title: 'Leaderboard', category: 'field', defaultSize: { w: 12, h: 11 }, hasSettings: true },
  'race-log': { kind: 'race-log', title: 'Race log', category: 'field', defaultSize: { w: 6, h: 8 } },
  'fastest-laps': { kind: 'fastest-laps', title: 'Fastest laps', category: 'field', defaultSize: { w: 6, h: 8 } },
  pace: { kind: 'pace', title: 'Pace', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'pit-stops': { kind: 'pit-stops', title: 'Pit stops', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  stints: { kind: 'stints', title: 'Stints', category: 'field', defaultSize: { w: 6, h: 7 } },
  'gap-evolution': { kind: 'gap-evolution', title: 'Gap evolution', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'lap-position': {
    kind: 'lap-position',
    title: 'Lap-by-lap position',
    category: 'field',
    defaultSize: { w: 6, h: 8 },
    hasSettings: true,
  },
  'race-stats': { kind: 'race-stats', title: 'Race stats', category: 'field', defaultSize: { w: 6, h: 7 } },
  'track-map': { kind: 'track-map', title: 'Track map', category: 'field', defaultSize: { w: 4, h: 13 } },
  'circle-of-doom': { kind: 'circle-of-doom', title: 'Circle of doom', category: 'field', defaultSize: { w: 4, h: 13 } },
  'top-speed': { kind: 'top-speed', title: 'Top speed', category: 'field', defaultSize: { w: 6, h: 8 }, hasSettings: true },
  'sector-ticker': { kind: 'sector-ticker', title: 'Sector leaderboard', category: 'field', defaultSize: { w: 6, h: 6 } },
  'battle-zones': { kind: 'battle-zones', title: 'Battle zones', category: 'field', defaultSize: { w: 6, h: 6 } },
  'race-notes': { kind: 'race-notes', title: 'Session notes', category: 'field', defaultSize: { w: 12, h: 12 } },
  tyres: { kind: 'tyres', title: 'Tyres', category: 'field', defaultSize: { w: 4, h: 12 } },
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

export const LIVE_DEFAULT_PANELS: PanelInstance[] = [
  { id: 'leaderboard', kind: 'leaderboard' },
  { id: 'race-log', kind: 'race-log' },
]

// Its own component (not inlined in the .map() below) so usePositionArrow —
// a per-row hook — has a stable identity per car via the key, rather than
// being called inside a loop callback where hook order isn't guaranteed
// stable as rows are added/removed/filtered.
function LiveStandingsRow({
  row,
  lastLap,
  onClick,
  onHoverCar,
  onLeaveCar,
}: {
  row: LiveStanding
  lastLap: LiveLap | undefined
  onClick: () => void
  onHoverCar: (car: string, e: MouseEvent) => void
  onLeaveCar: () => void
}) {
  const arrow = usePositionArrow(row.position)
  return (
    <tr className={row.in_pit ? 'replay-row in-pit clickable' : 'replay-row clickable'} onClick={onClick}>
      <td className="num pos">
        {arrow.direction ? <PositionChangeArrow direction={arrow.direction} delta={arrow.delta} /> : (row.position ?? '—')}
      </td>
      <td className="num cls-pos">{row.class_position ?? '—'}</td>
      <td className="al">
        <span className="class-chip">{row.class ?? '—'}</span>
      </td>
      <td
        className="al"
        onMouseEnter={(e) => onHoverCar(row.car_number, e)}
        onMouseMove={(e) => onHoverCar(row.car_number, e)}
        onMouseLeave={onLeaveCar}
      >
        <span className="car-num">#{row.car_number}</span>
        {row.taken_chequered_flag && <span title="Taken the chequered flag">🏁</span>}
      </td>
      <td className="al driver">{row.driver_name ?? '—'}</td>
      <td className="al team">{getTeamDisplayName(row.team)}</td>
      <td className="al manufacturer">{row.manufacturer ?? '—'}</td>
      <td className="num gap">{formatGap(row.gap_to_first_seconds, row.gap_to_first_laps)}</td>
      <td className="num interval">{formatGap(row.gap_to_next_seconds, row.gap_to_next_laps)}</td>
      <td className="num">{row.total_laps || ''}</td>
      {row.in_pit ? (
        <td className="num s-merged" colSpan={3}>
          <span className="pit-label">IN PIT</span>
        </td>
      ) : (
        <>
          <td className={'num' + colorBadgeClass(lastLap?.s1_color ?? null)}>{formatSplit(lastLap?.s1_seconds ?? null)}</td>
          <td className={'num' + colorBadgeClass(lastLap?.s2_color ?? null)}>{formatSplit(lastLap?.s2_seconds ?? null)}</td>
          <td className={'num' + colorBadgeClass(lastLap?.s3_color ?? null)}>{formatSplit(lastLap?.s3_seconds ?? null)}</td>
        </>
      )}
      <td className="num best">{formatLapTime(row.best_lap_seconds)}</td>
      <td className={'num last' + colorBadgeClass(row.last_lap_color)}>{formatLapTime(row.last_lap_seconds)}</td>
    </tr>
  )
}

function LeaderboardPanel({
  data,
  onRowClick,
  compactFilters,
}: {
  data: LiveState
  onRowClick?: (car: string) => void
  compactFilters?: boolean
}) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const classes = useMemo(() => [...new Set(data.standings.map((r) => r.class ?? 'Unknown'))].sort(), [data.standings])
  const activeClasses = useMemo(() => resolveClassSelection(classSelection, classes), [classSelection, classes])
  const visibleStandings = data.standings.filter((r) => activeClasses.has(r.class ?? 'Unknown'))

  const lastLapByCar = useMemo(() => {
    const map = new Map<string, LiveLap>()
    for (const lap of data.laps) {
      const prev = map.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) map.set(lap.car_number, lap)
    }
    return map
  }, [data.laps])

  // Hover a car's number in the main live timing panel to see its full
  // driver roster — a car's laps only ever carry the single driver of
  // that specific lap, so the roster is derived by scanning every laps
  // this car has done so far this session (see lib/carRoster.ts).
  const roster = useMemo(() => buildCarRoster(data.laps), [data.laps])
  const teamByCar = useMemo(() => new Map(data.standings.map((s) => [s.car_number, s.team])), [data.standings])
  const boardRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; car: string } | null>(null)
  // Viewport (clientX/Y), not container-relative — the tooltip is rendered
  // with position: fixed (see .car-hover-tooltip) so it isn't clipped by
  // .replay-board-wrap's horizontal scroll container, which forces its own
  // vertical overflow to `auto` too and would otherwise cut off the tooltip
  // for any row below the very top of the visible scroll area.
  const handleHoverCar = (car: string, e: MouseEvent) => {
    setHover({ x: e.clientX, y: e.clientY, car })
  }

  const filterControls = (
    <div className="replay-trend-controls">
      <ClassFilter classes={classes} selection={classSelection} onChange={setClassSelection} />
    </div>
  )

  return (
    <div>
      {compactFilters ? <PanelSettingsPopover>{filterControls}</PanelSettingsPopover> : filterControls}
      <div className="replay-board-wrap" ref={boardRef}>
        <table className="replay-board">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Cls&nbsp;Pos</th>
              <th className="al">Class</th>
              <th className="al">Car</th>
              <th className="al">Driver</th>
              <th className="al">Team</th>
              <th className="al">Manufacturer</th>
              <th>Gap</th>
              <th>Int</th>
              <th>Lap</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              <th>Best</th>
              <th>Last</th>
            </tr>
          </thead>
          <tbody>
            {visibleStandings.map((row) => (
              <LiveStandingsRow
                key={row.car_number}
                row={row}
                lastLap={lastLapByCar.get(row.car_number)}
                onClick={() => onRowClick?.(row.car_number)}
                onHoverCar={handleHoverCar}
                onLeaveCar={() => setHover(null)}
              />
            ))}
          </tbody>
        </table>
        {visibleStandings.length === 0 && <p className="replay-hint">No cars in this class have started yet.</p>}
        {hover && (
          <div className="replay-tooltip car-hover-tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>#{hover.car}</strong> {getTeamDisplayName(teamByCar.get(hover.car) ?? null)}
            {(roster.get(hover.car)?.length ?? 0) > 0 && <div>{roster.get(hover.car)!.join(' · ')}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function carLapsFor(adaptedLaps: ReturnType<typeof liveLapToLapRead>[], carNumber: string) {
  return adaptedLaps.filter((l) => l.car_number === carNumber)
}

// Their own components (not inlined in renderLivePanel's switch below) —
// useLiveTrendData is a hook, and renderLivePanel is a plain function
// called conditionally from a .map(), not a component, so calling a hook
// directly inside that switch would violate the rules of hooks (hook
// call order isn't stable across renders once panels are added/removed).
function GapEvolutionPanel({
  data,
  compactFilters,
  onRequestNoteLink,
}: {
  data: LiveState
  compactFilters?: boolean
  onRequestNoteLink?: (carNumber: string, lapNumber: number) => void
}) {
  const leaderLap = Math.max(0, ...data.standings.map((r) => r.total_laps))
  const trendData = useLiveTrendData(data.laps)
  return (
    <ReplayTrendChart
      data={trendData}
      mode="gap"
      currentLap={leaderLap}
      title="Gap evolution"
      compactFilters={compactFilters}
      onRequestNoteLink={onRequestNoteLink}
    />
  )
}

function LapPositionPanel({
  data,
  compactFilters,
  onRequestNoteLink,
}: {
  data: LiveState
  compactFilters?: boolean
  onRequestNoteLink?: (carNumber: string, lapNumber: number) => void
}) {
  const leaderLap = Math.max(0, ...data.standings.map((r) => r.total_laps))
  const trendData = useLiveTrendData(data.laps)
  return (
    <ReplayTrendChart
      data={trendData}
      mode="position"
      currentLap={leaderLap}
      title="Lap-by-lap position"
      compactFilters={compactFilters}
      onRequestNoteLink={onRequestNoteLink}
    />
  )
}

// The single place that maps a panel instance to its rendered content —
// every chart here is the exact same component the main historical app
// and Replay already use, just fed from live data via liveLapToLapRead.
export function renderLivePanel(
  panel: PanelInstance,
  ctx: LivePanelContext,
  onRowClick?: (car: string) => void,
  // Set true only from the dashboard grid (DashboardGrid/PanelFrame gives
  // every panel a gear-icon settings popup there) — left false for pop-out
  // windows, which have a whole browser window to themselves and keep
  // showing these same filters inline like before this dashboard existed.
  compactFilters = false,
) {
  const { data } = ctx
  const isRaceSession = isLiveRaceSession(data.session_type)
  switch (panel.kind) {
    case 'leaderboard':
      return <LeaderboardPanel data={data} onRowClick={onRowClick} compactFilters={compactFilters} />
    case 'race-log':
      return <RaceLogPanel entries={data.race_log} />
    case 'fastest-laps':
      return <LiveFastestLapsPanel laps={data.laps} standings={data.standings} />
    case 'pace':
    case 'pit-stops':
    case 'stints':
    case 'race-stats':
    case 'top-speed': {
      const adaptedLaps = data.laps.map((lap, i) => liveLapToLapRead(lap, i))
      if (panel.kind === 'pace') return <PaceChart laps={adaptedLaps} compactFilters={compactFilters} />
      if (panel.kind === 'pit-stops') return <PitTimeChart laps={adaptedLaps} compactFilters={compactFilters} />
      if (panel.kind === 'stints') return <StintLengthDistribution laps={adaptedLaps} />
      if (panel.kind === 'top-speed') return <TopSpeedChart laps={adaptedLaps} compactFilters={compactFilters} />
      return <RaceStats laps={adaptedLaps} />
    }
    case 'tyres':
      return <TyresPanel rows={data.standings} />
    case 'sector-ticker':
      return <SectorLeaderboardTicker laps={data.laps} />
    case 'battle-zones':
      return (
        <BattleZones
          rows={data.standings.map((s) => ({
            car_number: s.car_number,
            team: s.team,
            class: s.class,
            position: s.position,
            intervalSeconds: s.gap_to_next_laps != null ? null : s.gap_to_next_seconds,
          }))}
        />
      )
    case 'gap-evolution':
      return <GapEvolutionPanel data={data} compactFilters={compactFilters} onRequestNoteLink={ctx.onRequestNoteLink} />
    case 'lap-position':
      return <LapPositionPanel data={data} compactFilters={compactFilters} onRequestNoteLink={ctx.onRequestNoteLink} />
    case 'race-notes':
      return (
        <RaceNotesPanel
          sessionKey={ctx.sessionKey}
          title={ctx.title}
          laps={data.laps}
          classes={[...new Set(data.standings.map((s) => s.class ?? 'Unknown'))].sort()}
          raceLog={data.race_log}
          currentElapsedSeconds={ctx.clock.elapsedSeconds}
          currentRemainingSeconds={ctx.clock.remainingSeconds}
          carOptions={data.standings
            .map((s) => ({ id: s.car_number, label: `#${s.car_number} — ${s.team ?? 'Unknown'}` }))
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))}
          pendingLink={ctx.pendingNoteLink}
          onConsumeLink={ctx.onConsumeNoteLink}
          isRaceSession={ctx.isRaceSession}
          getRaceLocalTimestamp={(elapsedSeconds) => {
            // Live races happen in real time, so "now" (adjusted for the
            // viewer's own stream delay) is the circuit's wall clock — and
            // for a moment further in the past (a linked lap), walk that
            // same adjustment back by however much earlier it happened.
            if (elapsedSeconds == null || ctx.clock.elapsedSeconds == null) return null
            const secondsAgo = ctx.clock.elapsedSeconds - elapsedSeconds
            return new Date(Date.now() - ctx.delaySeconds * 1000 - secondsAgo * 1000).toISOString()
          }}
        />
      )
    case 'circle-of-doom': {
      const positions = computeLiveTrackPositions(data, ctx.delaySeconds)
      const teamByCar = new Map(data.standings.map((s) => [s.car_number, s.team]))
      const cars = positions.map((p) => ({ ...p, team: teamByCar.get(p.car_number) ?? null }))
      const sectorFractions = computeSectorFractions(data.laps)
      return <CircleOfDoom cars={cars} sectorFractions={sectorFractions} />
    }
    case 'track-map': {
      const trackMapUrl = findTrackMapUrl(ctx.title)
      if (!trackMapUrl) return <p className="replay-hint">No track map available for this circuit.</p>
      const positions = computeLiveTrackPositions(data, ctx.delaySeconds)
      const teamByCar = new Map(data.standings.map((s) => [s.car_number, s.team]))
      const cars = positions.map((p) => ({ ...p, team: teamByCar.get(p.car_number) ?? null }))
      return <TrackMap trackUrl={trackMapUrl} cars={cars} />
    }
    case 'car-position-history': {
      if (!panel.carNumber) return null
      const adaptedLaps = data.laps.map((lap, i) => liveLapToLapRead(lap, i))
      return (
        <LapPositionChart
          laps={adaptedLaps}
          focusCarNumber={panel.carNumber}
          rankBy={isRaceSession ? 'elapsed' : 'bestLapSoFar'}
          compactFilters={compactFilters}
          onRequestNoteLink={ctx.onRequestNoteLink}
        />
      )
    }
    case 'car-time-loss': {
      if (!panel.carNumber) return null
      const adaptedLaps = data.laps.map((lap, i) => liveLapToLapRead(lap, i))
      return <TimeLossTrace laps={adaptedLaps} carNumber={panel.carNumber} />
    }
    case 'car-pace':
    case 'car-stints':
    case 'car-pit-stops':
    case 'car-lap-history': {
      if (!panel.carNumber) return null
      const adaptedLaps = data.laps.map((lap, i) => liveLapToLapRead(lap, i))
      const laps = carLapsFor(adaptedLaps, panel.carNumber)
      if (panel.kind === 'car-pace') return <PaceChart laps={laps} hideCarFilter compactFilters={compactFilters} />
      if (panel.kind === 'car-stints') return <CarStintTable laps={laps} />
      if (panel.kind === 'car-pit-stops') return <PitTimeChart laps={laps} compactFilters={compactFilters} />
      return <CarLapHistoryTable laps={laps} allLaps={adaptedLaps} />
    }
    default:
      return null
  }
}
