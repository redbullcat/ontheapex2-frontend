import { getSession, logout } from '../lib/session'

export function AccountBadge() {
  const session = getSession()
  if (!session) return null
  return (
    <div className="account-badge">
      <span>
        {session.name} · {session.role}
      </span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  )
}
