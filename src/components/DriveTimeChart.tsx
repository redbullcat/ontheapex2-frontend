import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getEntityColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import type { EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { CollapsibleFilters } from './CollapsibleFilters'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 200 }
const MARGIN_LEFT_MIN = 90
const ROW_HEIGHT = 22
const ROW_GAP = 6

interface DriverTime {
  driver: string
  color: string
  seconds: number
  stints: number
  laps: number
}

function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Sums, per driver, the lap times of every stint they drove (consecutive
// laps by the same driver within the same car) — "all their stints added
// together", per the request, rather than just one car's worth.
function buildDriveTime(scopedLaps: LapRead[], driverSelection: EntitySelection): DriverTime[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of scopedLaps) {
    if (!lap.driver_name) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const totals = new Map<string, { seconds: number; stints: number; laps: number }>()

  for (const rows of byCar.values()) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    let currentDriver: string | null = null
    for (const lap of sorted) {
      const driver = lap.driver_name as string
      if (driver !== currentDriver) {
        currentDriver = driver
        const t = totals.get(driver)
        if (t) t.stints += 1
        else totals.set(driver, { seconds: 0, stints: 1, laps: 0 })
      }
      const t = totals.get(driver)!
      t.seconds += lap.lap_time_seconds ?? 0
      t.laps += 1
    }
  }

  const result: DriverTime[] = []
  for (const [driver, t] of totals) {
    if (driverSelection && !driverSelection.has(driver)) continue
    result.push({ driver, color: getEntityColor(driver), seconds: t.seconds, stints: t.stints, laps: t.laps })
  }
  result.sort((a, b) => b.seconds - a.seconds)
  return result
}

export function DriveTimeChart({
  laps,
  forcedWidth,
  onRendered,
  initialClassSelection,
  initialTeamSelection,
  initialManufacturerSelection,
  initialDriverSelection,
}: {
  laps: LapRead[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
  initialClassSelection?: ClassSelection
  initialTeamSelection?: EntitySelection
  initialManufacturerSelection?: EntitySelection
  initialDriverSelection?: EntitySelection
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [classSelection, setClassSelection] = useState<ClassSelection>(initialClassSelection ?? null)
  const [teamSelection, setTeamSelection] = useState<EntitySelection>(initialTeamSelection ?? null)
  const [manufacturerSelection, setManufacturerSelection] = useState<EntitySelection>(initialManufacturerSelection ?? null)
  const [driverSelection, setDriverSelection] = useState<EntitySelection>(initialDriverSelection ?? null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const classLaps = useMemo(
    () => laps.filter((l) => activeClasses.has(l.class ?? 'Unknown')),
    [laps, activeClasses],
  )

  const teamOptions: EntityOption[] = useMemo(() => {
    const names = new Set<string>()
    for (const lap of classLaps) if (lap.team) names.add(lap.team)
    return [...names].sort().map((name) => ({ id: name, label: getTeamDisplayName(name) }))
  }, [classLaps])

  const manufacturerOptions: EntityOption[] = useMemo(() => {
    const names = new Set<string>()
    for (const lap of classLaps) if (lap.manufacturer) names.add(lap.manufacturer)
    return [...names].sort().map((name) => ({ id: name, label: name }))
  }, [classLaps])

  const scopedLaps = useMemo(() => {
    return classLaps.filter(
      (l) => (!teamSelection || (l.team && teamSelection.has(l.team))) &&
        (!manufacturerSelection || (l.manufacturer && manufacturerSelection.has(l.manufacturer))),
    )
  }, [classLaps, teamSelection, manufacturerSelection])

  const driverOptions: EntityOption[] = useMemo(() => {
    const names = new Set<string>()
    for (const lap of scopedLaps) if (lap.driver_name) names.add(lap.driver_name)
    return [...names].sort().map((name) => ({ id: name, label: name }))
  }, [scopedLaps])

  const driverTimes = useMemo(() => buildDriveTime(scopedLaps, driverSelection), [scopedLaps, driverSelection])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (driverTimes.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.42))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = driverTimes.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([0, (d3.max(driverTimes, (d) => d.seconds) ?? 1) * 1.1]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(driverTimes.map((d) => d.driver))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(driverTimes)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.driver) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => (truncateLabel(d.driver, marginLeft - 14)))

    g.append('g')
      .selectAll('rect')
      .data(driverTimes)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.driver) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.seconds)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(driverTimes)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.seconds) + 6)
      .attr('y', (d) => (y(d.driver) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${formatDuration(d.seconds)} — ${d.stints} stint${d.stints === 1 ? '' : 's'} (${d.laps} laps)`)

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => formatDuration(d as number)).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [driverTimes, width, onRendered])

  return (
    <div className="viz-root pace-consistency-chart" ref={containerRef}>
      <style>{`
        .pace-consistency-chart {
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
          .pace-consistency-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .pace-consistency-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .pace-consistency-chart {
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
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="drive_time"
            renderChart={(w, onReady) => (
              <DriveTimeChart
                laps={laps}
                forcedWidth={w}
                onRendered={onReady}
                initialClassSelection={classSelection}
                initialTeamSelection={teamSelection}
                initialManufacturerSelection={manufacturerSelection}
                initialDriverSelection={driverSelection}
              />
            )}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        </div>
        <div className="chart-controls">
          <EntityFilter items={teamOptions} selection={teamSelection} onChange={setTeamSelection} addLabel="Add team" resetLabel="Show all teams" />
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
        <div className="chart-controls">
          <EntityFilter items={driverOptions} selection={driverSelection} onChange={setDriverSelection} addLabel="Add driver" resetLabel="Show all drivers" />
        </div>
      </CollapsibleFilters>
      {driverTimes.length === 0 ? (
        <p className="hint">No driver lap data for this selection.</p>
      ) : (
        <>
          <p className="hint">Total time each driver spent in the car — every stint they drove, added together.</p>
          <svg ref={svgRef} />
        </>
      )}
    </div>
  )
}
