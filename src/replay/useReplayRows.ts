import { useEffect, useMemo, useState } from 'react'
import { ReplayEngine, type RowState } from './replayEngine'
import type { ReplayData } from './replayData'

export function useReplayRows(data: ReplayData, currentT: number): RowState[] {
  const engine = useMemo(() => new ReplayEngine(data), [data])
  const [rows, setRows] = useState<RowState[]>(() => engine.getRows(currentT))

  useEffect(() => {
    setRows(engine.getRows(currentT))
  }, [engine, currentT])

  return rows
}
