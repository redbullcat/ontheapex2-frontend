import { useMemo, useState } from 'react'
import type { LiveState } from '../api/types'
import { CollapsibleSidebar, type SidebarTabDef } from '../components/CollapsibleSidebar'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'
import { ReplayTrendChart } from '../replay/ReplayTrendChart'
import { useLiveTrendData } from './liveTrendData'
import { isLiveRaceSession } from './liveSessionType'

type TabKey = 'race-log' | 'fastest-laps' | 'gap' | 'position' | 'track-map' | 'circle-of-doom'

// track-map/circle-of-doom have no working panel yet — no pop-out link
// makes sense for a "Coming soon" placeholder.
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
}: {
  data: LiveState
  griiipSessionId: number
  title: string
  open: boolean
  onToggle: () => void
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('race-log')
  const [expandedChart, setExpandedChart] = useState<'gap' | 'position' | null>(null)

  const isRaceSession = isLiveRaceSession(data.session_type)
  const trendData = useLiveTrendData(data.laps)
  // No scrubbing in Live — always reveal the whole chart, so the clip
  // boundary just needs to sit past whatever lap anyone's currently on.
  const leaderLap = useMemo(() => Math.max(0, ...data.standings.map((r) => r.total_laps)), [data.standings])

  const tabs: SidebarTabDef[] = useMemo(() => {
    const base: SidebarTabDef[] = [
      { key: 'race-log', label: 'Race log' },
      { key: 'fastest-laps', label: 'Fastest laps' },
    ]
    // Gap evolution / lap-by-lap position only mean something for a real
    // running order — practice/qualifying rank by single fastest lap, so
    // there's no "running order" for these to show.
    if (isRaceSession) {
      base.push({ key: 'gap', label: 'Gap evolution' }, { key: 'position', label: 'Lap position' })
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
        {(activeTab === 'track-map' || activeTab === 'circle-of-doom') && <p className="replay-hint">Coming soon.</p>}
      </CollapsibleSidebar>
    </>
  )
}
