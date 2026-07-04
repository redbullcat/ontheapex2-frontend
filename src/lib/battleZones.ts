export interface BattleRow {
  car_number: string
  team: string | null
  class: string | null
  position: number | null
  // Gap to the car immediately ahead in the overall running order, in
  // seconds — null when unknown (session start) or when the gap is a lap
  // or more (not a battle for position, whatever the on-paper gap is).
  intervalSeconds: number | null
}

export interface BattleZone {
  cars: BattleRow[]
  // The smallest gap within the zone — used to sort zones tightest-first.
  closestGapSeconds: number
}

// A "battle zone" is a run of cars, consecutive in the running order,
// each separated from the next by less than `thresholdSeconds` — same
// idea as a TV broadcast's "battle for P5" graphic. Zones can span
// classes (an outright battle for track position, not just in-class).
export function computeBattleZones(rows: BattleRow[], thresholdSeconds = 2): BattleZone[] {
  const sorted = [...rows]
    .filter((r) => r.position != null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const zones: BattleZone[] = []
  let current: BattleRow[] = []
  let currentClosest = Infinity

  const flush = () => {
    if (current.length >= 2) zones.push({ cars: current, closestGapSeconds: currentClosest })
    current = []
    currentClosest = Infinity
  }

  for (const row of sorted) {
    if (current.length === 0) {
      current.push(row)
      continue
    }
    const gap = row.intervalSeconds
    if (gap != null && gap <= thresholdSeconds) {
      current.push(row)
      currentClosest = Math.min(currentClosest, gap)
    } else {
      flush()
      current.push(row)
    }
  }
  flush()

  return zones.sort((a, b) => a.closestGapSeconds - b.closestGapSeconds)
}
