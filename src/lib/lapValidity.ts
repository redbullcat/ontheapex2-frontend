import type { LapRead } from '../api/types'

// A lap the timing system flagged as not a legitimate timed lap (track-limit
// violation, pit-in lap, driver-change/red-flag out-lap, etc) still
// physically happened — it counts for laps-completed, pit-stop detection,
// and stint boundaries — but shouldn't count towards "fastest lap"-style
// pace/consistency classification. `is_valid` is optional on LapRead so
// older cached responses (or a backend not yet carrying the field) default
// to valid rather than silently excluding everything.
export function isLapValid(lap: LapRead): boolean {
  return lap.is_valid !== false
}
