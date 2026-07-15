import { useEffect, useState, type RefObject } from 'react'

// Every export-capable chart measures its own container via ResizeObserver
// and re-runs its D3 layout off that width. `forcedWidth`, when given,
// bypasses the observer entirely and drives the same layout off an explicit
// number instead — used by the SVG editor to reflow a second, off-screen
// instance of the chart at an arbitrary width without touching its D3 code.
export function useResponsiveWidth(
  containerRef: RefObject<HTMLElement | null>,
  forcedWidth: number | undefined,
  fallback = 800,
): number {
  const [width, setWidth] = useState(forcedWidth ?? fallback)

  useEffect(() => {
    if (forcedWidth != null) {
      setWidth(forcedWidth)
      return
    }
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, forcedWidth])

  return width
}
