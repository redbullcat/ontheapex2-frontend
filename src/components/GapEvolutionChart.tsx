import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { CLASS_VARS, OTHER_VAR, assignClassVars, CLASS_COLOR_CSS_VARS, CLASS_COLOR_CSS_VARS_DARK } from '../lib/classColors'
import { getTeamColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ColorModeToggle, type ColorMode } from './ColorModeToggle'

const MARGIN = { top: 16, right: 64, bottom: 32, left: 48 }
const PLOT_HEIGHT = 400

interface Point {
  lap_number: number
  gap: number
}

interface CarSeries {
  car_number: string
  class: string
  team: string | null
  isReference: boolean
  points: Point[]
}

interface HoverState {
  x: number
  y: number
  car: string
  cls: string
  team: string | null
  gap: number
  lap: number
}

export function GapEvolutionChart({ laps }: { laps: LapRead[] }) {
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

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const classVar = useMemo(() => assignClassVars(allClasses), [allClasses])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const filtered = useMemo(
    () => laps.filter((l) => l.elapsed_seconds != null && l.lap_number != null && activeClasses.has(l.class ?? 'Unknown')),
    [laps, activeClasses],
  )

  // Reference car: the classification leader of the selection (most laps
  // completed, ties broken by lowest elapsed time at that lap), held fixed
  // for the entire chart. The original Streamlit chart picked whichever car
  // had the lowest max cumulative time, which relied on every car sharing
  // the same lap-range window (a slider clamped them all to one span); here
  // cars can have different final laps, so that rule would just pick
  // whoever raced (and thus accumulated less time) the least — e.g. a
  // car that retired early. Using the same classification rule as the
  // results table avoids that trap.
  const { referenceCar, gapByLapAndCar, maxLap, maxGap } = useMemo(() => {
    const lastLapByCar = new Map<string, LapRead>()
    for (const lap of filtered) {
      const prev = lastLapByCar.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
    }
    let referenceCar: string | null = null
    let bestLap = -1
    let bestElapsed = Infinity
    for (const [car, lastLap] of lastLapByCar) {
      if (lastLap.lap_number > bestLap || (lastLap.lap_number === bestLap && lastLap.elapsed_seconds! < bestElapsed)) {
        bestLap = lastLap.lap_number
        bestElapsed = lastLap.elapsed_seconds!
        referenceCar = car
      }
    }

    const refByLap = new Map<number, number>()
    if (referenceCar) {
      for (const lap of filtered) {
        if (lap.car_number === referenceCar) refByLap.set(lap.lap_number, lap.elapsed_seconds!)
      }
    }

    const gapByLapAndCar = new Map<number, Map<string, { gap: number; team: string | null; class: string }>>()
    let maxLap = 0
    let maxGap = 0
    for (const lap of filtered) {
      const refTime = refByLap.get(lap.lap_number)
      if (refTime === undefined) continue
      const gap = lap.elapsed_seconds! - refTime
      let inner = gapByLapAndCar.get(lap.lap_number)
      if (!inner) {
        inner = new Map()
        gapByLapAndCar.set(lap.lap_number, inner)
      }
      inner.set(lap.car_number, { gap, team: lap.team, class: lap.class ?? 'Unknown' })
      maxLap = Math.max(maxLap, lap.lap_number)
      maxGap = Math.max(maxGap, gap)
    }

    return { referenceCar, gapByLapAndCar, maxLap, maxGap }
  }, [filtered])

  const cars = useMemo(() => {
    const byCar = new Map<string, CarSeries>()
    for (const [lapNumber, inner] of gapByLapAndCar) {
      for (const [carNumber, entry] of inner) {
        let car = byCar.get(carNumber)
        if (!car) {
          car = { car_number: carNumber, class: entry.class, team: entry.team, isReference: carNumber === referenceCar, points: [] }
          byCar.set(carNumber, car)
        }
        car.points.push({ lap_number: lapNumber, gap: entry.gap })
      }
    }
    for (const car of byCar.values()) car.points.sort((a, b) => a.lap_number - b.lap_number)
    return [...byCar.values()]
  }, [gapByLapAndCar, referenceCar])

  const strokeColor = useCallback(
    (car: { class: string; team: string | null }) =>
      colorMode === 'team' ? getTeamColor(car.team) : `var(${classVar.get(car.class) ?? OTHER_VAR})`,
    [colorMode, classVar],
  )

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const x = d3.scaleLinear().domain([1, maxLap]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([0, maxGap || 1]).range([0, innerHeight])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const yTicks = y.ticks(6)
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
      .y((d) => y(d.gap))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .attr('class', 'car-lines')
      .selectAll<SVGPathElement, CarSeries>('path')
      .data(cars)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.7)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    // Direct label: closest car to the reference (smallest gap) per class at
    // the final lap, plus the reference car itself.
    const finalLap = gapByLapAndCar.get(maxLap)
    if (finalLap) {
      const leaders = [...activeClasses]
        .map((cls) => {
          let best: { car: string; gap: number; team: string | null; class: string } | null = null
          for (const [car, entry] of finalLap) {
            if (entry.class !== cls) continue
            if (!best || entry.gap < best.gap) best = { car, gap: entry.gap, team: entry.team, class: entry.class }
          }
          return best
        })
        .filter((e): e is { car: string; gap: number; team: string | null; class: string } => e !== null)
        .sort((a, b) => a.gap - b.gap)

      const minGapPx = 14
      const labelYs = leaders.map((l) => y(l.gap))
      for (let i = 1; i < labelYs.length; i++) {
        if (labelYs[i] - labelYs[i - 1] < minGapPx) labelYs[i] = labelYs[i - 1] + minGapPx
      }

      const endLabels = g.append('g').attr('class', 'end-labels')

      endLabels
        .selectAll('circle')
        .data(leaders)
        .join('circle')
        .attr('cx', innerWidth)
        .attr('cy', (_d, i) => labelYs[i])
        .attr('r', 4)
        .attr('fill', (d) => strokeColor(d))
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
        .text((d) => `#${d.car}${d.car === referenceCar ? ' (ref)' : ''}`)
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

    const yAxis = d3.axisLeft(y).tickValues(yTicks).tickFormat((d) => `+${d}s`).tickSizeOuter(0)
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
        const lapData = gapByLapAndCar.get(clampedLap)
        if (!lapData || lapData.size === 0) return

        const gapAtY = y.invert(my)
        let nearestCar: string | null = null
        let nearestEntry: { gap: number; team: string | null; class: string } | null = null
        let nearestDist = Infinity
        for (const [car, entry] of lapData) {
          const d = Math.abs(entry.gap - gapAtY)
          if (d < nearestDist) {
            nearestDist = d
            nearestCar = car
            nearestEntry = entry
          }
        }
        if (!nearestCar || !nearestEntry) return
        const car = nearestCar
        const entry = nearestEntry

        crosshair.style('display', null).attr('x1', x(clampedLap)).attr('x2', x(clampedLap))
        pathsSelRef.current
          ?.attr('opacity', (d) => (d.car_number === car ? 1 : 0.25))
          .attr('stroke-width', (d) => (d.car_number === car ? 3 : 2))
        pathsSelRef.current?.filter((d) => d.car_number === car).raise()

        const rect = containerRef.current?.getBoundingClientRect()
        setHover({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car,
          cls: entry.class,
          team: entry.team,
          gap: entry.gap,
          lap: clampedLap,
        })
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none')
        pathsSelRef.current?.attr('opacity', 0.7).attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
        setHover(null)
      })
  }, [cars, width, activeClasses, strokeColor, maxLap, maxGap, gapByLapAndCar, referenceCar])

  const legendClasses = useMemo(
    () => [...activeClasses].filter((c) => allClasses.indexOf(c) < CLASS_VARS.length),
    [activeClasses, allClasses],
  )

  return (
    <div className="viz-root gap-evolution-chart" ref={containerRef}>
      <style>{`
        .gap-evolution-chart {
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
          .gap-evolution-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            ${CLASS_COLOR_CSS_VARS_DARK}
          }
        }
        .gap-evolution-chart .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .gap-evolution-chart .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .gap-evolution-chart .legend-key {
          width: 14px;
          height: 2px;
          border-radius: 1px;
          flex: none;
        }
        .gap-evolution-chart .tooltip {
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
        .gap-evolution-chart .tooltip strong {
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
      {cars.length === 0 ? (
        <p className="hint">No lap data for this selection.</p>
      ) : (
        <p className="hint">Gap to #{referenceCar} — the fastest car across this selection.</p>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${hover.team}` : ''}
          </div>
          <div>
            +{hover.gap.toFixed(3)}s · {hover.cls} · Lap {hover.lap}
          </div>
        </div>
      )}
    </div>
  )
}
