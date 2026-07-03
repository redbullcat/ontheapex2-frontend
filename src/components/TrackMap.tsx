import { useCallback, useEffect, useRef, useState } from 'react'
import { getTeamColor } from '../lib/identityColors'
import { useFractionAnimation } from '../hooks/useFractionAnimation'

export interface TrackMapCar {
  car_number: string
  team: string | null
  fraction: number
  isLive?: boolean
}

interface ParsedTrack {
  viewBox: string
  // Raw inner markup (all <path> elements — corner markers, sector ticks
  // etc, not just the outline) rendered as-is so this matches what
  // SectorAnalysisChart's plain <img src={trackMapUrl}> shows.
  innerSvg: string
  // These files bundle ~30 paths (a few dozen small corner/sector-tick
  // marks alongside the actual circuit outline) — the outline is reliably
  // the single longest `d` string, everything else is a few dozen
  // characters. Used as a separate, invisible path purely to drive
  // getTotalLength/getPointAtLength for car placement.
  mainPathD: string
}

const trackCache = new Map<string, Promise<ParsedTrack | null>>()

function loadTrack(url: string): Promise<ParsedTrack | null> {
  let cached = trackCache.get(url)
  if (!cached) {
    cached = fetch(url)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!text) return null
        const viewBoxMatch = text.match(/viewBox="([^"]+)"/)
        const svgOpenMatch = text.match(/<svg[^>]*>/)
        const svgCloseIndex = text.lastIndexOf('</svg>')
        if (!viewBoxMatch || !svgOpenMatch || svgCloseIndex === -1) return null
        const innerSvg = text.slice(svgOpenMatch.index! + svgOpenMatch[0].length, svgCloseIndex)
        const dMatches = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
        if (dMatches.length === 0) return null
        const mainPathD = dMatches.reduce((longest, d) => (d.length > longest.length ? d : longest), dMatches[0])
        return { viewBox: viewBoxMatch[1], innerSvg, mainPathD }
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
  const circleRefs = useRef(new Map<string, SVGCircleElement>())

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

  // Car dots move via direct DOM writes (see useFractionAnimation), never
  // through React re-renders — the JSX below only sets cx/cy once, at
  // mount, via the ref callback's init guard; from then on this tick
  // handler owns them exclusively. Called unconditionally, before the
  // early returns below, so hook order stays stable across renders
  // regardless of load state.
  const onTick = useCallback((carNumber: string, fraction: number) => {
    const el = pathRef.current
    const circle = circleRefs.current.get(carNumber)
    if (!el || !circle) return
    const total = el.getTotalLength()
    const { x, y } = el.getPointAtLength(fraction * total)
    circle.setAttribute('cx', String(x))
    circle.setAttribute('cy', String(y))
  }, [])
  useFractionAnimation(cars, onTick)

  if (track === undefined) return <p className="replay-hint">Loading track map…</p>
  if (track === null) return <p className="replay-hint">No track map available for this circuit.</p>

  const anyLive = cars.some((c) => c.isLive)

  return (
    <div className="track-map">
      <svg viewBox={track.viewBox} width="100%" role="img" aria-label="Track map">
        <g dangerouslySetInnerHTML={{ __html: track.innerSvg }} />
        <path ref={pathRef} d={track.mainPathD} fill="none" stroke="none" />
        {pathReady &&
          cars.map((c) => {
            const isFocus = c.car_number === focusCarNumber
            return (
              <circle
                key={c.car_number}
                ref={(el) => {
                  if (el) circleRefs.current.set(c.car_number, el)
                  else circleRefs.current.delete(c.car_number)
                  if (!el || el.dataset.inited === '1') return
                  const pathEl = pathRef.current
                  if (pathEl) {
                    const total = pathEl.getTotalLength()
                    const { x, y } = pathEl.getPointAtLength(c.fraction * total)
                    el.setAttribute('cx', String(x))
                    el.setAttribute('cy', String(y))
                  }
                  el.dataset.inited = '1'
                }}
                r={isFocus ? 10 : 6}
                fill={getTeamColor(c.team)}
                stroke="#fff"
                strokeWidth={1.2}
              />
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
