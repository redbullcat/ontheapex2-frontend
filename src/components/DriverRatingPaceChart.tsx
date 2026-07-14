import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead, Stint } from '../api/types'
import { isLapValid } from '../lib/lapValidity'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { CollapsibleFilters } from './CollapsibleFilters'
import { formatLapTime } from '../replay/format'
import { DRIVER_CATEGORY_ORDER, driverCategoryColor, driverCategoryLabel } from '../lib/driverCategoryColors'

const MARGIN = { top: 4, right: 60, bottom: 28, left: 190 }
const MARGIN_LEFT_MIN = 90
const ROW_HEIGHT = 22
const ROW_GAP = 6
const DEFAULT_PERCENT = '20'

type MetricTab = 'drivetime' | 'fastestlap' | 'avgpace'

interface DriverRow {
  driver: string
  rating: string
  carNumber: string
  team: string | null
  totalTimeSeconds: number
  fastestSeconds: number | null
  lapTimes: number[]
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// One row per driver, session-wide (not per car — a driver who swapped
// cars, rare but possible, would otherwise be double-counted separately
// per car instead of as one person). Stints (already computed session-
// wide by the backend, same data DriverHistoryChart/Stints tab use) give
// each driver's own lap ranges within their car; lap_time_seconds summed
// across those laps is "drive time", the fastest *valid* one is "fastest
// lap", and every valid one feeds "average pace"'s box plot.
function computeDriverRows(laps: LapRead[], stints: Stint[], activeClasses: Set<string>): DriverRow[] {
  const lapsByCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (!activeClasses.has(lap.class ?? 'Unknown')) continue
    const arr = lapsByCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else lapsByCar.set(lap.car_number, [lap])
  }

  const rows = new Map<string, DriverRow>()
  for (const stint of stints) {
    if (!activeClasses.has(stint.class ?? 'Unknown')) continue
    let row = rows.get(stint.drivers)
    if (!row) {
      row = { driver: stint.drivers, rating: 'unknown', carNumber: stint.car_number, team: stint.team, totalTimeSeconds: 0, fastestSeconds: null, lapTimes: [] }
      rows.set(stint.drivers, row)
    }
    for (const lap of lapsByCar.get(stint.car_number) ?? []) {
      if (lap.lap_number < stint.start_lap || lap.lap_number > stint.end_lap) continue
      if (lap.lap_time_seconds == null) continue
      row.totalTimeSeconds += lap.lap_time_seconds
      if (row.rating === 'unknown' && lap.driver_category) row.rating = lap.driver_category.toLowerCase()
      if (!isLapValid(lap)) continue
      row.lapTimes.push(lap.lap_time_seconds)
      if (row.fastestSeconds == null || lap.lap_time_seconds < row.fastestSeconds) row.fastestSeconds = lap.lap_time_seconds
    }
  }
  return [...rows.values()]
}

interface BarDatum {
  key: string
  label: string
  value: number
  color: string
}

function BarChart({
  data,
  width,
  formatValue,
  zoomDomain,
}: {
  data: BarDatum[]
  width: number
  formatValue: (v: number) => string
  // Bar/pace charts elsewhere in the app (TopSpeedChart, PaceChart) zoom
  // the x-domain to the data's own range rather than starting at 0 — a
  // shared 0-based domain would squash the actually-meaningful spread
  // between drivers who are all within a few seconds/percent of each
  // other into a sliver at one end.
  zoomDomain?: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (data.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.36))
    const innerWidth = Math.max(0, width - marginLeft - MARGIN.right)
    const plotHeight = data.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const values = data.map((d) => d.value)
    const dataMin = d3.min(values) ?? 0
    const dataMax = d3.max(values) ?? 1
    const xMin = zoomDomain ? dataMin - (dataMax - dataMin) * 0.08 : 0
    const xMax = dataMax * 1.08 || 1
    const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.key))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    const xTicks = x.ticks(5)
    g.append('g')
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
      .data(data)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => d.label)

    g.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', x(xMin))
      .attr('y', (d) => y(d.key) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.value) - x(xMin)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.value) + 6)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => formatValue(d.value))

    const xAxis = d3.axisBottom(x).tickValues(xTicks).tickFormat((d) => formatValue(d as number)).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10))
  }, [data, width, formatValue, zoomDomain])

  return <svg ref={svgRef} />
}

interface BoxDatum extends BarDatum {
  q1: number
  median: number
  q3: number
  min: number
  max: number
}

function BoxPlotChart({ data, width }: { data: BoxDatum[]; width: number }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (data.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.36))
    const innerWidth = Math.max(0, width - marginLeft - MARGIN.right)
    const plotHeight = data.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const xMin = d3.min(data, (d) => d.min) ?? 0
    const xMax = d3.max(data, (d) => d.max) ?? 1
    const pad = (xMax - xMin) * 0.08 || 1
    const x = d3.scaleLinear().domain([xMin - pad, xMax + pad]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(data.map((d) => d.key))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    const xTicks = x.ticks(5)
    g.append('g')
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
      .data(data)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => d.label)

    const rows = g.append('g')
    for (const d of data) {
      const cy = (y(d.key) ?? 0) + ROW_HEIGHT / 2
      rows
        .append('line')
        .attr('x1', x(d.min))
        .attr('x2', x(d.max))
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('stroke', d.color)
        .attr('stroke-width', 1.5)
      rows
        .append('rect')
        .attr('x', x(d.q1))
        .attr('y', cy - ROW_HEIGHT / 2)
        .attr('width', Math.max(1, x(d.q3) - x(d.q1)))
        .attr('height', ROW_HEIGHT)
        .attr('rx', 3)
        .attr('fill', d.color)
        .attr('fill-opacity', 0.35)
        .attr('stroke', d.color)
        .attr('stroke-width', 1.5)
      rows
        .append('line')
        .attr('x1', x(d.median))
        .attr('x2', x(d.median))
        .attr('y1', cy - ROW_HEIGHT / 2)
        .attr('y2', cy + ROW_HEIGHT / 2)
        .attr('stroke', d.color)
        .attr('stroke-width', 2.5)
    }

    g.append('g')
      .selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.max) + 6)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => formatLapTime(d.median))

    const xAxis = d3.axisBottom(x).tickValues(xTicks).tickFormat((d) => formatLapTime(d as number)).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10))
  }, [data, width])

  return <svg ref={svgRef} />
}

function RatingSection({
  category,
  rows,
  metric,
  topPercent,
  containerWidth,
}: {
  category: string
  rows: DriverRow[]
  metric: MetricTab
  topPercent: number
  containerWidth: number
}) {
  const color = driverCategoryColor(category)

  if (metric === 'avgpace') {
    const boxData: BoxDatum[] = rows
      .map((row) => {
        const sorted = [...row.lapTimes].sort((a, b) => a - b)
        const keepCount = topPercent <= 0 ? 0 : Math.max(1, Math.ceil((sorted.length * topPercent) / 100))
        const kept = sorted.slice(0, keepCount)
        if (kept.length === 0) return null
        return {
          key: row.driver,
          label: `${row.driver} · #${row.carNumber}`,
          value: d3.mean(kept) ?? 0,
          color,
          min: kept[0],
          q1: d3.quantile(kept, 0.25) ?? kept[0],
          median: d3.quantile(kept, 0.5) ?? kept[0],
          q3: d3.quantile(kept, 0.75) ?? kept[0],
          max: kept[kept.length - 1],
        }
      })
      .filter((d): d is BoxDatum => d !== null)
      .sort((a, b) => a.median - b.median)
    if (boxData.length === 0) return null
    return (
      <div className="rating-section">
        <h4 style={{ color }}>{driverCategoryLabel(category)}</h4>
        <BoxPlotChart data={boxData} width={containerWidth} />
      </div>
    )
  }

  const barData: BarDatum[] = rows
    .map((row) => {
      const value = metric === 'drivetime' ? row.totalTimeSeconds : row.fastestSeconds
      if (value == null || value === 0) return null
      return { key: row.driver, label: `${row.driver} · #${row.carNumber}`, value, color }
    })
    .filter((d): d is BarDatum => d !== null)
    .sort((a, b) => (metric === 'drivetime' ? b.value - a.value : a.value - b.value))
  if (barData.length === 0) return null

  return (
    <div className="rating-section">
      <h4 style={{ color }}>{driverCategoryLabel(category)}</h4>
      <BarChart
        data={barData}
        width={containerWidth}
        formatValue={metric === 'drivetime' ? formatDuration : formatLapTime}
        zoomDomain={metric === 'fastestlap'}
      />
    </div>
  )
}

// Per-driver pace broken out by FIA driver category (Platinum/Gold/Silver/
// Bronze) — one small horizontal-bar/box-plot section per category, sorted
// best-first within each, so "who are the best Bronze drivers in this
// race" is a direct read rather than something buried in an all-drivers
// list sorted by outright pace (which a Bronze driver would rarely top).
export function DriverRatingPaceChart({ laps, stints, compactFilters }: { laps: LapRead[]; stints: Stint[]; compactFilters?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [metric, setMetric] = useState<MetricTab>('drivetime')
  const [topPercentInput, setTopPercentInput] = useState(DEFAULT_PERCENT)

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

  const activeClasses = useMemo(() => resolveClassSelection(classSelection, allClasses), [classSelection, allClasses])

  const rows = useMemo(() => computeDriverRows(laps, stints, activeClasses), [laps, stints, activeClasses])

  const byRating = useMemo(() => {
    const map = new Map<string, DriverRow[]>()
    for (const row of rows) {
      const arr = map.get(row.rating)
      if (arr) arr.push(row)
      else map.set(row.rating, [row])
    }
    return map
  }, [rows])

  const topPercent = Math.max(0, Math.min(100, Number(topPercentInput) || 0))
  const hasAnyRating = rows.some((r) => r.rating !== 'unknown')

  const filterControls = (
    <div className="chart-controls">
      <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      <div className="color-mode-toggle" role="radiogroup" aria-label="Metric">
        <button type="button" className={metric === 'drivetime' ? 'active' : ''} onClick={() => setMetric('drivetime')}>
          Drive time
        </button>
        <button type="button" className={metric === 'fastestlap' ? 'active' : ''} onClick={() => setMetric('fastestlap')}>
          Fastest lap
        </button>
        <button type="button" className={metric === 'avgpace' ? 'active' : ''} onClick={() => setMetric('avgpace')}>
          Average pace
        </button>
      </div>
      {metric === 'avgpace' && (
        <label className="lap-range-input">
          Top
          <input
            type="number"
            min={0}
            max={100}
            value={topPercentInput}
            onChange={(e) => setTopPercentInput(e.target.value)}
            style={{ width: 52 }}
          />
          % of laps
        </label>
      )}
    </div>
  )

  return (
    <div className="viz-root driver-rating-pace-chart" ref={containerRef}>
      <style>{`
        .driver-rating-pace-chart {
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
          .driver-rating-pace-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #383835; }
        }
        :root[data-theme='dark'] .driver-rating-pace-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #383835; }
        :root[data-theme='light'] .driver-rating-pace-chart { --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; }
        .driver-rating-pace-chart .rating-section { margin-bottom: 20px; }
        .driver-rating-pace-chart .rating-section h4 { margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
      `}</style>
      {compactFilters ? <>{filterControls}</> : <CollapsibleFilters>{filterControls}</CollapsibleFilters>}
      {!hasAnyRating ? (
        <p className="hint">No FIA driver category data for this session — only available for sessions captured via the live timing feed.</p>
      ) : (
        DRIVER_CATEGORY_ORDER.map((category) => (
          <RatingSection
            key={category}
            category={category}
            rows={byRating.get(category) ?? []}
            metric={metric}
            topPercent={topPercent}
            containerWidth={width}
          />
        ))
      )}
    </div>
  )
}
