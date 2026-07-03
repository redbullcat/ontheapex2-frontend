import { useEffect, useRef, useState } from 'react'
import { getLiveState } from '../api/client'
import type { LiveState } from '../api/types'

const POLL_INTERVAL_MS = 2000

export interface LiveStateStatus {
  status: 'loading' | 'success' | 'error'
  data: LiveState | null
  error: string | null
}

// Deliberately plain polling rather than a websocket/SSE channel — the
// Griiip feed itself only batches every ~1-2s (see app/live/signalr_client.py),
// so polling at the same cadence loses nothing and needs no new transport
// on our side. Revisit if this proves too chatty.
export function useLiveState(griiipSessionId: number | null): LiveStateStatus {
  const [state, setState] = useState<LiveStateStatus>({ status: 'loading', data: null, error: null })
  const inFlight = useRef(false)

  useEffect(() => {
    if (griiipSessionId == null) return
    let cancelled = false

    async function poll() {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const data = await getLiveState(griiipSessionId!)
        if (!cancelled) setState({ status: 'success', data, error: null })
      } catch (err) {
        if (!cancelled) setState((prev) => ({ status: prev.data ? 'success' : 'error', data: prev.data, error: String(err) }))
      } finally {
        inFlight.current = false
      }
    }

    poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [griiipSessionId])

  return state
}
