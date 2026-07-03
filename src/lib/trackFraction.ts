// Shared interpolation used by both Replay's Circle of Doom/track map (from
// sector-crossing timestamps already tracked by ReplayEngine) and Live's
// (from completed-lap boundaries, since we don't get mid-lap sector pushes
// there). Mirrors PACETEQ ONE TIMING's "Circle of Doom": a car's position
// between two known crossings is estimated by how much of the *expected*
// segment duration has elapsed since the last one, not real telemetry.
export function fractionFromSegment(segmentIndex: 0 | 1 | 2, elapsedInSegment: number, segmentDuration: number): number {
  const segFrac = segmentDuration > 0 ? Math.min(0.999, Math.max(0, elapsedInSegment / segmentDuration)) : 0
  return (segmentIndex + segFrac) / 3
}

export function median(vals: number[]): number | null {
  if (!vals.length) return null
  const sorted = [...vals].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

interface SectorLap {
  s1_seconds: number | null
  s2_seconds: number | null
  s3_seconds: number | null
}

// Circle of Doom's angular position is fundamentally *time*-based, not a
// literal distance around the physical circuit (see fractionFromSegment
// above) — so sector-boundary markers should use that same time fraction:
// what share of a typical lap's total time is spent in S1 and S1+S2,
// from the session's own recorded sector times. That stays correct for any
// track without needing real geometric sector-distance data, which we
// don't have.
export function computeSectorFractions(laps: SectorLap[]): [number, number] | null {
  const s1 = median(laps.map((l) => l.s1_seconds).filter((v): v is number => v != null && v > 0))
  const s2 = median(laps.map((l) => l.s2_seconds).filter((v): v is number => v != null && v > 0))
  const s3 = median(laps.map((l) => l.s3_seconds).filter((v): v is number => v != null && v > 0))
  if (s1 == null || s2 == null || s3 == null) return null
  const total = s1 + s2 + s3
  return [s1 / total, (s1 + s2) / total]
}
