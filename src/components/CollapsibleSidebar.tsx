import type { ReactNode } from 'react'

export interface SidebarTabDef {
  key: string
  label: string
}

// Shared chrome (collapse toggle, tab strip, pop-out-to-new-tab link) for
// both the live view's sidebar and Replay's — content is supplied by the
// caller per active tab, since what's actually shown differs a lot between
// the two (live-polled data vs. a replay-clock-scrubbed snapshot).
export function CollapsibleSidebar({
  tabs,
  activeTab,
  onTabChange,
  open,
  onToggle,
  popOutUrl,
  children,
}: {
  tabs: SidebarTabDef[]
  activeTab: string
  onTabChange: (key: string) => void
  open: boolean
  onToggle: () => void
  popOutUrl: string | null
  children: ReactNode
}) {
  return (
    <div className={`live-sidebar${open ? '' : ' live-sidebar-collapsed'}`}>
      <button className="live-sidebar-toggle" onClick={onToggle} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}>
        {open ? '›' : '‹'}
      </button>
      {open && (
        <div className="live-sidebar-content">
          <div className="live-sidebar-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`live-sidebar-tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {popOutUrl && (
            <div className="live-sidebar-panel-header">
              <a className="live-sidebar-popout" href={popOutUrl} target="_blank" rel="noreferrer" title="Open in new tab">
                ↗ Open in new tab
              </a>
            </div>
          )}
          <div className="live-sidebar-body">{children}</div>
        </div>
      )}
    </div>
  )
}
