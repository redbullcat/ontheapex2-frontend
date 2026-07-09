import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ChartExportButtons } from './ChartExportButtons'
import { CollapsibleFilters } from './CollapsibleFilters'

const MARGIN = { top: 16, right: 24, bottom: 40, left: 56 }
const HEIGHT = 440
const R = 6

interface CarPoint {
  car: string
  team: string | null
  avg: number
  std: number
  laps: number
}

interface HoverState {
  x: number
  y: number
  point: CarPoint
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`
}

// Sample standard deviation (ddof=1), matching pandas' default .std().
function sampleStd(values: number[]): number {
  if (values.length < 2) return 0
  const mean = d3.mean(values) ?? 0
  const variance = d3.sum(values, (v) => (v - mean) ** 2) / (values.length - 1)
  return Math.sqrt(variance)
}

export function PaceConsistencyChart({ laps }: { laps: LapRead[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

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

  const points = useMemo(() => {
    const byCar = new Map<string, { team: string | null; times: number[] }>()
    for (const lap of laps) {
      if (lap.lap_time_seconds == null) continue
      if (!activeClasses.has(lap.class ?? 'Unknown')) continue
      let car = byCar.get(lap.car_number)
      if (!car) {
        car = { team: lap.team, times: [] }
        byCar.set(lap.car_number, car)
      }
      car.times.push(lap.lap_time_seconds)
    }

    const result: CarPoint[] = []
    for (const [car, { team, times }] of byCar) {
      // Clean laps: within 105% of this car's own median, excluding pit/SC/outlier laps.
      const median = d3.median(times) ?? 0
      const clean = times.filter((t) => t <= median * 1.05)
      if (clean.length === 0) continue
      result.push({ car, team, avg: d3.mean(clean) ?? 0, std: sampleStd(clean), laps: clean.length })
    }
    return result
  }, [laps, activeClasses])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (points.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', width).attr('height', HEIGHT)

    const xExtent = d3.extent(points, (p) => p.avg) as [number, number]
    const yExtent = d3.extent(points, (p) => p.std) as [number, number]
    const xPad = (xExtent[1] - xExtent[0]) * 0.08 || 1
    const yPad = (yExtent[1] - yExtent[0]) * 0.12 || 0.5
    const x = d3.scaleLinear().domain([xExtent[0] - xPad, xExtent[1] + xPad]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([Math.max(0, yExtent[0] - yPad), yExtent[1] + yPad]).range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const medAvg = d3.median(points, (p) => p.avg) ?? 0
    const medStd = d3.median(points, (p) => p.std) ?? 0

    g.append('line')
      .attr('x1', x(medAvg))
      .attr('x2', x(medAvg))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 1)
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', y(medStd))
      .attr('y2', y(medStd))
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 1)

    const quadrants = [
      { label: 'Fast & consistent', x: 4, y: 4, anchor: 'start' as const, xFast: true, yLow: true },
      { label: 'Fast & inconsistent', x: 4, y: innerHeight - 8, anchor: 'start' as const, xFast: true, yLow: false },
      { label: 'Slow & consistent', x: innerWidth - 4, y: 4, anchor: 'end' as const, xFast: false, yLow: true },
      { label: 'Slow & inconsistent', x: innerWidth - 4, y: innerHeight - 8, anchor: 'end' as const, xFast: false, yLow: false },
    ]
    g.append('g')
      .selectAll('text')
      .data(quadrants)
      .join('text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('text-anchor', (d) => d.anchor)
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .text((d) => d.label)

    g.append('g')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .attr('cx', (d) => x(d.avg))
      .attr('cy', (d) => y(d.std))
      .attr('r', R)
      .attr('fill', (d) => getTeamColor(d.team))
      .attr('stroke', 'var(--surface-1)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent, d) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, point: d })
      })
      .on('mouseleave', () => setHover(null))

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => formatSeconds(d as number)).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    const yAxis = d3.axisLeft(y).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 34)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .text('Average pace (clean laps)')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -40)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .text('Std deviation (s)')
  }, [points, width])

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
        .pace-consistency-chart .tooltip {
          position: absolute;
          pointer-events: none;
          background: var(--text-primary);
          color: var(--surface-1);
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          transform: translate(12px, -50%);
          white-space: nowrap;
          z-index: 10;
        }
        .pace-consistency-chart .tooltip strong {
          font-size: 13px;
        }
      `}</style>
      <CollapsibleFilters actions={<ChartExportButtons svgRef={svgRef} filename="pace_consistency" />}>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        </div>
      </CollapsibleFilters>
      {points.length === 0 ? <p className="hint">No lap data for this selection.</p> : <svg ref={svgRef} />}
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>#{hover.point.car}</strong> {hover.point.team ? `— ${hover.point.team}` : ''}
          </div>
          <div>
            {formatSeconds(hover.point.avg)} avg · ±{hover.point.std.toFixed(3)}s · {hover.point.laps} laps
          </div>
        </div>
      )}
    </div>
  )
}
