import type { SessionSummary } from '../api/types'
import type { SessionBucket } from '../lib/sessionBucket'

const BUCKET_LABELS: Record<SessionBucket, string> = {
  practice: 'Practice',
  qualifying: 'Qualifying',
  race: 'Race',
}

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
        </div>
      )}
    </div>
  )
}
