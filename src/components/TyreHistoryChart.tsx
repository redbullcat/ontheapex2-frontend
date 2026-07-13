import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { tyreCompoundColor } from '../lib/tyreColors'
import { compoundDisplayName } from '../lib/carTyres'
import { computeWheelStints, WHEELS, type Wheel, type WheelStint } from '../lib/tyreStints'
import { ChartExportButtons } from './ChartExportButtons'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from './EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { getTeamDisplayName } from '../lib/identityColors'
import { CollapsibleFilters } from './CollapsibleFilters'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'

const MARGIN = { top: 8, right: 16, bottom: 28, left: 48 }
const ROW_HEIGHT = 44
const WHEEL_LABELS: Record<Wheel, string> = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' }

interface TooltipState {
  x: number
  y: number
  carNumber: string
  wheel: Wheel
  stint: WheelStint
}

// One lane per wheel (FL/FR/RL/RR), grouped into a row per car, all sharing
// the same lap-number x-axis — a pit stop that only swaps 1-3 wheels shows
// up as exactly those wheels' lanes breaking, rather than collapsing every
// wheel into one "the car's tyres" bar the way a single-row-per-car view
// would have to.
export function TyreHistoryChart({ laps, compactFilters }: { laps: LapRead[]; compactFilters?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)

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
    for (const l of laps) s.add(l.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(() => resolveClassSelection(classSelection, allClasses), [classSelection, allClasses])

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
    () => resolveEntitySelection(carSelection, carOptions.map((o) => o.id)),
    [carSelection, carOptions],
  )

  const filteredLaps = useMemo(
    () => laps.filter((l) => activeClasses.has(l.class ?? 'Unknown') && activeCars.has(l.car_number)),
    [laps, activeClasses, activeCars],
  )

  const carNumbers = useMemo(() => {
    const s = new Set<string>()
    for (const l of filteredLaps) s.add(l.car_number)
    return [...s].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
  }, [filteredLaps])

  const wheelStintsByCar = useMemo(() => {
    const map = new Map<string, Record<Wheel, WheelStint[]>>()
    for (const car of carNumbers) {
      const wheels = computeWheelStints(filteredLaps, car)
      if (WHEELS.some((w) => wheels[w].length > 0)) map.set(car, wheels)
    }
    return map
  }, [filteredLaps, carNumbers])

  const carsWithData = useMemo(() => carNumbers.filter((c) => wheelStintsByCar.has(c)), [carNumbers, wheelStintsByCar])

  const lapDomain = useMemo((): [number, number] => {
    let min = Infinity
    let max = -Infinity
    for (const wheels of wheelStintsByCar.values()) {
      for (const wheel of WHEELS) {
        for (const s of wheels[wheel]) {
          min = Math.min(min, s.startLap)
          max = Math.max(max, s.endLap)
        }
      }
    }
    return min <= max ? [min, max + 1] : [0, 1]
  }, [wheelStintsByCar])

  const legendCompounds = useMemo(() => {
    const s = new Set<string>()
    for (const wheels of wheelStintsByCar.values()) {
      for (const wheel of WHEELS) {
        for (const stint of wheels[wheel]) if (stint.compound) s.add(stint.compound)
      }
    }
    return [...s].sort()
  }, [wheelStintsByCar])

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerHeight = carsWithData.length * ROW_HEIGHT
  const height = innerHeight + MARGIN.top + MARGIN.bottom

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (carsWithData.length === 0 || width === 0) return

    svg.attr('width', width).attr('height', height)
    const x = d3.scaleLinear().domain(lapDomain).range([0, innerWidth])
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.min(10, lapDomain[1] - lapDomain[0]))
          .tickFormat((d) => String(Math.round(d as number))),
      )

    const laneGap = 1
    const laneHeight = (ROW_HEIGHT - 6 - laneGap * 3) / 4

    carsWithData.forEach((car, i) => {
      const y = i * ROW_HEIGHT
      const row = g.append('g').attr('transform', `translate(0,${y})`)

      row
        .append('text')
        .attr('class', 'row-label')
        .attr('x', -8)
        .attr('y', ROW_HEIGHT / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .text(`#${car}`)

      const wheels = wheelStintsByCar.get(car)
      if (!wheels) return

      WHEELS.forEach((wheel, wi) => {
        const laneY = 3 + wi * (laneHeight + laneGap)
        row
          .selectAll(`.lane-${wheel}`)
          .data(wheels[wheel])
          .join('rect')
          .attr('class', `lane-${wheel} stint-segment`)
          .attr('x', (d) => x(d.startLap))
          .attr('y', laneY)
          .attr('width', (d) => Math.max(1, x(d.endLap + 1) - x(d.startLap) - 1))
          .attr('height', laneHeight)
          .attr('rx', 1.5)
          .attr('fill', (d) => tyreCompoundColor(d.compound))
          .style('cursor', 'pointer')
          .on('mousemove', (event: MouseEvent, d) => {
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return
            setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, carNumber: car, wheel, stint: d })
          })
          .on('mouseleave', () => setTooltip(null))
      })
    })
  }, [carsWithData, wheelStintsByCar, width, innerWidth, innerHeight, lapDomain, height])

  return (
    <div className="viz-root tyre-history-chart" ref={containerRef}>
      <style>{`
        .tyre-history-chart {
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
          .tyre-history-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #44443f; }
        }
        :root[data-theme='dark'] .tyre-history-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #44443f; }
        :root[data-theme='light'] .tyre-history-chart { --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; }
        .tyre-history-chart .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; font-size: 13px; color: var(--text-secondary); }
        .tyre-history-chart .legend-item { display: flex; align-items: center; gap: 6px; }
        .tyre-history-chart .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; border: 1px solid var(--axis); }
        .tyre-history-chart .row-label { font-size: 10.5px; font-weight: 700; fill: var(--text-primary); }
        .tyre-history-chart .stint-segment { stroke: var(--axis); stroke-width: 0.75px; }
        .tyre-history-chart svg .domain, .tyre-history-chart svg .tick line { stroke: var(--axis); }
        .tyre-history-chart svg .tick text { fill: var(--text-secondary); font-size: 10px; }
        .tyre-history-chart .tooltip {
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
      `}</style>
      {compactFilters ? (
        <PanelSettingsPopover>
          <div className="chart-controls">
            <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
            <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all cars" />
          </div>
        </PanelSettingsPopover>
      ) : (
        <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename="tyre_history" />}>
          <div className="chart-controls">
            <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
            <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all cars" />
          </div>
        </CollapsibleFilters>
      )}
      <div className="legend">
        {legendCompounds.map((compound) => (
          <div className="legend-item" key={compound}>
            <span className="swatch" style={{ background: tyreCompoundColor(compound) }} />
            <span>{compoundDisplayName(compound)}</span>
          </div>
        ))}
      </div>
      {carsWithData.length === 0 ? <p className="hint">No tyre history for this selection.</p> : <svg ref={svgRef} />}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>#{tooltip.carNumber} — {WHEEL_LABELS[tooltip.wheel]}</strong> — {tooltip.stint.compound ? compoundDisplayName(tooltip.stint.compound) : 'Unknown'}
          </div>
          <div>
            Laps {tooltip.stint.startLap}–{tooltip.stint.endLap} ({tooltip.stint.lapCount} laps)
          </div>
        </div>
      )}
    </div>
  )
}
