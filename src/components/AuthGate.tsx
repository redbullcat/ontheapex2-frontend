import { useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { getSession, onSessionChanged, restoreSession, type Session } from '../lib/session'

// Gates only the main dashboard shell (see main.tsx) — Live Timing
// Replay/live-now/live-staging routes are mounted separately and never
// pass through here, so shared replay links keep working with no login.
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    restoreSession().then(setSession)
    return onSessionChanged(() => setSession(getSession()))
  }, [])

  if (session === undefined) return null
  if (session === null) return <LoginPage onLoggedIn={setSession} />
  return <>{children}</>
}
