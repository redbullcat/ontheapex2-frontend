import type { LapRead } from '../api/types'

// Loose enough to accept a LapRead, a LiveStanding, or any other row shape
// that carries the 4-wheel tyre snapshot fields.
export interface TyreFields {
  tire_fl_compound?: string | null
  tire_fl_age_laps?: number | null
  tire_fr_compound?: string | null
  tire_fr_age_laps?: number | null
  tire_rl_compound?: string | null
  tire_rl_age_laps?: number | null
  tire_rr_compound?: string | null
  tire_rr_age_laps?: number | null
}

// All 4 wheels normally share one compound — falls back to "Mixed" for the
// rare case they don't (e.g. mid-stint tyre change straddling a lap), rather
// than just showing one wheel and silently hiding the other three.
export function tyreSummary(row: TyreFields): { compound: string | null; age: number | null } {
  const compounds = [row.tire_fl_compound, row.tire_fr_compound, row.tire_rl_compound, row.tire_rr_compound]
  const known = compounds.filter((c): c is string => c != null)
  const compound = known.length === 0 ? null : known.every((c) => c === known[0]) ? known[0] : 'Mixed'
  const ages = [row.tire_fl_age_laps, row.tire_fr_age_laps, row.tire_rl_age_laps, row.tire_rr_age_laps].filter(
    (a): a is number => a != null,
  )
  const age = ages.length === 0 ? null : Math.max(...ages)
  return { compound, age }
}

// Griiip only ever sends full compound names (MEDIUM, SOFT, ...) — this is
// purely a display abbreviation for the FL-FR-RL-RR tyre code, not something
// Griiip sends itself.
const COMPOUND_LETTERS: Record<string, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
}

function compoundLetter(compound: string | null | undefined): string {
  if (!compound) return '?'
  return COMPOUND_LETTERS[compound.toUpperCase()] ?? compound.charAt(0).toUpperCase()
}

// Per-wheel compound code in FL-FR-RL-RR order (standard motorsport corner
// convention), e.g. soft fronts + hard rears -> "SSHH". Unlike tyreSummary,
// this never collapses to "Mixed" — an unmatched set is exactly what the
// per-letter code is for.
export function tyreCode(row: TyreFields): string | null {
  const compounds = [row.tire_fl_compound, row.tire_fr_compound, row.tire_rl_compound, row.tire_rr_compound]
  if (compounds.every((c) => c == null)) return null
  return compounds.map(compoundLetter).join('')
}

// Single shared age if all 4 wheels agree, otherwise the per-wheel ages
// hyphenated in the same FL-FR-RL-RR order as tyreCode (e.g. a stop that
// only changed the fronts: "1-1-20-20").
export function tyreAgeDisplay(row: TyreFields): string | null {
  const ages = [row.tire_fl_age_laps, row.tire_fr_age_laps, row.tire_rl_age_laps, row.tire_rr_age_laps]
  if (ages.every((a) => a == null)) return null
  const known = ages.filter((a): a is number => a != null)
  if (known.length === 4 && known.every((a) => a === known[0])) return String(known[0])
  return ages.map((a) => (a == null ? '?' : String(a))).join('-')
}

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
