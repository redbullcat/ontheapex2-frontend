import type { CarMeta, ReplayData } from './replayData'

export interface RowState {
  car_number: string
  class: string
  team: string | null
  driver_name: string | null
  lap: number
  s1: number | null
  s2: number | null
  s3: number | null
  s1UpdatedAt: number
  s2UpdatedAt: number
  s3UpdatedAt: number
  bestLap: number | null
  lastLap: number | null
  gap: number | null
  interval: number | null
  pits: number
  sincePit: number | null
  inPit: boolean
  position: number
  classPosition: number
  positionChangedAt: number
}

interface CarState {
  meta: CarMeta
  lap: number
  s1: number | null
  s2: number | null
  s3: number | null
  s1UpdatedAt: number
  s2UpdatedAt: number
  s3UpdatedAt: number
  bestLap: number | null
  lastLap: number | null
  gap: number | null
}

// Drives the leaderboard from the precomputed event timeline. Advancing
// forward is O(events since last tick) — a pointer walk, not a rescan — so
// normal playback/fast-forward stays cheap regardless of field size.
// Seeking backward (a scrub) is the one path that pays for a full replay
// from t=0, which is fine: it's a rare, deliberate action, not a per-frame
// cost, and even a full 6h field's worth of events replays in well under a
// millisecond.
export class ReplayEngine {
  private data: ReplayData
  private cars = new Map<string, CarState>()
  private eventPtr = 0
  private lastTime = -Infinity
  private lastPositionByCar = new Map<string, number>()
  private positionChangedAtByCar = new Map<string, number>()

  constructor(data: ReplayData) {
    this.data = data
    this.reset()
  }

  private reset() {
    this.cars = new Map(
      this.data.cars.map((meta) => [
        meta.car_number,
        {
          meta,
          lap: 0,
          s1: null,
          s2: null,
          s3: null,
          s1UpdatedAt: -Infinity,
          s2UpdatedAt: -Infinity,
          s3UpdatedAt: -Infinity,
          bestLap: null,
          lastLap: null,
          gap: null,
        },
      ]),
    )
    this.eventPtr = 0
    this.lastTime = -Infinity
    this.lastPositionByCar = new Map()
    this.positionChangedAtByCar = new Map()
  }

  private advanceTo(t: number) {
    const events = this.data.events
    while (this.eventPtr < events.length && events[this.eventPtr].time <= t) {
      const e = events[this.eventPtr]
      const car = this.cars.get(e.car)
      this.eventPtr++
      if (!car) continue
      car.lap = e.lap
      if (e.sector === 1) {
        car.s1 = e.value
        car.s1UpdatedAt = e.time
      } else if (e.sector === 2) {
        car.s2 = e.value
        car.s2UpdatedAt = e.time
      } else {
        car.s3 = e.value
        car.s3UpdatedAt = e.time
        car.lastLap = e.lapTimeSeconds ?? null
        if (car.lastLap != null) car.bestLap = car.bestLap == null ? car.lastLap : Math.min(car.bestLap, car.lastLap)
        car.gap = this.data.gapByLapAndCar.get(e.lap)?.get(e.car) ?? car.gap
      }
    }
  }

  private pitStateAt(car: string, t: number, currentLap: number) {
    const windows = this.data.pitWindowsByCar.get(car) ?? []
    let pits = 0
    let inPit = false
    let lastOutLap: number | null = null
    for (const w of windows) {
      if (t >= w.end) {
        pits++
        lastOutLap = w.outLap
      } else if (t >= w.start) {
        inPit = true
      }
    }
    const sincePit = lastOutLap != null ? Math.max(0, currentLap - lastOutLap) : null
    return { pits, inPit, sincePit }
  }

  // Recomputes the full leaderboard snapshot as of time t. Safe to call
  // every animation frame — advancing is incremental, sorting ~35 rows and
  // scanning each car's (small) pit-stop list fresh every time is cheap
  // enough not to bother caching.
  getRows(t: number): RowState[] {
    if (t < this.lastTime) this.reset()
    this.advanceTo(t)
    this.lastTime = t

    const rows = [...this.cars.values()]
      .filter((c) => c.lap > 0)
      .sort((a, b) => b.lap - a.lap || (a.gap ?? Infinity) - (b.gap ?? Infinity) || a.meta.car_number.localeCompare(b.meta.car_number))

    const classCounts = new Map<string, number>()

    // Flash only the rows whose own rank actually moved since the last
    // tick — not the whole board just because *someone* reordered.
    const newPositionByCar = new Map<string, number>()
    rows.forEach((c, i) => newPositionByCar.set(c.meta.car_number, i + 1))
    for (const [car, pos] of newPositionByCar) {
      const prevPos = this.lastPositionByCar.get(car)
      if (prevPos !== undefined && prevPos !== pos) this.positionChangedAtByCar.set(car, t)
    }
    this.lastPositionByCar = newPositionByCar

    return rows.map((c, i) => {
      const classPos = (classCounts.get(c.meta.class) ?? 0) + 1
      classCounts.set(c.meta.class, classPos)
      const prevGap = i > 0 ? rows[i - 1].gap : null
      const { pits, inPit, sincePit } = this.pitStateAt(c.meta.car_number, t, c.lap)
      return {
        car_number: c.meta.car_number,
        class: c.meta.class,
        team: c.meta.team,
        driver_name: c.meta.driver_name,
        lap: c.lap,
        s1: c.s1,
        s2: c.s2,
        s3: c.s3,
        s1UpdatedAt: c.s1UpdatedAt,
        s2UpdatedAt: c.s2UpdatedAt,
        s3UpdatedAt: c.s3UpdatedAt,
        bestLap: c.bestLap,
        lastLap: c.lastLap,
        gap: c.gap,
        interval: c.gap != null && prevGap != null ? c.gap - prevGap : null,
        pits,
        sincePit,
        inPit,
        position: i + 1,
        classPosition: classPos,
        positionChangedAt: this.positionChangedAtByCar.get(c.meta.car_number) ?? -Infinity,
      }
    })
  }
}
