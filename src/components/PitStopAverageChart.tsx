import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getManufacturerColor, getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import type { EntitySelection } from '../lib/entitySelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { computePitStops, type PitStop } from './PitTimeChart'
import { CollapsibleFilters } from './CollapsibleFilters'
import { GapModeToggle } from './GapModeToggle'
import { computeGaps, formatGap, type GapMode } from '../lib/gapToLeader'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 200 }
const MARGIN_LEFT_MIN = 90
const ROW_HEIGHT = 22
const ROW_GAP = 6

type GroupBy = 'team' | 'manufacturer'

interface GroupStats {
  key: string
  label: string
  color: string
  stops: number
  avgLoss: number
}

function formatSeconds(s: number): string {
  const sign = s < 0 ? '-' : ''
  return `${sign}${Math.abs(s).toFixed(1)}s`
}

function fieldFor(groupBy: GroupBy): (s: PitStop) => string | null {
  return groupBy === 'team' ? (s) => s.team : (s) => s.manufacturer
}

function buildGroups(
  stops: PitStop[],
  groupBy: GroupBy,
  entitySelection: EntitySelection,
  topPercent: number,
): GroupStats[] {
  const field = fieldFor(groupBy)
  const byGroup = new Map<string, number[]>()
  for (const s of stops) {
    const key = field(s)
    if (!key) continue
    if (entitySelection && !entitySelection.has(key)) continue
    const arr = byGroup.get(key)
    if (arr) arr.push(s.lossSeconds)
    else byGroup.set(key, [s.lossSeconds])
  }

  const groups: GroupStats[] = []
  for (const [key, losses] of byGroup) {
    // Top-N% fastest (lowest-loss) pit stops kept per group, same convention
    // as PaceChart's "Top % of laps" filter.
    const sortedAll = [...losses].sort((a, b) => a - b)
    const keepCount = topPercent <= 0 ? 0 : Math.max(1, Math.ceil((sortedAll.length * topPercent) / 100))
    if (keepCount === 0) continue
    const kept = sortedAll.slice(0, keepCount)
    groups.push({
      key,
      label: groupBy === 'team' ? getTeamDisplayName(key) : key,
      color: groupBy === 'team' ? getTeamColor(key) : getManufacturerColor(key),
      stops: kept.length,
      avgLoss: d3.mean(kept) ?? 0,
    })
  }
  groups.sort((a, b) => a.avgLoss - b.avgLoss)
  return groups
}

export function PitStopAverageChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('team')
  const [entitySelection, setEntitySelection] = useState<EntitySelection>(null)
  const [topPercentInput, setTopPercentInput] = useState('100')
  const [gapMode, setGapMode] = useState<GapMode>('ahead')

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

  const stops = useMemo(() => computePitStops(laps, activeClasses), [laps, activeClasses])

  const entityOptions: EntityOption[] = useMemo(() => {
    const field = fieldFor(groupBy)
    const names = new Set<string>()
    for (const s of stops) {
      const key = field(s)
      if (key) names.add(key)
    }
    return [...names]
      .sort()
      .map((name) => ({ id: name, label: groupBy === 'team' ? getTeamDisplayName(name) : name }))
  }, [stops, groupBy])

  // Reset the entity selection when switching group-by mode or its ids
  // (team names vs. manufacturer names) no longer line up with it.
  useEffect(() => {
    setEntitySelection(null)
  }, [groupBy])

  const topPercent = Math.max(0, Math.min(100, Number(topPercentInput) || 0))

  const groups = useMemo(
    () => buildGroups(stops, groupBy, entitySelection, topPercent),
    [stops, groupBy, entitySelection, topPercent],
  )

  // groups is already sorted ascending by avgLoss (fastest/lowest-loss
  // first), which is what computeGaps requires.
  const gaps = useMemo(() => computeGaps(groups.map((g) => g.avgLoss), gapMode), [groups, gapMode])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (groups.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.42))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = groups.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([0, (d3.max(groups, (g) => g.avgLoss) ?? 1) * 1.1]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(groups.map((g) => g.key))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

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
      .text((d) => (truncateLabel(d.label, marginLeft - 14)))

    g.append('g')
      .selectAll('rect')
      .data(groups)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.key) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.avgLoss)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(groups)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.avgLoss) + 6)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d, i) => {
        const gapText = formatGap(gaps[i])
        return `${formatSeconds(d.avgLoss)}${gapText ? `, ${gapText}` : ''} (${d.stops} stops)`
      })

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [groups, width, gaps])

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
      <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename="pit_stop_average" />}>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          <div className="color-mode-toggle" role="radiogroup" aria-label="Group by">
            {(['team', 'manufacturer'] as const).map((g) => (
              <button key={g} type="button" className={groupBy === g ? 'active' : ''} onClick={() => setGroupBy(g)}>
                {g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
          <label className="top-percent">
            <span className="field-label">Top % of pit stops</span>
            <input type="number" min={0} max={100} value={topPercentInput} onChange={(e) => setTopPercentInput(e.target.value)} />
          </label>
          <GapModeToggle value={gapMode} onChange={setGapMode} />
        </div>
        <div className="chart-controls">
          <EntityFilter
            items={entityOptions}
            selection={entitySelection}
            onChange={setEntitySelection}
            addLabel={groupBy === 'team' ? 'Add team' : 'Add manufacturer'}
            resetLabel={groupBy === 'team' ? 'Show all teams' : 'Show all manufacturers'}
          />
        </div>
      </CollapsibleFilters>
      {groups.length === 0 ? <p className="hint">No pit stop data for this selection.</p> : <svg ref={svgRef} />}
    </div>
  )
}
