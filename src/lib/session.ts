// Staff login against the backend's Ghost(Pro)-backed auth (see
// ontheapex2-backend's app/auth/*) — a Bearer JWT, not a cookie, since the
// frontend (data.ontheapex.com) and API (ontheapex-api.fly.dev) are
// different registrable domains and a cookie set by one is never sent to
// the other. Stored in localStorage so a reload doesn't force a re-login;
// the token itself carries an expiry the backend enforces independently.
export const API_BASE = 'https://ontheapex-api.fly.dev'
const STORAGE_KEY = 'ota:session'
const CHANGE_EVENT = 'ota:session-changed'

export type StaffRole = 'Owner' | 'Administrator' | 'Editor' | 'Author' | 'Contributor'

export interface Session {
  token: string
  email: string
  name: string
  role: StaffRole
}

let cache: Session | null | undefined

function readFromStorage(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function getSession(): Session | null {
  if (cache === undefined) cache = readFromStorage()
  return cache
}

function setSession(session: Session | null) {
  cache = session
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  else window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function onSessionChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}

export function logout() {
  setSession(null)
}

export class LoginError extends Error {}

export type LoginResult = { status: 'ok'; session: Session } | { status: '2fa_required'; pendingId: string }

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await postJson('/api/auth/login', { email, password })
  const data = await res.json()
  if (!res.ok) throw new LoginError(data.detail ?? 'Login failed')
  if (data.status === '2fa_required') return { status: '2fa_required', pendingId: data.pending_id }
  const session: Session = { token: data.token, email: data.email, name: data.name, role: data.role }
  setSession(session)
  return { status: 'ok', session }
}

export async function verifyTwoFactor(pendingId: string, code: string): Promise<Session> {
  const res = await postJson('/api/auth/login/verify', { pending_id: pendingId, code })
  const data = await res.json()
  if (!res.ok) throw new LoginError(data.detail ?? 'Verification failed')
  const session: Session = { token: data.token, email: data.email, name: data.name, role: data.role }
  setSession(session)
  return session
}

// Called once on app load to confirm a stored token hasn't expired (a
// cheap signature/expiry check on the backend, no re-contact with Ghost)
// — clears the stored session if it's no longer valid rather than leaving
// a dead token around for every subsequent request to fail against.
export async function restoreSession(): Promise<Session | null> {
  const existing = getSession()
  if (!existing) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${existing.token}` },
    })
    if (!res.ok) {
      setSession(null)
      return null
    }
    return existing
  } catch {
    // A network hiccup shouldn't log someone out — keep the stored
    // session and let the next real API call surface any actual problem.
    return existing
  }
}
