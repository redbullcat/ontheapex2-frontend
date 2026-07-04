import { useEffect, useRef } from 'react'
import { useLiveSessionsPoll } from './useLiveSessionsPoll'
import { liveNowUrl } from './liveNowUrl'
import type { LiveSessionSummary } from '../api/types'
import { BackLink } from '../components/BackLink'
import { ThemeToggleButton } from '../components/ThemeToggleButton'
import { useTheme } from '../hooks/useTheme'
import '../replay/replay.css'
import './live.css'

interface SeriesDef {
  key: string
  label: string
  // series_name is a free-text string from whatever timing provider fed
  // it (see backend app/live/participants.py's session_meta_from_bootstrap)
  // — matched loosely rather than against a fixed enum, since it varies
  // provider to provider.
  match: (session: LiveSessionSummary) => boolean
}

const SERIES: SeriesDef[] = [
  { key: 'elms', label: 'ELMS', match: (s) => /le mans series/i.test(s.series_name) },
  { key: 'wec', label: 'WEC', match: (s) => /\bwec\b|world endurance/i.test(s.series_name) },
  { key: 'imsa', label: 'IMSA', match: (s) => /imsa/i.test(s.series_name) },
]

function SeriesSection({
  def,
  session,
  secondsUntilNextPoll,
  onRetry,
}: {
  def: SeriesDef
  session: LiveSessionSummary | null
  secondsUntilNextPoll: number
  onRetry: () => void
}) {
  const openedSessionId = useRef<number | null>(null)

  // Auto-open the moment a session for this series is first seen — not on
  // every poll tick once it's already open in its own tab. Browsers only
  // allow window.open from a real user gesture, so this can be silently
  // blocked; the manual link below is the reliable fallback either way.
  useEffect(() => {
    if (!session || openedSessionId.current === session.griiip_session_id) return
    openedSessionId.current = session.griiip_session_id
    window.open(liveNowUrl(session), '_blank', 'noopener')
  }, [session])

  return (
    <div className="live-staging-section">
      <h2>{def.label}</h2>
      {session ? (
        <div className="live-staging-found">
          <span className="live-staging-dot" />
          <div>
            <p className="live-staging-found-title">
              {session.event_name} — {session.session_name}
            </p>
            <a href={liveNowUrl(session)} target="_blank" rel="noopener noreferrer">
              Open live timing ↗
            </a>
            <span className="live-staging-hint"> (opens automatically in a new tab too, unless your browser blocked it)</span>
          </div>
        </div>
      ) : (
        <div className="live-staging-empty">
          <p>No session running for {def.label}.</p>
          <button type="button" className="replay-btn" onClick={onRetry}>
            Retry now
          </button>
          <span className="live-staging-countdown">auto-refreshing in {secondsUntilNextPoll}s</span>
        </div>
      )}
    </div>
  )
}

export function LiveStagingPage() {
  const { sessions, secondsUntilNextPoll, retryNow, loading } = useLiveSessionsPoll()
  const [theme, setTheme] = useTheme()

  return (
    <div className="replay-root">
      <div className="replay-topbar">
        <div className="replay-session-id">
          <BackLink />
          <ThemeToggleButton theme={theme} onChange={setTheme} />
          <h2>Live timing</h2>
        </div>
      </div>
      <div className="live-staging-page">
        {loading ? (
          <p className="replay-hint">Checking for live sessions…</p>
        ) : (
          SERIES.map((def) => (
            <SeriesSection
              key={def.key}
              def={def}
              session={sessions.find(def.match) ?? null}
              secondsUntilNextPoll={secondsUntilNextPoll}
              onRetry={retryNow}
            />
          ))
        )}
      </div>
    </div>
  )
}
