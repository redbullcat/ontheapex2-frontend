import { useEffect, useState } from 'react'
import { getLiveSessions } from '../api/client'
import type { LiveSessionSummary } from '../api/types'

// Just presence-detection for the sidebar's "Live now" entry point, not
// something driving a live view — a slow poll is plenty, unlike
// useLiveState's 2s cadence.
const POLL_INTERVAL_MS = 30000

// Sessions the watchdog has already ended are still tracked in-memory for a
// while (frozen final state), but "Live now" should only ever point at
// something actually in progress.
export function useLiveSessions(): LiveSessionSummary[] {
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const data = await getLiveSessions()
        if (!cancelled) setSessions(data.filter((s) => !s.session_ended))
      } catch {
        // Best-effort — leave whatever we last had rather than flashing empty.
      }
    }
    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return sessions
}
