import { Select } from './Select'
import type { LiveSessionSummary } from '../api/types'
import { liveNowUrl } from '../live/liveNowUrl'

interface Option {
  value: string
  label: string
}

export type Theme = 'light' | 'dark'

export function Sidebar({
  open,
  onToggle,
  theme,
  onThemeChange,
  onOpenSettings,
  series,
  seriesValue,
  onSeriesChange,
  seriesDisabled,
  years,
  yearValue,
  onYearChange,
  yearDisabled,
  events,
  eventValue,
  onEventChange,
  eventDisabled,
  replayUrl,
  liveSessions,
}: {
  open: boolean
  onToggle: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
  onOpenSettings: () => void
  series: Option[]
  seriesValue: string
  onSeriesChange: (v: string) => void
  seriesDisabled: boolean
  years: Option[]
  yearValue: string
  onYearChange: (v: string) => void
  yearDisabled: boolean
  events: Option[]
  eventValue: string
  onEventChange: (v: string) => void
  eventDisabled: boolean
  // Session-specific "open in Replay" link — null when nothing valid is
  // selected (e.g. a "combine all practice" pseudo-session with no single
  // id for Replay to open).
  replayUrl: string | null
  // Whatever's actually live right now, from the auto-discovery poller —
  // empty most of the time, since sessions only run a few times a season.
  liveSessions: LiveSessionSummary[]
}) {
  if (!open) {
    return (
      <div className="sidebar-collapsed">
        <button type="button" className="sidebar-toggle" onClick={onToggle} title="Show sidebar" aria-label="Show sidebar">
          »
        </button>
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top-row">
        <button type="button" className="sidebar-toggle" onClick={onToggle} title="Hide sidebar" aria-label="Hide sidebar">
          «
        </button>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </div>

      {liveSessions.length > 0 && (
        <div className="sidebar-live-now">
          {liveSessions.map((session) => (
            <a key={session.griiip_session_id} className="sidebar-live-now-link" href={liveNowUrl(session)} target="_blank" rel="noopener noreferrer">
              <span className="sidebar-live-dot" /> Live now: {session.event_name} — {session.session_name}
            </a>
          ))}
        </div>
      )}

      <p className="replay-entry-point">
        <a href="/live-staging" target="_blank" rel="noopener noreferrer">
          Check for live sessions ↗
        </a>
      </p>

      <Select label="Series" value={seriesValue} options={series} onChange={onSeriesChange} disabled={seriesDisabled} />
      <Select label="Year" value={yearValue} options={years} onChange={onYearChange} disabled={yearDisabled} />
      <Select label="Event" value={eventValue} options={events} onChange={onEventChange} disabled={eventDisabled} />

      {replayUrl && (
        <p className="replay-entry-point">
          <a href={replayUrl} target="_blank" rel="noopener noreferrer">
            Open Live Timing Replay ↗
          </a>
        </p>
      )}
    </aside>
  )
}
