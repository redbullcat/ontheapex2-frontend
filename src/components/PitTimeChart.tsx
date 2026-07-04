import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'

const BAR_MARGIN = { top: 8, right: 56, bottom: 32, left: 160 }
const BAR_MARGIN_LEFT_MIN = 80
const ROW_HEIGHT = 22
const ROW_GAP = 6

const SCATTER_MARGIN = { top: 16, right: 24, bottom: 40, left: 56 }
const SCATTER_HEIGHT = 320
const R = 5

interface PitStop {
  car: string
  team: string | null
  lap: number
  lossSeconds: number
}

interface CarPitStats {
  car: string
  team: string | null
  color: string
  stops: number
  avgLoss: number
  minLoss: number
  maxLoss: number
}

function computePitStops(laps: LapRead[], activeClasses: Set<string>): PitStop[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (!activeClasses.has(lap.class ?? 'Unknown')) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const stops: PitStop[] = []
  for (const [car, rows] of byCar) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    const times = sorted.map((r) => r.lap_time_seconds).filter((t): t is number => t != null)
    const median = d3.median(times) ?? 0
    const greenLaps = times.filter((t) => t <= median * 1.1)
    const greenMedian = d3.median(greenLaps) ?? median
    if (greenMedian === 0) continue

    // Keyed by session too — lap_number resets to 1 each session, so a
    // combined multi-session view must never pair an in-lap from one
    // session with a same-numbered lap from another.
    const byLapNumber = new Map(sorted.map((r) => [`${r.session_id}:${r.lap_number}`, r]))
    for (const row of sorted) {
      if (row.crossing_finish_line_in_pit !== 'B') continue
      if (row.lap_time_seconds == null) continue
      const outLap = byLapNumber.get(`${row.session_id}:${row.lap_number + 1}`)
      if (!outLap || outLap.lap_time_seconds == null) continue
      // A caution/safety-car period can make the in- or out-lap itself
      // genuinely very slow (bunched-up traffic), which the raw formula
      // below can't distinguish from real pit time lost — an hours-long
      // "pit loss" is that, not a stop. Exclude stops where either lap
      // wasn't run under green, and as a backstop skip anything still far
      // outside normal green-flag pace.
      const isGreen = (flag: string | null) => !flag || flag.toUpperCase() === 'GF'
      if (!isGreen(row.flag_at_fl) || !isGreen(outLap.flag_at_fl)) continue
      if (row.lap_time_seconds > greenMedian * 3 || outLap.lap_time_seconds > greenMedian * 3) continue
      const lossSeconds = row.lap_time_seconds + outLap.lap_time_seconds - 2 * greenMedian
      stops.push({ car, team: row.team, lap: row.lap_number, lossSeconds })
    }
  }
  return stops
}

function formatSeconds(s: number): string {
  const sign = s < 0 ? '-' : ''
  const abs = Math.abs(s)
  return `${sign}${abs.toFixed(1)}s`
}

export function PitTimeChart({ laps, compactFilters }: { laps: LapRead[]; compactFilters?: boolean }) {
  const barContainerRef = useRef<HTMLDivElement>(null)
  const barSvgRef = useRef<SVGSVGElement>(null)
  const scatterContainerRef = useRef<HTMLDivElement>(null)
  const scatterSvgRef = useRef<SVGSVGElement>(null)
  const [barWidth, setBarWidth] = useState(800)
  const [scatterWidth, setScatterWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)

  useEffect(() => {
    const el = barContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setBarWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = scatterContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setScatterWidth(w)
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

  const stops = useMemo(() => computePitStops(laps, activeClasses), [laps, activeClasses])

  const carStats = useMemo(() => {
    const byCar = new Map<string, PitStop[]>()
    for (const s of stops) {
      const arr = byCar.get(s.car)
      if (arr) arr.push(s)
      else byCar.set(s.car, [s])
    }
    const result: CarPitStats[] = []
    for (const [car, carStops] of byCar) {
      const losses = carStops.map((s) => s.lossSeconds)
      result.push({
        car,
        team: carStops[0].team,
        color: getTeamColor(carStops[0].team),
        stops: carStops.length,
        avgLoss: d3.mean(losses) ?? 0,
        minLoss: d3.min(losses) ?? 0,
        maxLoss: d3.max(losses) ?? 0,
      })
    }
    return result.sort((a, b) => a.avgLoss - b.avgLoss)
  }, [stops])

  useEffect(() => {
    const svg = d3.select(barSvgRef.current)
    svg.selectAll('*').remove()
    if (carStats.length === 0 || barWidth === 0) return

    const marginLeft = Math.max(BAR_MARGIN_LEFT_MIN, Math.min(BAR_MARGIN.left, barWidth * 0.42))
    const innerWidth = barWidth - marginLeft - BAR_MARGIN.right
    const plotHeight = carStats.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + BAR_MARGIN.top + BAR_MARGIN.bottom
    svg.attr('width', barWidth).attr('height', height)

    const x = d3.scaleLinear().domain([0, (d3.max(carStats, (d) => d.avgLoss) ?? 1) * 1.1]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(carStats.map((d) => d.car))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${BAR_MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(carStats)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => {
        const label = `#${d.car} — ${getTeamDisplayName(d.team)}`
        return marginLeft < BAR_MARGIN.left ? truncateLabel(label, marginLeft - 14) : label
      })

    g.append('g')
      .selectAll('rect')
      .data(carStats)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.car) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.avgLoss)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(carStats)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.avgLoss) + 6)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${formatSeconds(d.avgLoss)} (${d.stops} stops)`)

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [carStats, barWidth])

  useEffect(() => {
    const svg = d3.select(scatterSvgRef.current)
    svg.selectAll('*').remove()
    if (stops.length === 0 || scatterWidth === 0) return

    const innerWidth = scatterWidth - SCATTER_MARGIN.left - SCATTER_MARGIN.right
    const innerHeight = SCATTER_HEIGHT - SCATTER_MARGIN.top - SCATTER_MARGIN.bottom
    svg.attr('width', scatterWidth).attr('height', SCATTER_HEIGHT)

    const x = d3.scaleLinear().domain(d3.extent(stops, (s) => s.lap) as [number, number]).nice().range([0, innerWidth])
    const y = d3.scaleLinear().domain(d3.extent(stops, (s) => s.lossSeconds) as [number, number]).nice().range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${SCATTER_MARGIN.left},${SCATTER_MARGIN.top})`)

    g.append('g')
      .selectAll('circle')
      .data(stops)
      .join('circle')
      .attr('cx', (d) => x(d.lap))
      .attr('cy', (d) => y(d.lossSeconds))
      .attr('r', R)
      .attr('fill', (d) => getTeamColor(d.team))
      .attr('fill-opacity', 0.8)
      .attr('stroke', 'var(--surface-1)')
      .attr('stroke-width', 1.5)
      .append('title')
      .text((d) => `#${d.car} — lap ${d.lap} — ${formatSeconds(d.lossSeconds)}`)

    const xAxis = d3.axisBottom(x).ticks(8).tickFormat((d) => `L${d}`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const yAxis = d3.axisLeft(y).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [stops, scatterWidth])

  return (
    <div className="viz-root pit-time-chart">
      <style>{`
        .pit-time-chart {
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
          .pit-time-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .pit-time-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .pit-time-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
      `}</style>
      {compactFilters ? (
        <PanelSettingsPopover>
          <div className="chart-controls">
            <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          </div>
        </PanelSettingsPopover>
      ) : (
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        </div>
      )}
      {carStats.length === 0 ? (
        <p className="hint">No pit stop data for this selection.</p>
      ) : (
        <>
          <div className="chart-controls">
            <h3 className="pit-time-subheading">Average pit loss per car</h3>
            <ChartExportButtons svgRef={barSvgRef} filename="pit_loss_avg" />
          </div>
          <div ref={barContainerRef}>
            <svg ref={barSvgRef} />
          </div>
          <div className="chart-controls">
            <h3 className="pit-time-subheading">Individual pit stops</h3>
            <ChartExportButtons svgRef={scatterSvgRef} filename="pit_stops" />
          </div>
          <div ref={scatterContainerRef}>
            <svg ref={scatterSvgRef} />
          </div>
        </>
      )}
    </div>
  )
}
