import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 16, right: 64, bottom: 40, left: 48 }
const PLOT_HEIGHT = 420

interface Point {
  lap_number: number
  gap: number
}

interface CarSeries {
  car_number: string
  team: string | null
  isReference: boolean
  points: Point[]
}

interface LeadChangeEvent {
  lap: number
  fromCar: string | null
  toCar: string
}

interface CautionBand {
  startLap: number
  endLap: number
}

interface HoverState {
  x: number
  y: number
  car: string
  team: string | null
  gap: number
  lap: number
}

// Ported from story_chart.py's detect_events() + _compute_gaps(): auto-detect
// the notable moments in a race (cautions, lead changes) from raw lap data,
// rather than requiring a human to mark them up. The original also detects
// pit stops and driver changes, but those already have dedicated tabs (Pit
// Stops, Stints) — read-only v1 keeps this chart focused on cautions and
// lead changes, the two that actually shape the gap-to-reference narrative.
function isGreen(flag: string | null): boolean {
  return !flag || flag.toUpperCase() === 'GF'
}

function computeStory(laps: LapRead[], activeClasses: Set<string>, activeCars: Set<string>) {
  const filtered = laps.filter(
    (l) =>
      l.elapsed_seconds != null &&
      l.lap_number != null &&
      activeClasses.has(l.class ?? 'Unknown') &&
      activeCars.has(l.car_number),
  )

  const byLap = new Map<number, LapRead[]>()
  for (const lap of filtered) {
    const arr = byLap.get(lap.lap_number)
    if (arr) arr.push(lap)
    else byLap.set(lap.lap_number, [lap])
  }
  const lapNumbers = [...byLap.keys()].sort((a, b) => a - b)

  const leaderByLap = new Map<number, LapRead>()
  const cautionLaps = new Set<number>()
  for (const lapNumber of lapNumbers) {
    const rows = byLap.get(lapNumber)!
    const sorted = [...rows].sort((a, b) => a.elapsed_seconds! - b.elapsed_seconds!)
    leaderByLap.set(lapNumber, sorted[0])
    if (rows.some((r) => !isGreen(r.flag_at_fl))) cautionLaps.add(lapNumber)
  }

  const leadChanges: LeadChangeEvent[] = []
  let prevLeader: string | null = null
  for (const lapNumber of lapNumbers) {
    const leader = leaderByLap.get(lapNumber)!.car_number
    if (prevLeader !== null && leader !== prevLeader) {
      leadChanges.push({ lap: lapNumber, fromCar: prevLeader, toCar: leader })
    }
    prevLeader = leader
  }

  const cautionBands: CautionBand[] = []
  let bandStart: number | null = null
  let prevLap: number | null = null
  for (const lapNumber of lapNumbers) {
    if (cautionLaps.has(lapNumber)) {
      if (bandStart === null) bandStart = lapNumber
    } else if (bandStart !== null) {
      cautionBands.push({ startLap: bandStart, endLap: prevLap! })
      bandStart = null
    }
    prevLap = lapNumber
  }
  if (bandStart !== null) cautionBands.push({ startLap: bandStart, endLap: prevLap! })

  // Reference car: the classification leader (most laps, then lowest
  // elapsed), same rule as the gap evolution and results table.
  const lastLapByCar = new Map<string, LapRead>()
  for (const lap of filtered) {
    const prev = lastLapByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
  }
  let referenceCar: string | null = null
  let bestLap = -1
  let bestElapsed = Infinity
  for (const lastLap of lastLapByCar.values()) {
    if (lastLap.lap_number > bestLap || (lastLap.lap_number === bestLap && lastLap.elapsed_seconds! < bestElapsed)) {
      bestLap = lastLap.lap_number
      bestElapsed = lastLap.elapsed_seconds!
      referenceCar = lastLap.car_number
    }
  }

  const refByLap = new Map<number, number>()
  if (referenceCar) {
    for (const lap of filtered) {
      if (lap.car_number === referenceCar) refByLap.set(lap.lap_number, lap.elapsed_seconds!)
    }
  }

  const carSeriesMap = new Map<string, CarSeries>()
  let minLap = Infinity
  let maxLap = 0
  let maxGap = 0
  for (const lapNumber of lapNumbers) {
    const refTime = refByLap.get(lapNumber)
    if (refTime === undefined) continue
    for (const lap of byLap.get(lapNumber)!) {
      const gap = lap.elapsed_seconds! - refTime
      let car = carSeriesMap.get(lap.car_number)
      if (!car) {
        car = { car_number: lap.car_number, team: lap.team, isReference: lap.car_number === referenceCar, points: [] }
        carSeriesMap.set(lap.car_number, car)
      }
      car.points.push({ lap_number: lapNumber, gap })
      minLap = Math.min(minLap, lapNumber)
      maxLap = Math.max(maxLap, lapNumber)
      maxGap = Math.max(maxGap, gap)
    }
  }
  for (const car of carSeriesMap.values()) car.points.sort((a, b) => a.lap_number - b.lap_number)

  return {
    cars: [...carSeriesMap.values()],
    referenceCar,
    leadChanges,
    cautionBands,
    minLap: minLap === Infinity ? 1 : minLap,
    maxLap,
    maxGap,
  }
}

export function StoryChart({
  laps,
  forcedWidth,
  onRendered,
}: {
  laps: LapRead[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const carOptions: EntityOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const lap of laps) {
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      if (!byCar.has(lap.car_number)) byCar.set(lap.car_number, getTeamDisplayName(lap.team))
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ id: car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [laps, activeClasses])

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const story = useMemo(
    () => computeStory(laps, activeClasses, activeCars),
    [laps, activeClasses, activeCars],
  )

  const strokeColor = useCallback((car: { team: string | null }) => getTeamColor(car.team), [])

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (story.cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const x = d3.scaleLinear().domain([story.minLap, story.maxLap]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([0, story.maxGap || 1]).range([0, innerHeight])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Caution bands sit behind everything else, a translucent wash spanning
    // the full plot height for the laps run under a non-green flag.
    g.append('g')
      .attr('class', 'caution-bands')
      .selectAll('rect')
      .data(story.cautionBands)
      .join('rect')
      .attr('x', (d) => x(d.startLap))
      .attr('width', (d) => Math.max(1, x(d.endLap) - x(d.startLap)))
      .attr('y', 0)
      .attr('height', innerHeight)
      .attr('fill', 'var(--caution)')
      .attr('fill-opacity', 0.15)

    const yTicks = y.ticks(6)
    g.append('g')
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
      .data(story.cars)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.7)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    // Lead-change markers: a vertical hairline at the lap, with the new
    // leader's car number labeled at the top.
    const leadG = g.append('g').attr('class', 'lead-changes')
    leadG
      .selectAll('line')
      .data(story.leadChanges)
      .join('line')
      .attr('x1', (d) => x(d.lap))
      .attr('x2', (d) => x(d.lap))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'var(--text-muted)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
    leadG
      .selectAll('text')
      .data(story.leadChanges)
      .join('text')
      .attr('x', (d) => x(d.lap))
      .attr('y', -4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .text((d) => `#${d.toCar}`)

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.min(story.maxLap - story.minLap + 1, Math.floor(innerWidth / 60))))
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
        const clampedLap = Math.max(story.minLap, Math.min(story.maxLap, lapAtX))
        const gapAtY = y.invert(my)

        let nearestCar: CarSeries | null = null
        let nearestGap = 0
        let nearestDist = Infinity
        for (const car of story.cars) {
          const pt = car.points.find((p) => p.lap_number === clampedLap)
          if (!pt) continue
          const d = Math.abs(pt.gap - gapAtY)
          if (d < nearestDist) {
            nearestDist = d
            nearestCar = car
            nearestGap = pt.gap
          }
        }
        if (!nearestCar) return
        const carNumber = nearestCar.car_number

        crosshair.style('display', null).attr('x1', x(clampedLap)).attr('x2', x(clampedLap))
        pathsSelRef.current
          ?.attr('opacity', (d) => (d.car_number === carNumber ? 1 : 0.25))
          .attr('stroke-width', (d) => (d.car_number === carNumber ? 3 : 2))
        pathsSelRef.current?.filter((d) => d.car_number === carNumber).raise()

        const rect = containerRef.current?.getBoundingClientRect()
        setHover({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: carNumber,
          team: nearestCar.team,
          gap: nearestGap,
          lap: clampedLap,
        })
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none')
        pathsSelRef.current?.attr('opacity', 0.7).attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
        setHover(null)
      })

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [story, width, strokeColor, onRendered])

  return (
    <div className="viz-root story-chart" ref={containerRef}>
      <style>{`
        .story-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          --caution: #fab219;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .story-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            --caution: #fab219;
          }
        }
        :root[data-theme='dark'] .story-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            --caution: #fab219;
        }
        :root[data-theme='light'] .story-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          --caution: #fab219;
          position: relative;
          background: var(--surface-1);
        }
        .story-chart .tooltip {
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
        .story-chart .tooltip strong {
          font-size: 13px;
        }
        .story-chart .legend-note {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .story-chart .legend-note .swatch {
          display: inline-block;
          width: 12px;
          height: 12px;
          background: var(--caution);
          opacity: 0.3;
          margin-right: 4px;
          vertical-align: middle;
        }
      `}</style>
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        <EntityFilter
          items={carOptions}
          selection={carSelection}
          onChange={setCarSelection}
          addLabel="Add car"
          resetLabel="Show all cars"
        />
        <ChartExportButtons
          svgRef={svgRef}
          filename="story_chart"
          renderChart={(w, onReady) => <StoryChart laps={laps} forcedWidth={w} onRendered={onReady} />}
        />
      </div>
      {story.cars.length === 0 ? (
        <p className="hint">No lap data for this selection.</p>
      ) : (
        <>
          <p className="hint">
            Gap to #{story.referenceCar} (the race leader) · {story.leadChanges.length} lead change
            {story.leadChanges.length === 1 ? '' : 's'} · {story.cautionBands.length} caution period
            {story.cautionBands.length === 1 ? '' : 's'}
          </p>
          <div className="legend-note">
            <span>
              <span className="swatch" />
              Caution period
            </span>
            <span>┊ Lead change</span>
          </div>
        </>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            +{hover.gap.toFixed(3)}s · Lap {hover.lap}
          </div>
        </div>
      )}
    </div>
  )
}
