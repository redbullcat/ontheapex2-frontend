import { useState } from 'react'
import { LoginError, login, verifyTwoFactor, type Session } from '../lib/session'

export function LoginPage({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email, password)
      if (result.status === '2fa_required') setPendingId(result.pendingId)
      else onLoggedIn(result.session)
    } catch (err) {
      setError(err instanceof LoginError ? err.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingId) return
    setError(null)
    setBusy(true)
    try {
      const session = await verifyTwoFactor(pendingId, code)
      onLoggedIn(session)
    } catch (err) {
      setError(err instanceof LoginError ? err.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>On The Apex</h1>
        <p className="subtitle">Sign in with your Ghost staff account</p>

        {pendingId ? (
          <form onSubmit={handleSubmitCode}>
            <p className="hint">A 6-digit code was emailed to {email} — enter it below.</p>
            <label className="field">
              <span className="field-label">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy || code.length === 0}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              className="login-secondary"
              onClick={() => {
                setPendingId(null)
                setCode('')
                setError(null)
              }}
            >
              Start over
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitCredentials}>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
