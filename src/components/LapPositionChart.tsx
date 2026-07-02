import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { CLASS_VARS, OTHER_VAR, assignClassVars, CLASS_COLOR_CSS_VARS, CLASS_COLOR_CSS_VARS_DARK } from '../lib/classColors'
import { getTeamColor } from '../lib/teamColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ColorModeToggle, type ColorMode } from './ColorModeToggle'

const MARGIN = { top: 16, right: 64, bottom: 32, left: 40 }
const PLOT_HEIGHT = 440

interface Point {
  lap_number: number
  position: number
  lap_time_seconds: number | null
}

interface RankedLap {
  car_number: string
  class: string
  team: string | null
  lap_number: number
  position: number
  lap_time_seconds: number | null
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
  lap: number
  lapTime: number | null
}

export function LapPositionChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('team')

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

  const lapsByNumber = useMemo(() => {
    const m = new Map<number, LapRead[]>()
    for (const lap of laps) {
      const arr = m.get(lap.lap_number)
      if (arr) arr.push(lap)
      else m.set(lap.lap_number, [lap])
    }
    return m
  }, [laps])

  // Classes ordered by whichever appears fastest (min elapsed) on lap 1, so
  // the leading class takes color slot 1 — stable across filter changes
  // since it's derived from the full, unfiltered dataset.
  const allClasses = useMemo(() => {
    const firstLap = [...lapsByNumber.keys()].sort((a, b) => a - b)[0]
    const rows = firstLap !== undefined ? lapsByNumber.get(firstLap) ?? [] : []
    const bestAtStart = new Map<string, number>()
    for (const row of rows) {
      if (row.elapsed_seconds == null) continue
      const cls = row.class ?? 'Unknown'
      const prev = bestAtStart.get(cls)
      if (prev === undefined || row.elapsed_seconds < prev) bestAtStart.set(cls, row.elapsed_seconds)
    }
    return [...bestAtStart.entries()].sort((a, b) => a[1] - b[1]).map(([cls]) => cls)
  }, [lapsByNumber])

  const classVar = useMemo(() => assignClassVars(allClasses), [allClasses])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  // Re-rank within the selected classes: for each lap, sort the selected
  // cars by elapsed time and assign 1..N, same convention as the hourly
  // chart and the original per-lap position matrix it was ported from.
  const rankedByLap = useMemo(() => {
    const m = new Map<number, RankedLap[]>()
    for (const [lapNumber, rows] of lapsByNumber) {
      const filtered = rows.filter((r) => r.elapsed_seconds != null && activeClasses.has(r.class ?? 'Unknown'))
      const sorted = [...filtered].sort((a, b) => a.elapsed_seconds! - b.elapsed_seconds!)
      const ranked = sorted.map((r, i) => ({
        car_number: r.car_number,
        class: r.class ?? 'Unknown',
        team: r.team,
        lap_number: lapNumber,
        position: i + 1,
        lap_time_seconds: r.lap_time_seconds,
      }))
      m.set(lapNumber, ranked)
    }
    return m
  }, [lapsByNumber, activeClasses])

  const cars = useMemo(() => {
    const byCar = new Map<string, CarSeries>()
    for (const ranked of rankedByLap.values()) {
      for (const p of ranked) {
        let car = byCar.get(p.car_number)
        if (!car) {
          car = { car_number: p.car_number, class: p.class, team: p.team, points: [] }
          byCar.set(p.car_number, car)
        }
        car.points.push({ lap_number: p.lap_number, position: p.position, lap_time_seconds: p.lap_time_seconds })
      }
    }
    for (const car of byCar.values()) car.points.sort((a, b) => a.lap_number - b.lap_number)
    return [...byCar.values()]
  }, [rankedByLap])

  const { maxLap, maxPosition } = useMemo(() => {
    let maxLap = 0
    let maxPosition = 1
    for (const [lapNumber, ranked] of rankedByLap) {
      maxLap = Math.max(maxLap, lapNumber)
      for (const p of ranked) maxPosition = Math.max(maxPosition, p.position)
    }
    return { maxLap, maxPosition }
  }, [rankedByLap])

  const strokeColor = useCallback(
    (car: { class: string; team: string | null }) =>
      colorMode === 'team' ? getTeamColor(car.team) : `var(${classVar.get(car.class) ?? OTHER_VAR})`,
    [colorMode, classVar],
  )

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)
  const crosshairRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const x = d3.scaleLinear().domain([1, maxLap]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([1, maxPosition]).range([0, innerHeight])

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
      .x((d) => x(d.lap_number))
      .y((d) => y(d.position))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .attr('class', 'car-lines')
      .selectAll<SVGPathElement, CarSeries>('path')
      .data(cars)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.65)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    const finalLap = rankedByLap.get(maxLap)
    if (finalLap) {
      const leaders = [...activeClasses]
        .map((cls) => {
          let best: RankedLap | null = null
          for (const entry of finalLap) {
            if (entry.class !== cls) continue
            if (!best || entry.position < best.position) best = entry
          }
          return best
        })
        .filter((e): e is RankedLap => e !== null)
        .sort((a, b) => a.position - b.position)

      const minGap = 14
      const labelYs = leaders.map((l) => y(l.position))
      for (let i = 1; i < labelYs.length; i++) {
        if (labelYs[i] - labelYs[i - 1] < minGap) labelYs[i] = labelYs[i - 1] + minGap
      }

      const endLabels = g.append('g').attr('class', 'end-labels')

      endLabels
        .selectAll('circle')
        .data(leaders)
        .join('circle')
        .attr('cx', innerWidth)
        .attr('cy', (_d, i) => labelYs[i])
        .attr('r', 4)
        .attr('fill', strokeColor)
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
      .ticks(Math.max(2, Math.min(maxLap, Math.floor(innerWidth / 60))))
      .tickFormat((d) => `L${d}`)
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
        const lapAtX = Math.round(x.invert(mx))
        const clampedLap = Math.max(1, Math.min(maxLap, lapAtX))
        const lapData = rankedByLap.get(clampedLap)
        if (!lapData || lapData.length === 0) return

        const positionAtY = y.invert(my)
        let nearest: RankedLap | null = null
        let nearestDist = Infinity
        for (const entry of lapData) {
          const d = Math.abs(entry.position - positionAtY)
          if (d < nearestDist) {
            nearestDist = d
            nearest = entry
          }
        }
        if (!nearest) return
        const nearestCar = nearest.car_number

        crosshair.style('display', null).attr('x1', x(clampedLap)).attr('x2', x(clampedLap))
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
          lap: nearest.lap_number,
          lapTime: nearest.lap_time_seconds,
        })
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none')
        pathsSelRef.current?.attr('opacity', 0.65).attr('stroke-width', 2)
        setHover(null)
      })
  }, [cars, width, activeClasses, strokeColor, maxLap, maxPosition, rankedByLap])

  const legendClasses = useMemo(
    () => [...activeClasses].filter((c) => allClasses.indexOf(c) < CLASS_VARS.length),
    [activeClasses, allClasses],
  )

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
          ${CLASS_COLOR_CSS_VARS}
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
            ${CLASS_COLOR_CSS_VARS_DARK}
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
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        {activeClasses.size > 1 && <ColorModeToggle mode={colorMode} onChange={setColorMode} />}
      </div>
      {colorMode === 'class' && (
        <div className="legend">
          {legendClasses.map((cls) => (
            <div className="legend-item" key={cls}>
              <span className="legend-key" style={{ background: `var(${classVar.get(cls)})` }} />
              <span>{cls}</span>
            </div>
          ))}
        </div>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${hover.team}` : ''}
          </div>
          <div>
            P{hover.position} · {hover.cls} · Lap {hover.lap}
            {hover.lapTime != null ? ` · ${hover.lapTime.toFixed(3)}s` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
