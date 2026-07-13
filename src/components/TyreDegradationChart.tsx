import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getEntityColor, getManufacturerColor, getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { tyreSummary } from '../lib/carTyres'
import { movingAverage } from '../lib/smoothTrend'
import { isLapValid } from '../lib/lapValidity'
import { classifyFlag } from '../lib/flags'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { CollapsibleFilters } from './CollapsibleFilters'

const MARGIN = { top: 16, right: 16, bottom: 32, left: 60 }
const PLOT_HEIGHT = 420
const SMOOTH_WINDOW = 3

type ColorBy = 'team' | 'manufacturer' | 'car'

interface RawPoint {
  age: number
  lapTime: number
}

interface TrendPoint {
  age: number
  lapTime: number
}

interface CarSeries {
  car_number: string
  team: string | null
  manufacturer: string | null
  points: RawPoint[]
  trend: TrendPoint[]
}

interface HoverState {
  x: number
  y: number
  car: string
  team: string | null
  age: number
  lapTime: number
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

// Every qualifying lap on this compound, for every selected car, pooled by
// tyre age (not lap-in-stint — a car can rejoin on the same tyres after a
// driver change, so age keeps climbing across what a driver-stint chart
// would call two stints) and averaged at each age, then smoothed. Not one
// cherry-picked "best" or "average" stint — every one of a car's own stints
// on this compound contributes.
//
// Caution-period laps are excluded outright rather than just relied on to
// average out: since this is pooled per-car (not across the whole field
// like the long-run-by-manufacturer chart), a single car's SC/FCY lap at a
// given tyre age is often the *only* sample at that age, so it becomes the
// mean rather than getting diluted — a lap-time cliff at that exact age
// with no bearing on actual degradation.
function computeSeries(laps: LapRead[], compound: string, activeCars: Set<string>): CarSeries[] {
  const byCar = new Map<string, { team: string | null; manufacturer: string | null; points: RawPoint[] }>()
  for (const lap of laps) {
    if (lap.lap_time_seconds == null) continue
    if (!isLapValid(lap)) continue
    if (classifyFlag(lap.flag_at_fl) !== 'green') continue
    if (!activeCars.has(lap.car_number)) continue
    const summary = tyreSummary(lap)
    if (summary.compound !== compound || summary.age == null) continue
    let entry = byCar.get(lap.car_number)
    if (!entry) {
      entry = { team: lap.team, manufacturer: lap.manufacturer, points: [] }
      byCar.set(lap.car_number, entry)
    }
    entry.points.push({ age: summary.age, lapTime: lap.lap_time_seconds })
  }

  const out: CarSeries[] = []
  for (const [car_number, entry] of byCar) {
    const byAge = new Map<number, number[]>()
    for (const p of entry.points) {
      const arr = byAge.get(p.age)
      if (arr) arr.push(p.lapTime)
      else byAge.set(p.age, [p.lapTime])
    }
    const averaged = [...byAge.entries()]
      .map(([age, times]) => ({ age, avg: d3.mean(times) ?? 0 }))
      .sort((a, b) => a.age - b.age)
    const smoothed = movingAverage(averaged, SMOOTH_WINDOW, (p) => p.avg)
    const trend = averaged.map((p, i) => ({ age: p.age, lapTime: smoothed[i] }))
    out.push({ car_number, team: entry.team, manufacturer: entry.manufacturer, points: entry.points, trend })
  }
  return out
}

export function TyreDegradationChart({ laps, compound }: { laps: LapRead[]; compound: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [colorBy, setColorBy] = useState<ColorBy>('team')
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)

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

  const carOptions: EntityOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const lap of laps) {
      if (tyreSummary(lap).compound !== compound) continue
      if (!byCar.has(lap.car_number)) byCar.set(lap.car_number, getTeamDisplayName(lap.team))
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ id: car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [laps, compound])

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const series = useMemo(() => computeSeries(laps, compound, activeCars), [laps, compound, activeCars])

  const colorFor = useCallback(
    (s: { team: string | null; manufacturer: string | null; car_number: string }) => {
      if (colorBy === 'car') return getEntityColor(s.car_number)
      if (colorBy === 'manufacturer') return getManufacturerColor(s.manufacturer)
      return getTeamColor(s.team)
    },
    [colorBy],
  )

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (series.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const maxAge = d3.max(series, (s) => d3.max(s.trend, (p) => p.age)) ?? 1
    const minTime = d3.min(series, (s) => d3.min(s.trend, (p) => p.lapTime)) ?? 0
    const maxTime = d3.max(series, (s) => d3.max(s.trend, (p) => p.lapTime)) ?? 1
    const pad = (maxTime - minTime) * 0.15 || 1

    const x = d3.scaleLinear().domain([1, maxAge]).range([0, innerWidth])
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
      .line<TrendPoint>()
      .x((d) => x(d.age))
      .y((d) => y(d.lapTime))
      .curve(d3.curveLinear)

    // faint raw scatter behind the trend lines
    g.append('g')
      .selectAll('circle')
      .data(series.flatMap((s) => s.points.map((p) => ({ ...p, color: colorFor(s) }))))
      .join('circle')
      .attr('cx', (d) => x(d.age))
      .attr('cy', (d) => y(d.lapTime))
      .attr('r', 2)
      .attr('fill', (d) => d.color)
      .attr('opacity', 0.15)

    const paths = g
      .append('g')
      .selectAll<SVGPathElement, CarSeries>('path')
      .data(series)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', colorFor)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.8)
      .attr('d', (d) => line(d.trend))
    pathsSelRef.current = paths

    g.append('g')
      .selectAll('circle')
      .data(series.flatMap((s) => s.trend.map((p) => ({ ...p, car_number: s.car_number, color: colorFor(s) }))))
      .join('circle')
      .attr('cx', (d) => x(d.age))
      .attr('cy', (d) => y(d.lapTime))
      .attr('r', 3)
      .attr('fill', (d) => d.color)
      .attr('opacity', 0.9)

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.min(maxAge, Math.floor(innerWidth / 50))))
      .tickFormat((d) => String(d))
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
        let nearest: { car: string; team: string | null; age: number; lapTime: number } | null = null
        let nearestDist = Infinity
        for (const s of series) {
          for (const p of s.trend) {
            const d = Math.hypot(x(p.age) - mx, y(p.lapTime) - my)
            if (d < nearestDist) {
              nearestDist = d
              nearest = { car: s.car_number, team: s.team, age: p.age, lapTime: p.lapTime }
            }
          }
        }
        if (!nearest) return
        const carNumber = nearest.car
        pathsSelRef.current
          ?.attr('opacity', (d) => (d.car_number === carNumber ? 1 : 0.15))
          .attr('stroke-width', (d) => (d.car_number === carNumber ? 3 : 2))
        pathsSelRef.current?.filter((d) => d.car_number === carNumber).raise()

        const rect = containerRef.current?.getBoundingClientRect()
        setHover({
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: nearest.car,
          team: nearest.team,
          age: nearest.age,
          lapTime: nearest.lapTime,
        })
      })
      .on('mouseleave', () => {
        pathsSelRef.current?.attr('opacity', 0.8).attr('stroke-width', 2)
        setHover(null)
      })
  }, [series, width, colorFor])

  return (
    <div className="viz-root tyre-degradation-chart" ref={containerRef}>
      <style>{`
        .tyre-degradation-chart {
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
          .tyre-degradation-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .tyre-degradation-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .tyre-degradation-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
        .tyre-degradation-chart .tooltip {
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
        .tyre-degradation-chart .tooltip strong {
          font-size: 13px;
        }
      `}</style>
      <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename={`tyre_degradation_${compound.toLowerCase()}`} />}>
        <div className="chart-controls">
          <div className="color-mode-toggle" role="radiogroup" aria-label="Color by">
            {(['team', 'manufacturer', 'car'] as const).map((m) => (
              <button key={m} type="button" className={colorBy === m ? 'active' : ''} onClick={() => setColorBy(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-controls">
          <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all cars" />
        </div>
      </CollapsibleFilters>
      {series.length === 0 ? (
        <p className="hint">No data for this selection.</p>
      ) : (
        <p className="hint">Each car's mean lap time by tyre age, smoothed — pooled across all of that car's own stints on this compound.</p>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            Tyre age {hover.age} &middot; {formatSeconds(hover.lapTime)}
          </div>
        </div>
      )}
    </div>
  )
}
