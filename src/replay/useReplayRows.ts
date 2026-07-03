import { useEffect, useMemo, useState } from 'react'
import { ReplayEngine, type ReplaySnapshot } from './replayEngine'
import type { ReplayData } from './replayData'

const EMPTY: ReplaySnapshot = { rows: [], flag: null, leaderLap: 0 }

export function useReplaySnapshot(data: ReplayData, currentT: number): ReplaySnapshot {
  const engine = useMemo(() => new ReplayEngine(data), [data])
  const [snapshot, setSnapshot] = useState<ReplaySnapshot>(() => engine.getSnapshot(currentT))

  useEffect(() => {
    setSnapshot(engine.getSnapshot(currentT))
  }, [engine, currentT])

  return snapshot ?? EMPTY
}
