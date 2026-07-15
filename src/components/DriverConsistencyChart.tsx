import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getEntityColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import type { EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { CollapsibleFilters } from './CollapsibleFilters'
import { GapModeToggle } from './GapModeToggle'
import { computeGaps, formatGap, type GapMode } from '../lib/gapToLeader'
import { isLapValid } from '../lib/lapValidity'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 200 }
const MARGIN_LEFT_MIN = 90
const ROW_HEIGHT = 22
const ROW_GAP = 6

interface DriverStats {
  driver: string
  color: string
  laps: number
  avg: number
  std: number
}

// Sample standard deviation (ddof=1), matching pandas' default .std().
function sampleStd(values: number[]): number {
  if (values.length < 2) return 0
  const mean = d3.mean(values) ?? 0
  const variance = d3.sum(values, (v) => (v - mean) ** 2) / (values.length - 1)
  return Math.sqrt(variance)
}

function buildDriverStats(
  laps: LapRead[],
  activeClasses: Set<string>,
  driverSelection: EntitySelection,
  topPercent: number,
): DriverStats[] {
  const byDriver = new Map<string, number[]>()
  for (const lap of laps) {
    if (lap.lap_time_seconds == null) continue
    if (!isLapValid(lap)) continue
    if (!lap.driver_name) continue
    if (!activeClasses.has(lap.class ?? 'Unknown')) continue
    if (driverSelection && !driverSelection.has(lap.driver_name)) continue
    const arr = byDriver.get(lap.driver_name)
    if (arr) arr.push(lap.lap_time_seconds)
    else byDriver.set(lap.driver_name, [lap.lap_time_seconds])
  }

  const result: DriverStats[] = []
  for (const [driver, times] of byDriver) {
    // Top-N% fastest laps kept per driver, same convention as PaceChart's
    // "Top % of laps" filter.
    const sortedAll = [...times].sort((a, b) => a - b)
    const keepCount = topPercent <= 0 ? 0 : Math.max(1, Math.ceil((sortedAll.length * topPercent) / 100))
    if (keepCount === 0) continue
    const kept = sortedAll.slice(0, keepCount)
    if (kept.length < 2) continue
    result.push({
      driver,
      color: getEntityColor(driver),
      laps: kept.length,
      avg: d3.mean(kept) ?? 0,
      std: sampleStd(kept),
    })
  }
  result.sort((a, b) => a.std - b.std)
  return result
}

export function DriverConsistencyChart({
  laps,
  forcedWidth,
  onRendered,
}: {
  laps: LapRead[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [driverSelection, setDriverSelection] = useState<EntitySelection>(null)
  const [topPercentInput, setTopPercentInput] = useState('100')
  const [gapMode, setGapMode] = useState<GapMode>('ahead')

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const driverOptions: EntityOption[] = useMemo(() => {
    const names = new Set<string>()
    for (const lap of laps) {
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      if (lap.driver_name) names.add(lap.driver_name)
    }
    return [...names].sort().map((name) => ({ id: name, label: name }))
  }, [laps, activeClasses])

  const topPercent = Math.max(0, Math.min(100, Number(topPercentInput) || 0))

  const stats = useMemo(
    () => buildDriverStats(laps, activeClasses, driverSelection, topPercent),
    [laps, activeClasses, driverSelection, topPercent],
  )

  // stats is already sorted ascending by std (most consistent first).
  const gaps = useMemo(() => computeGaps(stats.map((d) => d.std), gapMode), [stats, gapMode])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (stats.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.42))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = stats.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([0, (d3.max(stats, (d) => d.std) ?? 1) * 1.1]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(stats.map((d) => d.driver))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(stats)
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
      .data(stats)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.driver) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.std)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(stats)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.std) + 6)
      .attr('y', (d) => (y(d.driver) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d, i) => {
        const gapText = formatGap(gaps[i])
        return `±${d.std.toFixed(3)}s${gapText ? `, ${gapText}` : ''} (${d.laps} laps)`
      })

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [stats, width, gaps, onRendered])

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
            filename="driver_consistency"
            renderChart={(w, onReady) => <DriverConsistencyChart laps={laps} forcedWidth={w} onRendered={onReady} />}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          <label className="top-percent">
            <span className="field-label">Top % of laps</span>
            <input type="number" min={0} max={100} value={topPercentInput} onChange={(e) => setTopPercentInput(e.target.value)} />
          </label>
          <GapModeToggle value={gapMode} onChange={setGapMode} />
        </div>
        <div className="chart-controls">
          <EntityFilter
            items={driverOptions}
            selection={driverSelection}
            onChange={setDriverSelection}
            addLabel="Add driver"
            resetLabel="Show all drivers"
          />
        </div>
      </CollapsibleFilters>
      {stats.length === 0 ? (
        <p className="hint">No lap data for this selection.</p>
      ) : (
        <>
          <p className="hint">Std deviation of each driver's lap times — lower means more consistent. Compares every driver in the selected class(es) against each other.</p>
          <svg ref={svgRef} />
        </>
      )}
    </div>
  )
}
