import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { computeCarStints } from '../lib/stints'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { CollapsibleFilters } from './CollapsibleFilters'

const PANEL_WIDTH = 170
const PANEL_HEIGHT = 120
const PANEL_MARGIN = { top: 18, right: 6, bottom: 20, left: 26 }

interface CarPanel {
  car_number: string
  team: string | null
  label: string
  counts: Map<number, number>
  maxLength: number
  maxCount: number
}

function computePanels(laps: LapRead[], activeClasses: Set<string>, activeCars: Set<string>): CarPanel[] {
  const stints = computeCarStints(laps).filter(
    (s) => activeClasses.has(s.class ?? 'Unknown') && activeCars.has(s.car_number),
  )

  const byCar = new Map<string, { team: string | null; lengths: number[] }>()
  for (const stint of stints) {
    if (stint.laps.length === 0) continue
    let entry = byCar.get(stint.car_number)
    if (!entry) {
      entry = { team: stint.team, lengths: [] }
      byCar.set(stint.car_number, entry)
    }
    entry.lengths.push(stint.laps.length)
  }

  const panels: CarPanel[] = []
  for (const [car, { team, lengths }] of byCar) {
    const counts = new Map<number, number>()
    for (const len of lengths) counts.set(len, (counts.get(len) ?? 0) + 1)
    panels.push({
      car_number: car,
      team,
      label: `${getTeamDisplayName(team)} #${car}`,
      counts,
      maxLength: d3.max(lengths) ?? 1,
      maxCount: d3.max([...counts.values()]) ?? 1,
    })
  }
  panels.sort((a, b) => a.label.localeCompare(b.label))
  return panels
}

function drawPanel(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, panel: CarPanel) {
  const innerWidth = PANEL_WIDTH - PANEL_MARGIN.left - PANEL_MARGIN.right
  const innerHeight = PANEL_HEIGHT - PANEL_MARGIN.top - PANEL_MARGIN.bottom
  svg.attr('width', PANEL_WIDTH).attr('height', PANEL_HEIGHT)

  const g = svg.append('g').attr('transform', `translate(${PANEL_MARGIN.left},${PANEL_MARGIN.top})`)

  svg
    .append('text')
    .attr('x', PANEL_WIDTH / 2)
    .attr('y', 12)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text-primary)')
    .attr('font-size', 10)
    .attr('font-weight', 600)
    .text(panel.label)

  const x = d3.scaleLinear().domain([0, panel.maxLength + 1]).range([0, innerWidth])
  const y = d3.scaleLinear().domain([0, panel.maxCount]).range([innerHeight, 0])

  const barWidth = Math.max(1, innerWidth / (panel.maxLength + 1) - 1)
  const color = getTeamColor(panel.team)

  g.append('g')
    .selectAll('rect')
    .data([...panel.counts.entries()])
    .join('rect')
    .attr('x', ([len]) => x(len) - barWidth / 2)
    .attr('y', ([, count]) => y(count))
    .attr('width', barWidth)
    .attr('height', ([, count]) => innerHeight - y(count))
    .attr('fill', color)

  const xTicks = x.ticks(Math.min(4, panel.maxLength)).filter((t) => Number.isInteger(t) && t > 0)
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(xTicks).tickSizeOuter(0))
    .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
    .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
    .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 8))

  const yTicks = y.ticks(Math.min(4, panel.maxCount)).filter((t) => Number.isInteger(t))
  g.append('g')
    .call(d3.axisLeft(y).tickValues(yTicks).tickSizeOuter(0))
    .call((sel) => sel.select('.domain').remove())
    .call((sel) => sel.selectAll('.tick line').remove())
    .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 8))
}

export function StintLengthDistribution({ laps }: { laps: LapRead[] }) {
  const gridRef = useRef<HTMLDivElement>(null)
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

  const panels = useMemo(
    () => computePanels(laps, activeClasses, activeCars),
    [laps, activeClasses, activeCars],
  )

  useEffect(() => {
    const container = gridRef.current
    if (!container) return
    container.innerHTML = ''
    for (const panel of panels) {
      const wrapper = document.createElement('div')
      wrapper.className = 'stint-length-panel'
      container.appendChild(wrapper)
      const svg = d3.select(wrapper).append('svg')
      drawPanel(svg, panel)
    }
  }, [panels])

  return (
    <div className="viz-root stint-length-distribution">
      <style>{`
        .stint-length-distribution {
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
          .stint-length-distribution {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .stint-length-distribution {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .stint-length-distribution {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
        .stint-length-distribution .panel-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .stint-length-distribution .stint-length-panel {
          border: 1px solid var(--grid);
          border-radius: 4px;
          background: var(--surface-1);
        }
      `}</style>
      <CollapsibleFilters>
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
      {panels.length === 0 ? (
        <p className="hint">No stint data for this selection.</p>
      ) : (
        <p className="hint">Number of stints by stint length (laps), one panel per car.</p>
      )}
      <div className="panel-grid" ref={gridRef} />
    </div>
  )
}
