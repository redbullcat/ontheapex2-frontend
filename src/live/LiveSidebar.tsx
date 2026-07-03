import { useState } from 'react'
import type { LiveState } from '../api/types'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'

type TabKey = 'race-log' | 'fastest-laps' | 'track-map' | 'circle-of-doom'

const TABS: { key: TabKey; label: string; comingSoon?: boolean }[] = [
  { key: 'race-log', label: 'Race log' },
  { key: 'fastest-laps', label: 'Fastest laps' },
  { key: 'track-map', label: 'Track map', comingSoon: true },
  { key: 'circle-of-doom', label: 'Circle of doom', comingSoon: true },
]

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
    <div className={`live-sidebar${open ? '' : ' live-sidebar-collapsed'}`}>
      <button className="live-sidebar-toggle" onClick={onToggle} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}>
        {open ? '›' : '‹'}
      </button>
      {open && (
        <div className="live-sidebar-content">
          <div className="live-sidebar-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`live-sidebar-tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="live-sidebar-panel-header">
            <a
              className="live-sidebar-popout"
              href={popOutUrl(activeTab, griiipSessionId, title)}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              ↗ Open in new tab
            </a>
          </div>
          <div className="live-sidebar-body">
            <TabContent tab={activeTab} data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
