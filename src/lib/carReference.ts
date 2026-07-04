import { computeFieldStateAtMoment } from './fieldStateAtMoment'
import { getTeamDisplayName } from './identityColors'

interface LapLike {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
  class: string | null
  team: string | null
  driver_name: string | null
  lap_time_seconds?: number | null
  is_valid?: boolean
}

export interface CarReferenceOption {
  carNumber: string
  driverName: string | null
  team: string | null
  cls: string | null
  position: number
  classPosition: number
  totalCars: number
  totalInClass: number
  // Precomputed once so filtering on every keystroke is just a substring
  // check, not a fresh string build each time.
  searchText: string
}

// The full field's position snapshot at a given moment, for the session
// notes "/" car-reference autocomplete (see SlashReferenceTextarea) — same
// underlying ranking as the auto-captured linked-car snapshot, so a
// referenced car's position always agrees with the note's own linked car.
export function buildCarReferenceOptions(laps: LapLike[], elapsedCutoff: number | null, isRaceSession: boolean): CarReferenceOption[] {
  const field = computeFieldStateAtMoment(laps, elapsedCutoff, !isRaceSession)
  return field
    .map((r) => ({
      carNumber: r.car_number,
      driverName: r.driver_name,
      team: r.team,
      cls: r.class,
      position: r.position,
      classPosition: r.classPosition,
      totalCars: r.totalCars,
      totalInClass: r.totalInClass,
      searchText: [r.car_number, r.driver_name, r.team, r.class].filter(Boolean).join(' ').toLowerCase(),
    }))
    .sort((a, b) => a.position - b.position)
}

export function formatCarReference(option: CarReferenceOption): string {
  const driver = option.driverName ?? `Car #${option.carNumber}`
  return `${driver}, #${option.carNumber} ${getTeamDisplayName(option.team)} (P${option.classPosition}/${option.totalInClass}, P${option.position}/${option.totalCars})`
}
