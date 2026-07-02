import { useCallback, useEffect, useRef, useState } from 'react'

export interface Playback {
  current: number
  playing: boolean
  speed: number
  toggle: () => void
  scrubTo: (value: number) => void
  reset: () => void
  setSpeed: (speed: number) => void
}

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5] as const

// `unitsPerSecond` is the playback rate at 1x speed, in the same units as
// min/max (laps). Defaults to a pace that covers a ~50-lap stint in ~25s.
export function usePlayback(min: number, max: number, unitsPerSecond = 2): Playback {
  const [current, setCurrent] = useState(max)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  // Bounds changing (e.g. the lap-range filter) means the data underneath
  // the animation changed shape — snap back to the fully-revealed, static
  // default rather than continuing to animate over stale bounds.
  useEffect(() => {
    setCurrent(max)
    setPlaying(false)
    lastTsRef.current = null
  }, [min, max])

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null
      return
    }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setCurrent((c) => {
        const next = c + dt * speed * unitsPerSecond
        if (next >= max) {
          setPlaying(false)
          return max
        }
        return next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [playing, speed, max, unitsPerSecond])

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

  const reset = useCallback(() => {
    setPlaying(false)
    setCurrent(min)
  }, [min])

  return { current, playing, speed, toggle, scrubTo, reset, setSpeed }
}
