import type { HourlyPositionEntry, HourlyPositions, LiveLap } from '../api/types'

// There's no live hourly-positions endpoint (the backend one only exists
// for promoted/historical sessions), so this reproduces the same snapshot
// shape client-side: at each completed race-hour, each car's position is
// its latest lap as of that hour, ranked by (laps completed desc, elapsed
// time asc) — the exact comparator PositionChart itself re-applies to
// whatever `position` this passes in, so getting that field "right" here
// doesn't actually matter (see PositionChart.tsx's rankedByHour).
//
// The final bucket represents "as of right now" rather than a completed
// hour boundary (cutoff clamped to the latest elapsed time seen), so this
// chart keeps advancing every poll tick instead of only updating once an
// hour.
export function computeLiveHourlyPositions(laps: LiveLap[]): HourlyPositions[] {
  let maxElapsed = 0
  for (const lap of laps) {
    if (lap.elapsed_seconds != null) maxElapsed = Math.max(maxElapsed, lap.elapsed_seconds)
  }
  if (maxElapsed <= 0) return []

  const hourCount = Math.max(1, Math.ceil(maxElapsed / 3600))
  const result: HourlyPositions[] = []

  for (let h = 1; h <= hourCount; h++) {
    const cutoff = Math.min(h * 3600, maxElapsed)
    const latestByCar = new Map<string, LiveLap>()
    for (const lap of laps) {
      if (lap.elapsed_seconds == null || lap.lap_number == null || lap.elapsed_seconds > cutoff) continue
      const prev = latestByCar.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) latestByCar.set(lap.car_number, lap)
    }

    const positions: HourlyPositionEntry[] = [...latestByCar.values()]
      .sort((a, b) => b.lap_number - a.lap_number || a.elapsed_seconds! - b.elapsed_seconds!)
      .map((lap, i) => ({
        position: i + 1,
        car_number: lap.car_number,
        team: lap.team,
        class: lap.class,
        manufacturer: lap.manufacturer,
        lap_number: lap.lap_number,
        elapsed_seconds: lap.elapsed_seconds!,
      }))

    result.push({ hour: h, positions })
  }

  return result
}
