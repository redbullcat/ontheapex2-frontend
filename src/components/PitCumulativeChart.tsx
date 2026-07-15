import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { ChartExportButtons } from './ChartExportButtons'
import { truncateLabel } from '../lib/textTruncate'
import { computePitStops, type PitStop } from './PitTimeChart'
import { CollapsibleFilters } from './CollapsibleFilters'
import { EntityFilter, type EntityOption } from './EntityFilter'
import type { EntitySelection } from '../lib/entitySelection'
import { resolveEntitySelection } from '../lib/entitySelection'
import { contrastTextColorForColor } from '../lib/contrastColor'
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 56, bottom: 32, left: 160 }
const MARGIN_LEFT_MIN = 80
const ROW_HEIGHT = 26
const ROW_GAP = 8

// Six visually distinct hatch styles, cycled per round so a 7th+ round
// round-trips back to "+" — round identity stays legible even though the
// underlying fill (team color) repeats. Each bar's stroke is whichever of
// black/white contrasts with its own team color.
//
// Drawn as a single tiled <path> (one moveto/lineto pair per tile,
// concatenated) clipped to the segment's rect, not an SVG <pattern> fill —
// patterns (and, separately, mix-blend-mode) both render fine in-browser
// but Figma's SVG importer doesn't reliably support either, and flattens
// them to solid color blocks on import. A plain path + <clipPath> is the
// safe subset any SVG-import tool actually handles. Earlier this was one
// <line> element per tile-stroke, which produced megabyte-plus exports for
// a handful of cars — collapsing every stroke into one path's `d` string
// keeps the same visual density at a fraction of the DOM/file size.
type TextureKind = 'plus' | 'diag' | 'horiz' | 'diagBack' | 'cross' | 'dot'
const TEXTURE_CYCLE: TextureKind[] = ['plus', 'diag', 'horiz', 'diagBack', 'cross', 'dot']
const TEXTURE_GLYPH: Record<TextureKind, string> = {
  plus: '+',
  diag: '/',
  horiz: '=',
  diagBack: '\\',
  cross: 'x',
  dot: '.',
}
const TILE = 8

function textureForRound(round: number): TextureKind {
  return TEXTURE_CYCLE[(round - 1) % TEXTURE_CYCLE.length]
}

// Builds the tiled texture as path segments (moveto/lineto pairs, one tile's
// worth of strokes appended per iteration) plus a separate list of dot
// centers for the one pattern kind that isn't stroke-based.
function buildTexture(x0: number, w: number, h: number, kind: TextureKind): { path: string; dots: [number, number][] } {
  const half = TILE / 2
  const cols = Math.ceil(w / TILE) + 1
  const rows = Math.ceil(h / TILE) + 1
  const segments: string[] = []
  const dots: [number, number][] = []
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const tx = x0 + cx * TILE
      const ty = cy * TILE
      const seg = (x1: number, y1: number, x2: number, y2: number) =>
        segments.push(`M${tx + x1},${ty + y1}L${tx + x2},${ty + y2}`)
      switch (kind) {
        case 'plus':
          seg(half, 0, half, TILE)
          seg(0, half, TILE, half)
          break
        case 'diag':
          seg(0, TILE, TILE, 0)
          break
        case 'horiz':
          seg(0, TILE * 0.3, TILE, TILE * 0.3)
          seg(0, TILE * 0.75, TILE, TILE * 0.75)
          break
        case 'diagBack':
          seg(0, 0, TILE, TILE)
          break
        case 'cross':
          seg(0, 0, TILE, TILE)
          seg(0, TILE, TILE, 0)
          break
        case 'dot':
          dots.push([tx + half, ty + half])
          break
      }
    }
  }
  return { path: segments.join(''), dots }
}

// Tiles `kind` across [x0, x0+w) x [0, h), clipped to that exact rect so
// partial tiles at the edges don't spill outside the segment.
function appendTiledTexture(
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  row: d3.Selection<SVGGElement, unknown, null, undefined>,
  clipId: string,
  x0: number,
  w: number,
  h: number,
  kind: TextureKind,
  stroke: string,
) {
  defs.append('clipPath').attr('id', clipId).append('rect').attr('x', x0).attr('y', 0).attr('width', w).attr('height', h)
  const g = row.append('g').attr('clip-path', `url(#${clipId})`).attr('pointer-events', 'none')
  const { path, dots } = buildTexture(x0, w, h, kind)
  if (path) {
    g.append('path').attr('d', path).attr('fill', 'none').attr('stroke', stroke).attr('stroke-width', 1.1).attr('stroke-linecap', 'square').attr('stroke-opacity', 0.55)
  }
  for (const [cx, cy] of dots) {
    g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 1.3).attr('fill', stroke).attr('fill-opacity', 0.55)
  }
}

function formatSeconds(s: number): string {
  const sign = s < 0 ? '-' : ''
  return `${sign}${Math.abs(s).toFixed(1)}s`
}

interface CarTotal {
  car: string
  team: string | null
  segments: PitStop[]
  total: number
}

export function PitCumulativeChart({
  laps,
  forcedWidth,
  onRendered,
  initialClassSelection,
  initialCarSelection,
}: {
  laps: LapRead[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
  initialClassSelection?: ClassSelection
  initialCarSelection?: EntitySelection
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)
  const [classSelection, setClassSelection] = useState<ClassSelection>(initialClassSelection ?? null)
  const [carSelection, setCarSelection] = useState<EntitySelection>(initialCarSelection ?? null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const stops = useMemo(() => computePitStops(laps, activeClasses), [laps, activeClasses])

  const maxRound = useMemo(() => stops.reduce((m, s) => Math.max(m, s.round), 0), [stops])

  const carOptions: EntityOption[] = useMemo(() => {
    const byCar = new Map<string, string | null>()
    for (const s of stops) if (!byCar.has(s.car)) byCar.set(s.car, s.team)
    return [...byCar.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([car, team]) => ({ id: car, label: `#${car} — ${getTeamDisplayName(team)}` }))
  }, [stops])

  const activeCars = useMemo(
    () => resolveEntitySelection(carSelection, carOptions.map((c) => c.id)),
    [carSelection, carOptions],
  )

  const carTotals = useMemo(() => {
    const byCar = new Map<string, PitStop[]>()
    for (const s of stops) {
      if (!activeCars.has(s.car)) continue
      const arr = byCar.get(s.car)
      if (arr) arr.push(s)
      else byCar.set(s.car, [s])
    }
    const result: CarTotal[] = []
    for (const [car, segments] of byCar) {
      const ordered = [...segments].sort((a, b) => a.round - b.round)
      result.push({
        car,
        team: ordered[0].team,
        segments: ordered,
        total: ordered.reduce((sum, s) => sum + Math.max(0, s.lossSeconds), 0),
      })
    }
    return result.sort((a, b) => a.total - b.total)
  }, [stops, activeCars])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (carTotals.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.38))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = carTotals.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const defs = svg.append('defs')

    const x = d3.scaleLinear().domain([0, (d3.max(carTotals, (d) => d.total) ?? 1) * 1.08]).range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(carTotals.map((d) => d.car))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(carTotals)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => {
        const label = `#${d.car} — ${getTeamDisplayName(d.team)}`
        return truncateLabel(label, marginLeft - 14)
      })

    const rows = g
      .append('g')
      .selectAll('g.row')
      .data(carTotals)
      .join('g')
      .attr('class', 'row')
      .attr('transform', (d) => `translate(0,${y(d.car) ?? 0})`)

    // Segments stacked in round order (earliest stop nearest the axis),
    // color = team identity, texture = which round.
    rows.each(function (d) {
      let cursor = 0
      const row = d3.select(this)
      for (const seg of d.segments) {
        const w = Math.max(0, x(cursor + Math.max(0, seg.lossSeconds)) - x(cursor))
        const teamColor = getTeamColor(seg.team)
        row
          .append('rect')
          .attr('x', x(cursor))
          .attr('y', 0)
          .attr('width', w)
          .attr('height', ROW_HEIGHT)
          .attr('fill', teamColor)
          .append('title')
          .text(
            `#${seg.car} — stop ${seg.round} (lap ${seg.lap}): ${formatSeconds(seg.lossSeconds)}${seg.vftAtPit != null ? ` — VFT ${seg.vftAtPit.toFixed(0)}%` : ''}`,
          )
        if (w > 0) {
          const stroke = contrastTextColorForColor(teamColor)
          appendTiledTexture(
            defs,
            row as d3.Selection<SVGGElement, unknown, null, undefined>,
            `pit-cum-clip-${d.car}-${seg.round}`,
            x(cursor),
            w,
            ROW_HEIGHT,
            textureForRound(seg.round),
            stroke,
          )
        }
        cursor += Math.max(0, seg.lossSeconds)
      }
      row
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', Math.max(0, x(cursor)))
        .attr('height', ROW_HEIGHT)
        .attr('rx', 4)
        .attr('fill', 'none')
        .attr('stroke', 'var(--surface-1)')
        .attr('stroke-width', 1)
    })

    g.append('g')
      .selectAll('text.value')
      .data(carTotals)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(d.total) + 6)
      .attr('y', (d) => (y(d.car) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${formatSeconds(d.total)} total (${d.segments.length} stops)`)

    const xAxis = d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 11))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [carTotals, width, maxRound, onRendered])

  const legendRounds = useMemo(() => Array.from({ length: Math.max(0, maxRound) }, (_, i) => i + 1), [maxRound])

  return (
    <div className="viz-root pit-time-chart" ref={containerRef}>
      <style>{`
        .pit-time-chart {
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
          .pit-time-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
          }
        }
        :root[data-theme='dark'] .pit-time-chart {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --grid: #2c2c2a;
            --axis: #383835;
        }
        :root[data-theme='light'] .pit-time-chart {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --grid: #e1e0d9;
          --axis: #c3c2b7;
          position: relative;
          background: var(--surface-1);
        }
        .pit-round-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin: 4px 0 12px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .pit-round-legend-item {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .pit-round-legend-swatch {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 3px;
          background: var(--text-muted);
          text-align: center;
          line-height: 14px;
          font-size: 10px;
          color: var(--surface-1);
          font-weight: 700;
        }
      `}</style>
      <CollapsibleFilters
        actions={
          <ChartExportButtons
            svgRef={svgRef}
            filename="pit_cumulative"
            renderChart={(w, onReady) => (
              <PitCumulativeChart
                laps={laps}
                forcedWidth={w}
                onRendered={onReady}
                initialClassSelection={classSelection}
                initialCarSelection={carSelection}
              />
            )}
          />
        }
      >
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        </div>
        <div className="chart-controls">
          <EntityFilter
            items={carOptions}
            selection={carSelection}
            onChange={setCarSelection}
            addLabel="Add car"
            resetLabel="Show all cars"
          />
        </div>
      </CollapsibleFilters>
      {legendRounds.length > 0 && (
        <div className="pit-round-legend">
          {legendRounds.map((round) => (
            <span className="pit-round-legend-item" key={round}>
              <span className="pit-round-legend-swatch">{TEXTURE_GLYPH[textureForRound(round)]}</span>
              Stop {round}
            </span>
          ))}
        </div>
      )}
      {carTotals.length === 0 ? <p className="hint">No pit stop data for this selection.</p> : <svg ref={svgRef} />}
    </div>
  )
}
