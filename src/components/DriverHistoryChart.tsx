import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead, Stint } from '../api/types'
import { getEntityColor } from '../lib/identityColors'
import { CarPicker, type CarOption } from './CarPicker'

const MARGIN = { top: 8, right: 16, bottom: 32, left: 140 }
const ROW_HEIGHT = 40
const ROW_GAP = 12
const SEGMENT_GAP = 2

interface StintSegment extends Stint {
  fastestLapNumber: number | null
}

interface TooltipState {
  x: number
  y: number
  segment: StintSegment
}

function formatLapTime(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export function DriverHistoryChart({ stints, laps }: { stints: Stint[]; laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [selectedCars, setSelectedCars] = useState<string[]>([])
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

  const carOptions: CarOption[] = useMemo(() => {
    const byCar = new Map<string, string>()
    for (const s of stints) {
      if (!byCar.has(s.car_number)) byCar.set(s.car_number, s.team ?? 'Unknown team')
    }
    return [...byCar.entries()]
      .map(([car_number, team]) => ({ car_number, label: `#${car_number} — ${team}` }))
      .sort((a, b) => a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))
  }, [stints])

  const lapsByCar = useMemo(() => {
    const m = new Map<string, LapRead[]>()
    for (const lap of laps) {
      const arr = m.get(lap.car_number)
      if (arr) arr.push(lap)
      else m.set(lap.car_number, [lap])
    }
    return m
  }, [laps])

  const maxLap = useMemo(() => d3.max(stints, (s) => s.end_lap) ?? 1, [stints])

  const rows = useMemo(() => {
    return selectedCars.map((carNumber) => {
      const carStints = stints
        .filter((s) => s.car_number === carNumber)
        .sort((a, b) => a.start_lap - b.start_lap)
      const carLaps = lapsByCar.get(carNumber) ?? []
      const segments: StintSegment[] = carStints.map((stint) => {
        let fastestLapNumber: number | null = null
        let best = Infinity
        for (const lap of carLaps) {
          if (lap.lap_number < stint.start_lap || lap.lap_number > stint.end_lap) continue
          if (lap.lap_time_seconds == null) continue
          if (lap.lap_time_seconds < best) {
            best = lap.lap_time_seconds
            fastestLapNumber = lap.lap_number
          }
        }
        return { ...stint, fastestLapNumber }
      })
      return { carNumber, team: carStints[0]?.team ?? null, segments }
    })
  }, [selectedCars, stints, lapsByCar])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (rows.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const plotHeight = rows.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3.scaleLinear().domain([1, maxLap]).range([0, innerWidth])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    rows.forEach((row, i) => {
      const rowY = i * (ROW_HEIGHT + ROW_GAP)
      const rowG = g.append('g').attr('transform', `translate(0,${rowY})`)

      rowG
        .append('text')
        .attr('x', -10)
        .attr('y', ROW_HEIGHT / 2)
        .attr('dominant-baseline', 'central')
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(`#${row.carNumber}`)

      const clipId = `driver-history-clip-${i}`
      rowG
        .append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('width', innerWidth)
        .attr('height', ROW_HEIGHT)
        .attr('rx', 4)
        .attr('ry', 4)

      const segGroup = rowG.append('g').attr('clip-path', `url(#${clipId})`)

      segGroup
        .selectAll('rect')
        .data(row.segments)
        .join('rect')
        .attr('x', (d) => x(d.start_lap))
        .attr('y', 0)
        .attr('width', (d) => Math.max(0, x(d.end_lap) - x(d.start_lap) - SEGMENT_GAP))
        .attr('height', ROW_HEIGHT)
        .attr('fill', (d) => getEntityColor(d.drivers))
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, d) => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, segment: d })
        })
        .on('mouseleave', () => setTooltip(null))

      segGroup
        .selectAll('text')
        .data(row.segments)
        .join('text')
        .attr('x', (d) => (x(d.start_lap) + x(d.end_lap) - SEGMENT_GAP) / 2)
        .attr('y', ROW_HEIGHT / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', '#ffffff')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
        .text((d) => d.drivers)
        .each(function (d) {
          const segWidth = x(d.end_lap) - x(d.start_lap) - SEGMENT_GAP
          const textWidth = (this as SVGTextElement).getBBox().width
          if (textWidth + 12 > segWidth) d3.select(this).remove()
        })
    })

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.floor(innerWidth / 80)))
      .tickFormat((d) => `Lap ${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${plotHeight + 8})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [rows, width, maxLap])

  return (
    <div className="viz-root driver-history-chart" ref={containerRef}>
      <style>{`
        .driver-history-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .driver-history-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --axis: #383835;
          }
        }
        .driver-history-chart .tooltip {
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
        .driver-history-chart .tooltip strong {
          font-size: 13px;
        }
      `}</style>
      <div className="chart-controls">
        <CarPicker cars={carOptions} selected={selectedCars} onChange={setSelectedCars} />
      </div>
      {rows.length === 0 ? (
        <p className="hint">Pick one or more cars above to see their driver stint history.</p>
      ) : (
        <svg ref={svgRef} />
      )}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>{tooltip.segment.drivers}</strong>
          </div>
          <div>
            Laps {tooltip.segment.start_lap}–{tooltip.segment.end_lap} ({tooltip.segment.lap_count} laps)
          </div>
          <div>
            Fastest {formatLapTime(tooltip.segment.best_lap_seconds)}
            {tooltip.segment.fastestLapNumber != null ? ` (lap ${tooltip.segment.fastestLapNumber})` : ''}
          </div>
          <div>Average {formatLapTime(tooltip.segment.avg_lap_seconds)}</div>
        </div>
      )}
    </div>
  )
}
