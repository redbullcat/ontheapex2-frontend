import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { CollapsibleFilters } from './CollapsibleFilters'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 160 }
const MARGIN_LEFT_MIN = 80
const ROW_HEIGHT = 22
const ROW_GAP = 6

interface CarVftUsage {
  car: string
  team: string | null
  avgUsage: number
  laps: number
}

// Per-lap VFT consumption: how much of the % reading dropped from one lap
// to the next within the same stint. A pit stop recharges the tank, so the
// out-lap's reading is *higher* than the in-lap's — that's not usage, so
// only strictly-decreasing consecutive-lap deltas count.
function computeVftUsage(laps: LapRead[], activeClasses: Set<string>): CarVftUsage[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (!activeClasses.has(lap.class ?? 'Unknown')) continue
    if (lap.vft_percent == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const result: CarVftUsage[] = []
  for (const [car, rows] of byCar) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    const deltas: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (curr.session_id !== prev.session_id) continue
      if (curr.lap_number !== prev.lap_number + 1) continue
      const delta = (prev.vft_percent ?? 0) - (curr.vft_percent ?? 0)
      if (delta > 0) deltas.push(delta)
    }
    if (deltas.length === 0) continue
    result.push({ car, team: sorted[0].team, avgUsage: d3.mean(deltas) ?? 0, laps: deltas.length })
  }
  return result.sort((a, b) => b.avgUsage - a.avgUsage)
}

export function PitVftUsageChart({
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
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const allUsage = useMemo(() => computeVftUsage(laps, activeClasses), [laps, activeClasses])

  const carOptions: EntityOption[] = useMemo(
    () =>
      [...allUsage]
        .sort((a, b) => a.car.localeCompare(b.car, undefined, { numeric: true }))
        .map((d) => ({ id: d.car, label: `#${d.car} — ${getTeamDisplayName(d.team)}` })),
    [allUsage],
  )

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const usage = useMemo(() => allUsage.filter((d) => activeCars.has(d.car)), [allUsage, activeCars])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (usage.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.42))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = usage.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([0, (d3.max(usage, (d) => d.avgUsage) ?? 1) * 1.1]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(usage.map((d) => d.car))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(usage)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => {
        const label = `#${d.car} — ${getTeamDisplayName(d.team)}`
        return truncateLabel(label, marginLeft - 14)
      })

    g.append('g')
      .selectAll('rect')
      .data(usage)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.car) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.avgUsage)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => getTeamColor(d.team))

    g.append('g')
      .selectAll('text.value')
      .data(usage)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.avgUsage) + 6)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${d.avgUsage.toFixed(3)}%/lap (${d.laps} laps)`)

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}%`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [usage, width, onRendered])

  return (
    <div className="viz-root pit-time-chart" ref={containerRef}>
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
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="vft_usage_avg"
            renderChart={(w, onReady) => <PitVftUsageChart laps={laps} forcedWidth={w} onRendered={onReady} />}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
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
      {usage.length === 0 ? <p className="hint">No VFT data for this selection.</p> : <svg ref={svgRef} />}
    </div>
  )
}
