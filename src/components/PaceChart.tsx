import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getEntityColor, getTeamColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 200 }
const ROW_HEIGHT = 22
const ROW_GAP = 6

type GroupBy = 'team' | 'driver' | 'manufacturer'
type ChartType = 'bar' | 'box'

interface GroupStats {
  key: string
  color: string
  laps: number[]
  mean: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

function fieldFor(groupBy: GroupBy): (lap: LapRead) => string | null {
  if (groupBy === 'team') return (l) => l.team
  if (groupBy === 'driver') return (l) => l.driver_name
  return (l) => l.manufacturer
}

function colorFor(groupBy: GroupBy, key: string): string {
  return groupBy === 'team' ? getTeamColor(key) : getEntityColor(key)
}

function buildGroups(laps: LapRead[], activeClasses: Set<string>, groupBy: GroupBy): GroupStats[] {
  const field = fieldFor(groupBy)
  const byGroup = new Map<string, number[]>()
  for (const lap of laps) {
    if (lap.lap_time_seconds == null) continue
    if (!activeClasses.has(lap.class ?? 'Unknown')) continue
    const key = field(lap)
    if (!key) continue
    const arr = byGroup.get(key)
    if (arr) arr.push(lap.lap_time_seconds)
    else byGroup.set(key, [lap.lap_time_seconds])
  }

  const groups: GroupStats[] = []
  for (const [key, times] of byGroup) {
    const sorted = [...times].sort((a, b) => a - b)
    groups.push({
      key,
      color: colorFor(groupBy, key),
      laps: sorted,
      mean: d3.mean(sorted) ?? 0,
      min: sorted[0],
      q1: d3.quantile(sorted, 0.25) ?? sorted[0],
      median: d3.quantile(sorted, 0.5) ?? sorted[0],
      q3: d3.quantile(sorted, 0.75) ?? sorted[0],
      max: sorted[sorted.length - 1],
    })
  }
  groups.sort((a, b) => a.mean - b.mean)
  return groups
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

export function PaceChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('team')
  const [chartType, setChartType] = useState<ChartType>('bar')

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

  const groups = useMemo(() => buildGroups(laps, activeClasses, groupBy), [laps, activeClasses, groupBy])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (groups.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const plotHeight = groups.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const xMin = d3.min(groups, (g) => (chartType === 'bar' ? g.mean : g.min)) ?? 0
    const xMax = d3.max(groups, (g) => (chartType === 'bar' ? g.mean : g.max)) ?? 1
    const pad = (xMax - xMin) * 0.05 || 1
    const x = d3.scaleLinear().domain([Math.max(0, xMin - pad), xMax + pad]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(groups.map((g) => g.key))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const xTicks = x.ticks(6)
    g.append('g')
      .attr('class', 'gridlines')
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
      .data(groups)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => d.key)

    if (chartType === 'bar') {
      g.append('g')
        .selectAll('rect')
        .data(groups)
        .join('rect')
        .attr('x', 0)
        .attr('y', (d) => y(d.key) ?? 0)
        .attr('width', (d) => Math.max(0, x(d.mean)))
        .attr('height', ROW_HEIGHT)
        .attr('rx', 4)
        .attr('fill', (d) => d.color)

      g.append('g')
        .selectAll('text.value')
        .data(groups)
        .join('text')
        .attr('class', 'value')
        .attr('x', (d) => x(d.mean) + 6)
        .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
        .attr('dominant-baseline', 'central')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', 11)
        .text((d) => formatSeconds(d.mean))
    } else {
      const row = g
        .append('g')
        .selectAll('g')
        .data(groups)
        .join('g')
        .attr('transform', (d) => `translate(0,${y(d.key) ?? 0})`)

      row
        .append('line')
        .attr('x1', (d) => x(d.min))
        .attr('x2', (d) => x(d.max))
        .attr('y1', ROW_HEIGHT / 2)
        .attr('y2', ROW_HEIGHT / 2)
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 1.5)

      row
        .append('rect')
        .attr('x', (d) => x(d.q1))
        .attr('y', 2)
        .attr('width', (d) => Math.max(1, x(d.q3) - x(d.q1)))
        .attr('height', ROW_HEIGHT - 4)
        .attr('rx', 3)
        .attr('fill', (d) => d.color)
        .attr('fill-opacity', 0.35)
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 1.5)

      row
        .append('line')
        .attr('x1', (d) => x(d.median))
        .attr('x2', (d) => x(d.median))
        .attr('y1', 2)
        .attr('y2', ROW_HEIGHT - 2)
        .attr('stroke', (d) => d.color)
        .attr('stroke-width', 2)
    }

    const xAxis = d3
      .axisBottom(x)
      .tickValues(xTicks)
      .tickFormat((d) => formatSeconds(d as number))
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [groups, width, chartType])

  return (
    <div className="viz-root pace-chart" ref={containerRef}>
      <style>{`
        .pace-chart {
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
          .pace-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
      `}</style>
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        <div className="color-mode-toggle" role="radiogroup" aria-label="Group by">
          {(['team', 'driver', 'manufacturer'] as const).map((g) => (
            <button key={g} type="button" className={groupBy === g ? 'active' : ''} onClick={() => setGroupBy(g)}>
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <div className="color-mode-toggle" role="radiogroup" aria-label="Chart type">
          {(['bar', 'box'] as const).map((t) => (
            <button key={t} type="button" className={chartType === t ? 'active' : ''} onClick={() => setChartType(t)}>
              {t === 'bar' ? 'Bar' : 'Box plot'}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? <p className="hint">No lap data for this selection.</p> : <svg ref={svgRef} />}
    </div>
  )
}
