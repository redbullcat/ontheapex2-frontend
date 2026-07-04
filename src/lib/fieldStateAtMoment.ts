interface LapLike {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
  class: string | null
  team: string | null
  driver_name: string | null
}

export interface CarStateAtMoment {
  car_number: string
  class: string | null
  team: string | null
  driver_name: string | null
  lapNumber: number
  // Running order at this moment, 1-based — overall and within-class.
  position: number
  classPosition: number
  // Field sizes at this same moment, so a position can be shown as "P1/17"
  // rather than a bare number.
  totalCars: number
  totalInClass: number
}

// Reconstructs "who's where" as of a given elapsed-seconds cutoff (or every
// lap given, if the cutoff is null — i.e. "right now") by taking each car's
// most recent lap at/before the cutoff and ranking by race progress: more
// laps completed always outranks fewer, and only cars tied on lap count are
// broken by elapsed time — same priority replayEngine.ts's isAhead() uses
// for the live leaderboard's own position field. Ranking by elapsed_seconds
// alone (ascending) is wrong here: a leader who's completed more laps has
// necessarily run for *longer* (a bigger elapsed_seconds sum) than a
// back-marker on fewer laps, so that naive comparison ranks the back-marker
// ahead of the actual leader.
export function computeFieldStateAtMoment(laps: LapLike[], elapsedCutoff: number | null): CarStateAtMoment[] {
  const latestByCar = new Map<string, LapLike>()
  for (const lap of laps) {
    if (lap.elapsed_seconds == null) continue
    if (elapsedCutoff != null && lap.elapsed_seconds > elapsedCutoff) continue
    const prev = latestByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) latestByCar.set(lap.car_number, lap)
  }
  const rows = [...latestByCar.values()].sort((a, b) => {
    if (b.lap_number !== a.lap_number) return b.lap_number - a.lap_number
    return (a.elapsed_seconds ?? Infinity) - (b.elapsed_seconds ?? Infinity)
  })
  const classTotals = new Map<string, number>()
  for (const r of rows) {
    const cls = r.class ?? 'Unknown'
    classTotals.set(cls, (classTotals.get(cls) ?? 0) + 1)
  }
  const classCounts = new Map<string, number>()
  return rows.map((r, i) => {
    const cls = r.class ?? 'Unknown'
    const classPosition = (classCounts.get(cls) ?? 0) + 1
    classCounts.set(cls, classPosition)
    return {
      car_number: r.car_number,
      class: r.class,
      team: r.team,
      driver_name: r.driver_name,
      lapNumber: r.lap_number,
      position: i + 1,
      classPosition,
      totalCars: rows.length,
      totalInClass: classTotals.get(cls) ?? 1,
    }
  })
}
