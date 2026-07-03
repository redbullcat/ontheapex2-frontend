import { useState } from 'react'
import type { LiveState } from '../api/types'
import { CollapsibleSidebar, type SidebarTabDef } from '../components/CollapsibleSidebar'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'

type TabKey = 'race-log' | 'fastest-laps' | 'track-map' | 'circle-of-doom'

const TABS: SidebarTabDef[] = [
  { key: 'race-log', label: 'Race log' },
  { key: 'fastest-laps', label: 'Fastest laps' },
  { key: 'track-map', label: 'Track map' },
  { key: 'circle-of-doom', label: 'Circle of doom' },
]

// track-map/circle-of-doom have no working panel yet — no pop-out link
// makes sense for a "Coming soon" placeholder.
const POPOUT_TABS: TabKey[] = ['race-log', 'fastest-laps']

function TabContent({ tab, data }: { tab: TabKey; data: LiveState }) {
  switch (tab) {
    case 'race-log':
      return <RaceLogPanel entries={data.race_log} />
    case 'fastest-laps':
      return <LiveFastestLapsPanel laps={data.laps} standings={data.standings} />
    case 'track-map':
    case 'circle-of-doom':
      return <p className="replay-hint">Coming soon.</p>
  }
}

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

  return (
    <CollapsibleSidebar
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(key) => setActiveTab(key as TabKey)}
      open={open}
      onToggle={onToggle}
      popOutUrl={POPOUT_TABS.includes(activeTab) ? popOutUrl(activeTab, griiipSessionId, title) : null}
    >
      <TabContent tab={activeTab} data={data} />
    </CollapsibleSidebar>
  )
}
