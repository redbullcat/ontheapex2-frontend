import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { HourlyPositions } from '../api/types'

// Categorical slots 1–3 (blue, aqua, yellow) from the shared palette — validated
// for both light and dark surfaces via scripts/validate_palette.js in the
// dataviz skill. Referenced through CSS custom properties so the mode swap
// happens in one place (see the <style> block below).
const CLASS_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8']
const OTHER_VAR = '--series-other'

const MARGIN = { top: 16, right: 64, bottom: 32, left: 40 }
const PLOT_HEIGHT = 440

interface Point {
  hour: number
  position: number
  lap_number: number
  elapsed_seconds: number
}

interface CarSeries {
  car_number: string
  class: string
  team: string | null
  points: Point[]
}

interface HoverState {
  x: number
  y: number
  car: string
  cls: string
  team: string | null
  position: number
  hour: number
  lap: number
}

export function PositionChart({ data }: { data: HourlyPositions[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<HoverState | null>(null)

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

  const cars = useMemo(() => {
    const byCar = new Map<string, CarSeries>()
    for (const hourEntry of data) {
      for (const p of hourEntry.positions) {
        let car = byCar.get(p.car_number)
        if (!car) {
          car = { car_number: p.car_number, class: p.class ?? 'Unknown', team: p.team, points: [] }
          byCar.set(p.car_number, car)
        }
        car.points.push({
          hour: hourEntry.hour,
          position: p.position,
          lap_number: p.lap_number,
          elapsed_seconds: p.elapsed_seconds,
        })
      }
    }
    for (const car of byCar.values()) car.points.sort((a, b) => a.hour - b.hour)
    return [...byCar.values()]
  }, [data])

  // Classes ordered by their best (lowest) position at the first hour, so the
  // fastest class takes slot 1 — deterministic without hardcoding series names.
  const classOrder = useMemo(() => {
    const bestAtStart = new Map<string, number>()
    for (const car of cars) {
      const first = car.points[0]
      if (!first) continue
      const prev = bestAtStart.get(car.class)
      if (prev === undefined || first.position < prev) bestAtStart.set(car.class, first.position)
    }
    return [...bestAtStart.entries()].sort((a, b) => a[1] - b[1]).map(([cls]) => cls)
  }, [cars])

  const classVar = useMemo(() => {
    const m = new Map<string, string>()
    classOrder.forEach((cls, i) => m.set(cls, i < CLASS_VARS.length ? CLASS_VARS[i] : OTHER_VAR))
    return m
  }, [classOrder])

  const { maxHour, maxPosition } = useMemo(() => {
    let maxHour = 0
    let maxPosition = 1
    for (const hourEntry of data) {
      maxHour = Math.max(maxHour, hourEntry.hour)
      for (const p of hourEntry.positions) maxPosition = Math.max(maxPosition, p.position)
    }
    return { maxHour, maxPosition }
  }, [data])

  const positionsByHourAndCar = useMemo(() => {
    const m = new Map<number, Map<string, Point & { car_number: string; team: string | null; class: string }>>()
    for (const hourEntry of data) {
      const inner = new Map<string, Point & { car_number: string; team: string | null; class: string }>()
      for (const p of hourEntry.positions) {
        inner.set(p.car_number, {
          hour: hourEntry.hour,
          position: p.position,
          lap_number: p.lap_number,
          elapsed_seconds: p.elapsed_seconds,
          car_number: p.car_number,
          team: p.team,
          class: p.class ?? 'Unknown',
        })
      }
      m.set(hourEntry.hour, inner)
    }
    return m
  }, [data])

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)
  const xRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const yRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const crosshairRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const x = d3.scaleLinear().domain([0, maxHour]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([1, maxPosition]).range([0, innerHeight])
    xRef.current = x
    yRef.current = y

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const yTicks = y.ticks(Math.min(maxPosition, 10)).filter((t) => Number.isInteger(t))
    g.append('g')
      .attr('class', 'gridlines')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 1)

    const line = d3
      .line<Point>()
      .x((d) => x(d.hour))
      .y((d) => y(d.position))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .attr('class', 'car-lines')
      .selectAll<SVGPathElement, CarSeries>('path')
      .data(cars)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => `var(${classVar.get(d.class) ?? OTHER_VAR})`)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.65)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    // Direct label: each class's leader (lowest position) at the final hour.
    const finalHour = positionsByHourAndCar.get(maxHour)
    if (finalHour) {
      const leaders = classOrder
        .map((cls) => {
          let best: (Point & { car_number: string; class: string }) | null = null
          for (const entry of finalHour.values()) {
            if (entry.class !== cls) continue
            if (!best || entry.position < best.position) best = entry
          }
          return best
        })
        .filter((e): e is Point & { car_number: string; class: string } => e !== null)
        .sort((a, b) => a.position - b.position)

      // Nudge apart labels that would otherwise collide vertically.
      const minGap = 14
      const labelYs = leaders.map((l) => y(l.position))
      for (let i = 1; i < labelYs.length; i++) {
        if (labelYs[i] - labelYs[i - 1] < minGap) labelYs[i] = labelYs[i - 1] + minGap
      }

      const endLabels = g.append('g').attr('class', 'end-labels')

      // End-dot carries the series color (the identity channel); the label
      // text stays in ink so it stays legible even for the lighter hues.
      endLabels
        .selectAll('circle')
        .data(leaders)
        .join('circle')
        .attr('cx', innerWidth)
        .attr('cy', (_d, i) => labelYs[i])
        .attr('r', 4)
        .attr('fill', (d) => `var(${classVar.get(d.class) ?? OTHER_VAR})`)
        .attr('stroke', 'var(--surface-1)')
        .attr('stroke-width', 2)

      endLabels
        .selectAll('text')
        .data(leaders)
        .join('text')
        .attr('x', innerWidth + 10)
        .attr('y', (_d, i) => labelYs[i])
        .attr('dominant-baseline', 'central')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text((d) => `#${d.car_number}`)
    }

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.min(maxHour + 1, Math.floor(innerWidth / 60))))
      .tickFormat((d) => `H${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const yAxis = d3.axisLeft(y).tickValues(yTicks).tickFormat((d) => `P${d}`).tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    // Crosshair + nearest-car hover: with 60+ overlapping lines a per-mark
    // hit target isn't viable, so the pointer's Y picks the nearest car at
    // the snapped hour instead (a 1-D nearest-point layer).
    const crosshair = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'var(--axis)')
      .attr('stroke-width', 1)
      .style('display', 'none')
    crosshairRef.current = crosshair

    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')

    overlay
      .on('mousemove', (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event, g.node())
        const hourAtX = Math.round(x.invert(mx))
        const clampedHour = Math.max(0, Math.min(maxHour, hourAtX))
        const hourData = positionsByHourAndCar.get(clampedHour)
        if (!hourData || hourData.size === 0) return

        const positionAtY = y.invert(my)
        let nearest: (Point & { car_number: string; team: string | null; class: string }) | null = null
        let nearestDist = Infinity
        for (const entry of hourData.values()) {
          const d = Math.abs(entry.position - positionAtY)
          if (d < nearestDist) {
            nearestDist = d
            nearest = entry
          }
        }
        if (!nearest) return
        const nearestCar = nearest.car_number

        crosshair.style('display', null).attr('x1', x(clampedHour)).attr('x2', x(clampedHour))
        pathsSelRef.current
          ?.attr('opacity', (d) => (d.car_number === nearestCar ? 1 : 0.25))
          .attr('stroke-width', (d) => (d.car_number === nearestCar ? 3 : 2))
        pathsSelRef.current?.filter((d) => d.car_number === nearestCar).raise()

        const rect = containerRef.current?.getBoundingClientRect()
        setHover({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: nearest.car_number,
          cls: nearest.class,
          team: nearest.team,
          position: nearest.position,
          hour: clampedHour,
          lap: nearest.lap_number,
        })
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none')
        pathsSelRef.current?.attr('opacity', 0.65).attr('stroke-width', 2)
        setHover(null)
      })
  }, [cars, width, classOrder, classVar, maxHour, maxPosition, positionsByHourAndCar])

  const legendClasses = useMemo(() => classOrder.slice(0, CLASS_VARS.length), [classOrder])

  return (
    <div className="viz-root position-chart" ref={containerRef}>
      <style>{`
        .position-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          --series-1: #2a78d6;
          --series-2: #1baf7a;
          --series-3: #eda100;
          --series-4: #008300;
          --series-5: #4a3aa7;
          --series-6: #e34948;
          --series-7: #e87ba4;
          --series-8: #eb6834;
          --series-other: #898781;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .position-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            --series-1: #3987e5;
            --series-2: #199e70;
            --series-3: #c98500;
            --series-4: #008300;
            --series-5: #9085e9;
            --series-6: #e66767;
            --series-7: #d55181;
            --series-8: #d95926;
            --series-other: #898781;
          }
        }
        .position-chart .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .position-chart .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .position-chart .legend-key {
          width: 14px;
          height: 2px;
          border-radius: 1px;
          flex: none;
        }
        .position-chart .tooltip {
          position: absolute;
          pointer-events: none;
          background: var(--text-primary);
          color: var(--surface-1);
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          transform: translate(12px, -50%);
          white-space: nowrap;
          z-index: 10;
        }
        .position-chart .tooltip strong {
          font-size: 13px;
        }
      `}</style>
      <div className="legend">
        {legendClasses.map((cls) => (
          <div className="legend-item" key={cls}>
            <span className="legend-key" style={{ background: `var(${classVar.get(cls)})` }} />
            <span>{cls}</span>
          </div>
        ))}
      </div>
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${hover.team}` : ''}
          </div>
          <div>
            P{hover.position} · {hover.cls} · Hour {hover.hour} · Lap {hover.lap}
          </div>
        </div>
      )}
    </div>
  )
}
