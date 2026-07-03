import { useEffect, useRef, useState } from 'react'
import { getTeamColor } from '../lib/identityColors'

export interface TrackMapCar {
  car_number: string
  team: string | null
  fraction: number
  isLive?: boolean
}

interface ParsedTrack {
  viewBox: string
  d: string
}

const trackCache = new Map<string, Promise<ParsedTrack | null>>()

// Bundled track SVGs (see lib/trackMaps.ts) are a single continuous <path>
// each — fetched as raw text (not <img>) so we can read the path's `d` and
// drive an offscreen path element for getPointAtLength, the same technique
// SectorAnalysisChart's static overlay uses, just animated per car instead
// of per-sector-gap.
function loadTrack(url: string): Promise<ParsedTrack | null> {
  let cached = trackCache.get(url)
  if (!cached) {
    cached = fetch(url)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!text) return null
        const viewBoxMatch = text.match(/viewBox="([^"]+)"/)
        const dMatch = text.match(/<path[^>]*\sd="([^"]+)"/)
        if (!viewBoxMatch || !dMatch) return null
        return { viewBox: viewBoxMatch[1], d: dMatch[1] }
      })
    trackCache.set(url, cached)
  }
  return cached
}

export function TrackMap({ trackUrl, cars, focusCarNumber }: { trackUrl: string; cars: TrackMapCar[]; focusCarNumber?: string }) {
  const [track, setTrack] = useState<ParsedTrack | null | undefined>(undefined)
  const pathRef = useRef<SVGPathElement>(null)
  // The path element only exists in the DOM after the render where `track`
  // becomes non-null commits — pathRef.current is still null during that
  // same render pass, so a second state flip forces one more render once
  // it's actually attached and getPointAtLength/getTotalLength are usable.
  const [pathReady, setPathReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTrack(undefined)
    setPathReady(false)
    loadTrack(trackUrl).then((t) => {
      if (!cancelled) setTrack(t)
    })
    return () => {
      cancelled = true
    }
  }, [trackUrl])

  useEffect(() => {
    if (track && pathRef.current) setPathReady(true)
  }, [track])

  if (track === undefined) return <p className="replay-hint">Loading track map…</p>
  if (track === null) return <p className="replay-hint">No track map available for this circuit.</p>

  const anyLive = cars.some((c) => c.isLive)

  return (
    <div className="track-map">
      <svg viewBox={track.viewBox} width="100%" role="img" aria-label="Track map">
        <path ref={pathRef} d={track.d} fill="none" stroke="var(--replay-track-line, #5757e7)" strokeWidth={6} />
        {pathReady && cars.map((c) => {
          const el = pathRef.current
          if (!el) return null
          const total = el.getTotalLength()
          const { x, y } = el.getPointAtLength(c.fraction * total)
          const isFocus = c.car_number === focusCarNumber
          return (
            <g key={c.car_number}>
              <circle cx={x} cy={y} r={isFocus ? 10 : 6} fill={getTeamColor(c.team)} stroke="#fff" strokeWidth={1.2} />
            </g>
          )
        })}
      </svg>
      <p className="replay-hint">
        {anyLive
          ? 'Car positions from live GPS where available, estimated between timing crossings otherwise.'
          : 'Car positions estimated between timing-loop crossings, not real telemetry.'}
      </p>
    </div>
  )
}
