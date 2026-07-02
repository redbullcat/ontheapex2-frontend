import type { SessionBucket } from './sessionBucket'

// A "combined" selection pools every session in a bucket (e.g. every
// Practice session of an event) into one synthetic session, encoded as a
// string so it can slot into the same `sessionId` state/URL param a real
// numeric session id normally occupies.
const PREFIX = 'combined:'

export function combinedSessionId(bucket: SessionBucket): string {
  return `${PREFIX}${bucket}`
}

export function parseCombinedSessionId(sessionId: string): SessionBucket | null {
  if (!sessionId.startsWith(PREFIX)) return null
  const bucket = sessionId.slice(PREFIX.length)
  return bucket === 'practice' || bucket === 'qualifying' || bucket === 'race' ? (bucket as SessionBucket) : null
}
