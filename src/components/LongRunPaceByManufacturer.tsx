import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { computeCarStints } from '../lib/stints'
import { isLapValid } from '../lib/lapValidity'
import { getManufacturerColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { CollapsibleFilters } from './CollapsibleFilters'

const MARGIN = { top: 16, right: 140, bottom: 32, left: 56 }
const PLOT_HEIGHT = 460
const MIN_STINT_LENGTH = 3
// Odd-sized centered moving average across lap-in-stint position, softening
// the per-position mean into a LOESS-like trend without pulling in a stats
// dependency for a true regression.
const SMOOTH_WINDOW = 3

interface RawPoint {
  manufacturer: string
  lapInStint: number
  lapTime: number
}

interface TrendPoint {
  lapInStint: number
  lapTime: number
}

interface ManufacturerSeries {
  manufacturer: string
  color: string
  points: RawPoint[]
  trend: TrendPoint[]
}

function smooth(points: { lapInStint: number; avg: number }[]): TrendPoint[] {
  const half = Math.floor(SMOOTH_WINDOW / 2)
  return points.map((p, i) => {
    const window = points.slice(Math.max(0, i - half), Math.min(points.length, i + half + 1))
    const avg = d3.mean(window, (w) => w.avg) ?? p.avg
    return { lapInStint: p.lapInStint, lapTime: avg }
  })
}

function computeSeries(
  laps: LapRead[],
  activeClasses: Set<string>,
  activeManufacturers: Set<string>,
): ManufacturerSeries[] {
  const stints = computeCarStints(laps).filter(
    (s) => s.laps.length >= MIN_STINT_LENGTH && activeClasses.has(s.class ?? 'Unknown'),
  )

  const byManufacturer = new Map<string, RawPoint[]>()
  for (const stint of stints) {
    const manufacturer = stint.manufacturer ?? 'Unknown'
    if (!activeManufacturers.has(manufacturer)) continue
    const arr = byManufacturer.get(manufacturer) ?? []
    stint.laps.forEach((lap, i) => {
      if (lap.lap_time_seconds == null) return
      if (!isLapValid(lap)) return
      arr.push({ manufacturer, lapInStint: i + 1, lapTime: lap.lap_time_seconds })
    })
    byManufacturer.set(manufacturer, arr)
  }

  const manufacturers = [...byManufacturer.keys()].sort()

  const out: ManufacturerSeries[] = []
  for (const manufacturer of manufacturers) {
    const points = byManufacturer.get(manufacturer)!
    const byPosition = new Map<number, number[]>()
    for (const p of points) {
      const arr = byPosition.get(p.lapInStint)
      if (arr) arr.push(p.lapTime)
      else byPosition.set(p.lapInStint, [p.lapTime])
    }
    const averaged = [...byPosition.entries()]
      .map(([lapInStint, times]) => ({ lapInStint, avg: d3.mean(times) ?? 0 }))
      .sort((a, b) => a.lapInStint - b.lapInStint)

    out.push({ manufacturer, color: getManufacturerColor(manufacturer), points, trend: smooth(averaged) })
  }
  return out
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

export function LongRunPaceByManufacturer({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [manufacturerSelection, setManufacturerSelection] = useState<EntitySelection>(null)
  // Defaults to zoomed on the actual long-run trend lines — a raw-point
  // domain gets blown out by rare outlier laps (traffic, yellow flags),
  // squashing the trends themselves into an illegible band at the bottom.
  const [zoomToTrend, setZoomToTrend] = useState(true)

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

  const manufacturerOptions: EntityOption[] = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) {
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      s.add(lap.manufacturer ?? 'Unknown')
    }
    return [...s].sort().map((m) => ({ id: m, label: m }))
  }, [laps, activeClasses])

  const activeManufacturers = useMemo(
    () => resolveEntitySelection(manufacturerSelection, manufacturerOptions.map((m) => m.id)),
    [manufacturerSelection, manufacturerOptions],
  )

  const series = useMemo(
    () => computeSeries(laps, activeClasses, activeManufacturers),
    [laps, activeClasses, activeManufacturers],
  )

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (series.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const allPoints = series.flatMap((s) => s.points)
    const maxLapInStint = d3.max(allPoints, (p) => p.lapInStint) ?? 1

    // Zoomed mode sizes the y-domain to the trend lines (the actual signal
    // this chart exists to show), not the raw scatter — a single outlier
    // lap can otherwise blow the domain out several seconds and squash
    // every trend into a thin band. "Show all laps" reverts to the full
    // raw-point range.
    const allTrendPoints = series.flatMap((s) => s.trend)
    const domainSource = zoomToTrend && allTrendPoints.length > 0 ? allTrendPoints : allPoints
    const minTime = d3.min(domainSource, (p) => p.lapTime) ?? 0
    const maxTime = d3.max(domainSource, (p) => p.lapTime) ?? 1
    const pad = (maxTime - minTime) * (zoomToTrend ? 0.25 : 0.08) || 1

    const x = d3.scaleLinear().domain([1, maxLapInStint]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([minTime - pad, maxTime + pad]).range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Scatter dots that fall outside a zoomed domain would otherwise spill
    // above/below the plot into the axis-label margins.
    const clipId = `long-run-clip-${Math.random().toString(36).slice(2)}`
    svg
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)

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

    for (const s of series) {
      g.append('g')
        .attr('clip-path', `url(#${clipId})`)
        .selectAll('circle')
        .data(s.points)
        .join('circle')
        .attr('cx', (d) => x(d.lapInStint))
        .attr('cy', (d) => y(d.lapTime))
        .attr('r', 2.5)
        .attr('fill', s.color)
        .attr('fill-opacity', 0.25)
    }

    const line = d3
      .line<TrendPoint>()
      .x((d) => x(d.lapInStint))
      .y((d) => y(d.lapTime))
      .curve(d3.curveBasis)

    for (const s of series) {
      g.append('path')
        .datum(s.trend)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 2.5)
        .attr('d', line)
    }

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

    const legend = g.append('g').attr('transform', `translate(${innerWidth + 16},0)`)
    legend
      .selectAll('g')
      .data(series)
      .join('g')
      .attr('transform', (_d, i) => `translate(0,${i * 20})`)
      .each(function (d) {
        const item = d3.select(this)
        item.append('line').attr('x1', 0).attr('x2', 16).attr('y1', 0).attr('y2', 0).attr('stroke', d.color).attr('stroke-width', 3)
        item
          .append('text')
          .attr('x', 22)
          .attr('y', 4)
          .attr('fill', 'var(--text-secondary)')
          .attr('font-size', 11)
          .text(d.manufacturer)
      })
  }, [series, width, zoomToTrend])

  return (
    <div className="viz-root long-run-manufacturer-chart" ref={containerRef}>
      <style>{`
        .long-run-manufacturer-chart {
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
          .long-run-manufacturer-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .long-run-manufacturer-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .long-run-manufacturer-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
      `}</style>
      <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename="long_run_pace_by_manufacturer" />}>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          <div className="color-mode-toggle" role="radiogroup" aria-label="Y-axis range">
            <button type="button" className={zoomToTrend ? 'active' : ''} onClick={() => setZoomToTrend(true)}>
              Zoomed
            </button>
            <button type="button" className={!zoomToTrend ? 'active' : ''} onClick={() => setZoomToTrend(false)}>
              All laps
            </button>
          </div>
        </div>
        <div className="chart-controls">
          <EntityFilter
            items={manufacturerOptions}
            selection={manufacturerSelection}
            onChange={setManufacturerSelection}
            addLabel="Add manufacturer"
            resetLabel="Show all manufacturers"
          />
        </div>
      </CollapsibleFilters>
      {series.length === 0 ? (
        <p className="hint">No stint data ({MIN_STINT_LENGTH}+ laps) for this selection.</p>
      ) : (
        <p className="hint">Lap time by stint position, colored by manufacturer, with a smoothed trend per manufacturer.</p>
      )}
      <svg ref={svgRef} />
    </div>
  )
}
