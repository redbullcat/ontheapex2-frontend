import type { SessionSummary } from '../api/types'
import type { SessionBucket } from '../lib/sessionBucket'
import { combinedSessionId } from '../lib/combinedSession'

const BUCKET_LABELS: Record<SessionBucket, string> = {
  practice: 'Practice',
  qualifying: 'Qualifying',
  race: 'Race',
}

// Race weekends normally have exactly one race session, so "combine all"
// is only meaningful for Practice/Qualifying, where there's often 2+.
const COMBINABLE_BUCKETS: SessionBucket[] = ['practice', 'qualifying']

export function SessionTypeTabs({
  sessionsByBucket,
  activeBucket,
  onBucketChange,
  sessionId,
  onSessionChange,
}: {
  sessionsByBucket: Record<SessionBucket, SessionSummary[]>
  activeBucket: SessionBucket | ''
  onBucketChange: (bucket: SessionBucket) => void
  sessionId: string
  onSessionChange: (id: string) => void
}) {
  const buckets: SessionBucket[] = ['practice', 'qualifying', 'race']
  const sessionsInBucket = activeBucket ? sessionsByBucket[activeBucket] : []
  const canCombine = activeBucket && COMBINABLE_BUCKETS.includes(activeBucket) && sessionsInBucket.length > 1

  return (
    <div className="session-type-tabs">
      <div className="tabs session-section-tabs" role="tablist">
        {buckets.map((bucket) => {
          const count = sessionsByBucket[bucket].length
          return (
            <button
              key={bucket}
              type="button"
              role="tab"
              aria-selected={activeBucket === bucket}
              className={activeBucket === bucket ? 'active' : ''}
              disabled={count === 0}
              onClick={() => onBucketChange(bucket)}
            >
              {BUCKET_LABELS[bucket]}
              {count === 0 ? ' (no data)' : ''}
            </button>
          )
        })}
      </div>
      {sessionsInBucket.length > 1 && (
        <div className="session-pills">
          {sessionsInBucket.map((s) => (
            <button
              key={s.id}
              type="button"
              className={String(s.id) === sessionId ? 'session-pill active' : 'session-pill'}
              onClick={() => onSessionChange(String(s.id))}
            >
              {s.label}
            </button>
          ))}
          {canCombine && (
            <button
              type="button"
              className={
                sessionId === combinedSessionId(activeBucket as SessionBucket)
                  ? 'session-pill session-pill-combined active'
                  : 'session-pill session-pill-combined'
              }
              title={`Pool every ${BUCKET_LABELS[activeBucket as SessionBucket]} session together`}
              onClick={() => onSessionChange(combinedSessionId(activeBucket as SessionBucket))}
            >
              All {BUCKET_LABELS[activeBucket as SessionBucket]} ({sessionsInBucket.length})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
