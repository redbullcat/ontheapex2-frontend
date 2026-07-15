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
import { useResponsiveWidth } from '../hooks/useResponsiveWidth'

const MARGIN = { top: 8, right: 56, bottom: 24, left: 160 }
const MARGIN_LEFT_MIN = 80
const ROW_HEIGHT = 22
const ROW_GAP = 6

function formatSeconds(s: number): string {
  const sign = s < 0 ? '-' : ''
  return `${sign}${Math.abs(s).toFixed(1)}s`
}

// One faceted bar panel for a single pit-stop round — bars ordered by lap
// (earliest stopper at top, latest at bottom), same visual language as
// PitTimeChart's average-loss bars just scoped to this round's stops.
function RoundPanel({
  round,
  stops,
  forcedWidth,
  onRendered,
}: {
  round: number
  stops: PitStop[]
  forcedWidth?: number
  onRendered?: (svg: SVGSVGElement) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useResponsiveWidth(containerRef, forcedWidth)

  // Ordered by lap ascending — the car that stopped earliest in this round
  // at top, working down to the latest stopper.
  const ordered = useMemo(() => [...stops].sort((a, b) => a.lap - b.lap), [stops])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (ordered.length === 0 || width === 0) return

    const marginLeft = Math.max(MARGIN_LEFT_MIN, Math.min(MARGIN.left, width * 0.38))
    const innerWidth = width - marginLeft - MARGIN.right
    const plotHeight = ordered.length * (ROW_HEIGHT + ROW_GAP)
    const height = plotHeight + MARGIN.top + MARGIN.bottom
    svg.attr('width', width).attr('height', height)

    const x = d3
      .scaleLinear()
      .domain([0, Math.max(1, (d3.max(ordered, (d) => d.lossSeconds) ?? 1) * 1.1)])
      .range([0, innerWidth])
    const y = d3
      .scaleBand()
      .domain(ordered.map((d) => `${d.car}-${d.lap}`))
      .range([0, plotHeight])
      .paddingInner(ROW_GAP / (ROW_HEIGHT + ROW_GAP))

    const g = svg.append('g').attr('transform', `translate(${marginLeft},${MARGIN.top})`)

    g.append('g')
      .selectAll('text')
      .data(ordered)
      .join('text')
      .attr('x', -10)
      .attr('y', (d) => (y(`${d.car}-${d.lap}`) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 12)
      .text((d) => {
        const label = `#${d.car} — ${getTeamDisplayName(d.team)}`
        return truncateLabel(label, marginLeft - 14)
      })

    g.append('g')
      .selectAll('rect')
      .data(ordered)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(`${d.car}-${d.lap}`) ?? 0)
      .attr('width', (d) => Math.max(0, x(Math.max(0, d.lossSeconds))))
      .attr('height', ROW_HEIGHT)
      .attr('rx', 4)
      .attr('fill', (d) => getTeamColor(d.team))
      .append('title')
      .text(
        (d) =>
          `#${d.car} — ${getTeamDisplayName(d.team)} — lap ${d.lap} — ${formatSeconds(d.lossSeconds)}${d.vftAtPit != null ? ` — VFT ${d.vftAtPit.toFixed(0)}%` : ''}`,
      )

    g.append('g')
      .selectAll('text.value')
      .data(ordered)
      .join('text')
      .attr('class', 'value')
      .attr('x', (d) => x(Math.max(0, d.lossSeconds)) + 6)
      .attr('y', (d) => (y(`${d.car}-${d.lap}`) ?? 0) + ROW_HEIGHT / 2)
      .attr('dominant-baseline', 'central')
      .attr('fill', 'var(--text-secondary)')
      .attr('font-size', 11)
      .text((d) => `${formatSeconds(d.lossSeconds)}, lap ${d.lap}`)

    const xAxis = d3.axisBottom(x).ticks(5).tickFormat((d) => `${d}s`).tickSizeOuter(0)
    g.append('g')
      .attr('transform', `translate(0,${plotHeight})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', 'var(--axis)'))
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10))

    if (svgRef.current) onRendered?.(svgRef.current)
  }, [ordered, width, onRendered])

  return (
    <div className="pit-round-panel">
      <div className="chart-controls">
        <h3 className="pit-time-subheading">Stop {round}</h3>
        <ChartExportButtons
          svgRef={svgRef}
          filename={`pit_round_${round}`}
          renderChart={(w, onReady) => (
            <RoundPanel round={round} stops={stops} forcedWidth={w} onRendered={onReady} />
          )}
        />
      </div>
      <div ref={containerRef}>
        <svg ref={svgRef} />
      </div>
    </div>
  )
}

export function PitRoundsChart({ laps }: { laps: LapRead[] }) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [selectedRound, setSelectedRound] = useState<number | null>(null)

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

  const rounds = useMemo(() => {
    const byRound = new Map<number, PitStop[]>()
    for (const s of stops) {
      const arr = byRound.get(s.round)
      if (arr) arr.push(s)
      else byRound.set(s.round, [s])
    }
    return [...byRound.entries()].sort(([a], [b]) => a - b)
  }, [stops])

  // Reset to the first round whenever the round list changes shape (e.g. a
  // class filter removes the currently-selected round entirely).
  const roundNumbers = useMemo(() => rounds.map(([round]) => round), [rounds])
  const activeRound = selectedRound != null && roundNumbers.includes(selectedRound) ? selectedRound : (roundNumbers[0] ?? null)
  const activeRoundStops = rounds.find(([round]) => round === activeRound)?.[1] ?? []

  return (
    <div className="viz-root pit-time-chart">
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
        .pit-round-tabs {
          margin-bottom: 8px;
        }
      `}</style>
      <CollapsibleFilters>
        <div className="chart-controls">
          <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
        </div>
      </CollapsibleFilters>
      {rounds.length === 0 ? (
        <p className="hint">No pit stop data for this selection.</p>
      ) : (
        <>
          <div className="color-mode-toggle pit-round-tabs" role="tablist" aria-label="Pit stop round">
            {roundNumbers.map((round) => (
              <button
                key={round}
                type="button"
                role="tab"
                aria-selected={round === activeRound}
                className={round === activeRound ? 'active' : ''}
                onClick={() => setSelectedRound(round)}
              >
                Stop {round}
              </button>
            ))}
          </div>
          {activeRound != null && <RoundPanel round={activeRound} stops={activeRoundStops} />}
        </>
      )}
    </div>
  )
}
