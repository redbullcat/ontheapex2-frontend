import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getEntityColor, getTeamDisplayName } from '../lib/identityColors'
import { Select } from './Select'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 160 }
const MARGIN_LEFT_MIN = 80
const ROW_HEIGHT = 24
const ROW_GAP = 8

type Scope = 'car' | 'team' | 'manufacturer'

interface DriverStats {
  driver: string
  color: string
  laps: number
  avgPace: number
  std: number
  fastestLap: number
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

function fieldFor(scope: Scope): (lap: LapRead) => string | null {
  if (scope === 'car') return (l) => l.car_number
  if (scope === 'team') return (l) => l.team
  return (l) => l.manufacturer
}

function labelFor(scope: Scope, value: string, laps: LapRead[]): string {
  if (scope === 'team') return getTeamDisplayName(value)
  if (scope === 'car') {
    const team = laps.find((l) => l.car_number === value)?.team
    return `#${value} — ${getTeamDisplayName(team)}`
  }
  return value
}

function buildDriverStats(laps: LapRead[], topPercent: number): DriverStats[] {
  const byDriver = new Map<string, number[]>()
  for (const lap of laps) {
    if (lap.lap_time_seconds == null || !lap.driver_name) continue
    const arr = byDriver.get(lap.driver_name)
    if (arr) arr.push(lap.lap_time_seconds)
    else byDriver.set(lap.driver_name, [lap.lap_time_seconds])
  }

  const result: DriverStats[] = []
  for (const [driver, times] of byDriver) {
    // Top-N% fastest laps kept per driver for the pace/consistency figures,
    // same convention as PaceChart's "Top % of laps" filter — fastest single
    // lap always comes from every lap, unaffected by this filter.
    const sortedAll = [...times].sort((a, b) => a - b)
    const keepCount = topPercent <= 0 ? 0 : Math.max(1, Math.ceil((sortedAll.length * topPercent) / 100))
    if (keepCount === 0) continue
    const kept = sortedAll.slice(0, keepCount)
    result.push({
      driver,
      color: getEntityColor(driver),
      laps: kept.length,
      avgPace: d3.mean(kept) ?? 0,
      std: sampleStd(kept),
      fastestLap: d3.min(times) ?? 0,
    })
  }
  return result
}

function BarRow({
  title,
  data,
  format,
  filename,
  sortAsc,
}: {
  title: string
  data: { key: string; color: string; value: number; detail: string }[]
  format: (n: number) => string
  filename: string
  sortAsc: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(600)

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

  const sorted = useMemo(
    () => [...data].sort((a, b) => (sortAsc ? a.value - b.value : b.value - a.value)),
    [data, sortAsc],
  )

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (sorted.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.42))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = sorted.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    // Zoom the axis to the spread of values actually present (like PaceChart's
    // bar chart) instead of always anchoring at 0 — head-to-head differences
    // between drivers are often small relative to the absolute value (e.g.
    // 2:06.5 vs 2:07.3), so a 0-based axis would flatten every bar to
    // near-identical lengths.
    const xMin = d3.min(sorted, (d) => d.value) ?? 0
    const xMax = d3.max(sorted, (d) => d.value) ?? 1
    const pad = (xMax - xMin) * 0.1 || xMax * 0.05 || 1
    const x = d3.scaleLinear().domain([Math.max(0, xMin - pad), xMax + pad]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(sorted.map((d) => d.key))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(sorted)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => (marginLeft < MARGIN.left ? truncateLabel(d.key, marginLeft - 14) : d.key))

    g.append('g')
      .selectAll('rect')
      .data(sorted)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.key) ?? 0)
      .attr('width', (d) => Math.max(0, x(d.value)))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => d.color)

    g.append('g')
      .selectAll('text.value')
      .data(sorted)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.value) + 6)
      .attr('y', (d) => (y(d.key) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${format(d.value)}${d.detail ? ` — ${d.detail}` : ''}`)

    const xAxis = d3.axisBottom(x).ticks(5).tickFormat((d) => format(d as number)).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))
  }, [sorted, width, format])

  return (
    <div>
      <div className="chart-controls">
        <h3 className="pit-time-subheading">{title}</h3>
        <ChartExportButtons svgRef={svgRef} filename={filename} />
      </div>
      <div ref={containerRef}>
        {sorted.length === 0 ? <p className="hint">No data.</p> : <svg ref={svgRef} />}
      </div>
    </div>
  )
}

export function HeadToHeadChart({ laps }: { laps: LapRead[] }) {
  const [classValue, setClassValue] = useState('')
  const [scope, setScope] = useState<Scope>('car')
  const [entityValue, setEntityValue] = useState('')
  const [topPercentInput, setTopPercentInput] = useState('100')

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  useEffect(() => {
    if (!classValue && allClasses.length > 0) setClassValue(allClasses[0])
    else if (classValue && !allClasses.includes(classValue)) setClassValue(allClasses[0] ?? '')
  }, [allClasses, classValue])

  const classLaps = useMemo(
    () => laps.filter((l) => (l.class ?? 'Unknown') === classValue),
    [laps, classValue],
  )

  const entityOptions = useMemo(() => {
    const field = fieldFor(scope)
    const values = new Set<string>()
    for (const lap of classLaps) {
      const v = field(lap)
      if (v) values.add(v)
    }
    return [...values]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((v) => ({ value: v, label: labelFor(scope, v, classLaps) }))
  }, [classLaps, scope])

  // Reset the entity choice whenever the class or scope narrows the
  // available options out from under the current selection.
  useEffect(() => {
    if (!entityOptions.some((o) => o.value === entityValue)) setEntityValue(entityOptions[0]?.value ?? '')
  }, [entityOptions, entityValue])

  const scopedLaps = useMemo(() => {
    if (!entityValue) return []
    const field = fieldFor(scope)
    return classLaps.filter((l) => field(l) === entityValue)
  }, [classLaps, scope, entityValue])

  const topPercent = Math.max(0, Math.min(100, Number(topPercentInput) || 0))

  const driverStats = useMemo(() => buildDriverStats(scopedLaps, topPercent), [scopedLaps, topPercent])

  const carsInvolved = useMemo(() => {
    if (scope === 'car') return 1
    return new Set(scopedLaps.map((l) => l.car_number)).size
  }, [scope, scopedLaps])

  return (
    <div className="viz-root head-to-head-chart">
      <style>{`
        .head-to-head-chart {
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
          .head-to-head-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .head-to-head-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .head-to-head-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        .head-to-head-chart .h2h-stack > div + div {
          margin-top: 20px;
        }
      `}</style>
      <div className="chart-controls">
        <Select label="Class" value={classValue} onChange={setClassValue} options={allClasses.map((c) => ({ value: c, label: c }))} />
        <div className="color-mode-toggle" role="radiogroup" aria-label="Compare by">
          {(['car', 'team', 'manufacturer'] as const).map((s) => (
            <button key={s} type="button" className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <Select
          label={scope === 'car' ? 'Car' : scope === 'team' ? 'Team' : 'Manufacturer'}
          value={entityValue}
          onChange={setEntityValue}
          options={entityOptions}
        />
        <label className="top-percent">
          <span className="field-label">Top % of laps</span>
          <input type="number" min={0} max={100} value={topPercentInput} onChange={(e) => setTopPercentInput(e.target.value)} />
        </label>
      </div>

      {driverStats.length === 0 ? (
        <p className="hint">No driver lap data for this selection.</p>
      ) : (
        <>
          {scope !== 'car' && (
            <p className="hint">
              Comparing {driverStats.length} driver{driverStats.length === 1 ? '' : 's'} across {carsInvolved} car
              {carsInvolved === 1 ? '' : 's'} for this {scope}.
            </p>
          )}
          {topPercent < 100 && (
            <p className="hint">
              Top % of laps applies to average pace and consistency below — fastest single lap always uses every lap.
            </p>
          )}
          <div className="h2h-stack">
            <BarRow
              title="Average pace"
              data={driverStats.map((d) => ({ key: d.driver, color: d.color, value: d.avgPace, detail: `${d.laps} laps` }))}
              format={formatSeconds}
              filename="h2h_pace"
              sortAsc
            />
            <BarRow
              title="Consistency (std dev)"
              data={driverStats.map((d) => ({ key: d.driver, color: d.color, value: d.std, detail: '' }))}
              format={(s) => `${s.toFixed(3)}s`}
              filename="h2h_consistency"
              sortAsc
            />
            <BarRow
              title="Fastest single lap"
              data={driverStats.map((d) => ({ key: d.driver, color: d.color, value: d.fastestLap, detail: '' }))}
              format={formatSeconds}
              filename="h2h_fastest_lap"
              sortAsc
            />
          </div>
        </>
      )}
    </div>
  )
}
