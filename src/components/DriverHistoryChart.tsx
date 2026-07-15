import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead, Stint } from '../api/types'
import { getEntityColor, getTeamDisplayName } from '../lib/identityColors'
import { computeFieldStateAtMoment } from '../lib/fieldStateAtMoment'
import { CarPicker, type CarOption } from './CarPicker'
import { CarDetailModal } from './CarDetailModal'
import { ChartExportButtons } from './ChartExportButtons'
import { CollapsibleFilters } from './CollapsibleFilters'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 16, bottom: 32, left: 140 }
const MARGIN_LEFT_MIN = 44
const ROW_HEIGHT = 40
const ROW_GAP = 12
const SEGMENT_GAP = 2

interface StintSegment extends Stint {
  fastestLapNumber: number | null
  avg20Seconds: number | null
  startPosition: number | null
  endPosition: number | null
  placesGainedLost: number | null
}

interface DriverSummaryRow {
  driver: string
  color: string
  totalTimeSeconds: number
  avgSeconds: number | null
  avg20Seconds: number | null
  fastestSeconds: number | null
  fastestLapNumber: number | null
  stints: number
  totalLaps: number
  firstStintLap: number
  totalPlacesGainedLost: number | null
}

interface TooltipState {
  x: number
  y: number
  segment: StintSegment
}

function formatLapTime(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatPlacesGainedLost(delta: number | null, startPosition: number | null, endPosition: number | null): string {
  if (delta == null || startPosition == null || endPosition == null) return 'Places gained/lost —'
  if (delta === 0) return `Places gained/lost: none (P${startPosition} → P${endPosition})`
  const verb = delta > 0 ? 'gained' : 'lost'
  return `Places ${verb}: ${Math.abs(delta)} (P${startPosition} → P${endPosition})`
}

// Top-20% fastest laps, same convention as the pace chart's top-N% filter.
function fastestPercentMean(sortedSeconds: number[], percent: number): number | null {
  if (sortedSeconds.length === 0) return null
  const keep = Math.max(1, Math.ceil((sortedSeconds.length * percent) / 100))
  return d3.mean(sortedSeconds.slice(0, keep)) ?? null
}

// Car's overall running-order position at the moment a given lap's driver
// crossed the line, derived from the full field (all cars), not just this
// car's own laps — position is meaningless without the rest of the field.
function positionAtLap(lap: LapRead | null, allLaps: LapRead[], carNumber: string): number | null {
  if (lap?.elapsed_seconds == null) return null
  const state = computeFieldStateAtMoment(allLaps, lap.elapsed_seconds)
  return state.find((r) => r.car_number === carNumber)?.position ?? null
}

// Places gained/lost across a stint: car's field position on the driver's
// first lap of the stint vs. their last lap of it. Positive = gained places
// (moved to a lower/better position number), negative = lost places.
function stintPositions(stint: Stint, carLaps: LapRead[], allLaps: LapRead[]) {
  let firstLap: LapRead | null = null
  let lastLap: LapRead | null = null
  for (const lap of carLaps) {
    if (lap.lap_number < stint.start_lap || lap.lap_number > stint.end_lap) continue
    if (firstLap === null || lap.lap_number < firstLap.lap_number) firstLap = lap
    if (lastLap === null || lap.lap_number > lastLap.lap_number) lastLap = lap
  }
  const startPosition = positionAtLap(firstLap, allLaps, stint.car_number)
  const endPosition = positionAtLap(lastLap, allLaps, stint.car_number)
  const placesGainedLost = startPosition != null && endPosition != null ? startPosition - endPosition : null
  return { startPosition, endPosition, placesGainedLost }
}

function computeDriverSummary(carStints: Stint[], carLaps: LapRead[], allLaps: LapRead[]): DriverSummaryRow[] {
  const lapsByDriver = new Map<string, LapRead[]>()
  const stintCountByDriver = new Map<string, number>()
  const firstStintLapByDriver = new Map<string, number>()
  const firstStintByDriver = new Map<string, Stint>()
  const lastStintByDriver = new Map<string, Stint>()
  for (const stint of carStints) {
    stintCountByDriver.set(stint.drivers, (stintCountByDriver.get(stint.drivers) ?? 0) + 1)
    const prevFirst = firstStintLapByDriver.get(stint.drivers)
    if (prevFirst === undefined || stint.start_lap < prevFirst) firstStintLapByDriver.set(stint.drivers, stint.start_lap)
    const prevFirstStint = firstStintByDriver.get(stint.drivers)
    if (!prevFirstStint || stint.start_lap < prevFirstStint.start_lap) firstStintByDriver.set(stint.drivers, stint)
    const prevLastStint = lastStintByDriver.get(stint.drivers)
    if (!prevLastStint || stint.end_lap > prevLastStint.end_lap) lastStintByDriver.set(stint.drivers, stint)
    for (const lap of carLaps) {
      if (lap.lap_number < stint.start_lap || lap.lap_number > stint.end_lap) continue
      const arr = lapsByDriver.get(stint.drivers)
      if (arr) arr.push(lap)
      else lapsByDriver.set(stint.drivers, [lap])
    }
  }

  const rows: DriverSummaryRow[] = []
  for (const [driver, driverLaps] of lapsByDriver) {
    const times = driverLaps.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
    const sorted = [...times].sort((a, b) => a - b)
    let fastestLapNumber: number | null = null
    let fastestSeconds: number | null = null
    for (const lap of driverLaps) {
      if (lap.lap_time_seconds == null) continue
      if (fastestSeconds === null || lap.lap_time_seconds < fastestSeconds) {
        fastestSeconds = lap.lap_time_seconds
        fastestLapNumber = lap.lap_number
      }
    }
    const firstStint = firstStintByDriver.get(driver)
    const lastStint = lastStintByDriver.get(driver)
    const startPosition = firstStint ? stintPositions(firstStint, carLaps, allLaps).startPosition : null
    const endPosition = lastStint ? stintPositions(lastStint, carLaps, allLaps).endPosition : null
    const totalPlacesGainedLost = startPosition != null && endPosition != null ? startPosition - endPosition : null

    rows.push({
      driver,
      color: getEntityColor(driver),
      totalTimeSeconds: times.reduce((sum, t) => sum + t, 0),
      avgSeconds: d3.mean(sorted) ?? null,
      avg20Seconds: fastestPercentMean(sorted, 20),
      fastestSeconds,
      fastestLapNumber,
      stints: stintCountByDriver.get(driver) ?? 0,
      totalLaps: driverLaps.length,
      firstStintLap: firstStintLapByDriver.get(driver) ?? 0,
      totalPlacesGainedLost,
    })
  }
  rows.sort((a, b) => a.firstStintLap - b.firstStintLap)
  return rows
}

const PIE_RADIUS = 70

function driverPieArcs(rows: DriverSummaryRow[]) {
  const pie = d3.pie<DriverSummaryRow>().value((d) => d.totalTimeSeconds).sort(null)
  const arc = d3.arc<d3.PieArcDatum<DriverSummaryRow>>().innerRadius(0).outerRadius(PIE_RADIUS)
  return pie(rows).map((slice) => ({ ...slice, path: arc(slice) ?? '' }))
}

export function DriverHistoryChart({
  stints,
  laps,
  isRaceSession = false,
  forcedWidth,
  onRendered,
  initialSelectedCars,
}: {
  stints: Stint[]
  laps: LapRead[]
  isRaceSession?: boolean
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
  initialSelectedCars?: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [selectedCars, setSelectedCars] = useState<string[]>(initialSelectedCars ?? [])
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedStint, setSelectedStint] = useState<{ carNumber: string; segment: StintSegment } | null>(null)

  const carOptions: CarOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const s of stints) {
      if (!byCar.has(s.car_number)) byCar.set(s.car_number, getTeamDisplayName(s.team))
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))
  }, [stints])

  const lapsByCar = useMemo(() => {
    const m = new Map<string, LapRead[]>()
    for (const lap of laps) {
      const arr = m.get(lap.car_number)
      if (arr) arr.push(lap)
      else m.set(lap.car_number, [lap])
    }
    return m
  }, [laps])

  const maxLap = useMemo(() => d3.max(stints, (s) => s.end_lap) ?? 1, [stints])

  const rows = useMemo(() => {
    return selectedCars.map((carNumber) => {
      const carStints = stints
        .filter((s) => s.car_number === carNumber)
        .sort((a, b) => a.start_lap - b.start_lap)
      const carLaps = lapsByCar.get(carNumber) ?? []
      const segments: StintSegment[] = carStints.map((stint) => {
        let fastestLapNumber: number | null = null
        let best = Infinity
        const stintTimes: number[] = []
        for (const lap of carLaps) {
          if (lap.lap_number < stint.start_lap || lap.lap_number > stint.end_lap) continue
          if (lap.lap_time_seconds == null) continue
          stintTimes.push(lap.lap_time_seconds)
          if (lap.lap_time_seconds < best) {
            best = lap.lap_time_seconds
            fastestLapNumber = lap.lap_number
          }
        }
        const avg20Seconds = fastestPercentMean([...stintTimes].sort((a, b) => a - b), 20)
        const { startPosition, endPosition, placesGainedLost } = stintPositions(stint, carLaps, laps)
        return { ...stint, fastestLapNumber, avg20Seconds, startPosition, endPosition, placesGainedLost }
      })
      const driverSummary = computeDriverSummary(carStints, carLaps, laps)
      return { carNumber, team: carStints[0]?.team ?? null, segments, driverSummary }
    })
  }, [selectedCars, stints, lapsByCar])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (rows.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.3))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([1, maxLap]).range([0, innerWidth])

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    rows.forEach((row, i) => {
      const rowY = i * (ROW_HEIGHT + ROW_GAP)
      const rowG = g.append('g').attr('transform', `translate(0,${rowY})`)

      rowG
        .append('text')
        .attr('x', -10)
        .attr('y', ROW_HEIGHT / 2)
        .attr('dominant-baseline', 'central')
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(`#${row.carNumber}`)

      const clipId = `driver-history-clip-${i}`
      rowG
        .append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('width', innerWidth)
        .attr('height', ROW_HEIGHT)
        .attr('rx', 4)
        .attr('ry', 4)

      const segGroup = rowG.append('g').attr('clip-path', `url(#${clipId})`)

      segGroup
        .selectAll('rect')
        .data(row.segments)
        .join('rect')
        .attr('x', (d) => x(d.start_lap))
        .attr('y', 0)
        .attr('width', (d) => Math.max(0, x(d.end_lap) - x(d.start_lap) - SEGMENT_GAP))
        .attr('height', ROW_HEIGHT)
        .attr('fill', (d) => getEntityColor(d.drivers))
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, d) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, segment: d })
        })
        .on('mouseleave', () => setTooltip(null))
        .on('click', (_event, d) => setSelectedStint({ carNumber: row.carNumber, segment: d }))

      segGroup
        .selectAll('text')
        .data(row.segments)
        .join('text')
        .attr('x', (d) => (x(d.start_lap) + x(d.end_lap) - SEGMENT_GAP) / 2)
        .attr('y', ROW_HEIGHT / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#ffffff')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
        .text((d) => d.drivers)
        .each(function (d) {
          const segWidth = x(d.end_lap) - x(d.start_lap) - SEGMENT_GAP
          const textWidth = (this as SVGTextElement).getBBox().width
          if (textWidth + 12 > segWidth) d3.select(this).remove()
        })
    })

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.floor(innerWidth / 80)))
      .tickFormat((d) => `Lap ${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${plotHeight + 8})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [rows, width, maxLap, onRendered])

  return (
    <div className="viz-root driver-history-chart" ref={containerRef}>
      <style>{`
        .driver-history-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .driver-history-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .driver-history-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --axis: #383835;
        }
        :root[data-theme='light'] .driver-history-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        .driver-history-chart .tooltip {
          position: absolute;
          pointer-events: none;
          background: var(--text-primary);
          color: var(--surface-1);
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          transform: translate(-50%, -120%);
          white-space: nowrap;
          z-index: 10;
        }
        .driver-history-chart .tooltip strong {
          font-size: 13px;
        }
        .driver-history-chart .driver-summary {
          margin-top: 20px;
        }
        .driver-history-chart .driver-summary h3 {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .driver-history-chart .table-scroll {
          overflow-x: auto;
        }
        .driver-history-chart table {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
          white-space: nowrap;
        }
        .driver-history-chart th {
          text-align: left;
          font-weight: 600;
          color: var(--text-muted);
          padding: 6px 12px 6px 0;
          border-bottom: 1px solid var(--axis);
        }
        .driver-history-chart td {
          padding: 6px 12px 6px 0;
          border-bottom: 1px solid var(--axis);
          font-variant-numeric: tabular-nums;
          color: var(--text-primary);
        }
        .driver-history-chart td.places-gained {
          color: #2e7d32;
          font-weight: 600;
        }
        .driver-history-chart td.places-lost {
          color: #c62828;
          font-weight: 600;
        }
        .driver-history-chart .team-key {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
          vertical-align: middle;
        }
        .driver-history-chart .driver-pie-row {
          display: flex;
          align-items: center;
          gap: 24px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .driver-history-chart .driver-pie {
          flex: none;
        }
        .driver-history-chart .driver-pie-legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .driver-history-chart .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .driver-history-chart .legend-key {
          width: 10px;
          height: 10px;
          flex: none;
        }
      `}</style>
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="driver_stint_history"
            renderChart={(w, onReady) => (
              <DriverHistoryChart
                stints={stints}
                laps={laps}
                isRaceSession={isRaceSession}
                forcedWidth={w}
                onRendered={onReady}
                initialSelectedCars={selectedCars}
              />
            )}
          />
        }
      >
        <div className="chart-controls">
          <CarPicker cars={carOptions} selected={selectedCars} onChange={setSelectedCars} />
        </div>
      </CollapsibleFilters>
      {rows.length === 0 ? (
        <p className="hint">Pick one or more cars above to see their driver stint history.</p>
      ) : (
        <svg ref={svgRef} />
      )}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>{tooltip.segment.drivers}</strong>
          </div>
          <div>
            Laps {tooltip.segment.start_lap}–{tooltip.segment.end_lap} ({tooltip.segment.lap_count} laps)
          </div>
          <div>
            Fastest {formatLapTime(tooltip.segment.best_lap_seconds)}
            {tooltip.segment.fastestLapNumber != null ? ` (lap ${tooltip.segment.fastestLapNumber})` : ''}
          </div>
          <div>Average (100%) {formatLapTime(tooltip.segment.avg_lap_seconds)}</div>
          <div>Average (top 20%) {formatLapTime(tooltip.segment.avg20Seconds)}</div>
          <div>{formatPlacesGainedLost(tooltip.segment.placesGainedLost, tooltip.segment.startPosition, tooltip.segment.endPosition)}</div>
        </div>
      )}
      {rows.map((row) => (
        <div className="driver-summary" key={row.carNumber}>
          <h3>
            #{row.carNumber} {row.team ? `— ${getTeamDisplayName(row.team)}` : ''}
          </h3>
          <div className="driver-pie-row">
            <svg width={PIE_RADIUS * 2} height={PIE_RADIUS * 2} className="driver-pie">
              <g transform={`translate(${PIE_RADIUS},${PIE_RADIUS})`}>
                {driverPieArcs(row.driverSummary).map((slice) => (
                  <path key={slice.data.driver} d={slice.path} fill={slice.data.color} stroke="var(--surface-1)" strokeWidth={2} />
                ))}
              </g>
            </svg>
            <div className="driver-pie-legend">
              {row.driverSummary.map((d) => {
                const total = row.driverSummary.reduce((sum, r) => sum + r.totalTimeSeconds, 0)
                const pct = total > 0 ? (d.totalTimeSeconds / total) * 100 : 0
                return (
                  <div className="legend-item" key={d.driver}>
                    <span className="legend-key" style={{ background: d.color, borderRadius: '50%', height: 10 }} />
                    <span>
                      {d.driver} — {formatDuration(d.totalTimeSeconds)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Time in car</th>
                  <th>Avg (100%)</th>
                  <th>Avg (top 20%)</th>
                  <th>Fastest lap</th>
                  <th>Stints</th>
                  <th>Laps</th>
                  <th>Places +/-</th>
                </tr>
              </thead>
              <tbody>
                {row.driverSummary.map((d) => (
                  <tr key={d.driver}>
                    <td>
                      <span className="team-key" style={{ background: d.color }} />
                      {d.driver}
                    </td>
                    <td>{formatDuration(d.totalTimeSeconds)}</td>
                    <td>{formatLapTime(d.avgSeconds)}</td>
                    <td>{formatLapTime(d.avg20Seconds)}</td>
                    <td>
                      {formatLapTime(d.fastestSeconds)}
                      {d.fastestLapNumber != null ? ` (lap ${d.fastestLapNumber})` : ''}
                    </td>
                    <td>{d.stints}</td>
                    <td>{d.totalLaps}</td>
                    <td className={d.totalPlacesGainedLost != null ? (d.totalPlacesGainedLost > 0 ? 'places-gained' : d.totalPlacesGainedLost < 0 ? 'places-lost' : '') : ''}>
                      {d.totalPlacesGainedLost == null
                        ? '—'
                        : d.totalPlacesGainedLost === 0
                          ? '±0'
                          : d.totalPlacesGainedLost > 0
                            ? `+${d.totalPlacesGainedLost}`
                            : `${d.totalPlacesGainedLost}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {selectedStint && (
        <div className="replay-root car-detail-modal-scope">
          <CarDetailModal
            carNumber={selectedStint.carNumber}
            allLaps={laps}
            isRaceSession={isRaceSession}
            onClose={() => setSelectedStint(null)}
            stintContext={{
              drivers: selectedStint.segment.drivers,
              startLap: selectedStint.segment.start_lap,
              endLap: selectedStint.segment.end_lap,
              fastestSeconds: selectedStint.segment.best_lap_seconds,
              avgSeconds: selectedStint.segment.avg_lap_seconds,
              placesGainedLost: selectedStint.segment.placesGainedLost,
            }}
          />
        </div>
      )}
    </div>
  )
}
