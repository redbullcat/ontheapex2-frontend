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
import { useSvgRecorder } from '../hooks/useSvgRecorder'
import { RecordControls } from './RecordControls'
import { CollapsibleFilters } from './CollapsibleFilters'

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

// Linear interpolation of a car's gap at a fractional lap, for smooth
// scrubbing between the integer lap samples the data is recorded at.
function gapAtLap(points: Point[], lap: number): number | null {
  if (points.length === 0) return null
  if (lap <= points[0].lap_number) return points[0].gap
  const last = points[points.length - 1]
  if (lap >= last.lap_number) return last.gap
  for (let i = 1; i < points.length; i++) {
    if (points[i].lap_number >= lap) {
      const a = points[i - 1]
      const b = points[i]
      const t = (lap - a.lap_number) / (b.lap_number - a.lap_number || 1)
      return a.gap + t * (b.gap - a.gap)
    }
  }
  return last.gap
}

export function GapEvolutionChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const recorder = useSvgRecorder(svgRef, 'gap_evolution')
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('team')
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)
  const [lapRange, setLapRange] = useState<[number, number] | null>(null)
  const [showFlags, setShowFlags] = useState(false)
  const [referenceCarOverride, setReferenceCarOverride] = useState<string | null>(null)

  const flagPeriods = useMemo(() => computeFlagPeriods(laps), [laps])

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

  const filtered = useMemo(
    () =>
      laps.filter(
        (l) =>
          l.elapsed_seconds != null &&
          l.lap_number != null &&
          activeClasses.has(l.class ?? 'Unknown') &&
          activeCars.has(l.car_number) &&
          l.lap_number >= effectiveLapRange[0] &&
          l.lap_number <= effectiveLapRange[1],
      ),
    [laps, activeClasses, activeCars, effectiveLapRange],
  )

  // Reference car: defaults to the classification leader of the selection
  // (most laps completed, ties broken by lowest elapsed time at that lap),
  // but the user can pin it to any car via referenceCarOverride. The
  // original Streamlit chart picked whichever car had the lowest max
  // cumulative time, which relied on every car sharing the same lap-range
  // window (a slider clamped them all to one span); here cars can have
  // different final laps, so that rule would just pick whoever raced (and
  // thus accumulated less time) the least — e.g. a car that retired early.
  // Using the same classification rule as the results table avoids that trap.
  const { referenceCar, isAutoReference, gapByLapAndCar, minLap, maxLap, minGap, maxGap } = useMemo(() => {
    const lastLapByCar = new Map<string, LapRead>()
    for (const lap of filtered) {
      const prev = lastLapByCar.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
    }
    let autoReferenceCar: string | null = null
    let bestLap = -1
    let bestElapsed = Infinity
    for (const [car, lastLap] of lastLapByCar) {
      if (lastLap.lap_number > bestLap || (lastLap.lap_number === bestLap && lastLap.elapsed_seconds! < bestElapsed)) {
        bestLap = lastLap.lap_number
        bestElapsed = lastLap.elapsed_seconds!
        autoReferenceCar = car
      }
    }

    const isAutoReference = !referenceCarOverride || !lastLapByCar.has(referenceCarOverride)
    const referenceCar = isAutoReference ? autoReferenceCar : referenceCarOverride

    const refByLap = new Map<number, number>()
    if (referenceCar) {
      for (const lap of filtered) {
        if (lap.car_number === referenceCar) refByLap.set(lap.lap_number, lap.elapsed_seconds!)
      }
    }

    const gapByLapAndCar = new Map<number, Map<string, { gap: number; team: string | null; class: string }>>()
    let minLap = Infinity
    let maxLap = 0
    let minGap = Infinity
    let maxGap = -Infinity
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
      minLap = Math.min(minLap, lap.lap_number)
      maxLap = Math.max(maxLap, lap.lap_number)
      minGap = Math.min(minGap, gap)
      maxGap = Math.max(maxGap, gap)
    }

    return {
      referenceCar,
      isAutoReference,
      gapByLapAndCar,
      minLap: minLap === Infinity ? 1 : minLap,
      maxLap,
      minGap: minGap === Infinity ? 0 : minGap,
      maxGap: maxGap === -Infinity ? 0 : maxGap,
    }
  }, [filtered, referenceCarOverride])

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
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const clipRectRef = useRef<d3.Selection<SVGRectElement, unknown, null, undefined> | null>(null)
  const markersSelRef = useRef<d3.Selection<SVGCircleElement, CarSeries, SVGGElement, unknown> | null>(null)
  const gridlinesGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const yAxisGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const endLabelsGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const lineGenRef = useRef<d3.Line<Point> | null>(null)
  const overallMaxAbsRef = useRef(1)

  const playback = usePlayback(minLap, maxLap, 3)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (cars.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = PLOT_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', PLOT_HEIGHT)

    const x = d3.scaleLinear().domain([minLap, maxLap]).range([0, innerWidth])
    // Symmetric around zero (0 sits at vertical center) rather than pinned
    // to the top — matches the usual gap-to-reference chart convention,
    // and lets a manually chosen reference car show both ahead (-) and
    // behind (+) gaps.
    const overallMaxAbs = Math.max(Math.abs(minGap), Math.abs(maxGap), 1)
    overallMaxAbsRef.current = overallMaxAbs
    const y = d3.scaleLinear().domain([overallMaxAbs, -overallMaxAbs]).range([0, innerHeight])
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

    const yTicks = y.ticks(6)
    const gridlinesG = g.append('g').attr('class', 'gridlines')
    gridlinesG
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', (d) => (d === 0 ? 'var(--axis)' : 'var(--grid)'))
      .attr('stroke-width', (d) => (d === 0 ? 1.5 : 1))
    gridlinesGRef.current = gridlinesG

    const line = d3
      .line<Point>()
      .x((d) => x(d.lap_number))
      .y((d) => y(d.gap))
      .curve(d3.curveLinear)
    lineGenRef.current = line

    // Playback reveal clip: the car-lines group is clipped to a rect whose
    // width tracks the replay position, so scrubbing/playing only has to
    // update the clip rect + marker dots (see the lightweight effect below)
    // instead of rebuilding the whole chart every animation frame.
    const clipId = `gap-evo-clip-${Math.random().toString(36).slice(2)}`
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
      .attr('stroke-width', (d) => (d.isReference ? 2.5 : 2))
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.7)
      .attr('d', (d) => line(d.points))
    pathsSelRef.current = paths

    const markers = g
      .append('g')
      .attr('class', 'playback-markers')
      .selectAll<SVGCircleElement, CarSeries>('circle')
      .data(cars)
      .join('circle')
      .attr('r', 4)
      .attr('fill', (d) => strokeColor(d))
      .attr('stroke', 'var(--surface-1)')
      .attr('stroke-width', 1.5)
      .style('display', playback.current < maxLap ? 'inline' : 'none')
      .attr('cx', x(playback.current))
      .attr('cy', (d) => {
        const v = gapAtLap(d.points, playback.current)
        return v == null ? -9999 : y(v)
      })
    markersSelRef.current = markers

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
      endLabelsGRef.current = endLabels
      // Final-classification labels only make sense once the replay has
      // reached the end (they're computed from the last lap in range) —
      // hidden mid-playback, shown at the static default/fully-revealed view.
      endLabels.style('display', playback.current < maxLap ? 'none' : 'inline')

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
      .ticks(Math.max(2, Math.min(maxLap - minLap + 1, Math.floor(innerWidth / 60))))
      .tickFormat((d) => `L${d}`)
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
    const yAxisG = g
      .append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
    yAxisGRef.current = yAxisG

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
        const clampedLap = Math.max(minLap, Math.min(maxLap, lapAtX))
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
  }, [cars, width, activeClasses, strokeColor, minLap, maxLap, minGap, maxGap, gapByLapAndCar, referenceCar, showFlags, flagPeriods])

  // Cheap per-frame update: the clip-rect width, marker positions, and a
  // "progressive zoom" y-domain rescaled to whatever's been revealed so far
  // — small early-race gaps aren't squashed by a scale sized for a later
  // pit-stop spike. Deliberately not touching the dependency list on the
  // effect above so playback never triggers the expensive full chart rebuild;
  // this only updates existing attributes (no elements added/removed).
  useEffect(() => {
    const x = xScaleRef.current
    const y = yScaleRef.current
    const line = lineGenRef.current
    if (!x || !y || !line) return
    const current = playback.current

    let revealedMin = Infinity
    let revealedMax = -Infinity
    for (const car of cars) {
      for (const p of car.points) {
        if (p.lap_number <= current) {
          revealedMin = Math.min(revealedMin, p.gap)
          revealedMax = Math.max(revealedMax, p.gap)
        }
      }
    }
    const floor = overallMaxAbsRef.current * 0.08
    const revealedMaxAbs =
      revealedMin === Infinity ? floor : Math.max(Math.abs(revealedMin), Math.abs(revealedMax), floor)
    y.domain([revealedMaxAbs, -revealedMaxAbs])

    const yTicks = y.ticks(6)
    gridlinesGRef.current
      ?.selectAll<SVGLineElement, number>('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', x.range()[1])
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', (d) => (d === 0 ? 'var(--axis)' : 'var(--grid)'))
      .attr('stroke-width', (d) => (d === 0 ? 1.5 : 1))

    yAxisGRef.current
      ?.call(
        d3
          .axisLeft(y)
          .tickValues(yTicks)
          .tickFormat((d) => `${Number(d) > 0 ? '+' : ''}${d}s`)
          .tickSizeOuter(0),
      )
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    pathsSelRef.current?.attr('d', (d) => line(d.points))

    clipRectRef.current?.attr('width', Math.max(0, x(current) + 8))
    // Recording (useSvgRecorder's portrait/square crop-and-track mode)
    // needs this in a plain, queryable form — getBoundingClientRect() on
    // the clip rect itself always reads as all-zero, since clipPath
    // contents are never laid out/painted the way normal elements are.
    svgRef.current?.setAttribute('data-reveal-x', String(x(current)))
    const showMarkers = current < maxLap
    markersSelRef.current
      ?.style('display', showMarkers ? 'inline' : 'none')
      .attr('cx', x(current))
      .attr('cy', (d) => {
        const v = gapAtLap(d.points, current)
        return v == null ? -9999 : y(v)
      })
    endLabelsGRef.current?.style('display', showMarkers ? 'none' : 'inline')
  }, [playback.current, maxLap, cars])

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
        :root[data-theme='dark'] .gap-evolution-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
            ${CLASS_COLOR_CSS_VARS_DARK}
        }
        :root[data-theme='light'] .gap-evolution-chart {
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
        .gap-evolution-chart .ref-car-picker select {
          font-size: 13px;
          padding: 3px 4px;
          border-radius: 4px;
          border: 1px solid var(--grid);
          background: transparent;
          color: var(--text-primary);
        }
      `}</style>
      <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename="gap_evolution" />}>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          {activeClasses.size > 1 && <ColorModeToggle mode={colorMode} onChange={setColorMode} />}
          <LapRangeInputs min={lapBounds[0]} max={lapBounds[1]} value={effectiveLapRange} onChange={setLapRange} />
          <label className="class-filter-item">
            <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
            Show flag periods
          </label>
          <label className="class-filter-item ref-car-picker">
            Reference
            <select
              value={referenceCarOverride ?? ''}
              onChange={(e) => setReferenceCarOverride(e.target.value || null)}
            >
              <option value="">Auto (race leader)</option>
              {carOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <RecordControls recorder={recorder} />
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
      <div className="chart-controls">
        <PlaybackControls
          playback={playback}
          min={minLap}
          max={maxLap}
          formatValue={(v) => `Lap ${Math.round(v)}`}
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
      {cars.length === 0 ? (
        <p className="hint">No lap data for this selection.</p>
      ) : (
        <p className="hint">
          Gap to #{referenceCar}
          {isAutoReference ? ' — the race leader across this selection.' : ' (manually selected reference car).'}
        </p>
      )}
      <svg ref={svgRef} />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.car}</strong> {hover.team ? `— ${getTeamDisplayName(hover.team)}` : ''}
          </div>
          <div>
            {hover.gap > 0 ? '+' : ''}
            {hover.gap.toFixed(3)}s · {hover.cls} · Lap {hover.lap}
          </div>
        </div>
      )}
    </div>
  )
}
