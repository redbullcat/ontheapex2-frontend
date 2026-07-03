import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { computeTimeLossTrace } from '../lib/timeLossTrace'
import { formatLapTime } from '../replay/format'

const MARGIN = { top: 12, right: 16, bottom: 24, left: 44 }
const HEIGHT = 180

export function TimeLossTrace({ laps, carNumber }: { laps: LapRead[]; carNumber: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(600)

  const completedLaps = useMemo(
    () =>
      laps
        .filter((l) => l.car_number === carNumber && l.lap_time_seconds != null)
        .sort((a, b) => b.lap_number - a.lap_number),
    [laps, carNumber],
  )
  const [selectedLap, setSelectedLap] = useState<number | null>(null)
  // Track the latest completed lap so the selector defaults to (and stays
  // pinned to) it as new laps land, without fighting a deliberate manual
  // pick of an earlier lap.
  const latestLapNumber = completedLaps[0]?.lap_number ?? null

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

  const result = useMemo(
    () => computeTimeLossTrace(laps, carNumber, selectedLap ?? undefined),
    [laps, carNumber, selectedLap],
  )

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (!result) return

    const height = HEIGHT
    const innerW = Math.max(10, width - MARGIN.left - MARGIN.right)
    const innerH = height - MARGIN.top - MARGIN.bottom

    const known = result.points.filter((p) => p.delta != null)
    const maxAbs = Math.max(0.1, ...known.map((p) => Math.abs(p.delta!)))
    const y = d3.scaleLinear().domain([-maxAbs * 1.15, maxAbs * 1.15]).range([innerH, 0])
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW])

    const g = svg.attr('width', width).attr('height', height).append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    g.append('line').attr('x1', 0).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0)).attr('class', 'time-loss-zero')

    g.append('g')
      .attr('class', 'time-loss-axis')
      .call(d3.axisLeft(y).ticks(4).tickFormat((v) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}s`))

    g.append('g')
      .attr('class', 'time-loss-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(result.points.map((p) => p.fraction))
          .tickFormat((_, i) => result.points[i].label),
      )

    // Segments only drawn between two consecutive *known* points — a blank
    // split (unrecorded) breaks the line rather than lying through it.
    const line = d3
      .line<{ fraction: number; delta: number }>()
      .x((p) => x(p.fraction))
      .y((p) => y(p.delta))

    for (let i = 0; i < result.points.length - 1; i++) {
      const a = result.points[i]
      const b = result.points[i + 1]
      if (a.delta == null || b.delta == null) continue
      const segPoints = [
        { fraction: a.fraction, delta: a.delta },
        { fraction: b.fraction, delta: b.delta },
      ]
      g.append('path')
        .attr('d', line(segPoints))
        .attr('class', b.delta >= a.delta ? 'time-loss-segment time-loss-losing' : 'time-loss-segment time-loss-gaining')
    }

    g.selectAll('.time-loss-dot')
      .data(known)
      .join('circle')
      .attr('class', 'time-loss-dot')
      .attr('cx', (p) => x(p.fraction))
      .attr('cy', (p) => y(p.delta!))
      .attr('r', 3.5)
  }, [result, width])

  if (!result) {
    return <p className="replay-hint">Not enough completed laps yet to plot a time-loss trace.</p>
  }

  const finalDelta = result.points[result.points.length - 1]?.delta ?? null

  return (
    <div ref={containerRef} className="time-loss-trace">
      <div className="time-loss-controls">
        <label className="field">
          <span className="field-label">Lap</span>
          <select value={result.targetLapNumber} onChange={(e) => setSelectedLap(Number(e.target.value))}>
            {completedLaps.map((l) => (
              <option key={l.lap_number} value={l.lap_number}>
                Lap {l.lap_number} — {formatLapTime(l.lap_time_seconds)}
                {l.lap_number === latestLapNumber ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="time-loss-reference">
          vs {result.referenceIsOwnBest ? 'own fastest lap' : `#${result.referenceCarNumber} fastest in class`} — Lap{' '}
          {result.referenceLapNumber} ({formatLapTime(result.referenceLapTime)}
          {!result.referenceIsOwnBest && result.referenceDriverName ? `, ${result.referenceDriverName}` : ''})
        </p>
      </div>
      <svg ref={svgRef} />
      <p className="replay-hint time-loss-hint">
        {finalDelta == null
          ? 'Some splits on this lap were not recorded.'
          : finalDelta >= 0
            ? `Finished this lap ${finalDelta.toFixed(1)}s behind the reference.`
            : `Finished this lap ${Math.abs(finalDelta).toFixed(1)}s ahead of the reference.`}
        {' '}Only shows completed laps — a split isn't known until the car actually crosses it, live or replay.
      </p>
    </div>
  )
}
