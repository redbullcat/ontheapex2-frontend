import { useMemo } from 'react'
import type { LiveLap } from '../api/types'
import { PositionChart } from '../components/PositionChart'
import { computeLiveHourlyPositions } from './liveHourlyPositions'

// PositionChart already has everything "hourly results, with options for
// class and hour" needs — a class filter, a car filter, and an hour axis
// you hover to read exact standings — so this just feeds it a live-computed
// snapshot instead of the historical hourly-positions endpoint (which only
// exists for promoted sessions).
export function LiveHourlyResultsPanel({ laps }: { laps: LiveLap[] }) {
  const hourly = useMemo(() => computeLiveHourlyPositions(laps), [laps])

  if (hourly.length === 0) {
    return <p className="replay-hint">No hourly results yet — check back after the first hour.</p>
  }

  return <PositionChart data={hourly} />
}
