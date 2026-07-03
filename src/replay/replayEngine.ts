import type { CarMeta, ReplayData } from './replayData'
import type { FlagCategory } from '../lib/flags'

export type BestBadge = 'session' | 'personal' | null

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
  s1Badge: BestBadge
  s2Badge: BestBadge
  s3Badge: BestBadge
  bestLap: number | null
  lastLap: number | null
  lastLapBadge: BestBadge
  gap: number | null
  interval: number | null
  pits: number
  sincePit: number | null
  inPit: boolean
  position: number
  classPosition: number
  positionChangedAt: number
}

export interface ReplaySnapshot {
  rows: RowState[]
  flag: FlagCategory | null
  leaderLap: number
}

interface CarState {
  meta: CarMeta
  driverName: string | null
  lap: number
  sector: number
  lastEventTime: number
  s1: number | null
  s2: number | null
  s3: number | null
  s1UpdatedAt: number
  s2UpdatedAt: number
  s3UpdatedAt: number
  bestLap: number | null
  lastLap: number | null
}

// A car is "ahead" of another if it's completed more of the current lap
// (higher lap, then higher sector within that lap), or — tied on both —
// reached that exact checkpoint earlier. This alone fully orders the field
// without needing a gap value at all, which sidesteps the lap-1 problem:
// gap doesn't exist yet for anyone before the first lap completes, but
// sector/event-time progress always does.
function isAhead(a: CarState, b: CarState): boolean {
  if (a.lap !== b.lap) return a.lap > b.lap
  if (a.sector !== b.sector) return a.sector > b.sector
  return a.lastEventTime < b.lastEventTime
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

  // Running bests, updated incrementally as events land — "session" means
  // fastest in that car's class so far this session; "personal" means
  // fastest that specific car has done so far.
  private sessionBestSector = new Map<string, number>() // `${class}:${sector}`
  private sessionBestLap = new Map<string, number>() // class
  private personalBestSector = new Map<string, [number | null, number | null, number | null]>() // car -> [s1,s2,s3]
  private personalBestLap = new Map<string, number>() // car

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
          driverName: null,
          lap: 0,
          sector: 0,
          lastEventTime: -Infinity,
          s1: null,
          s2: null,
          s3: null,
          s1UpdatedAt: -Infinity,
          s2UpdatedAt: -Infinity,
          s3UpdatedAt: -Infinity,
          bestLap: null,
          lastLap: null,
        },
      ]),
    )
    this.eventPtr = 0
    this.lastTime = -Infinity
    this.lastPositionByCar = new Map()
    this.positionChangedAtByCar = new Map()
    this.sessionBestSector = new Map()
    this.sessionBestLap = new Map()
    this.personalBestSector = new Map()
    this.personalBestLap = new Map()
  }

  private updateBests(car: CarState, sector: 1 | 2 | 3, value: number) {
    const cls = car.meta.class
    const sectorKey = `${cls}:${sector}`
    this.sessionBestSector.set(sectorKey, Math.min(this.sessionBestSector.get(sectorKey) ?? Infinity, value))

    let personal = this.personalBestSector.get(car.meta.car_number)
    if (!personal) {
      personal = [null, null, null]
      this.personalBestSector.set(car.meta.car_number, personal)
    }
    const idx = sector - 1
    personal[idx] = personal[idx] == null ? value : Math.min(personal[idx]!, value)
  }

  private updateLapBests(car: CarState, lapTime: number) {
    const cls = car.meta.class
    this.sessionBestLap.set(cls, Math.min(this.sessionBestLap.get(cls) ?? Infinity, lapTime))
    this.personalBestLap.set(car.meta.car_number, Math.min(this.personalBestLap.get(car.meta.car_number) ?? Infinity, lapTime))
  }

  private badge(value: number | null, sessionBest: number | undefined, personalBest: number | null | undefined): BestBadge {
    if (value == null) return null
    if (sessionBest != null && value <= sessionBest) return 'session'
    if (personalBest != null && value <= personalBest) return 'personal'
    return null
  }

  private advanceTo(t: number) {
    const events = this.data.events
    while (this.eventPtr < events.length && events[this.eventPtr].time <= t) {
      const e = events[this.eventPtr]
      const car = this.cars.get(e.car)
      this.eventPtr++
      if (!car) continue
      car.lap = e.lap
      car.sector = e.sector
      car.lastEventTime = e.time
      car.driverName = e.driverName
      if (e.sector === 1) {
        car.s1 = e.value
        car.s1UpdatedAt = e.time
        this.updateBests(car, 1, e.value)
      } else if (e.sector === 2) {
        car.s2 = e.value
        car.s2UpdatedAt = e.time
        this.updateBests(car, 2, e.value)
      } else {
        car.s3 = e.value
        car.s3UpdatedAt = e.time
        this.updateBests(car, 3, e.value)
        car.lastLap = e.lapTimeSeconds ?? null
        if (car.lastLap != null) {
          car.bestLap = car.bestLap == null ? car.lastLap : Math.min(car.bestLap, car.lastLap)
          this.updateLapBests(car, car.lastLap)
        }
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

  private flagAt(leaderLap: number): FlagCategory | null {
    if (leaderLap <= 0) return null
    for (const p of this.data.flagPeriods) {
      if (leaderLap >= p.startLap && leaderLap <= p.endLap) return p.category
    }
    return null
  }

  // Recomputes the full leaderboard snapshot as of time t. Safe to call
  // every animation frame — advancing is incremental, sorting ~35 rows and
  // scanning each car's (small) pit-stop list fresh every time is cheap
  // enough not to bother caching.
  getSnapshot(t: number): ReplaySnapshot {
    if (t < this.lastTime) this.reset()
    this.advanceTo(t)
    this.lastTime = t

    const rows = [...this.cars.values()]
      .filter((c) => c.lap > 0)
      .sort((a, b) => {
        if (isAhead(a, b)) return -1
        if (isAhead(b, a)) return 1
        return a.meta.car_number.localeCompare(b.meta.car_number, undefined, { numeric: true })
      })

    const leader = rows[0] ?? null
    const leaderElapsedBySector = leader ? this.data.elapsedByLapSectorByCar.get(leader.meta.car_number) : undefined

    const gapFor = (c: CarState): number | null => {
      if (!leaderElapsedBySector || c.lap === 0 || c.sector === 0) return null
      const leaderAtSameCheckpoint = leaderElapsedBySector.get(`${c.lap}:${c.sector}`)
      if (leaderAtSameCheckpoint == null) return null
      return c.lastEventTime - leaderAtSameCheckpoint
    }

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

    const rowStates = rows.map((c, i) => {
      const classPos = (classCounts.get(c.meta.class) ?? 0) + 1
      classCounts.set(c.meta.class, classPos)
      const gap = gapFor(c)
      const prevGap = i > 0 ? gapFor(rows[i - 1]) : null
      const { pits, inPit, sincePit } = this.pitStateAt(c.meta.car_number, t, c.lap)
      const personalSector = this.personalBestSector.get(c.meta.car_number)
      return {
        car_number: c.meta.car_number,
        class: c.meta.class,
        team: c.meta.team,
        driver_name: c.driverName,
        lap: c.lap,
        s1: c.s1,
        s2: c.s2,
        s3: c.s3,
        s1UpdatedAt: c.s1UpdatedAt,
        s2UpdatedAt: c.s2UpdatedAt,
        s3UpdatedAt: c.s3UpdatedAt,
        s1Badge: this.badge(c.s1, this.sessionBestSector.get(`${c.meta.class}:1`), personalSector?.[0]),
        s2Badge: this.badge(c.s2, this.sessionBestSector.get(`${c.meta.class}:2`), personalSector?.[1]),
        s3Badge: this.badge(c.s3, this.sessionBestSector.get(`${c.meta.class}:3`), personalSector?.[2]),
        bestLap: c.bestLap,
        lastLap: c.lastLap,
        lastLapBadge: this.badge(c.lastLap, this.sessionBestLap.get(c.meta.class), this.personalBestLap.get(c.meta.car_number)),
        gap,
        interval: gap != null && prevGap != null ? gap - prevGap : null,
        pits,
        sincePit,
        inPit,
        position: i + 1,
        classPosition: classPos,
        positionChangedAt: this.positionChangedAtByCar.get(c.meta.car_number) ?? -Infinity,
      }
    })

    return { rows: rowStates, flag: leader ? this.flagAt(leader.lap) : null, leaderLap: leader?.lap ?? 0 }
  }
}
