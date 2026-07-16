import { useEffect, useState } from 'react'
import {
  addShareEmail,
  fetchShareList,
  removeShareEmail,
  searchUsers,
  type ShareEntry,
  type UserSearchResult,
} from '../lib/sessionNotesApi'

// Search-as-you-type debounce — short enough to feel instant, long enough
// to not fire a request on every single keystroke while still typing a name.
const SEARCH_DEBOUNCE_MS = 200

export function NotesShareSettings({ sessionKey, onClose }: { sessionKey: string; onClose: () => void }) {
  const [shared, setShared] = useState<ShareEntry[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchShareList(sessionKey)
      .then(setShared)
      .catch(() => setError('Failed to load sharing settings'))
      .finally(() => setLoading(false))
  }, [sessionKey])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      searchUsers(query).then((found) =>
        setResults(found.filter((u) => !shared.some((s) => s.email === u.email))),
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, shared])

  async function handleAdd(email: string) {
    try {
      setShared(await addShareEmail(sessionKey, email))
      setQuery('')
      setResults([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share notes')
    }
  }

  async function handleRemove(email: string) {
    try {
      setShared(await removeShareEmail(sessionKey, email))
    } catch {
      setError('Failed to update sharing settings')
    }
  }

  return (
    <div className="notes-share-backdrop" onClick={onClose}>
      <div className="notes-share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notes-share-header">
          <h3>Share session notes</h3>
          <button type="button" className="notes-share-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <p className="replay-hint">
          Anyone you add below can see and add notes for this session in real time, and see who wrote what.
        </p>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="replay-hint">Loading…</p>
        ) : (
          <>
            <ul className="notes-share-list">
              {shared.map((entry) => (
                <li key={entry.email}>
                  <span>{entry.name ?? entry.email}</span>
                  <button type="button" onClick={() => handleRemove(entry.email)} title="Remove access">
                    ✕
                  </button>
                </li>
              ))}
              {shared.length === 0 && <li className="replay-hint">Only you have access so far.</li>}
            </ul>

            <div className="notes-share-search">
              <input
                type="text"
                placeholder="Add someone by name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="notes-share-results">
                  {results.map((r) => (
                    <li key={r.email}>
                      <button type="button" onClick={() => handleAdd(r.email)}>
                        {r.name} <span className="notes-share-result-email">({r.email})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && results.length === 0 && (
                <p className="replay-hint">No matching accounts — they need to have logged in at least once.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
