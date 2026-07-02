// User-defined team colour/name overrides, persisted to localStorage so
// they carry over across sessions and page refreshes. Keyed by the raw
// TEAM string exactly as it appears in the timing data.
export interface TeamOverride {
  color?: string
  name?: string
}

const STORAGE_KEY = 'ota:teamOverrides'
const CHANGE_EVENT = 'ota:identity-overrides-changed'

let cache: Record<string, TeamOverride> | null = null

function readFromStorage(): Record<string, TeamOverride> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getCache(): Record<string, TeamOverride> {
  if (!cache) cache = readFromStorage()
  return cache
}

function writeToStorage(overrides: Record<string, TeamOverride>) {
  cache = overrides
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getTeamOverrides(): Record<string, TeamOverride> {
  return getCache()
}

export function setTeamOverride(team: string, patch: TeamOverride) {
  const all = { ...getCache() }
  const merged = { ...all[team], ...patch }
  if (!merged.color && !merged.name) {
    delete all[team]
  } else {
    all[team] = merged
  }
  writeToStorage(all)
}

export function clearTeamOverride(team: string) {
  const all = { ...getCache() }
  delete all[team]
  writeToStorage(all)
}

export function onIdentityOverridesChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}
