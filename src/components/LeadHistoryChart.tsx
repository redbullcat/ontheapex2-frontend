import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LeadStint } from '../api/types'
import { ChartExportButtons } from './ChartExportButtons'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'

const MARGIN = { top: 8, right: 16, bottom: 32, left: 16 }
const BAR_HEIGHT = 48
const GAP = 2

interface TooltipState {
  x: number
  y: number
  stint: LeadStint
}

export function LeadHistoryChart({ stints }: { stints: LeadStint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
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

  // Team livery colors, same convention as every other chart's colorMode
  // 'team' (see lib/identityColors — a real per-team lookup table plus a
  // hash-based fallback for anything not in it, so this never runs out of
  // distinct colors or has to fall back to a shared "other" gray the way a
  // fixed 8-slot categorical palette does. Also picks up any custom team
  // color the user has set in Settings, same as everywhere else.
  const carTeam = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const s of stints) if (!map.has(s.car_number)) map.set(s.car_number, s.team)
    return map
  }, [stints])

  const carColor = useMemo(() => {
    const scale = new Map<string, string>()
    for (const [car, team] of carTeam) scale.set(car, getTeamColor(team))
    return scale
  }, [carTeam])

  // Legend lists every car that led (most laps led first) — no palette
  // limit to cap it at anymore.
  const legendCars = useMemo(() => {
    const lapsLedByCar = new Map<string, number>()
    for (const s of stints) lapsLedByCar.set(s.car_number, (lapsLedByCar.get(s.car_number) ?? 0) + s.laps_led)
    return [...lapsLedByCar.entries()].sort((a, b) => b[1] - a[1]).map(([car]) => car)
  }, [stints])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (stints.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const height = BAR_HEIGHT + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const lapMin = d3.min(stints, (d) => d.start_lap) ?? 0
    const lapMax = d3.max(stints, (d) => d.end_lap) ?? 1
    const x = d3.scaleLinear().domain([lapMin, lapMax]).range([0, innerWidth])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const clipId = 'lead-history-clip'
    g.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', BAR_HEIGHT)
      .attr('rx', 4)
      .attr('ry', 4)

    const segments = g.append('g').attr('clip-path', `url(#${clipId})`)

    segments
      .selectAll('rect')
      .data(stints)
      .join('rect')
      .attr('x', (d) => x(d.start_lap))
      .attr('y', 0)
      .attr('width', (d) => Math.max(0, x(d.end_lap) - x(d.start_lap) - GAP))
      .attr('height', BAR_HEIGHT)
      .attr('fill', (d) => carColor.get(d.car_number) ?? getTeamColor(d.team))
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent, d) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, stint: d })
      })
      .on('mouseleave', () => setTooltip(null))

    // Direct labels: only inside segments wide enough to hold the car number comfortably.
    segments
      .selectAll('text')
      .data(stints)
      .join('text')
      .attr('x', (d) => (x(d.start_lap) + x(d.end_lap) - GAP) / 2)
      .attr('y', BAR_HEIGHT / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#ffffff')
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .text((d) => `#${d.car_number}`)
      .each(function (d) {
        const segWidth = x(d.end_lap) - x(d.start_lap) - GAP
        const textWidth = (this as SVGTextElement).getBBox().width
        if (textWidth + 12 > segWidth) d3.select(this).remove()
      })

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.floor(innerWidth / 80)))
      .tickFormat((d) => `Lap ${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${BAR_HEIGHT + 8})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', '#c3c2b7'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', '#e1e0d9'))
      .call((sel) =>
        sel
          .selectAll('.tick text')
          .attr('fill', '#898781')
          .attr('font-size', 11),
      )
  }, [stints, width, carColor])

  return (
    <div className="viz-root lead-history" ref={containerRef}>
      <style>{`
        .lead-history {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          position: relative;
          background: var(--surface-1);
        }
        @media (prefers-color-scheme: dark) {
          .lead-history {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
          }
        }
        :root[data-theme='dark'] .lead-history {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
        }
        :root[data-theme='light'] .lead-history {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          position: relative;
          background: var(--surface-1);
        }
        .lead-history .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .lead-history .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lead-history .swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex: none;
        }
        .lead-history .tooltip {
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
      <div className="chart-controls">
        <div className="legend">
          {legendCars.map((car) => (
            <div className="legend-item" key={car}>
              <span className="swatch" style={{ background: carColor.get(car) }} />
              <span>
                #{car} — {getTeamDisplayName(carTeam.get(car) ?? null)}
              </span>
            </div>
          ))}
        </div>
        <ChartExportButtons svgRef={svgRef} filename="lead_history" />
      </div>
      <svg ref={svgRef} />
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>#{tooltip.stint.car_number}</strong>
            {tooltip.stint.team ? ` — ${getTeamDisplayName(tooltip.stint.team)}` : ''}
          </div>
          <div>
            Laps {tooltip.stint.start_lap}–{tooltip.stint.end_lap}
            {tooltip.stint.drivers ? ` · ${tooltip.stint.drivers}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
