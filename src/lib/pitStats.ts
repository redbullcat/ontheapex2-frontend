import type { LapRead } from '../api/types'

export interface PitStats {
  pits: number
  sincePit: number | null
}

// Same in-lap/out-lap pairing convention as replay/replayData.ts's
// computePitWindows (crossing_finish_line_in_pit === 'B' paired with the
// next lap's pit_time_seconds) — duplicated rather than imported since that
// one isn't exported and is tangled up with ReplayData's other fields. Kept
// here so Live's leaderboard (which has no replay engine/time-scrubbing)
// can compute the same "Pits" / "Since pit" columns Replay's leaderboard
// already has.
export function computePitStats(laps: LapRead[]): Map<string, PitStats> {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const result = new Map<string, PitStats>()
  for (const [car, carLaps] of byCar) {
    const sorted = [...carLaps].sort((a, b) => a.lap_number - b.lap_number)
    const byLapNumber = new Map(sorted.map((l) => [l.lap_number, l]))
    let pits = 0
    let lastOutLap: number | null = null
    for (const lap of sorted) {
      if (lap.crossing_finish_line_in_pit !== 'B') continue
      const outLap = byLapNumber.get(lap.lap_number + 1)
      if (!outLap || outLap.pit_time_seconds == null || outLap.pit_time_seconds <= 0) continue
      pits++
      lastOutLap = outLap.lap_number
    }
    const currentLap = sorted[sorted.length - 1]?.lap_number ?? null
    const sincePit = lastOutLap != null && currentLap != null ? Math.max(0, currentLap - lastOutLap) : null
    result.set(car, { pits, sincePit })
  }
  return result
}
