import { useEffect, useState } from 'react'

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

// >2s is already one missed poll (2s cadence, see useLiveState) — 8s is
// ~4 missed polls, generous enough that one slow response doesn't flip this
// to "stale" for no reason, but a real stall shows up quickly. 20s is long
// enough that it's clearly not just polling jitter anymore.
const STALE_AFTER_MS = 8000
const DISCONNECTED_AFTER_MS = 20000

// Fixed bottom-left (DelaySettings owns bottom-right) — a browser clock
// plus "is our poller actually still hearing from the backend" indicator,
// independent of whatever artificial delay the viewer has dialed in to
// sync with their stream (see useDelayedLiveState — lastFetchAt is always
// the real fetch time, never the delayed one).
export function ConnectionStatusBar({
  lastFetchAt,
  liveStatus,
}: {
  lastFetchAt: number | null
  liveStatus: 'loading' | 'success' | 'error'
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const staleMs = lastFetchAt != null ? now - lastFetchAt : null

  let health: 'good' | 'stale' | 'bad' = 'good'
  let label = 'Connecting…'
  if (lastFetchAt != null) {
    const lastUpdated = formatTime(new Date(lastFetchAt))
    if (liveStatus === 'error' || (staleMs != null && staleMs > DISCONNECTED_AFTER_MS)) {
      health = 'bad'
      label = `Connection lost — last updated ${lastUpdated}`
    } else if (staleMs != null && staleMs > STALE_AFTER_MS) {
      health = 'stale'
      label = `Slow connection — last updated ${lastUpdated}`
    } else {
      health = 'good'
      label = `Good connection — last updated ${lastUpdated}`
    }
  }

  return (
    <div className="live-status-bar">
      <span className={`live-status-dot live-status-${health}`} />
      <span className="live-status-label">{label}</span>
      <span className="live-status-clock">{formatTime(new Date(now))}</span>
    </div>
  )
}
