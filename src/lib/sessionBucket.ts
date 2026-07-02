import type { SessionSummary } from '../api/types'

export type SessionBucket = 'practice' | 'qualifying' | 'race'

export function bucketFor(type: SessionSummary['type']): SessionBucket {
  if (type === 'qualifying') return 'qualifying'
  if (type === 'race') return 'race'
  return 'practice'
}
