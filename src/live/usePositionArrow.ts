import { useEffect, useRef, useState } from 'react'

// Live has no engine incrementally tracking this the way Replay does (see
// replayEngine.ts's positionDirectionByCar) — each poll just hands over a
// fresh position, so this compares it to whatever the last render saw.
// Real setTimeout, not tied to the 2s poll cadence, so the arrow disappears
// at an actual 10s regardless of how the polling happens to line up.
export function usePositionArrow(position: number | null): 'up' | 'down' | null {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const prev = useRef(position)

  useEffect(() => {
    if (position == null || prev.current == null || prev.current === position) {
      prev.current = position
      return
    }
    const dir = position < prev.current ? 'up' : 'down'
    prev.current = position
    setDirection(dir)
    const t = setTimeout(() => setDirection(null), 10000)
    return () => clearTimeout(t)
  }, [position])

  return direction
}
