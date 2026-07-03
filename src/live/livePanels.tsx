import { useMemo, useState } from 'react'
import type { LiveLap, LiveStanding, LiveState } from '../api/types'
import type { PanelDef, PanelInstance } from '../dashboard/types'
import { formatGap, formatLapTime, formatSplit } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from '../components/ClassFilter'
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
import { computeLiveTrackPositions } from './liveTrackPosition'
import { LapPositionChart } from '../components/LapPositionChart'
import { CarStintTable } from '../components/CarStintTable'
import { CarLapHistoryTable } from '../components/CarLapHistoryTable'
import { TimeLossTrace } from '../components/TimeLossTrace'
import { usePositionArrow } from './usePositionArrow'
import { PositionChangeArrow } from '../components/PositionChangeArrow'
import { isLiveRaceSession } from './liveSessionType'

export interface LivePanelContext {
  data: LiveState
  title: string
  delaySeconds: number
}

export const LIVE_PANEL_DEFS: Record<string, PanelDef> = {
  leaderboard: { kind: 'leaderboard', title: 'Leaderboard', category: 'field', defaultSize: { w: 12, h: 11 } },
  'race-log': { kind: 'race-log', title: 'Race log', category: 'field', defaultSize: { w: 6, h: 8 } },
  'fastest-laps': { kind: 'fastest-laps', title: 'Fastest laps', category: 'field', defaultSize: { w: 6, h: 8 } },
  pace: { kind: 'pace', title: 'Pace', category: 'field', defaultSize: { w: 6, h: 8 } },
  'pit-stops': { kind: 'pit-stops', title: 'Pit stops', category: 'field', defaultSize: { w: 6, h: 8 } },
  stints: { kind: 'stints', title: 'Stints', category: 'field', defaultSize: { w: 6, h: 7 } },
  'gap-evolution': { kind: 'gap-evolution', title: 'Gap evolution', category: 'field', defaultSize: { w: 6, h: 8 } },
  'lap-position': { kind: 'lap-position', title: 'Lap-by-lap position', category: 'field', defaultSize: { w: 6, h: 8 } },
  'race-stats': { kind: 'race-stats', title: 'Race stats', category: 'field', defaultSize: { w: 6, h: 7 } },
  'track-map': { kind: 'track-map', title: 'Track map', category: 'field', defaultSize: { w: 4, h: 13 } },
  'circle-of-doom': { kind: 'circle-of-doom', title: 'Circle of doom', category: 'field', defaultSize: { w: 4, h: 13 } },
  'car-position-history': { kind: 'car-position-history', title: 'Position history', category: 'car', defaultSize: { w: 6, h: 7 } },
  'car-time-loss': { kind: 'car-time-loss', title: 'Time-loss trace', category: 'car', defaultSize: { w: 6, h: 6 } },
  'car-pace': { kind: 'car-pace', title: 'Pace', category: 'car', defaultSize: { w: 6, h: 7 } },
  'car-stints': { kind: 'car-stints', title: 'Stint history', category: 'car', defaultSize: { w: 6, h: 6 } },
  'car-pit-stops': { kind: 'car-pit-stops', title: 'Pit stops', category: 'car', defaultSize: { w: 6, h: 7 } },
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
function LiveStandingsRow({ row, lastLap, onClick }: { row: LiveStanding; lastLap: LiveLap | undefined; onClick: () => void }) {
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
      <td className="al">
        <span className="car-num">#{row.car_number}</span>
        {row.taken_chequered_flag && <span title="Taken the chequered flag">🏁</span>}
      </td>
      <td className="al driver">{row.driver_name ?? '—'}</td>
      <td className="al team">{getTeamDisplayName(row.team)}</td>
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

function LeaderboardPanel({ data, onRowClick }: { data: LiveState; onRowClick?: (car: string) => void }) {
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

  return (
    <div>
      <div className="replay-trend-controls">
        <ClassFilter classes={classes} selection={classSelection} onChange={setClassSelection} />
      </div>
      <div className="replay-board-wrap">
        <table className="replay-board">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Cls&nbsp;Pos</th>
              <th className="al">Class</th>
              <th className="al">Car</th>
              <th className="al">Driver</th>
              <th className="al">Team</th>
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
              />
            ))}
          </tbody>
        </table>
        {visibleStandings.length === 0 && <p className="replay-hint">No cars in this class have started yet.</p>}
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
function GapEvolutionPanel({ data }: { data: LiveState }) {
  const leaderLap = Math.max(0, ...data.standings.map((r) => r.total_laps))
  const trendData = useLiveTrendData(data.laps)
  return <ReplayTrendChart data={trendData} mode="gap" currentLap={leaderLap} title="Gap evolution" />
}

function LapPositionPanel({ data }: { data: LiveState }) {
  const leaderLap = Math.max(0, ...data.standings.map((r) => r.total_laps))
  const trendData = useLiveTrendData(data.laps)
  return <ReplayTrendChart data={trendData} mode="position" currentLap={leaderLap} title="Lap-by-lap position" />
}

// The single place that maps a panel instance to its rendered content —
// every chart here is the exact same component the main historical app
// and Replay already use, just fed from live data via liveLapToLapRead.
export function renderLivePanel(panel: PanelInstance, ctx: LivePanelContext, onRowClick?: (car: string) => void) {
  const { data } = ctx
  const isRaceSession = isLiveRaceSession(data.session_type)
  switch (panel.kind) {
    case 'leaderboard':
      return <LeaderboardPanel data={data} onRowClick={onRowClick} />
    case 'race-log':
      return <RaceLogPanel entries={data.race_log} />
    case 'fastest-laps':
      return <LiveFastestLapsPanel laps={data.laps} standings={data.standings} />
    case 'pace':
    case 'pit-stops':
    case 'stints':
    case 'race-stats': {
      const adaptedLaps = data.laps.map((lap, i) => liveLapToLapRead(lap, i))
      if (panel.kind === 'pace') return <PaceChart laps={adaptedLaps} />
      if (panel.kind === 'pit-stops') return <PitTimeChart laps={adaptedLaps} />
      if (panel.kind === 'stints') return <StintLengthDistribution laps={adaptedLaps} />
      return <RaceStats laps={adaptedLaps} />
    }
    case 'gap-evolution':
      return <GapEvolutionPanel data={data} />
    case 'lap-position':
      return <LapPositionPanel data={data} />
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
      return <LapPositionChart laps={adaptedLaps} focusCarNumber={panel.carNumber} rankBy={isRaceSession ? 'elapsed' : 'bestLapSoFar'} />
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
      if (panel.kind === 'car-pace') return <PaceChart laps={laps} hideCarFilter />
      if (panel.kind === 'car-stints') return <CarStintTable laps={laps} />
      if (panel.kind === 'car-pit-stops') return <PitTimeChart laps={laps} />
      return <CarLapHistoryTable laps={laps} />
    }
    default:
      return null
  }
}
