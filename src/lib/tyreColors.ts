// Standard motorsport tyre-compound color convention (soft=red, medium=
// yellow, hard=white/light, intermediate=green, wet=blue) — Griiip's own
// captures have only ever shown "MEDIUM" so far, but the others are kept
// so the mapping doesn't need revisiting once a wet/mixed session is seen.
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#e5322d',
  MEDIUM: '#f2d43a',
  HARD: '#f4f4f2',
  INTERMEDIATE: '#2fa84f',
  WET: '#2f6fe4',
}

export function tyreCompoundColor(compound: string | null | undefined): string {
  if (!compound) return '#b9b7ae'
  return COMPOUND_COLORS[compound.toUpperCase()] ?? '#b9b7ae'
}
