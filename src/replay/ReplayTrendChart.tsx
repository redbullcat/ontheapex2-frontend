import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { CarMeta } from './replayData'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from '../components/EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'
import { useSvgRecorder } from './useSvgRecorder'

const MARGIN = { top: 16, right: 16, bottom: 28, left: 44 }
const HEIGHT = 220
const EXPANDED_HEIGHT = 560

interface Point {
  lap: number
  value: number
}
interface Series {
  car: string
  team: string | null
  class: string
  color: string
  points: Point[]
}

// Only the fields this chart actually reads — deliberately narrower than
// ReplayData so Live can feed it data built fresh from the polling feed
// (see live/liveTrendData.ts) without needing a full ReplayData object.
export interface TrendChartData {
  cars: CarMeta[]
  classes: string[]
  gapByLapAndCar: Map<number, Map<string, number>>
  positionByLapAndCar: Map<number, Map<string, number>>
}

// Shared by the gap-evolution and position trend charts under the
// leaderboard — same shape (per-car line over laps, class/car filters, a
// clip-path reveal synced to the replay clock), just a different data
// source and y-axis convention between the two modes.
export function ReplayTrendChart({
  data,
  mode,
  currentLap,
  title,
  onVisibleCarsChange,
  expanded,
  onToggleExpand,
  compactFilters,
  onRequestNoteLink,
  initialClasses,
}: {
  data: TrendChartData
  mode: 'gap' | 'position'
  currentLap: number
  title: string
  onVisibleCarsChange?: (cars: Set<string>) => void
  expanded?: boolean
  onToggleExpand?: () => void
  // Moves the class/car filter row behind the panel's gear-icon popup
  // (see PanelSettingsPopover) — opt in for dashboard panels, which have
  // much less width to spare than this chart's other home in the
  // full-width sidebar/main app, where the filters stay inline as always.
  compactFilters?: boolean
  // Clicking the hovered point links a race note to that exact car/lap —
  // the caller resolves elapsed_seconds for the click since this chart's
  // own data (gap/position by lap) has no elapsed-time field on it.
  onRequestNoteLink?: (carNumber: string, lapNumber: number) => void
  // Preselects the class filter on first render instead of "all classes"
  // — only read once (see useState initializer below), same as any other
  // uncontrolled-after-mount filter in this app.
  initialClasses?: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const recorder = useSvgRecorder(svgRef, title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'chart')
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(() =>
    initialClasses && initialClasses.length > 0 ? new Set(initialClasses) : null,
  )
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)
  const [hover, setHover] = useState<{ x: number; y: number; car: string; team: string | null; value: number; lap: number } | null>(
    null,
  )
  // Synchronous mirror of `hover` for the overlay's click handler below —
  // that handler is registered once per chart rebuild, so it can't close
  // over each mousemove's fresh state.
  const hoverRef = useRef<typeof hover>(null)

  const height = expanded ? EXPANDED_HEIGHT : HEIGHT

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

  const carOptions: EntityOption[] = useMemo(
    () =>
      data.cars
        .map((c) => ({ id: c.car_number, label: `#${c.car_number} — ${getTeamDisplayName(c.team)}` }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [data],
  )

  const activeClasses = useMemo(() => resolveClassSelection(classSelection, data.classes), [classSelection, data.classes])
  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const allSeries = useMemo((): Series[] => {
    const byCarMap = mode === 'gap' ? data.gapByLapAndCar : data.positionByLapAndCar
    const seriesByCar = new Map<string, Point[]>()
    for (const [lap, inner] of byCarMap) {
      for (const [car, value] of inner) {
        const arr = seriesByCar.get(car)
        if (arr) arr.push({ lap, value })
        else seriesByCar.set(car, [{ lap, value }])
      }
    }
    return data.cars
      .map((c) => ({
        car: c.car_number,
        team: c.team,
        class: c.class,
        color: getTeamColor(c.team),
        points: (seriesByCar.get(c.car_number) ?? []).sort((a, b) => a.lap - b.lap),
      }))
      .filter((s) => s.points.length > 0)
  }, [data, mode])

  const visibleSeries = useMemo(
    () => allSeries.filter((s) => activeClasses.has(s.class) && activeCars.has(s.car)),
    [allSeries, activeClasses, activeCars],
  )

  useEffect(() => {
    onVisibleCarsChange?.(new Set(visibleSeries.map((s) => s.car)))
  }, [visibleSeries, onVisibleCarsChange])

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, Series, SVGGElement, unknown> | null>(null)
  const clipRectRef = useRef<d3.Selection<SVGRectElement, unknown, null, undefined> | null>(null)
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (visibleSeries.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = height - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const maxLap = d3.max(visibleSeries, (s) => d3.max(s.points, (p) => p.lap) ?? 0) ?? 1
    const minLap = d3.min(visibleSeries, (s) => d3.min(s.points, (p) => p.lap) ?? 1) ?? 1
    const x = d3.scaleLinear().domain([minLap, maxLap]).range([0, innerWidth])
    xScaleRef.current = x

    let y: d3.ScaleLinear<number, number>
    if (mode === 'position') {
      const maxPos = d3.max(visibleSeries, (s) => d3.max(s.points, (p) => p.value) ?? 1) ?? 1
      y = d3.scaleLinear().domain([1, maxPos]).range([0, innerHeight])
    } else {
      const maxGap = d3.max(visibleSeries, (s) => d3.max(s.points, (p) => p.value) ?? 1) ?? 1
      const minGap = Math.min(0, d3.min(visibleSeries, (s) => d3.min(s.points, (p) => p.value) ?? 0) ?? 0)
      y = d3.scaleLinear().domain([minGap, maxGap || 1]).range([0, innerHeight])
    }

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const yTicks = mode === 'position' ? y.ticks(Math.min(6, Math.ceil(y.domain()[1]))).filter(Number.isInteger) : y.ticks(5)
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', 'var(--replay-line)')
      .attr('stroke-width', 1)

    // Playback reveal clip — see the lightweight effect below, which is the
    // only thing that runs per tick; this heavy rebuild only runs when the
    // underlying series/size actually change.
    const clipId = `replay-trend-clip-${mode}-${Math.random().toString(36).slice(2)}`
    g.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', -4)
      .attr('y', -8)
      .attr('width', Math.max(0, x(currentLap) + 4))
      .attr('height', innerHeight + 16)
    clipRectRef.current = g.select<SVGRectElement>(`#${clipId} rect`)

    const line = d3
      .line<Point>()
      .x((d) => x(d.lap))
      .y((d) => y(d.value))
      .curve(d3.curveLinear)

    const paths = g
      .append('g')
      .attr('clip-path', `url(#${clipId})`)
      .selectAll<SVGPathElement, Series>('path')
      .data(visibleSeries)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.6)
      .attr('opacity', 0.85)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.min(maxLap - minLap + 1, Math.floor(innerWidth / 50))))
      .tickFormat((d) => `L${d}`)
      .tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--replay-line-strong)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--replay-line-strong)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--replay-muted)').attr('font-size', 10))

    const yAxis = d3
      .axisLeft(y)
      .tickValues(yTicks)
      .tickFormat((d) => (mode === 'position' ? `P${d}` : `+${d}s`))
      .tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--replay-muted)').attr('font-size', 10))

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
        let nearest: { series: Series; point: Point } | null = null
        let nearestDist = Infinity
        for (const s of visibleSeries) {
          for (const p of s.points) {
            if (Math.abs(p.lap - lapAtX) > 1) continue
            const d = Math.abs(y(p.value) - my)
            if (d < nearestDist) {
              nearestDist = d
              nearest = { series: s, point: p }
            }
          }
        }
        if (!nearest) {
          hoverRef.current = null
          setHover(null)
          return
        }
        const rect = containerRef.current?.getBoundingClientRect()
        const next = {
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: nearest.series.car,
          team: nearest.series.team,
          value: nearest.point.value,
          lap: nearest.point.lap,
        }
        hoverRef.current = next
        setHover(next)
        const car = nearest.series.car
        pathsSelRef.current?.attr('opacity', (d) => (d.car === car ? 1 : 0.25)).attr('stroke-width', (d) => (d.car === car ? 2.6 : 1.6))
        pathsSelRef.current?.filter((d) => d.car === car).raise()
      })
      .on('mouseleave', () => {
        hoverRef.current = null
        setHover(null)
        pathsSelRef.current?.attr('opacity', 0.85).attr('stroke-width', 1.6)
      })
      .on('click', () => {
        const h = hoverRef.current
        if (!h || !onRequestNoteLink) return
        onRequestNoteLink(h.car, h.lap)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSeries, width, height, mode, onRequestNoteLink])

  // Cheap per-tick update: just the clip width.
  useEffect(() => {
    const x = xScaleRef.current
    if (!x || !clipRectRef.current) return
    clipRectRef.current.attr('width', Math.max(0, x(currentLap) + 4))
  }, [currentLap])

  return (
    <div className={expanded ? 'replay-trend-panel expanded' : 'replay-trend-panel'}>
      <div className="replay-trend-header">
        <p className="replay-panel-label">{title}</p>
        {recorder.recording && (
          <span className="replay-record-indicator">
            <span className="replay-record-dot" /> {String(Math.floor(recorder.elapsedSeconds / 60)).padStart(2, '0')}:
            {String(recorder.elapsedSeconds % 60).padStart(2, '0')}
          </span>
        )}
        <button
          type="button"
          className="replay-record-btn"
          onClick={recorder.recording ? recorder.stop : recorder.start}
          title={recorder.recording ? 'Stop recording and download the video' : 'Record this chart as a video — play/scrub normally while recording'}
        >
          {recorder.recording ? '⏹ Stop' : '⏺ Record'}
        </button>
        {onToggleExpand && (
          <button type="button" className="replay-expand-btn" onClick={onToggleExpand} title={expanded ? 'Close' : 'Expand'}>
            {expanded ? '✕ Close' : '⛶ Expand'}
          </button>
        )}
      </div>
      {compactFilters ? (
        <PanelSettingsPopover>
          <div className="replay-trend-controls">
            <ClassFilter classes={data.classes} selection={classSelection} onChange={setClassSelection} />
            <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all" />
          </div>
        </PanelSettingsPopover>
      ) : (
        <div className="replay-trend-controls">
          <ClassFilter classes={data.classes} selection={classSelection} onChange={setClassSelection} />
          <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all" />
        </div>
      )}
      <div className="replay-trend-chart" ref={containerRef}>
        <svg ref={svgRef} />
        {hover && (
          <div className="replay-tooltip" style={{ left: hover.x, top: hover.y }}>
            <strong>#{hover.car}</strong> {getTeamDisplayName(hover.team)}
            <div>{mode === 'position' ? `P${hover.value}` : `+${hover.value.toFixed(1)}s`} · Lap {hover.lap}</div>
            {onRequestNoteLink && <span className="tooltip-note-hint">Click to link a race note here</span>}
          </div>
        )}
      </div>
    </div>
  )
}
