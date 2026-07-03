import { useCallback, useEffect, useRef, useState } from 'react'

export interface ReplayClock {
  current: number
  playing: boolean
  speed: number
  toggle: () => void
  scrubTo: (value: number) => void
  skip: (deltaSeconds: number) => void
  setSpeed: (speed: number) => void
}

// 1x is real wall-clock time — a 6h race takes 6h to replay at 1x. That was
// the explicit ask, unlike the lap-indexed charts' playback rate.
export const REPLAY_SPEEDS = [1, 2, 5, 10, 30] as const

export function useReplayClock(min: number, max: number): ReplayClock {
  const [current, setCurrent] = useState(min)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const lastTsRef = useRef<number | null>(null)

  // Bounds only really change once, when the session's data finishes
  // loading — reset to the start rather than leaving a stale clock value.
  useEffect(() => {
    setCurrent(min)
    setPlaying(false)
    lastTsRef.current = null
  }, [min, max])

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null
      return
    }
    // setInterval rather than requestAnimationFrame — the clock readout
    // and scrubber don't need display-refresh precision, and a fixed
    // ~30fps cadence still reads perfectly smooth while roughly halving
    // how often every panel watching `current` re-renders. That matters
    // more now than it used to: with several dashboard panels mounted at
    // once, rAF firing at full, sometimes-uncapped rate (observed under
    // headless/CI Chromium in particular) was enough combined render
    // pressure to trip React's "Maximum update depth exceeded" runaway-
    // update detector, even though each individual update was legitimate.
    const TICK_MS = 33
    const id = window.setInterval(() => {
      const now = performance.now()
      if (lastTsRef.current == null) lastTsRef.current = now
      const dt = (now - lastTsRef.current) / 1000
      lastTsRef.current = now
      setCurrent((c) => {
        const next = c + dt * speed
        if (next >= max) {
          setPlaying(false)
          return max
        }
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, speed, max])

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && current >= max) setCurrent(min)
      return !p
    })
  }, [current, max, min])

  const scrubTo = useCallback(
    (value: number) => {
      setPlaying(false)
      setCurrent(Math.max(min, Math.min(max, value)))
    },
    [min, max],
  )

  const skip = useCallback(
    (deltaSeconds: number) => {
      setCurrent((c) => Math.max(min, Math.min(max, c + deltaSeconds)))
    },
    [min, max],
  )

  return { current, playing, speed, toggle, scrubTo, skip, setSpeed }
}
