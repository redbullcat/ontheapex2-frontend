import { useEffect, useState } from 'react'
import { onPenaltiesChanged } from '../lib/penalties'

// A version counter that bumps whenever a penalty is added or removed —
// plug into a useMemo's dependency array so consumers (the Results table's
// penalty badge, the Settings panel's review list) recompute the moment a
// penalty changes, without each needing its own subscription.
export function usePenaltiesVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => onPenaltiesChanged(() => setVersion((v) => v + 1)), [])
  return version
}
