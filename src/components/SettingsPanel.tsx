import { useEffect, useState } from 'react'
import { getTeamColor } from '../lib/identityColors'
import { clearTeamOverride, getTeamOverrides, setTeamOverride } from '../lib/identityOverrides'
import { clearLapDeleted, listDeletedLaps } from '../lib/lapOverrides'

function formatDeletedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function SettingsPanel({ teams, onClose }: { teams: string[]; onClose: () => void }) {
  const [overrides, setOverrides] = useState(() => getTeamOverrides())
  const [addTeam, setAddTeam] = useState('')
  const [addColor, setAddColor] = useState('#2a78d6')
  const [addName, setAddName] = useState('')
  const [deletedLaps, setDeletedLaps] = useState(() => listDeletedLaps())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const overriddenTeams = Object.keys(overrides).sort()
  const teamsAvailableToAdd = teams.filter((t) => !overrides[t])

  const applyOverride = (team: string, patch: { color?: string; name?: string }) => {
    setTeamOverride(team, patch)
    setOverrides(getTeamOverrides())
  }

  const removeOverride = (team: string) => {
    clearTeamOverride(team)
    setOverrides(getTeamOverrides())
  }

  const restoreLap = (sessionId: number, carNumber: string, lapNumber: number) => {
    clearLapDeleted(sessionId, carNumber, lapNumber)
    setDeletedLaps(listDeletedLaps())
  }

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>
        <p className="hint">
          Override a team's colour and/or display name. Car colours follow their team's colour throughout the app.
          Changes are saved in this browser and apply everywhere the team appears.
        </p>

        {overriddenTeams.length > 0 && (
          <div className="settings-list">
            {overriddenTeams.map((team) => (
              <div className="settings-row" key={team}>
                <input
                  type="color"
                  value={overrides[team].color ?? getTeamColor(team)}
                  onChange={(e) => applyOverride(team, { color: e.target.value })}
                />
                <div className="settings-row-team">
                  <span className="settings-row-original">{team}</span>
                  <input
                    type="text"
                    placeholder="Display name (optional)"
                    value={overrides[team].name ?? ''}
                    onChange={(e) => applyOverride(team, { name: e.target.value })}
                  />
                </div>
                <button type="button" className="entity-filter-reset" onClick={() => removeOverride(team)}>
                  Reset
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="settings-add">
          <span className="field-label">Add a team override</span>
          <div className="settings-row">
            <input type="color" value={addColor} onChange={(e) => setAddColor(e.target.value)} />
            {teamsAvailableToAdd.length > 0 ? (
              <select value={addTeam} onChange={(e) => setAddTeam(e.target.value)}>
                <option value="">Select a team…</option>
                {teamsAvailableToAdd.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Team name (as it appears in the data)"
                value={addTeam}
                onChange={(e) => setAddTeam(e.target.value)}
              />
            )}
            <input
              type="text"
              placeholder="Display name (optional)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
            <button
              type="button"
              className="chart-export-trigger"
              disabled={!addTeam}
              onClick={() => {
                if (!addTeam) return
                applyOverride(addTeam, { color: addColor, name: addName || undefined })
                setAddTeam('')
                setAddName('')
              }}
            >
              Add
            </button>
          </div>
        </div>

        <h3 className="settings-section-head">Deleted laps</h3>
        <p className="hint">
          Laps flagged deleted (a steward's decision, e.g. a struck-down pole lap) here are excluded from
          fastest-lap classification — Results, Fastest Laps, and the race starting grid — everywhere in the app.
          The lap itself is never removed from the data. Flag a lap from its Results row.
        </p>
        {deletedLaps.length === 0 ? (
          <p className="hint">No laps flagged yet.</p>
        ) : (
          <div className="settings-list">
            {deletedLaps.map((d) => (
              <div className="settings-row settings-row-deleted-lap" key={`${d.sessionId}:${d.carNumber}:${d.lapNumber}`}>
                <div className="settings-row-team">
                  <span className="settings-row-original">
                    Session {d.sessionId} — #{d.carNumber} — Lap {d.lapNumber}
                  </span>
                  <span className="settings-deleted-lap-reason">
                    {d.reason} <span className="settings-deleted-lap-date">({formatDeletedAt(d.deletedAt)})</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="entity-filter-reset"
                  onClick={() => restoreLap(d.sessionId, d.carNumber, d.lapNumber)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
