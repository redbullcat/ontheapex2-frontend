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
}

// Reconstructs "who's where" as of a given elapsed-seconds cutoff (or every
// lap given, if the cutoff is null — i.e. "right now") by taking each car's
// most recent lap at/before the cutoff and ranking by elapsed time. Same
// convention LapPositionChart's rankBy:'elapsed' uses for the running
// order, and it works unmodified for both Replay's LapRead[] and Live's
// LiveLap[] since both carry the same handful of fields this needs — no
// separate adapter needed for each view, and no separate "position at lap
// N" index needs to exist ahead of time (Replay's ReplayData happens to
// have one, positionByLapAndCar, but Live doesn't, and this needs to work
// for a lap clicked on a chart, which could be anywhere in the past).
export function computeFieldStateAtMoment(laps: LapLike[], elapsedCutoff: number | null): CarStateAtMoment[] {
  const latestByCar = new Map<string, LapLike>()
  for (const lap of laps) {
    if (lap.elapsed_seconds == null) continue
    if (elapsedCutoff != null && lap.elapsed_seconds > elapsedCutoff) continue
    const prev = latestByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) latestByCar.set(lap.car_number, lap)
  }
  const rows = [...latestByCar.values()].sort((a, b) => (a.elapsed_seconds ?? Infinity) - (b.elapsed_seconds ?? Infinity))
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
    }
  })
}
