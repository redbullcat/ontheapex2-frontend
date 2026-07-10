import type { LapRead } from '../api/types'

function hasTyreData(lap: LapRead): boolean {
  return (
    lap.tire_fl_compound != null ||
    lap.tire_fr_compound != null ||
    lap.tire_rl_compound != null ||
    lap.tire_rr_compound != null
  )
}

// One row per car: the most recent lap (by lap_number) that actually
// carries a tyre snapshot — a car mid-stint with no *new* lap yet still
// shows its last known tyres rather than blanking out. Callers pass an
// already clock-filtered `laps` array (Replay's visibleLaps) or a whole
// session's laps (the historical app) depending on what "current" means
// for that view.
export function latestTyresByCar(laps: LapRead[]): Map<string, LapRead> {
  const latest = new Map<string, LapRead>()
  for (const lap of laps) {
    if (!hasTyreData(lap)) continue
    const existing = latest.get(lap.car_number)
    if (!existing || lap.lap_number > existing.lap_number) {
      latest.set(lap.car_number, lap)
    }
  }
  return latest
}
