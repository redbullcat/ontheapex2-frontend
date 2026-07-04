// A car's laps carry only the single driver who drove that specific lap
// (`driver_name`) — there's no separate field anywhere listing a car's full
// 2-3 driver roster, so it's derived here by collecting every distinct
// driver_name seen across a car's laps so far.
export function buildCarRoster(laps: { car_number: string; driver_name: string | null }[]): Map<string, string[]> {
  const sets = new Map<string, Set<string>>()
  for (const lap of laps) {
    if (!lap.driver_name) continue
    let set = sets.get(lap.car_number)
    if (!set) {
      set = new Set()
      sets.set(lap.car_number, set)
    }
    set.add(lap.driver_name)
  }
  const result = new Map<string, string[]>()
  for (const [car, set] of sets) result.set(car, [...set])
  return result
}
