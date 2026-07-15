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
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 16, bottom: 28, left: 48 }
const ROW_HEIGHT = 44
const WHEEL_LABELS: Record<Wheel, string> = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' }

interface StintTooltip {
  kind: 'stint'
  x: number
  y: number
  carNumber: string
  wheel: Wheel
  stint: WheelStint
}

interface PitTooltip {
  kind: 'pit'
  x: number
  y: number
  carNumber: string
  lapNumber: number
  pitSeconds: number
}

type TooltipState = StintTooltip | PitTooltip

// One lane per wheel (FL/FR/RL/RR), grouped into a row per car, all sharing
// the same lap-number x-axis — a pit stop that only swaps 1-3 wheels shows
// up as exactly those wheels' lanes breaking, rather than collapsing every
// wheel into one "the car's tyres" bar the way a single-row-per-car view
// would have to.
export function TyreHistoryChart({
  laps,
  compactFilters,
  forcedWidth,
  onRendered,
}: {
  laps: LapRead[]
  compactFilters?: boolean
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(null)

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

  // Confirmed real pit stops, independent of the per-wheel compound/age
  // signal above — Griiip's tyre-change reporting is unreliable (its
  // isChanged flag and age-reset both routinely stay silent through a real
  // stop), but pit_time_seconds comes from crossing-line timestamps, not
  // the tyre channel, so it still reliably marks that *something* happened
  // here even when the wheel lanes show no break.
  const pitStopsByCar = useMemo(() => {
    const map = new Map<string, { lapNumber: number; pitSeconds: number }[]>()
    for (const car of carsWithData) {
      const stops = filteredLaps
        .filter((l) => l.car_number === car && l.pit_time_seconds != null)
        .map((l) => ({ lapNumber: l.lap_number, pitSeconds: l.pit_time_seconds! }))
        .sort((a, b) => a.lapNumber - b.lapNumber)
      if (stops.length > 0) map.set(car, stops)
    }
    return map
  }, [filteredLaps, carsWithData])

  // How many of those confirmed real stops actually got a wheel-stint
  // break somewhere in the feed — the real-world completeness rate,
  // verified against a direct comparison with Timing71's independent
  // capture of the same WEC Sao Paulo race: both sides land on the same
  // ~16%, confirming this is a genuine gap in Griiip's own data for that
  // event rather than something either side's code is losing. Surfaced so
  // that number is never a surprise buried in a silently-unbroken lane.
  const tyreDataCompleteness = useMemo(() => {
    let confirmedStops = 0
    let totalStops = 0
    for (const [car, stops] of pitStopsByCar) {
      const wheels = wheelStintsByCar.get(car)
      if (!wheels) continue
      const changeLaps = new Set<number>()
      for (const wheel of WHEELS) {
        const stints = wheels[wheel]
        for (let i = 1; i < stints.length; i++) changeLaps.add(stints[i].startLap)
      }
      for (const stop of stops) {
        totalStops++
        // A wheel stint's new startLap can land on the pit-in lap itself
        // or the very next (out) lap, depending on exactly when the
        // tires channel's snapshot was last taken relative to the lap
        // boundary — see app/live/state.py's module docstring.
        if (changeLaps.has(stop.lapNumber) || changeLaps.has(stop.lapNumber + 1)) confirmedStops++
      }
    }
    return { confirmedStops, totalStops }
  }, [pitStopsByCar, wheelStintsByCar])

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
            setTooltip({ kind: 'stint', x: event.clientX - rect.left, y: event.clientY - rect.top, carNumber: car, wheel, stint: d })
          })
          .on('mouseleave', () => setTooltip(null))
      })

      const pitStops = pitStopsByCar.get(car) ?? []
      row
        .selectAll('.pit-marker')
        .data(pitStops)
        .join('line')
        .attr('class', 'pit-marker')
        .attr('x1', (d) => x(d.lapNumber + 0.5))
        .attr('x2', (d) => x(d.lapNumber + 0.5))
        .attr('y1', 0)
        .attr('y2', ROW_HEIGHT)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, d) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip({ kind: 'pit', x: event.clientX - rect.left, y: event.clientY - rect.top, carNumber: car, lapNumber: d.lapNumber, pitSeconds: d.pitSeconds })
        })
        .on('mouseleave', () => setTooltip(null))
    })

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [carsWithData, wheelStintsByCar, pitStopsByCar, width, innerWidth, innerHeight, lapDomain, height, onRendered])

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
        .tyre-history-chart .pit-swatch {
          width: 0; height: 12px; border-radius: 0; border: none;
          border-left: 2px dashed var(--text-secondary);
        }
        .tyre-history-chart .row-label { font-size: 10.5px; font-weight: 700; fill: var(--text-primary); }
        .tyre-history-chart .stint-segment { stroke: var(--axis); stroke-width: 0.75px; }
        .tyre-history-chart .pit-marker { stroke: var(--text-secondary); stroke-width: 1.5px; stroke-dasharray: 2 2; }
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
        <CollapsibleFilters
          actions={
            <ChartExportButtons
              svgRef={svgRef}
              filename="tyre_history"
              renderChart={(w, onReady) => (
                <TyreHistoryChart laps={laps} compactFilters={compactFilters} forcedWidth={w} onRendered={onReady} />
              )}
            />
          }
        >
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
        <div className="legend-item">
          <span className="swatch pit-swatch" />
          <span>Confirmed pit stop</span>
        </div>
      </div>
      <p className="hint">
        Dashed lines mark every confirmed pit stop. The timing feed doesn't always report which tyres were changed at a
        stop — a solid, unbroken wheel lane through a marker means no change was reported, not necessarily that none happened.
        {tyreDataCompleteness.totalStops > 0 &&
          ` Tyre changes confirmed for ${tyreDataCompleteness.confirmedStops} of ${tyreDataCompleteness.totalStops} pit stops this session (${Math.round((100 * tyreDataCompleteness.confirmedStops) / tyreDataCompleteness.totalStops)}%).`}
      </p>
      {carsWithData.length === 0 ? <p className="hint">No tyre history for this selection.</p> : <svg ref={svgRef} />}
      {tooltip && tooltip.kind === 'stint' && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>#{tooltip.carNumber} — {WHEEL_LABELS[tooltip.wheel]}</strong> — {tooltip.stint.compound ? compoundDisplayName(tooltip.stint.compound) : 'Unknown'}
          </div>
          <div>
            Laps {tooltip.stint.startLap}–{tooltip.stint.endLap} ({tooltip.stint.lapCount} laps)
          </div>
        </div>
      )}
      {tooltip && tooltip.kind === 'pit' && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>#{tooltip.carNumber} — Pit stop</strong>
          </div>
          <div>
            Lap {tooltip.lapNumber} &middot; {tooltip.pitSeconds.toFixed(1)}s in pit
          </div>
        </div>
      )}
    </div>
  )
}
