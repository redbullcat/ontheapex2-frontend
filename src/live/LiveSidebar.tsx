import { useMemo, useState } from 'react'
import type { LiveState } from '../api/types'
import { CollapsibleSidebar, type SidebarTabDef } from '../components/CollapsibleSidebar'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'
import { ReplayTrendChart } from '../replay/ReplayTrendChart'
import { useLiveTrendData } from './liveTrendData'
import { isLiveRaceSession } from './liveSessionType'
import { liveLapToLapRead } from '../lib/liveLapAdapter'
import { PaceChart } from '../components/PaceChart'
import { PitTimeChart } from '../components/PitTimeChart'
import { StintLengthDistribution } from '../components/StintLengthDistribution'
import { RaceStats } from '../components/RaceStats'
import { CircleOfDoom } from '../components/CircleOfDoom'
import { TrackMap } from '../components/TrackMap'
import { findTrackMapUrl } from '../lib/trackMaps'
import { computeLiveTrackPositions } from './liveTrackPosition'

type TabKey = 'race-log' | 'fastest-laps' | 'pace' | 'pit-stops' | 'stints' | 'gap' | 'position' | 'race-stats' | 'track-map' | 'circle-of-doom'

// track-map/circle-of-doom have no working panel yet — no pop-out link
// makes sense for a "Coming soon" placeholder. The main-app chart reuses
// (pace/pit-stops/stints/race-stats) already have their own export
// buttons built in, so a pop-out adds nothing there either.
const POPOUT_TABS: TabKey[] = ['race-log', 'fastest-laps', 'gap', 'position']

// A pop-out opens this same route in a new tab with &panel=<tab>, which
// LiveNowApp uses to render just that one panel full-screen — no new
// export infrastructure, just reusing the existing polling/routing.
function popOutUrl(tab: TabKey, griiipSessionId: number, title: string): string {
  const params = new URLSearchParams({ sid: String(griiipSessionId), title, panel: tab })
  return `${window.location.pathname}?${params.toString()}`
}

export function LiveSidebar({
  data,
  griiipSessionId,
  title,
  open,
  onToggle,
  delaySeconds,
}: {
  data: LiveState
  griiipSessionId: number
  title: string
  open: boolean
  onToggle: () => void
  delaySeconds: number
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('race-log')
  const [expandedChart, setExpandedChart] = useState<'gap' | 'position' | null>(null)
  const trackMapUrl = useMemo(() => findTrackMapUrl(title), [title])
  const trackCars = useMemo(() => {
    if (activeTab !== 'circle-of-doom' && activeTab !== 'track-map') return []
    const positions = computeLiveTrackPositions(data, delaySeconds)
    const teamByCar = new Map(data.standings.map((s) => [s.car_number, s.team]))
    return positions.map((p) => ({ ...p, team: teamByCar.get(p.car_number) ?? null }))
  }, [data, delaySeconds, activeTab])

  const isRaceSession = isLiveRaceSession(data.session_type)
  const trendData = useLiveTrendData(data.laps)
  // No scrubbing in Live — always reveal the whole chart, so the clip
  // boundary just needs to sit past whatever lap anyone's currently on.
  const leaderLap = useMemo(() => Math.max(0, ...data.standings.map((r) => r.total_laps)), [data.standings])

  // Reshaped once here (not per-chart) so every reused main-app component
  // below — built for the historical LapRead schema — works against the
  // in-progress live feed unmodified, the same adapter the car-detail panel
  // already uses. Recomputed on every poll, which is fine at live's ~1-2k
  // completed-lap scale (see liveLapAdapter.ts).
  const adaptedLaps = useMemo(() => data.laps.map((lap, i) => liveLapToLapRead(lap, i)), [data.laps])

  const tabs: SidebarTabDef[] = useMemo(() => {
    const base: SidebarTabDef[] = [
      { key: 'race-log', label: 'Race log' },
      { key: 'fastest-laps', label: 'Fastest laps' },
      { key: 'pace', label: 'Pace' },
      { key: 'pit-stops', label: 'Pit stops' },
      { key: 'stints', label: 'Stints' },
    ]
    // Gap evolution / lap-by-lap position / race stats (lead changes etc)
    // only mean something for a real running order — practice/qualifying
    // rank by single fastest lap, so there's no "running order" for these
    // to show.
    if (isRaceSession) {
      base.push(
        { key: 'gap', label: 'Gap evolution' },
        { key: 'position', label: 'Lap position' },
        { key: 'race-stats', label: 'Race stats' },
      )
    }
    base.push({ key: 'track-map', label: 'Track map' }, { key: 'circle-of-doom', label: 'Circle of doom' })
    return base
  }, [isRaceSession])

  return (
    <>
      {expandedChart && <div className="replay-backdrop" onClick={() => setExpandedChart(null)} />}
      <CollapsibleSidebar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
        open={open}
        onToggle={onToggle}
        popOutUrl={POPOUT_TABS.includes(activeTab) ? popOutUrl(activeTab, griiipSessionId, title) : null}
      >
        {activeTab === 'race-log' && <RaceLogPanel entries={data.race_log} />}
        {activeTab === 'fastest-laps' && <LiveFastestLapsPanel laps={data.laps} standings={data.standings} />}
        {activeTab === 'pace' && <PaceChart laps={adaptedLaps} />}
        {activeTab === 'pit-stops' && <PitTimeChart laps={adaptedLaps} />}
        {activeTab === 'stints' && <StintLengthDistribution laps={adaptedLaps} />}
        {activeTab === 'gap' && (
          <ReplayTrendChart
            data={trendData}
            mode="gap"
            currentLap={leaderLap}
            title="Gap evolution"
            expanded={expandedChart === 'gap'}
            onToggleExpand={() => setExpandedChart((c) => (c === 'gap' ? null : 'gap'))}
          />
        )}
        {activeTab === 'position' && (
          <ReplayTrendChart
            data={trendData}
            mode="position"
            currentLap={leaderLap}
            title="Lap-by-lap position"
            expanded={expandedChart === 'position'}
            onToggleExpand={() => setExpandedChart((c) => (c === 'position' ? null : 'position'))}
          />
        )}
        {activeTab === 'race-stats' && <RaceStats laps={adaptedLaps} />}
        {activeTab === 'circle-of-doom' && <CircleOfDoom cars={trackCars} />}
        {activeTab === 'track-map' &&
          (trackMapUrl ? (
            <TrackMap trackUrl={trackMapUrl} cars={trackCars} />
          ) : (
            <p className="replay-hint">No track map available for this circuit.</p>
          ))}
      </CollapsibleSidebar>
    </>
  )
}
