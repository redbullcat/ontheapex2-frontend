import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { LapRangeInputs } from './LapRangeInputs'
import { ChartExportButtons } from './ChartExportButtons'
import { findTrackMapUrl } from '../lib/trackMaps'
import { CollapsibleFilters } from './CollapsibleFilters'
import { isLapValid } from '../lib/lapValidity'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 24, right: 64, bottom: 32, left: 48 }
const PLOT_HEIGHT = 420

interface SectorPoint {
  x: number
  gap: number
  label: string
}

interface CarSectorSeries {
  car_number: string
  team: string | null
  lap_number: number
  isReference: boolean
  points: SectorPoint[]
}

interface HoverState {
  x: number
  y: number
  car: string
  team: string | null
  gap: number
  label: string
}

function hasSectors(l: LapRead): boolean {
  return l.s1_seconds != null && l.s2_seconds != null && l.s3_seconds != null
}

function splitsOf(l: LapRead): [number, number, number] {
  const s1 = l.s1_seconds!
  const s2 = l.s2_seconds!
  const s3 = l.s3_seconds!
  return [s1, s1 + s2, s1 + s2 + s3]
}

export function SectorAnalysisChart({
  laps,
  seriesSlug,
  eventName,
  forcedWidth,
  onRendered,
  initialClassSelection,
  initialCarSelection,
  initialLapRange,
  initialUseRefCar,
  initialRefCar,
}: {
  laps: LapRead[]
  seriesSlug?: string
  eventName?: string
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
  initialClassSelection?: ClassSelection
  initialCarSelection?: EntitySelection
  initialLapRange?: [number, number] | null
  initialUseRefCar?: boolean
  initialRefCar?: string
}) {
  const trackMapUrl =
    seriesSlug?.toLowerCase() === 'wec' && eventName ? findTrackMapUrl(eventName) : null
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(initialClassSelection ?? null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(initialCarSelection ?? null)
  const [lapRange, setLapRange] = useState<[number, number] | null>(initialLapRange ?? null)
  const [useRefCar, setUseRefCar] = useState(initialUseRefCar ?? false)
  const [refCar, setRefCar] = useState(initialRefCar ?? '')

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const lapBounds = useMemo((): [number, number] => {
    let min = Infinity
    let max = 0
    for (const lap of laps) {
      min = Math.min(min, lap.lap_number)
      max = Math.max(max, lap.lap_number)
    }
    return min === Infinity ? [0, 1] : [min, max]
  }, [laps])
  const effectiveLapRange = lapRange ?? lapBounds

  // Sector-timed laps within the active class/lap-range window, independent
  // of which cars are toggled on — the reference lap and the "cars to show"
  // list are scoped separately, matching the Streamlit reference chart.
  const sectorLaps = useMemo(
    () =>
      laps.filter(
        (l) =>
          hasSectors(l) &&
          l.lap_time_seconds != null &&
          isLapValid(l) &&
          activeClasses.has(l.class ?? 'Unknown') &&
          l.lap_number >= effectiveLapRange[0] &&
          l.lap_number <= effectiveLapRange[1],
      ),
    [laps, activeClasses, effectiveLapRange],
  )

  const carOptions: EntityOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const lap of sectorLaps) {
      if (!byCar.has(lap.car_number)) byCar.set(lap.car_number, getTeamDisplayName(lap.team))
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ id: car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [sectorLaps])

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const fastestByCar = useMemo(() => {
    const best = new Map<string, LapRead>()
    for (const lap of sectorLaps) {
      const prev = best.get(lap.car_number)
      if (!prev || lap.lap_time_seconds! < prev.lap_time_seconds!) best.set(lap.car_number, lap)
    }
    return best
  }, [sectorLaps])

  const { referenceLap, referenceLabel } = useMemo(() => {
    if (useRefCar && refCar) {
      const lap = fastestByCar.get(refCar)
      if (lap) return { referenceLap: lap, referenceLabel: `#${refCar} — Lap ${lap.lap_number} (fastest)` }
    }
    let best: LapRead | null = null
    for (const lap of fastestByCar.values()) {
      if (!best || lap.lap_time_seconds! < best.lap_time_seconds!) best = lap
    }
    return {
      referenceLap: best,
      referenceLabel: best ? `#${best.car_number} — Lap ${best.lap_number} (fastest in selection)` : '',
    }
  }, [useRefCar, refCar, fastestByCar])

  const { series, refSplits } = useMemo(() => {
    if (!referenceLap) return { series: [] as CarSectorSeries[], refSplits: null as [number, number, number] | null }
    const refSplitsLocal = splitsOf(referenceLap)
    const out: CarSectorSeries[] = []
    for (const car of activeCars) {
      const lap = fastestByCar.get(car)
      if (!lap) continue
      const [s1, s2, s3] = splitsOf(lap)
      const cum = [s1, s2, s3]
      const points: SectorPoint[] = [
        { x: 0, gap: 0, label: 'Start' },
        { x: refSplitsLocal[0], gap: cum[0] - refSplitsLocal[0], label: 'S1' },
        { x: refSplitsLocal[1], gap: cum[1] - refSplitsLocal[1], label: 'S2' },
        { x: refSplitsLocal[2], gap: cum[2] - refSplitsLocal[2], label: 'Lap end' },
      ]
      out.push({
        car_number: car,
        team: lap.team,
        lap_number: lap.lap_number,
        isReference: car === referenceLap.car_number,
        points,
      })
    }
    return { series: out, refSplits: refSplitsLocal }
  }, [referenceLap, activeCars, fastestByCar])

  const strokeColor = useCallback((car: { team: string | null }) => getTeamColor(car.team), [])
  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSectorSeries, SVGGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (series.length === 0 || width === 0 || !refSplits) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const maxGap = d3.max(series, (s) => d3.max(s.points, (p) => Math.abs(p.gap))) ?? 1
    const x = d3.scaleLinear().domain([0, refSplits[2]]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([-maxGap * 1.1 || -1, maxGap * 1.1 || 1]).range([innerHeight, 0])

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

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', y(0))
      .attr('y2', y(0))
      .attr('stroke', 'var(--axis)')
      .attr('stroke-width', 1.5)

    for (const boundary of refSplits) {
      g.append('line')
        .attr('x1', x(boundary))
        .attr('x2', x(boundary))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'var(--grid)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
    }

    const line = d3
      .line<SectorPoint>()
      .x((d) => x(d.x))
      .y((d) => y(d.gap))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .selectAll<SVGPathElement, CarSectorSeries>('path')
      .data(series)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.8)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    g.append('g')
      .selectAll('circle.marker')
      .data(series.flatMap((s) => s.points.slice(1).map((p) => ({ ...p, color: strokeColor(s) }))))
      .join('circle')
      .attr('class', 'marker')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.gap))
      .attr('r', 3.5)
      .attr('fill', (d) => d.color)

    const xAxis = d3
      .axisBottom(x)
      .tickValues(refSplits)
      .tickFormat((_d, i) => ['S1', 'S2', 'Lap end'][i])
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const yAxis = d3
      .axisLeft(y)
      .tickValues(yTicks)
      .tickFormat((d) => `${Number(d) > 0 ? '+' : ''}${d}s`)
      .tickSizeOuter(0)
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
        const gapAtY = y.invert(my)
        const xAtM = x.invert(mx)

        let nearest: { car: string; team: string | null; gap: number; label: string } | null = null
        let nearestDist = Infinity
        for (const s of series) {
          for (const p of s.points) {
            const d = Math.hypot(x(p.x) - mx, y(p.gap) - my)
            if (d < nearestDist) {
              nearestDist = d
              nearest = { car: s.car_number, team: s.team, gap: p.gap, label: p.label }
            }
          }
        }
        void xAtM
        void gapAtY
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
          gap: nearest.gap,
          label: nearest.label,
        })
      })
      .on('mouseleave', () => {
        pathsSelRef.current?.attr('opacity', 0.8).attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
        setHover(null)
      })

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [series, refSplits, width, strokeColor, onRendered])

  return (
    <div className="viz-root sector-analysis-chart" ref={containerRef}>
      <style>{`
        .sector-analysis-chart {
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
          .sector-analysis-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .sector-analysis-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .sector-analysis-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
        .sector-analysis-chart .tooltip {
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
        .sector-analysis-chart .tooltip strong {
          font-size: 13px;
        }
        .sector-analysis-chart .track-map {
          margin-bottom: 16px;
        }
        .sector-analysis-chart .track-map img {
          max-width: 260px;
          width: 100%;
          height: auto;
        }
      `}</style>
      {trackMapUrl && (
        <div className="track-map">
          <img src={trackMapUrl} alt={`${eventName} track map`} />
        </div>
      )}
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="sector_analysis"
            renderChart={(w, onReady) => (
              <SectorAnalysisChart
                laps={laps}
                seriesSlug={seriesSlug}
                eventName={eventName}
                forcedWidth={w}
                onRendered={onReady}
                initialClassSelection={classSelection}
                initialCarSelection={carSelection}
                initialLapRange={lapRange}
                initialUseRefCar={useRefCar}
                initialRefCar={refCar}
              />
            )}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          <LapRangeInputs min={lapBounds[0]} max={lapBounds[1]} value={effectiveLapRange} onChange={setLapRange} />
          <label className="class-filter-item">
            <input
              type="checkbox"
              checked={useRefCar}
              onChange={(e) => setUseRefCar(e.target.checked)}
            />
            Use a specific car as reference
          </label>
          {useRefCar && (
            <select value={refCar} onChange={(e) => setRefCar(e.target.value)}>
              <option value="">Select a car…</option>
              {carOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
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
      {series.length === 0 ? (
        <p className="hint">No sector time data for this selection.</p>
      ) : (
        <p className="hint">
          Each car's own fastest lap in range, compared sector-by-sector against {referenceLabel}.
        </p>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            {hover.label}: {hover.gap >= 0 ? '+' : ''}
            {hover.gap.toFixed(3)}s
          </div>
        </div>
      )}
    </div>
  )
}
