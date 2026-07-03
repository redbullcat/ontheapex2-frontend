// Shown next to a car's position for 10s after it changes — green up-arrow
// for gaining places, red down-arrow for losing them. Shared by Live
// (usePositionArrow) and Replay (replayEngine's positionDirection), which
// track the underlying change differently but land on the same shape here.
export function PositionChangeArrow({ direction }: { direction: 'up' | 'down' | null }) {
  if (!direction) return null
  return (
    <span className={`position-arrow position-arrow-${direction}`} aria-hidden="true">
      {direction === 'up' ? '▲' : '▼'}
    </span>
  )
}
