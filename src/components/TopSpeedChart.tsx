import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 160 }
const ROW_HEIGHT = 22
const ROW_GAP = 6

interface CarTopSpeed {
  car: string
  team: string | null
  color: string
  topSpeed: number
  lap: number | null
}

export function TopSpeedChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)

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

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const cars = useMemo(() => {
    // Raw speed-trap data can carry the occasional sensor-glitch reading
    // far above a car's real pace (seen live: one lap reporting 377 km/h
    // against a ~320 km/h cluster). Cap each car's "top speed" at 115% of
    // its own median reading — enough headroom for a genuine slipstream
    // peak, tight enough to reject a one-off glitch.
    const byCar = new Map<string, number[]>()
    for (const lap of laps) {
      if (lap.top_speed == null) continue
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      const arr = byCar.get(lap.car_number)
      if (arr) arr.push(lap.top_speed)
      else byCar.set(lap.car_number, [lap.top_speed])
    }
    const ceilingByCar = new Map<string, number>()
    for (const [car, speeds] of byCar) {
      const median = d3.median(speeds) ?? 0
      ceilingByCar.set(car, median * 1.15)
    }

    const best = new Map<string, CarTopSpeed>()
    for (const lap of laps) {
      if (lap.top_speed == null) continue
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      const ceiling = ceilingByCar.get(lap.car_number) ?? Infinity
      if (lap.top_speed > ceiling) continue
      const prev = best.get(lap.car_number)
      if (!prev || lap.top_speed > prev.topSpeed) {
        best.set(lap.car_number, {
          car: lap.car_number,
          team: lap.team,
          color: getTeamColor(lap.team),
          topSpeed: lap.top_speed,
          lap: lap.lap_number,
        })
      }
    }
    return [...best.values()].sort((a, b) => b.topSpeed - a.topSpeed)
  }, [laps, activeClasses])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const plotHeight = cars.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const xMin = (d3.min(cars, (d) => d.topSpeed) ?? 0) * 0.95
    const xMax = (d3.max(cars, (d) => d.topSpeed) ?? 1) * 1.02
    const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(cars.map((d) => d.car))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const xTicks = x.ticks(6)
    g.append('g')
      .attr('class', 'gridlines')
      .selectAll('line')
      .data(xTicks)
      .join('line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', plotHeight)
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 1)

    g.append('g')
      .selectAll('text')
      .data(cars)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => `#${d.car} — ${d.team ?? 'Unknown'}`)

    g.append('g')
      .selectAll('rect')
      .data(cars)
      .join('rect')
      .attr('x', x(xMin))
      .attr('y', (d) => y(d.car) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.topSpeed) - x(xMin)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(cars)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.topSpeed) + 6)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${d.topSpeed.toFixed(1)} km/h`)

    const xAxis = d3.axisBottom(x).tickValues(xTicks).tickFormat((d) => `${d}`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [cars, width])

  return (
    <div className="viz-root top-speed-chart" ref={containerRef}>
      <style>{`
        .top-speed-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .top-speed-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
      `}</style>
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      {cars.length === 0 ? <p className="hint">No top speed data for this selection.</p> : <svg ref={svgRef} />}
    </div>
  )
}
