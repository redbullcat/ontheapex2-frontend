import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { ReplayData } from './replayData'
import { getTeamColor } from '../lib/identityColors'

const HEIGHT = 64
const TRACK_COUNT = 5

interface Series {
  car: string
  color: string
  points: { time: number; gap: number }[]
}

export function ReplayGapStrip({ data, current }: { data: ReplayData; current: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const playheadRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null)
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const series = useMemo((): Series[] => {
    const byCar = new Map<string, { time: number; gap: number }[]>()
    for (const e of data.events) {
      if (e.sector !== 3) continue
      const gap = data.gapByLapAndCar.get(e.lap)?.get(e.car)
      if (gap == null) continue
      const arr = byCar.get(e.car)
      if (arr) arr.push({ time: e.time, gap })
      else byCar.set(e.car, [{ time: e.time, gap }])
    }
    const finalGap = (car: string) => {
      const pts = byCar.get(car)
      return pts && pts.length ? pts[pts.length - 1].gap : Infinity
    }
    const cars = [...byCar.keys()].filter((c) => c !== data.referenceCar).sort((a, b) => finalGap(a) - finalGap(b))
    const team = new Map(data.cars.map((c) => [c.car_number, c.team]))
    return cars.slice(0, TRACK_COUNT).map((car) => ({
      car,
      color: getTeamColor(team.get(car) ?? null),
      points: byCar.get(car) ?? [],
    }))
  }, [data])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (width === 0 || series.length === 0) return

    svg.attr('width', width).attr('height', HEIGHT)
    const x = d3.scaleLinear().domain([data.minTime, data.maxTime]).range([4, width - 4])
    const maxGap = d3.max(series, (s) => d3.max(s.points, (p) => p.gap) ?? 0) ?? 1
    const y = d3.scaleLinear().domain([0, maxGap || 1]).range([HEIGHT - 6, 6])
    xScaleRef.current = x

    const line = d3
      .line<{ time: number; gap: number }>()
      .x((d) => x(d.time))
      .y((d) => y(d.gap))
      .curve(d3.curveLinear)

    svg
      .selectAll('path')
      .data(series)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.85)
      .attr('d', (d) => line(d.points))

    const playhead = svg
      .append('line')
      .attr('y1', 0)
      .attr('y2', HEIGHT)
      .attr('stroke', 'var(--replay-accent)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('x1', x(current))
      .attr('x2', x(current))
    playheadRef.current = playhead
    // deliberately excludes `current` — the playhead position is updated by
    // the cheap effect below every tick; this heavy rebuild should only run
    // when the underlying data/size actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, data])

  // Cheap per-tick update: just the playhead position.
  useEffect(() => {
    const x = xScaleRef.current
    if (!x || !playheadRef.current) return
    const px = x(current)
    playheadRef.current.attr('x1', px).attr('x2', px)
  }, [current])

  return (
    <div className="replay-gap-strip" ref={containerRef}>
      <svg ref={svgRef} />
      <div className="replay-gap-legend">
        <span className="replay-gap-legend-title">Gap to leader</span>
        {series.map((s) => (
          <span key={s.car} className="replay-gap-legend-item">
            <i style={{ background: s.color }} />#{s.car}
          </span>
        ))}
      </div>
    </div>
  )
}
