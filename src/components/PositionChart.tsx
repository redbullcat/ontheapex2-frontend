import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { HourlyPositionEntry, HourlyPositions } from '../api/types'
import { CLASS_VARS, OTHER_VAR, assignClassVars, CLASS_COLOR_CSS_VARS, CLASS_COLOR_CSS_VARS_DARK } from '../lib/classColors'
import { getTeamColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ColorModeToggle, type ColorMode } from './ColorModeToggle'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { LapRangeInputs } from './LapRangeInputs'

const MARGIN = { top: 16, right: 64, bottom: 32, left: 40 }
const PLOT_HEIGHT = 440

interface Point {
  hour: number
  position: number
  lap_number: number
  elapsed_seconds: number
}

interface RankedEntry extends HourlyPositionEntry {
  class: string
  hour: number
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
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('team')
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)
  const [lapRange, setLapRange] = useState<[number, number] | null>(null)

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

  // Classes ordered by their best (lowest) overall position at the first
  // hour, so the fastest class takes color slot 1 — deterministic without
  // hardcoding series names. Derived from the full (unfiltered) data so a
  // class's color/slot never changes when the filter narrows.
  const allClasses = useMemo(() => {
    const bestAtStart = new Map<string, number>()
    const firstHour = data[0]
    if (firstHour) {
      for (const p of firstHour.positions) {
        const cls = p.class ?? 'Unknown'
        const prev = bestAtStart.get(cls)
        if (prev === undefined || p.position < prev) bestAtStart.set(cls, p.position)
      }
    }
    return [...bestAtStart.entries()].sort((a, b) => a[1] - b[1]).map(([cls]) => cls)
  }, [data])

  const classVar = useMemo(() => assignClassVars(allClasses), [allClasses])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const carOptions: EntityOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const hourEntry of data) {
      for (const p of hourEntry.positions) {
        if (!activeClasses.has(p.class ?? 'Unknown')) continue
        if (!byCar.has(p.car_number)) byCar.set(p.car_number, p.team ?? 'Unknown team')
      }
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ id: car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [data, activeClasses])

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const lapBounds = useMemo((): [number, number] => {
    let min = Infinity
    let max = 0
    for (const hourEntry of data) {
      for (const p of hourEntry.positions) {
        min = Math.min(min, p.lap_number)
        max = Math.max(max, p.lap_number)
      }
    }
    return min === Infinity ? [0, 1] : [min, max]
  }, [data])

  const effectiveLapRange = lapRange ?? lapBounds

  // Re-rank within the selected classes: position is recomputed per hour
  // from elapsed_seconds among only the entries whose class is selected, so
  // filtering to one class shows that class's own P1..Pn running order.
  const rankedByHour = useMemo(() => {
    const m = new Map<number, RankedEntry[]>()
    for (const hourEntry of data) {
      const filtered = hourEntry.positions.filter(
        (p) =>
          activeClasses.has(p.class ?? 'Unknown') &&
          activeCars.has(p.car_number) &&
          p.lap_number >= effectiveLapRange[0] &&
          p.lap_number <= effectiveLapRange[1],
      )
      // Rank by laps completed first, elapsed time only breaks ties within the
      // same lap count — a car stuck on a stale forward-filled snapshot after
      // retiring (fewer laps, frozen low elapsed_seconds) must not outrank
      // cars still racing just because its elapsed clock stopped early.
      const sorted = [...filtered].sort(
        (a, b) => b.lap_number - a.lap_number || a.elapsed_seconds - b.elapsed_seconds,
      )
      const ranked = sorted.map((p, i) => ({ ...p, class: p.class ?? 'Unknown', hour: hourEntry.hour, position: i + 1 }))
      m.set(hourEntry.hour, ranked)
    }
    return m
  }, [data, activeClasses, activeCars, effectiveLapRange])

  const cars = useMemo(() => {
    const byCar = new Map<string, CarSeries>()
    for (const ranked of rankedByHour.values()) {
      for (const p of ranked) {
        let car = byCar.get(p.car_number)
        if (!car) {
          car = { car_number: p.car_number, class: p.class, team: p.team, points: [] }
          byCar.set(p.car_number, car)
        }
        car.points.push({
          hour: p.hour,
          position: p.position,
          lap_number: p.lap_number,
          elapsed_seconds: p.elapsed_seconds,
        })
      }
    }
    for (const car of byCar.values()) car.points.sort((a, b) => a.hour - b.hour)
    return [...byCar.values()]
  }, [rankedByHour])

  const { maxHour, maxPosition } = useMemo(() => {
    let maxHour = 0
    let maxPosition = 1
    for (const [hour, ranked] of rankedByHour) {
      maxHour = Math.max(maxHour, hour)
      for (const p of ranked) maxPosition = Math.max(maxPosition, p.position)
    }
    return { maxHour, maxPosition }
  }, [rankedByHour])

  const positionsByHourAndCar = useMemo(() => {
    const m = new Map<number, Map<string, RankedEntry>>()
    for (const [hour, ranked] of rankedByHour) {
      const inner = new Map<string, RankedEntry>()
      for (const p of ranked) inner.set(p.car_number, p)
      m.set(hour, inner)
    }
    return m
  }, [rankedByHour])

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

    const x = d3.scaleLinear().domain([0, maxHour]).range([0, innerWidth])
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
      .attr('stroke', strokeColor)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.65)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    // Direct label: each selected class's leader (lowest position) at the
    // final hour. The dot carries color identity; the label stays in ink.
    const finalHour = positionsByHourAndCar.get(maxHour)
    if (finalHour) {
      const leaders = [...activeClasses]
        .map((cls) => {
          let best: RankedEntry | null = null
          for (const entry of finalHour.values()) {
            if (entry.class !== cls) continue
            if (!best || entry.position < best.position) best = entry
          }
          return best
        })
        .filter((e): e is RankedEntry => e !== null)
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

    // Crosshair + nearest-car hover: with many overlapping lines a per-mark
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
        let nearest: RankedEntry | null = null
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
  }, [cars, width, activeClasses, strokeColor, maxHour, maxPosition, positionsByHourAndCar])

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
        :root[data-theme='dark'] .position-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            ${CLASS_COLOR_CSS_VARS_DARK}
        }
        :root[data-theme='light'] .position-chart {
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
        <LapRangeInputs min={lapBounds[0]} max={lapBounds[1]} value={effectiveLapRange} onChange={setLapRange} />
      </div>
      <div className="chart-controls">
        <EntityFilter
          items={carOptions}
          selection={carSelection}
          onChange={setCarSelection}
          addLabel="Add car"
          resetLabel="Show all cars"
        />
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
            P{hover.position} · {hover.cls} · Hour {hover.hour} · Lap {hover.lap}
          </div>
        </div>
      )}
    </div>
  )
}
