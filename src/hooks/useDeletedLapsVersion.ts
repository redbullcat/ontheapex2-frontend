import { useEffect, useState } from 'react'
import { onDeletedLapsChanged } from '../lib/lapOverrides'

// A version counter that bumps whenever a deleted-lap flag is added or
// removed — plug into a useMemo's dependency array so classification
// (SessionResultsTable, FastestLapsTable, the starting grid, etc) recomputes
// the moment a lap gets flagged, without each of those needing its own
// storage-event subscription.
export function useDeletedLapsVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => onDeletedLapsChanged(() => setVersion((v) => v + 1)), [])
  return version
}
