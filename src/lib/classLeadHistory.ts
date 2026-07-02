import type { LapRead, LeadStint } from '../api/types'

// The lead-history API endpoint only returns overall-race leader stints, so
// per-class lead history is derived client-side from raw lap data: the
// class leader on a given lap is whichever car in that class has covered
// the most ground (lowest elapsed time among cars on the same lap number),
// then consecutive laps led by the same car are collapsed into stints —
// mirroring how the backend builds the overall stints.
export function computeClassLeadHistory(laps: LapRead[], cls: string): LeadStint[] {
  const classLaps = laps.filter(
    (l) => (l.class ?? 'Unknown') === cls && l.elapsed_seconds != null && l.lap_number != null,
  )

  const byLap = new Map<number, LapRead[]>()
  for (const lap of classLaps) {
    const arr = byLap.get(lap.lap_number)
    if (arr) arr.push(lap)
    else byLap.set(lap.lap_number, [lap])
  }
  const lapNumbers = [...byLap.keys()].sort((a, b) => a - b)

  interface OpenStint {
    car_number: string
    team: string | null
    manufacturer: string | null
    drivers: Set<string>
    start_lap: number
    end_lap: number
  }

  function finalize(s: OpenStint): LeadStint {
    return {
      car_number: s.car_number,
      team: s.team,
      manufacturer: s.manufacturer,
      drivers: [...s.drivers].sort().join(' / '),
      start_lap: s.start_lap,
      end_lap: s.end_lap,
      laps_led: s.end_lap - s.start_lap + 1,
    }
  }

  const stints: LeadStint[] = []
  let current: OpenStint | null = null
  for (const lapNumber of lapNumbers) {
    const rows = byLap.get(lapNumber)!
    const leader = rows.reduce((best, r) => (r.elapsed_seconds! < best.elapsed_seconds! ? r : best))
    if (current && current.car_number === leader.car_number) {
      current.end_lap = lapNumber
      if (leader.driver_name) current.drivers.add(leader.driver_name)
    } else {
      if (current) stints.push(finalize(current))
      current = {
        car_number: leader.car_number,
        team: leader.team,
        manufacturer: leader.manufacturer,
        drivers: new Set(leader.driver_name ? [leader.driver_name] : []),
        start_lap: lapNumber,
        end_lap: lapNumber,
      }
    }
  }
  if (current) stints.push(finalize(current))
  return stints
}
