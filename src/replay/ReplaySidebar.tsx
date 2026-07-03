import { useMemo, useState } from 'react'
import type { ReplayData } from './replayData'
import type { RowState } from './replayEngine'
import { CollapsibleSidebar, type SidebarTabDef } from '../components/CollapsibleSidebar'
import { RaceLogPanel } from '../live/RaceLogPanel'
import { REPLAY_RACE_LOG_TYPES } from './raceLogSynth'
import { ReplayFastestLapsPanel } from './ReplayFastestLapsPanel'
import { ReplayTrendChart } from './ReplayTrendChart'
import { formatClock } from './format'
import type { RaceLogEntry, RaceLogType } from '../api/types'
import { CircleOfDoom } from '../components/CircleOfDoom'
import { TrackMap } from '../components/TrackMap'
import { findTrackMapUrl } from '../lib/trackMaps'
import { computeSectorFractions } from '../lib/trackFraction'

type TabKey = 'race-log' | 'fastest-laps' | 'gap' | 'position' | 'track-map' | 'circle-of-doom'

const POPOUT_TABS: TabKey[] = ['race-log', 'fastest-laps', 'gap', 'position']

function replayTimestampFormatter(entry: RaceLogEntry): string {
  return formatClock(entry.elapsedTimeMillis / 1000)
}

export function ReplaySidebar({
  data,
  rows,
  activeClasses,
  currentTime,
  leaderLap,
  isRaceSession,
  sessionId,
  title,
  open,
  onToggle,
  onGapVisibleCarsChange,
  onPositionVisibleCarsChange,
}: {
  data: ReplayData
  rows: RowState[]
  activeClasses: Set<string>
  currentTime: number
  leaderLap: number
  isRaceSession: boolean
  sessionId: string
  title: string
  open: boolean
  onToggle: () => void
  onGapVisibleCarsChange: (cars: Set<string>) => void
  onPositionVisibleCarsChange: (cars: Set<string>) => void
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('race-log')
  const [expandedChart, setExpandedChart] = useState<'gap' | 'position' | null>(null)
  const trackMapUrl = useMemo(() => findTrackMapUrl(title), [title])
  const sectorFractions = useMemo(() => computeSectorFractions(data.laps), [data.laps])

  const tabs: SidebarTabDef[] = useMemo(() => {
    const base: SidebarTabDef[] = [
      { key: 'race-log', label: 'Race log' },
      { key: 'fastest-laps', label: 'Fastest laps' },
    ]
    // Gap evolution / lap-by-lap position only mean something when ranking
    // is by real-time running order — for practice/qualifying (ranked by
    // single fastest lap), there's no "running order" for these to show.
    if (isRaceSession) {
      base.push({ key: 'gap', label: 'Gap evolution' }, { key: 'position', label: 'Lap position' })
    }
    base.push({ key: 'track-map', label: 'Track map' }, { key: 'circle-of-doom', label: 'Circle of doom' })
    return base
  }, [isRaceSession])

  // Race log is a fixed, precomputed timeline (raceLogSynth.ts) — only
  // reveal entries up to the current playback position, same principle as
  // the leaderboard/charts not showing the future.
  const visibleRaceLog = useMemo(
    () => data.raceLog.filter((e) => e.elapsedTimeMillis / 1000 <= currentTime),
    [data.raceLog, currentTime],
  )

  function popOutUrl(tab: TabKey): string {
    const params = new URLSearchParams({ session: sessionId, title, panel: tab })
    return `${window.location.pathname}?${params.toString()}`
  }

  return (
    <>
      {expandedChart && <div className="replay-backdrop" onClick={() => setExpandedChart(null)} />}
      <CollapsibleSidebar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
        open={open}
        onToggle={onToggle}
        popOutUrl={POPOUT_TABS.includes(activeTab) ? popOutUrl(activeTab) : null}
      >
      {activeTab === 'race-log' && (
        <RaceLogPanel
          entries={visibleRaceLog}
          availableTypes={REPLAY_RACE_LOG_TYPES as unknown as RaceLogType[]}
          formatTimestamp={replayTimestampFormatter}
        />
      )}
      {activeTab === 'fastest-laps' && <ReplayFastestLapsPanel rows={rows} activeClasses={activeClasses} />}
      {activeTab === 'gap' && (
        <ReplayTrendChart
          data={data}
          mode="gap"
          currentLap={leaderLap}
          title="Gap evolution — live"
          onVisibleCarsChange={onGapVisibleCarsChange}
          expanded={expandedChart === 'gap'}
          onToggleExpand={() => setExpandedChart((c) => (c === 'gap' ? null : 'gap'))}
        />
      )}
      {activeTab === 'position' && (
        <ReplayTrendChart
          data={data}
          mode="position"
          currentLap={leaderLap}
          title="Lap-by-lap position — live"
          onVisibleCarsChange={onPositionVisibleCarsChange}
          expanded={expandedChart === 'position'}
          onToggleExpand={() => setExpandedChart((c) => (c === 'position' ? null : 'position'))}
        />
      )}
      {activeTab === 'circle-of-doom' && (
        <CircleOfDoom
          cars={rows
            .filter((r) => activeClasses.has(r.class))
            .map((r) => ({ car_number: r.car_number, team: r.team, fraction: r.trackFraction }))}
          sectorFractions={sectorFractions}
        />
      )}
      {activeTab === 'track-map' &&
        (trackMapUrl ? (
          <TrackMap
            trackUrl={trackMapUrl}
            cars={rows
              .filter((r) => activeClasses.has(r.class))
              .map((r) => ({ car_number: r.car_number, team: r.team, fraction: r.trackFraction }))}
          />
        ) : (
          <p className="replay-hint">No track map available for this circuit.</p>
        ))}
      </CollapsibleSidebar>
    </>
  )
}
