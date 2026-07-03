import { useEffect, useRef, useState } from 'react'

export interface PositionArrowState {
  direction: 'up' | 'down' | null
  delta: number
}

const NONE: PositionArrowState = { direction: null, delta: 0 }

// Live has no engine incrementally tracking this the way Replay does (see
// replayEngine.ts's positionDirectionByCar/positionDeltaByCar) — each poll
// just hands over a fresh position, so this compares it to whatever the
// last render saw. Real setTimeout, not tied to the 2s poll cadence, so
// the arrow disappears at an actual 10s regardless of how the polling
// happens to line up.
export function usePositionArrow(position: number | null): PositionArrowState {
  const [state, setState] = useState<PositionArrowState>(NONE)
  const prev = useRef(position)

  useEffect(() => {
    if (position == null || prev.current == null || prev.current === position) {
      prev.current = position
      return
    }
    const direction = position < prev.current ? 'up' : 'down'
    const delta = Math.abs(position - prev.current)
    prev.current = position
    setState({ direction, delta })
    const t = setTimeout(() => setState(NONE), 10000)
    return () => clearTimeout(t)
  }, [position])

  return state
}
