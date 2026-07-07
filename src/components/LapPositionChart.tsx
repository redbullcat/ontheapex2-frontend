import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { CLASS_VARS, OTHER_VAR, assignClassVars, CLASS_COLOR_CSS_VARS, CLASS_COLOR_CSS_VARS_DARK } from '../lib/classColors'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ColorModeToggle, type ColorMode } from './ColorModeToggle'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { LapRangeInputs } from './LapRangeInputs'
import { computeFlagPeriods, FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { ChartExportButtons } from './ChartExportButtons'
import { usePlayback } from '../hooks/usePlayback'
import { PlaybackControls } from './PlaybackControls'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'
import { useSvgRecorder } from '../hooks/useSvgRecorder'
import { RecordControls } from './RecordControls'
import { contrastTextColor } from '../lib/contrastColor'
import { isLapDeleted } from '../lib/lapOverrides'
import { useDeletedLapsVersion } from '../hooks/useDeletedLapsVersion'

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

// Linear interpolation of a car's position at a fractional lap, for smooth
// scrubbing between the integer lap samples the data is recorded at.
function positionAtLap(points: Point[], lap: number): number | null {
  if (points.length === 0) return null
  if (lap <= points[0].lap_number) return points[0].position
  const last = points[points.length - 1]
  if (lap >= last.lap_number) return last.position
  for (let i = 1; i < points.length; i++) {
    if (points[i].lap_number >= lap) {
      const a = points[i - 1]
      const b = points[i]
      const t = (lap - a.lap_number) / (b.lap_number - a.lap_number || 1)
      return a.position + t * (b.position - a.position)
    }
  }
  return last.position
}

// `focusCarNumber` is for the car-detail panel (see CarDetailModal): ranking
// still needs the whole field's laps (position is meaningless computed from
// one car alone — every lap would trivially rank "1st"), but the view opens
// scoped to that car's own class and with comparison against other cars
// hidden, since a detail panel isn't the place to build a multi-car
// comparison. Every other caller (the main app's own Position tab) omits
// this and behaves exactly as before.
//
// `rankBy` defaults to 'elapsed' — real running order, which is only
// meaningful for a race (this is exactly why the main app's own Position
// tab is excluded for practice/qualifying, see App.tsx's NON_RACE_TABS).
// 'bestLapSoFar' ranks by each car's best lap time recorded up to that
// point instead — how practice/qualifying sessions are actually classified
// — for the car-detail panel to use on those session types.
export function LapPositionChart({
  laps,
  focusCarNumber,
  rankBy = 'elapsed',
  compactFilters,
  onRequestNoteLink,
  startingGrid,
}: {
  laps: LapRead[]
  focusCarNumber?: string
  rankBy?: 'elapsed' | 'bestLapSoFar'
  // Moves the class/car filter controls behind the panel's gear-icon popup
  // (see PanelSettingsPopover) — opt in for dashboard panels, which have
  // much less width to spare than this chart's other home in the
  // full-width sidebar/main app, where the controls stay inline as always.
  compactFilters?: boolean
  // Clicking the hovered point links a race note to that exact car/lap —
  // only wired up from the dashboard's race-notes panel context, so this
  // chart's other homes (main app, car-detail modal) are unaffected. The
  // caller (not this chart) resolves elapsed_seconds for the click, since
  // ReplayTrendChart — the other chart with this same feature — has no
  // per-lap elapsed data of its own to do that lookup with.
  onRequestNoteLink?: (carNumber: string, lapNumber: number) => void
  // Qualifying classification (car_number -> grid slot), from
  // computeStartingGrid — when given (only meaningful for rankBy
  // 'elapsed', i.e. an actual race), every car's line gets an extra point
  // at lap 0 sitting at its grid slot, so whatever happened between the
  // green flag and each car's own first recorded crossing of the line
  // — which the raw per-lap data alone has already missed by the time lap
  // 1 is recorded — shows up as a visible first move instead of the line
  // just starting wherever lap 1 happened to land it.
  startingGrid?: Map<string, number> | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const recorder = useSvgRecorder(svgRef, focusCarNumber ? `lap_position_${focusCarNumber}` : 'lap_position')
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<HoverState | null>(null)
  // Synchronous mirror of `hover` for the overlay's click handler below —
  // that handler is registered once per chart rebuild (see the effect's
  // dependency list), so it can't close over each mousemove's fresh state.
  const hoverRef = useRef<HoverState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(() => {
    if (!focusCarNumber) return null
    const cls = laps.find((l) => l.car_number === focusCarNumber)?.class
    return cls ? new Set([cls]) : null
  })
  const [colorMode, setColorMode] = useState<ColorMode>('team')
  // Deliberately NOT seeded to just focusCarNumber — ranking needs every
  // car in the class to be in the pool, or every lap trivially ranks 1st
  // again (the exact bug this prop exists to fix). "Add car" is hidden
  // below instead of narrowed, so this stays "the whole class" for good.
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)
  const [lapRange, setLapRange] = useState<[number, number] | null>(null)
  const [showFlags, setShowFlags] = useState(false)

  const flagPeriods = useMemo(() => computeFlagPeriods(laps), [laps])
  const deletedLapsVersion = useDeletedLapsVersion()

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

  // Re-rank within the selected classes: for each lap, sort the selected
  // cars by elapsed time and assign 1..N, same convention as the hourly
  // chart and the original per-lap position matrix it was ported from.
  //
  // 'bestLapSoFar' walks every lap number in order (regardless of the
  // visible lap-range window, so scrubbing that slider doesn't change what
  // "best so far" means at a given lap) maintaining each car's running best
  // lap time, then ranks by that instead of elapsed time.
  const rankedByLap = useMemo(() => {
    const m = new Map<number, RankedLap[]>()
    const allLapNumbers = [...lapsByNumber.keys()].sort((a, b) => a - b)

    if (rankBy === 'bestLapSoFar') {
      const bestSoFar = new Map<string, { time: number; class: string; team: string | null }>()
      for (const lapNumber of allLapNumbers) {
        for (const r of lapsByNumber.get(lapNumber)!) {
          if (r.lap_time_seconds == null) continue
          if (!activeClasses.has(r.class ?? 'Unknown') || !activeCars.has(r.car_number)) continue
          if (isLapDeleted(r.session_id, r.car_number, r.lap_number)) continue
          const prev = bestSoFar.get(r.car_number)
          if (!prev || r.lap_time_seconds < prev.time) {
            bestSoFar.set(r.car_number, { time: r.lap_time_seconds, class: r.class ?? 'Unknown', team: r.team })
          }
        }
        if (lapNumber < effectiveLapRange[0] || lapNumber > effectiveLapRange[1]) continue
        const sorted = [...bestSoFar.entries()].sort((a, b) => a[1].time - b[1].time)
        m.set(
          lapNumber,
          sorted.map(([car_number, v], i) => ({
            car_number,
            class: v.class,
            team: v.team,
            lap_number: lapNumber,
            position: i + 1,
            lap_time_seconds: v.time,
          })),
        )
      }
      return m
    }

    for (const lapNumber of allLapNumbers) {
      if (lapNumber < effectiveLapRange[0] || lapNumber > effectiveLapRange[1]) continue
      const rows = lapsByNumber.get(lapNumber)!
      const filtered = rows.filter(
        (r) =>
          r.elapsed_seconds != null &&
          activeClasses.has(r.class ?? 'Unknown') &&
          activeCars.has(r.car_number),
      )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapsByNumber, activeClasses, activeCars, effectiveLapRange, rankBy, deletedLapsVersion])

  // Grid slot only makes sense as the origin of a real race running order
  // — practice/qualifying's own 'bestLapSoFar' ranking has no green flag to
  // start from.
  const showGridStart = Boolean(startingGrid) && rankBy === 'elapsed'

  const cars = useMemo(() => {
    const byCar = new Map<string, CarSeries>()
    for (const ranked of rankedByLap.values()) {
      for (const p of ranked) {
        // The ranking pool always needs every car in the class (see
        // rankedByLap above — that's the actual fix for the "always P1"
        // bug), but focusCarNumber means only its own line should ever be
        // drawn, not a full-field comparison.
        if (focusCarNumber && p.car_number !== focusCarNumber) continue
        let car = byCar.get(p.car_number)
        if (!car) {
          car = { car_number: p.car_number, class: p.class, team: p.team, points: [] }
          byCar.set(p.car_number, car)
        }
        car.points.push({ lap_number: p.lap_number, position: p.position, lap_time_seconds: p.lap_time_seconds })
      }
    }
    for (const car of byCar.values()) car.points.sort((a, b) => a.lap_number - b.lap_number)
    if (showGridStart) {
      for (const car of byCar.values()) {
        if (car.points.length === 0 || car.points[0].lap_number > 0) {
          // Falls back to the car's own lap-1 position (a flat line, no
          // implied movement) when it has no qualifying time of its own —
          // a late entry or a qualifying DNS — rather than leaving it
          // without a grid point at all, which would make it pop in
          // suddenly at lap 1 while every other car's marker is already
          // sitting in place.
          const gridPos = startingGrid!.get(car.car_number) ?? car.points[0]?.position
          if (gridPos != null) car.points.unshift({ lap_number: 0, position: gridPos, lap_time_seconds: null })
        }
      }
    }
    return [...byCar.values()]
  }, [rankedByLap, focusCarNumber, showGridStart, startingGrid])

  const { minLap, maxLap, maxPosition } = useMemo(() => {
    let minLap = Infinity
    let maxLap = 0
    let maxPosition = 1
    for (const [lapNumber, ranked] of rankedByLap) {
      minLap = Math.min(minLap, lapNumber)
      maxLap = Math.max(maxLap, lapNumber)
      for (const p of ranked) maxPosition = Math.max(maxPosition, p.position)
    }
    // The grid point above can sit at a slot deeper than any position the
    // field's actual race laps ever reach (e.g. a car that qualified last
    // but only ever raced near the front) — widen the axis to still fit it.
    for (const car of cars) {
      for (const p of car.points) maxPosition = Math.max(maxPosition, p.position)
    }
    return { minLap: minLap === Infinity ? 1 : minLap, maxLap, maxPosition }
  }, [rankedByLap, cars])

  const strokeColor = useCallback(
    (car: { class: string; team: string | null }) => {
      // A single focused line has no other car to stay distinguishable
      // from, so skip the hashed team/class color entirely — some team
      // names hash to colors with poor contrast against the chart
      // background (e.g. near-white), which is invisible with one line on
      // screen even though it was never really noticeable buried among
      // twenty overlapping ones.
      // --replay-accent is only guaranteed defined where focusCarNumber is
      // ever actually set (the car-detail panel, which always renders
      // inside replay.css's scope) — the main app's own Position tab never
      // passes this prop, so it never hits this branch.
      if (focusCarNumber) return 'var(--replay-accent)'
      return colorMode === 'team' ? getTeamColor(car.team) : `var(${classVar.get(car.class) ?? OTHER_VAR})`
    },
    [colorMode, classVar, focusCarNumber],
  )

  const pathsSelRef = useRef<d3.Selection<SVGPathElement, CarSeries, SVGGElement, unknown> | null>(null)
  const crosshairRef = useRef<d3.Selection<SVGLineElement, unknown, null, undefined> | null>(null)
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const clipRectRef = useRef<d3.Selection<SVGRectElement, unknown, null, undefined> | null>(null)
  const markersSelRef = useRef<d3.Selection<SVGCircleElement, CarSeries, SVGGElement, unknown> | null>(null)
  const markerLabelsSelRef = useRef<d3.Selection<SVGTextElement, CarSeries, SVGGElement, unknown> | null>(null)

  const playback = usePlayback(showGridStart ? 0 : minLap, maxLap, 3)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const xDomainMin = showGridStart ? 0 : minLap
    const x = d3.scaleLinear().domain([xDomainMin, maxLap]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([1, maxPosition]).range([0, innerHeight])
    xScaleRef.current = x
    yScaleRef.current = y

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    if (showFlags) {
      g.append('g')
        .attr('class', 'flag-bands')
        .selectAll('rect')
        .data(flagPeriods.filter((p) => p.category !== 'green'))
        .join('rect')
        .attr('x', (d) => x(d.startLap))
        .attr('width', (d) => Math.max(1, x(d.endLap + 1) - x(d.startLap)))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', (d) => FLAG_COLORS[d.category])
        .attr('fill-opacity', 0.15)
    }

    // Every position, not d3's default "nice round numbers" tick selection
    // — P1..P35 all listed rather than just every 2nd/5th one.
    const yTicks = d3.range(1, maxPosition + 1)
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

    // Playback reveal clip: the car-lines group is clipped to a rect whose
    // width tracks the replay position, so scrubbing/playing only has to
    // update the clip rect + marker dots (see the lightweight effect below)
    // instead of rebuilding the whole chart every animation frame.
    const clipId = `lap-pos-clip-${Math.random().toString(36).slice(2)}`
    g.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', -8)
      .attr('y', -8)
      .attr('width', Math.max(0, x(playback.current) + 8))
      .attr('height', innerHeight + 16)
    clipRectRef.current = g.select<SVGRectElement>(`#${clipId} rect`)

    const paths = g
      .append('g')
      .attr('class', 'car-lines')
      .attr('clip-path', `url(#${clipId})`)
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

    const markerCx = (d: CarSeries) => {
      // A retired/no-more-laps car's marker freezes at its own last known
      // lap instead of sliding along with everyone else's current
      // position — otherwise (see positionAtLap's forward-fill) it looks
      // like the car is still "racing" with no line trailing behind it.
      // Freezing it in place means the crop-tracking recorder's scrolling
      // window naturally carries it out of frame on its own.
      const lastLap = d.points[d.points.length - 1]?.lap_number ?? playback.current
      return x(Math.min(playback.current, lastLap))
    }
    const markers = g
      .append('g')
      .attr('class', 'playback-markers')
      .selectAll<SVGCircleElement, CarSeries>('circle')
      .data(cars)
      .join('circle')
      .attr('r', 9)
      .attr('fill', strokeColor)
      .attr('stroke', 'var(--surface-1)')
      .attr('stroke-width', 1.5)
      .attr('cx', markerCx)
      .attr('cy', (d) => {
        const v = positionAtLap(d.points, playback.current)
        return v == null ? -9999 : y(v)
      })
    markersSelRef.current = markers

    const markerLabels = g
      .append('g')
      .attr('class', 'playback-marker-labels')
      .selectAll<SVGTextElement, CarSeries>('text')
      .data(cars)
      .join('text')
      .attr('x', markerCx)
      .attr('y', (d) => {
        const v = positionAtLap(d.points, playback.current)
        return v == null ? -9999 : y(v)
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 8)
      .attr('font-weight', 700)
      .attr('pointer-events', 'none')
      .attr('fill', function (_d, i) {
        const circle = markers.nodes()[i]
        return circle ? contrastTextColor(circle) : '#000000'
      })
      .text((d) => d.car_number)
    markerLabelsSelRef.current = markerLabels

    const finalLap = rankedByLap.get(maxLap)
    if (finalLap) {
      // Every car that finished (not just one leader per class) gets its
      // own finishing-position label — with focusCarNumber only its own
      // line is ever drawn, so only its own label makes sense to show.
      // Every position is already a unique integer (no ties), so unlike
      // the old per-class-leader version this never needs a collision
      // nudge — y(position) alone keeps every label evenly spaced.
      const finishers = focusCarNumber
        ? finalLap.filter((e) => e.car_number === focusCarNumber)
        : [...finalLap].sort((a, b) => a.position - b.position)

      // No circle here — the (now-always-visible, see markers above)
      // playback marker itself already sits at this exact spot for any
      // car that actually finished, so a second circle would just be a
      // duplicate sitting on top of it. This is just the "P3" text next
      // to it.
      g.append('g')
        .attr('class', 'end-labels')
        .selectAll('text')
        .data(finishers)
        .join('text')
        .attr('x', innerWidth + 14)
        .attr('y', (d) => y(d.position))
        .attr('dominant-baseline', 'central')
        .attr('fill', 'var(--text-primary)')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text((d) => `P${d.position}`)
    }

    const xAxis = d3.axisBottom(x).tickSizeOuter(0)
    if (showGridStart) {
      // Explicit tickValues rather than .ticks(...) so the "Grid" tick at
      // 0 is always present — d3's automatic "nice round number" tick
      // selection has no reason to always land exactly on 0 otherwise.
      const autoTicks = x.ticks(Math.max(2, Math.min(maxLap - xDomainMin + 1, Math.floor(innerWidth / 60))))
      xAxis.tickValues([0, ...autoTicks.filter((t) => t !== 0)]).tickFormat((d) => (d === 0 ? 'Grid' : `L${d}`))
    } else {
      xAxis.ticks(Math.max(2, Math.min(maxLap - minLap + 1, Math.floor(innerWidth / 60)))).tickFormat((d) => `L${d}`)
    }

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

    // Markers/labels are appended before the axes above, so without this
    // an axis gridline painted later would sit visually on top of (in
    // front of) any dot/number that happens to overlap it. SVG paints in
    // DOM order, so raising these groups to the end of <g> puts them back
    // above the axes regardless of append order.
    g.select('.playback-markers').raise()
    g.select('.playback-marker-labels').raise()
    g.select('.end-labels').raise()

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
        // The "Grid" column at lap 0 isn't in rankedByLap at all — it's a
        // synthetic point unshifted onto each car's own series above, not
        // a real recorded lap — so clamping straight to minLap here would
        // silently show lap-1's *actual* running order while the visually
        // nearest dots are still sitting at their grid slots, mismatching
        // whichever car the cursor lands nearest to.
        const clampedLap = showGridStart
          ? Math.max(0, Math.min(maxLap, lapAtX))
          : Math.max(minLap, Math.min(maxLap, lapAtX))
        const lapData: RankedLap[] | undefined =
          clampedLap === 0 && showGridStart
            ? cars
                .filter((c) => c.points[0]?.lap_number === 0)
                .map((c) => ({
                  car_number: c.car_number,
                  class: c.class,
                  team: c.team,
                  lap_number: 0,
                  position: c.points[0].position,
                  lap_time_seconds: null,
                }))
            : rankedByLap.get(clampedLap)
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
        const next: HoverState = {
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
          car: nearest.car_number,
          cls: nearest.class,
          team: nearest.team,
          position: nearest.position,
          lap: nearest.lap_number,
          lapTime: nearest.lap_time_seconds,
        }
        hoverRef.current = next
        setHover(next)
      })
      .on('mouseleave', () => {
        crosshair.style('display', 'none')
        pathsSelRef.current?.attr('opacity', 0.65).attr('stroke-width', 2)
        hoverRef.current = null
        setHover(null)
      })
      .on('click', () => {
        const h = hoverRef.current
        if (!h || !onRequestNoteLink) return
        onRequestNoteLink(h.car, h.lap)
      })
  }, [cars, width, activeClasses, strokeColor, minLap, maxLap, maxPosition, rankedByLap, showFlags, flagPeriods, focusCarNumber, onRequestNoteLink, showGridStart])

  // Cheap per-frame update: just the clip-rect width and marker positions,
  // driven by playback.current — deliberately not touching the dependency
  // list above so playback never triggers the expensive full chart rebuild.
  useEffect(() => {
    const x = xScaleRef.current
    const y = yScaleRef.current
    if (!x || !y) return
    const current = playback.current
    clipRectRef.current?.attr('width', Math.max(0, x(current) + 8))
    // Recording (useSvgRecorder's portrait/square crop-and-track mode)
    // needs this in a plain, queryable form — getBoundingClientRect() on
    // the clip rect itself always reads as all-zero, since clipPath
    // contents are never laid out/painted the way normal elements are.
    svgRef.current?.setAttribute('data-reveal-x', String(x(current)))
    // A retired/finished car's marker freezes at its own last lap (see the
    // matching comment where markerCx is built above) instead of sliding
    // along with the current playback position — and stays visible
    // throughout, including once the race is fully revealed, rather than
    // vanishing right when there's nothing left to reveal.
    const markerCx = (d: CarSeries) => {
      const lastLap = d.points[d.points.length - 1]?.lap_number ?? current
      return x(Math.min(current, lastLap))
    }
    const markerCy = (d: CarSeries) => {
      const v = positionAtLap(d.points, current)
      return v == null ? -9999 : y(v)
    }
    markersSelRef.current?.attr('cx', markerCx).attr('cy', markerCy)
    markerLabelsSelRef.current?.attr('x', markerCx).attr('y', markerCy)
  }, [playback.current, maxLap])

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
      {(() => {
        const filterControls = (
          <>
            <div className="chart-controls">
              <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
              {activeClasses.size > 1 && <ColorModeToggle mode={colorMode} onChange={setColorMode} />}
              <LapRangeInputs min={lapBounds[0]} max={lapBounds[1]} value={effectiveLapRange} onChange={setLapRange} />
              <label className="class-filter-item">
                <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
                Show flag periods
              </label>
              <ChartExportButtons svgRef={svgRef} filename="lap_position" />
              <RecordControls recorder={recorder} />
            </div>
            {!focusCarNumber && (
              <div className="chart-controls">
                <EntityFilter
                  items={carOptions}
                  selection={carSelection}
                  onChange={setCarSelection}
                  addLabel="Add car"
                  resetLabel="Show all cars"
                />
              </div>
            )}
          </>
        )
        return compactFilters ? <PanelSettingsPopover>{filterControls}</PanelSettingsPopover> : filterControls
      })()}
      <div className="chart-controls">
        <PlaybackControls
          playback={playback}
          min={showGridStart ? 0 : minLap}
          max={maxLap}
          formatValue={(v) => (showGridStart && Math.round(v) <= 0 ? 'Grid' : `Lap ${Math.round(v)}`)}
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
      {showFlags && (
        <div className="legend">
          {[...new Set(flagPeriods.filter((p) => p.category !== 'green').map((p) => p.category))].map((cat) => (
            <div className="legend-item" key={cat}>
              <span className="legend-key" style={{ background: FLAG_COLORS[cat] }} />
              <span>{FLAG_LABELS[cat]}</span>
            </div>
          ))}
        </div>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            P{hover.position} · {hover.cls} · Lap {hover.lap}
            {hover.lapTime != null ? ` · ${hover.lapTime.toFixed(3)}s` : ''}
          </div>
          {onRequestNoteLink && <span className="tooltip-note-hint">Click to link a race note here</span>}
        </div>
      )}
    </div>
  )
}
