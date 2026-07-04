export interface SectorLeader {
  cls: string
  sector: 1 | 2 | 3
  seconds: number
  car_number: string
  team: string | null
}

interface SectorLapLike {
  car_number: string
  class: string | null
  team: string | null
  s1_seconds: number | null
  s2_seconds: number | null
  s3_seconds: number | null
}

// The current fastest sector time per class, one entry per class+sector
// that has at least one recorded split — this is the "purple" time a
// sector leaderboard ticker highlights. Only the current holder is
// tracked (not the full history of who held it), since neither LapRead
// nor LiveLap carry a ready-made feed of "this lap just went purple"
// events for Replay's historical laps the way LiveLap's own s*_color
// fields do for the live feed.
export function computeSectorLeaders(laps: SectorLapLike[]): SectorLeader[] {
  const best = new Map<string, SectorLeader>()
  for (const lap of laps) {
    const cls = lap.class ?? 'Unknown'
    const sectors: [1 | 2 | 3, number | null][] = [
      [1, lap.s1_seconds],
      [2, lap.s2_seconds],
      [3, lap.s3_seconds],
    ]
    for (const [sector, seconds] of sectors) {
      if (seconds == null) continue
      const key = `${cls}:${sector}`
      const current = best.get(key)
      if (!current || seconds < current.seconds) {
        best.set(key, { cls, sector, seconds, car_number: lap.car_number, team: lap.team })
      }
    }
  }
  return [...best.values()].sort((a, b) => a.cls.localeCompare(b.cls) || a.sector - b.sector)
}
