import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { WeatherReading } from '../api/types'
import { ChartExportButtons } from './ChartExportButtons'
import { formatClock } from '../replay/format'

const MARGIN = { top: 8, right: 16, bottom: 28, left: 48 }
const PANEL_HEIGHT = 140
const PANEL_GAP = 28

interface Series {
  key: string
  label: string
  color: string
  unit: string
  points: { x: number; y: number }[]
  formatValue: (v: number) => string
}

interface HoverState {
  x: number
  y: number
  elapsedSeconds: number
  values: { label: string; color: string; text: string }[]
}

// One axis per panel (never a shared/dual axis across different units) —
// track/air temp share °C so those two live on one panel together; wind
// speed, humidity, and pressure each get their own since none of those
// units are comparable to another.
function buildSeries(readings: WeatherReading[]): { panels: { title: string; series: Series[] }[] } {
  const withElapsed = readings.filter((r) => r.elapsed_seconds != null) as (WeatherReading & { elapsed_seconds: number })[]
  const sorted = [...withElapsed].sort((a, b) => a.elapsed_seconds - b.elapsed_seconds)

  const seriesFor = (
    key: keyof WeatherReading,
    label: string,
    color: string,
    unit: string,
    formatValue: (v: number) => string = (v) => `${v.toFixed(1)}${unit}`,
  ): Series => ({
    key,
    label,
    color,
    unit,
    formatValue,
    points: sorted
      .map((r) => ({ x: r.elapsed_seconds, y: r[key] as number | null }))
      .filter((p): p is { x: number; y: number } => p.y != null),
  })

  return {
    panels: [
      {
        title: 'Temperature',
        series: [
          seriesFor('track_temperature', 'Track', '#e0722e', '°C'),
          seriesFor('air_temperature', 'Air', '#3f7fbf', '°C'),
        ],
      },
      { title: 'Wind speed', series: [seriesFor('wind_speed_kph', 'Wind speed', '#4a9d6e', ' kph')] },
      { title: 'Humidity', series: [seriesFor('humidity', 'Humidity', '#7a6bc4', '%')] },
      { title: 'Pressure', series: [seriesFor('pressure', 'Pressure', '#b0754f', ' mbar')] },
    ].filter((panel) => panel.series.some((s) => s.points.length > 0)),
  }
}

function Panel({
  title,
  series,
  width,
  maxElapsed,
  onHover,
  forcedWidth,
  onRendered,
}: {
  title: string
  series: Series[]
  width: number
  maxElapsed: number
  onHover: (state: HoverState | null) => void
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Panel has no container of its own to measure — its width is driven by
  // the parent WeatherChart's ResizeObserver and passed down as a prop, so
  // (unlike every other chart here) there's no useResponsiveWidth/containerRef
  // to plug forcedWidth into. Just override the prop directly instead.
  const effectiveWidth = forcedWidth ?? width

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (effectiveWidth === 0 || series.every((s) => s.points.length === 0)) return

    const innerWidth = Math.max(0, effectiveWidth - MARGIN.left - MARGIN.right)
    const innerHeight = PANEL_HEIGHT - MARGIN.top - MARGIN.bottom
    svg.attr('width', effectiveWidth).attr('height', PANEL_HEIGHT)

    const allPoints = series.flatMap((s) => s.points)
    const yMin = d3.min(allPoints, (p) => p.y) ?? 0
    const yMax = d3.max(allPoints, (p) => p.y) ?? 1
    const pad = (yMax - yMin) * 0.15 || 1

    const x = d3.scaleLinear().domain([0, maxElapsed]).range([0, innerWidth])
    const y = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const yTicks = y.ticks(4)
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d))
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 1)

    const line = d3
      .line<{ x: number; y: number }>()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveMonotoneX)

    for (const s of series) {
      g.append('path')
        .datum(s.points)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 2)
        .attr('d', line)
    }

    const xAxis = d3
      .axisBottom(x)
      .ticks(Math.max(2, Math.floor(innerWidth / 90)))
      .tickFormat((d) => formatClock(d as number))
      .tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10))

    const yAxis = d3.axisLeft(y).tickValues(yTicks).tickFormat((d) => (d as number).toFixed(0)).tickSizeOuter(0)
    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10))

    const overlay = g
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')

    const bisect = d3.bisector<{ x: number; y: number }, number>((d) => d.x).left

    overlay
      .on('mousemove', (event: MouseEvent) => {
        const [mx, my] = d3.pointer(event, g.node())
        const elapsed = x.invert(mx)
        const values: HoverState['values'] = []
        for (const s of series) {
          if (s.points.length === 0) continue
          const idx = bisect(s.points, elapsed)
          const point = s.points[Math.min(idx, s.points.length - 1)]
          if (!point) continue
          values.push({ label: s.label, color: s.color, text: s.formatValue(point.y) })
        }
        const rect = (svgRef.current?.parentElement as HTMLElement)?.getBoundingClientRect()
        onHover({
          x: (rect ? event.clientX - rect.left : mx + MARGIN.left),
          y: my + MARGIN.top,
          elapsedSeconds: elapsed,
          values,
        })
      })
      .on('mouseleave', () => onHover(null))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [series, effectiveWidth, maxElapsed, onHover, onRendered])

  return (
    <div className="weather-panel">
      <div className="weather-panel-header">
        <span className="weather-panel-title">{title}</span>
        <span className="weather-panel-legend">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.key} className="weather-legend-item">
                <span className="weather-swatch" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          <ChartExportButtons
            svgRef={svgRef}
            filename={`weather_${title.toLowerCase().replace(/\s+/g, '_')}`}
            renderChart={(w, onReady) => (
              <Panel
                title={title}
                series={series}
                width={width}
                maxElapsed={maxElapsed}
                onHover={onHover}
                forcedWidth={w}
                onRendered={onReady}
              />
            )}
          />
        </span>
      </div>
      <svg ref={svgRef} />
    </div>
  )
}

export function WeatherChart({ readings }: { readings: WeatherReading[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
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

  const { panels } = useMemo(() => buildSeries(readings), [readings])

  const maxElapsed = useMemo(() => {
    let max = 0
    for (const r of readings) {
      if (r.elapsed_seconds != null) max = Math.max(max, r.elapsed_seconds)
    }
    return max || 1
  }, [readings])

  return (
    <div className="viz-root weather-chart" ref={containerRef}>
      <style>{`
        .weather-chart {
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
          .weather-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #383835; }
        }
        :root[data-theme='dark'] .weather-chart { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #898781; --grid: #2c2c2a; --axis: #383835; }
        :root[data-theme='light'] .weather-chart { --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; }
        .weather-chart .weather-panel { margin-bottom: ${PANEL_GAP}px; }
        .weather-chart .weather-panel-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
        .weather-chart .weather-panel-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
        .weather-chart .weather-panel-legend { display: flex; gap: 12px; font-size: 11px; color: var(--text-secondary); }
        .weather-chart .weather-legend-item { display: flex; align-items: center; gap: 4px; }
        .weather-chart .weather-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
        .weather-chart .tooltip {
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
      `}</style>
      {panels.length === 0 ? (
        <p className="hint">No weather data for this session.</p>
      ) : (
        panels.map((panel) => (
          <Panel key={panel.title} title={panel.title} series={panel.series} width={width} maxElapsed={maxElapsed} onHover={setHover} />
        ))
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div>
            <strong>{formatClock(hover.elapsedSeconds)}</strong>
          </div>
          {hover.values.map((v) => (
            <div key={v.label}>
              <span className="weather-swatch" style={{ background: v.color, display: 'inline-block', marginRight: 6 }} />
              {v.label}: {v.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
