import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { computeFlagPeriods, FLAG_COLORS, FLAG_LABELS, type FlagPeriod } from '../lib/flags'
import { ChartExportButtons } from './ChartExportButtons'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 16, bottom: 32, left: 16 }
const BAR_HEIGHT = 40

interface TooltipState {
  x: number
  y: number
  period: FlagPeriod
}

export function FlagGanttChart({
  laps,
  forcedWidth,
  onRendered,
}: {
  laps: LapRead[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const periods = useMemo(() => computeFlagPeriods(laps), [laps])
  const legendCategories = useMemo(
    () => [...new Set(periods.map((p) => p.category))].sort(),
    [periods],
  )

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (periods.length === 0 || width === 0) return

    const innerWidth = width - MARGIN.left - MARGIN.right
    const height = BAR_HEIGHT + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const lapMin = d3.min(periods, (d) => d.startLap) ?? 0
    const lapMax = d3.max(periods, (d) => d.endLap) ?? 1
    const x = d3.scaleLinear().domain([lapMin, lapMax + 1]).range([0, innerWidth])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    g.append('g')
      .selectAll('rect')
      .data(periods)
      .join('rect')
      .attr('x', (d) => x(d.startLap))
      .attr('y', 0)
      .attr('width', (d) => Math.max(0, x(d.endLap + 1) - x(d.startLap) - 1))
      .attr('height', BAR_HEIGHT)
      .attr('rx', 3)
      .attr('fill', (d) => FLAG_COLORS[d.category])
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent, d) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, period: d })
      })
      .on('mouseleave', () => setTooltip(null))

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.floor(innerWidth / 80)))
      .tickFormat((d) => `Lap ${d}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${BAR_HEIGHT + 8})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--grid)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [periods, width, onRendered])

  return (
    <div className="viz-root flag-gantt-chart" ref={containerRef}>
      <style>{`
        .flag-gantt-chart {
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
          .flag-gantt-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .flag-gantt-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .flag-gantt-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
        }
        .flag-gantt-chart .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .flag-gantt-chart .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .flag-gantt-chart .swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex: none;
        }
        .flag-gantt-chart .tooltip {
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
          {legendCategories.map((cat) => (
            <div className="legend-item" key={cat}>
              <span className="swatch" style={{ background: FLAG_COLORS[cat] }} />
              <span>{FLAG_LABELS[cat]}</span>
            </div>
          ))}
        </div>
        <ChartExportButtons
          svgRef={svgRef}
          filename="flag_periods"
          renderChart={(w, onReady) => <FlagGanttChart laps={laps} forcedWidth={w} onRendered={onReady} />}
        />
      </div>
      {periods.length === 0 ? (
        <p className="hint">No flag data for this session.</p>
      ) : (
        <svg ref={svgRef} />
      )}
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div>
            <strong>{FLAG_LABELS[tooltip.period.category]}</strong>
          </div>
          <div>
            Laps {tooltip.period.startLap}–{tooltip.period.endLap}
          </div>
        </div>
      )}
    </div>
  )
}
