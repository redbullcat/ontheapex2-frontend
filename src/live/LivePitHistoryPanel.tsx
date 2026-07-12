import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { computePitHistory, type PitStint } from '../lib/pitHistory'
import { tyreCompoundColor } from '../lib/tyreColors'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { EntityFilter, type EntityOption } from '../components/EntityFilter'
import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'
import { getTeamDisplayName } from '../lib/identityColors'
import { PanelSettingsPopover } from '../dashboard/PanelSettingsPopover'
import { formatLapTime } from '../replay/format'

const MARGIN = { top: 8, right: 16, bottom: 28, left: 48 }
const ROW_HEIGHT = 26

interface TooltipState {
  x: number
  y: number
  stint: PitStint
}

// Pit-to-pit stints (not tyre-compound stints — see TyreHistoryChart for
// that) — one lane per car, stops spanning the whole race with no gaps, so
// pit-stop timing/frequency is directly comparable across the field. Same
// d3-rects-in-rows construction as TyreHistoryChart, just colored by
// compound and labeled with lap count on the bar itself (driver/avg pace/
// tyre age are hover-only — no room to fit them all as static labels).
export function LivePitHistoryPanel({ laps }: { laps: LapRead[] }) {
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

  // computePitHistory groups by car internally, but only needs to run once
  // over the whole filtered set rather than once per car (unlike
  // TyreHistoryChart's computeTyreStints, which takes a single car number).
  const stintsByCar = useMemo(() => {
    const map = new Map<string, PitStint[]>()
    for (const stint of computePitHistory(filteredLaps)) {
      const arr = map.get(stint.car_number)
      if (arr) arr.push(stint)
      else map.set(stint.car_number, [stint])
    }
    return map
  }, [filteredLaps])

  const carsWithData = useMemo(
    () => [...stintsByCar.keys()].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0)),
    [stintsByCar],
  )

  const lapDomain = useMemo((): [number, number] => {
    let min = Infinity
    let max = -Infinity
    for (const stints of stintsByCar.values()) {
      for (const s of stints) {
        min = Math.min(min, s.startLap)
        max = Math.max(max, s.endLap)
      }
    }
    return min <= max ? [min, max + 1] : [0, 1]
  }, [stintsByCar])

  const legendCompounds = useMemo(() => {
    const s = new Set<string>()
    for (const stints of stintsByCar.values()) {
      for (const stint of stints) if (stint.tyreCompound) s.add(stint.tyreCompound)
    }
    return [...s].sort()
  }, [stintsByCar])

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

      const stints = stintsByCar.get(car) ?? []
      const cell = row
        .selectAll('g.stint')
        .data(stints)
        .join('g')
        .attr('class', 'stint')
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, d) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, stint: d })
        })
        .on('mouseleave', () => setTooltip(null))

      cell
        .append('rect')
        .attr('x', (d) => x(d.startLap))
        .attr('y', 2)
        .attr('width', (d) => Math.max(1, x(d.endLap + 1) - x(d.startLap) - 1))
        .attr('height', ROW_HEIGHT - 6)
        .attr('rx', 2)
        .attr('class', (d) => (d.isCurrent ? 'stint-segment stint-current' : 'stint-segment'))
        .attr('fill', (d) => tyreCompoundColor(d.tyreCompound))

      // Lap count on the bar itself — only when there's room for the text,
      // otherwise it just overflows into the neighbouring stint.
      cell
        .append('text')
        .attr('class', 'stint-label')
        .attr('x', (d) => (x(d.startLap) + x(d.endLap + 1)) / 2)
        .attr('y', ROW_HEIGHT / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .text((d) => (x(d.endLap + 1) - x(d.startLap) >= 18 ? String(d.lapCount) : ''))
    })
  }, [carsWithData, stintsByCar, width, innerWidth, innerHeight, lapDomain, height])

  return (
    <div className="viz-root pit-history-chart" ref={containerRef}>
      <style>{`
        .pit-history-chart {
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
          .pit-history-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #44443f; }
        }
        :root[data-theme='dark'] .pit-history-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #44443f; }
        :root[data-theme='light'] .pit-history-chart { --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; }
        .pit-history-chart .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; font-size: 13px; color: var(--text-secondary); }
        .pit-history-chart .legend-item { display: flex; align-items: center; gap: 6px; }
        .pit-history-chart .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; border: 1px solid var(--axis); }
        .pit-history-chart .row-label { font-size: 10.5px; font-weight: 700; fill: var(--text-primary); }
        .pit-history-chart .stint-segment { stroke: var(--axis); stroke-width: 1px; }
        .pit-history-chart .stint-current { stroke: var(--text-primary); stroke-width: 1.5px; stroke-dasharray: 3 2; }
        .pit-history-chart .stint-label { font-size: 10px; font-weight: 600; fill: var(--text-primary); pointer-events: none; }
        .pit-history-chart svg .domain, .pit-history-chart svg .tick line { stroke: var(--axis); }
        .pit-history-chart svg .tick text { fill: var(--text-secondary); font-size: 10px; }
        .pit-history-chart .tooltip {
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
        .pit-history-chart .tooltip strong { font-size: 13px; }
      `}</style>
      <PanelSettingsPopover>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
          <EntityFilter items={carOptions} selection={carSelection} onChange={setCarSelection} addLabel="Add car" resetLabel="Show all cars" />
        </div>
      </PanelSettingsPopover>
      <div className="legend">
        {legendCompounds.map((compound) => (
          <div className="legend-item" key={compound}>
            <span className="swatch" style={{ background: tyreCompoundColor(compound) }} />
            <span>{compound}</span>
          </div>
        ))}
      </div>
      {carsWithData.length === 0 ? <p className="hint">No pit history for this selection yet.</p> : <svg ref={svgRef} />}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>#{tooltip.stint.car_number}</strong> — {tooltip.stint.driver ?? 'Unknown driver'}
            {tooltip.stint.isCurrent && ' (current stint)'}
          </div>
          <div>
            Laps {tooltip.stint.startLap}–{tooltip.stint.endLap} ({tooltip.stint.lapCount} laps)
          </div>
          <div>Avg lap: {tooltip.stint.avgLapSeconds != null ? formatLapTime(tooltip.stint.avgLapSeconds) : '—'}</div>
          <div>
            Tyres: {tooltip.stint.tyreCompound ?? '—'} (age {tooltip.stint.tyreAge ?? '—'})
          </div>
        </div>
      )}
    </div>
  )
}
