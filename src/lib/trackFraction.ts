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
