import { computeFlagPeriods, type FlagCategory } from './flags'

interface FlagEventLapLike {
  lap_number: number
  flag_at_fl: string | null
  elapsed_seconds: number | null
}

export interface FlagEvent {
  category: FlagCategory
  // 1-based count of this category so far this session — "FCY #2", "SC #1".
  occurrence: number
  startLap: number
  endLap: number
  // Earliest/latest elapsed_seconds recorded for the start/end lap numbers
  // across all cars — an approximation of when the period began/ended in
  // race time, since the flag itself isn't tied to one specific car.
  startElapsedSeconds: number | null
  endElapsedSeconds: number | null
}

// Every non-green flag period (FCY, safety car, red flag) this session,
// numbered per category, for the race-notes timeline to surface as its own
// full-width row — see RaceNotesPanel.
export function computeFlagEvents<T extends FlagEventLapLike>(laps: T[]): FlagEvent[] {
  const periods = computeFlagPeriods(laps).filter((p) => p.category !== 'green')

  const elapsedByLap = new Map<number, number[]>()
  for (const lap of laps) {
    if (lap.elapsed_seconds == null) continue
    const arr = elapsedByLap.get(lap.lap_number)
    if (arr) arr.push(lap.elapsed_seconds)
    else elapsedByLap.set(lap.lap_number, [lap.elapsed_seconds])
  }

  const counts = new Map<FlagCategory, number>()
  return periods.map((p) => {
    const occurrence = (counts.get(p.category) ?? 0) + 1
    counts.set(p.category, occurrence)
    const startTimes = elapsedByLap.get(p.startLap) ?? []
    const endTimes = elapsedByLap.get(p.endLap) ?? []
    return {
      category: p.category,
      occurrence,
      startLap: p.startLap,
      endLap: p.endLap,
      startElapsedSeconds: startTimes.length ? Math.min(...startTimes) : null,
      endElapsedSeconds: endTimes.length ? Math.max(...endTimes) : null,
    }
  })
}
