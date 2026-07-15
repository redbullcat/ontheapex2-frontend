import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { computeCarStints } from '../lib/stints'
import { isLapValid } from '../lib/lapValidity'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { CollapsibleFilters } from './CollapsibleFilters'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 16, right: 64, bottom: 32, left: 56 }
const PLOT_HEIGHT = 420

interface StintPoint {
  lapInStint: number
  lapTime: number
}

interface CarLongRun {
  car_number: string
  team: string | null
  stintLength: number
  points: StintPoint[]
}

interface HoverState {
  x: number
  y: number
  car: string
  team: string | null
  lapTime: number
  lapInStint: number
}

function computeLongestRuns(laps: LapRead[], activeClasses: Set<string>, activeCars: Set<string>): CarLongRun[] {
  const stints = computeCarStints(laps)
  const filtered = stints.filter(
    (s) => activeClasses.has(s.class ?? 'Unknown') && activeCars.has(s.car_number),
  )
  const longestByCar = new Map<string, (typeof stints)[number]>()
  for (const s of filtered) {
    const prev = longestByCar.get(s.car_number)
    if (!prev || s.laps.length > prev.laps.length) longestByCar.set(s.car_number, s)
  }
  return [...longestByCar.values()]
    .map((s) => ({
      car_number: s.car_number,
      team: s.team,
      stintLength: s.laps.length,
      points: s.laps
        .filter((l) => l.lap_time_seconds != null && isLapValid(l))
        .map((l, i) => ({ lapInStint: i + 1, lapTime: l.lap_time_seconds! })),
    }))
    .filter((c) => c.points.length > 0)
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

export function LongRunChart({
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
  const [hover, setHover] = useState<HoverState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)

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

  const runs = useMemo(
    () => computeLongestRuns(laps, activeClasses, activeCars),
    [laps, activeClasses, activeCars],
  )

  const strokeColor = useCallback((run: { team: string | null }) => getTeamColor(run.team), [])
  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarLongRun, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (runs.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const maxLapInStint = d3.max(runs, (r) => d3.max(r.points, (p) => p.lapInStint)) ?? 1
    const minTime = d3.min(runs, (r) => d3.min(r.points, (p) => p.lapTime)) ?? 0
    const maxTime = d3.max(runs, (r) => d3.max(r.points, (p) => p.lapTime)) ?? 1
    const pad = (maxTime - minTime) * 0.08 || 1

    const x = d3.scaleLinear().domain([1, maxLapInStint]).range([0, innerWidth])
    // Fastest (lowest) times plotted toward the top, matching the reference
    // chart's reversed y-axis convention.
    const y = d3.scaleLinear().domain([minTime - pad, maxTime + pad]).range([0, innerHeight])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

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
      .line<StintPoint>()
      .x((d) => x(d.lapInStint))
      .y((d) => y(d.lapTime))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .selectAll<SVGPathElement, CarLongRun>('path')
      .data(runs)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.75)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    g.append('g')
      .selectAll('circle')
      .data(runs.flatMap((r) => r.points.map((p) => ({ ...p, car: r.car_number, color: strokeColor(r) }))))
      .join('circle')
      .attr('cx', (d) => x(d.lapInStint))
      .attr('cy', (d) => y(d.lapTime))
      .attr('r', 2.5)
      .attr('fill', (d) => d.color)
      .attr('opacity', 0.75)

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.min(maxLapInStint, Math.floor(innerWidth / 50))))
      .tickFormat((d) => `L${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const yAxis = d3.axisLeft(y).tickValues(yTicks).tickFormat((d) => formatSeconds(d as number)).tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')

    overlay
      .on('mousemove', (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event, g.node())
        let nearest: { car: string; team: string | null; lapTime: number; lapInStint: number } | null = null
        let nearestDist = Infinity
        for (const run of runs) {
          for (const p of run.points) {
            const d = Math.hypot(x(p.lapInStint) - mx, y(p.lapTime) - my)
            if (d < nearestDist) {
              nearestDist = d
              nearest = { car: run.car_number, team: run.team, lapTime: p.lapTime, lapInStint: p.lapInStint }
            }
          }
        }
        if (!nearest) return
        const carNumber = nearest.car
        pathsSelRef.current
          ?.attr('opacity', (d) => (d.car_number === carNumber ? 1 : 0.2))
          .attr('stroke-width', (d) => (d.car_number === carNumber ? 3 : 2))
        pathsSelRef.current?.filter((d) => d.car_number === carNumber).raise()

        const rect = containerRef.current?.getBoundingClientRect()
        setHover({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: nearest.car,
          team: nearest.team,
          lapTime: nearest.lapTime,
          lapInStint: nearest.lapInStint,
        })
      })
      .on('mouseleave', () => {
        pathsSelRef.current?.attr('opacity', 0.75).attr('stroke-width', 2)
        setHover(null)
      })

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [runs, width, strokeColor, onRendered])

  return (
    <div className="viz-root long-run-chart" ref={containerRef}>
      <style>{`
        .long-run-chart {
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
          .long-run-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .long-run-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .long-run-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
        .long-run-chart .tooltip {
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
        .long-run-chart .tooltip strong {
          font-size: 13px;
        }
      `}</style>
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="longest_run_pace"
            renderChart={(w, onReady) => <LongRunChart laps={laps} forcedWidth={w} onRendered={onReady} />}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
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
      </CollapsibleFilters>
      {runs.length === 0 ? (
        <p className="hint">No stint data long enough for this selection.</p>
      ) : (
        <p className="hint">Each car's single longest clean stint, lap by lap.</p>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            Lap {hover.lapInStint} of stint · {formatSeconds(hover.lapTime)}
          </div>
        </div>
      )}
    </div>
  )
}
