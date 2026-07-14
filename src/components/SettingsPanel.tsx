import { useEffect, useMemo, useState } from 'react'
import { getTeamColor } from '../lib/identityColors'
import { clearTeamOverride, getTeamOverrides, setTeamOverride } from '../lib/identityOverrides'
import { clearLapDeleted, listDeletedLaps, loadAllDeletedLaps } from '../lib/lapOverrides'
import { useDeletedLapsVersion } from '../hooks/useDeletedLapsVersion'
import { addPenalty, listPenalties, loadAllPenalties, removePenalty } from '../lib/penalties'
import { usePenaltiesVersion } from '../hooks/usePenaltiesVersion'

function formatDeletedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function SettingsPanel({
  teams,
  onClose,
  currentSessionId,
}: {
  teams: string[]
  onClose: () => void
  // Pre-fills the penalty form's Session ID field with whichever session is
  // currently open — the common case (recording a penalty just reviewed
  // for the race in view) shouldn't require looking up its numeric id.
  currentSessionId?: number
}) {
  const [overrides, setOverrides] = useState(() => getTeamOverrides())
  const [addTeam, setAddTeam] = useState('')
  const [addColor, setAddColor] = useState('#2a78d6')
  const [addName, setAddName] = useState('')
  const deletedLapsVersion = useDeletedLapsVersion()
  const deletedLaps = useMemo(
    () => listDeletedLaps(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletedLapsVersion],
  )
  const penaltiesVersion = usePenaltiesVersion()
  const penalties = useMemo(
    () => listPenalties(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [penaltiesVersion],
  )
  const [penaltySession, setPenaltySession] = useState(() => (currentSessionId != null ? String(currentSessionId) : ''))
  const [penaltyCar, setPenaltyCar] = useState('')
  const [penaltyText, setPenaltyText] = useState('')
  const [penaltyReason, setPenaltyReason] = useState('')
  const [penaltyDocUrl, setPenaltyDocUrl] = useState('')

  useEffect(() => {
    // Both stores only ever hold whatever's been fetched already (per
    // session, as each session is viewed) — a full load here is what makes
    // this review list actually span every session, not just the one open
    // when Settings happens to be opened.
    loadAllDeletedLaps()
    loadAllPenalties()
  }, [])

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
  }

  const canAddPenalty = penaltySession.trim() !== '' && !Number.isNaN(Number(penaltySession)) && penaltyCar.trim() !== '' && penaltyText.trim() !== '' && penaltyReason.trim() !== ''

  const submitPenalty = () => {
    if (!canAddPenalty) return
    addPenalty({
      session_id: Number(penaltySession),
      car_number: penaltyCar.trim(),
      penalty: penaltyText.trim(),
      reason: penaltyReason.trim(),
      stewards_doc_url: penaltyDocUrl.trim() || null,
    })
    setPenaltyCar('')
    setPenaltyText('')
    setPenaltyReason('')
    setPenaltyDocUrl('')
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

        <h3 className="settings-section-head">Penalties</h3>
        <p className="hint">
          Post-session steward decisions — time penalties, drive-throughs, disqualification, etc. Recorded here for
          review/audit; visible wherever the car appears (e.g. the Results table).
        </p>
        {penalties.length === 0 ? (
          <p className="hint">No penalties recorded yet.</p>
        ) : (
          <div className="settings-list">
            {penalties.map((p) => (
              <div className="settings-row settings-row-deleted-lap" key={p.id}>
                <div className="settings-row-team">
                  <span className="settings-row-original">
                    Session {p.session_id} — #{p.car_number} — {p.penalty}
                  </span>
                  <span className="settings-deleted-lap-reason">
                    {p.reason} <span className="settings-deleted-lap-date">({formatDeletedAt(p.created_at)})</span>
                  </span>
                  {p.stewards_doc_url && (
                    <a href={p.stewards_doc_url} target="_blank" rel="noopener noreferrer">
                      Stewards document
                    </a>
                  )}
                </div>
                <button type="button" className="entity-filter-reset" onClick={() => removePenalty(p.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="settings-add">
          <span className="field-label">Add a penalty</span>
          <div className="settings-row">
            <input
              type="number"
              placeholder="Session ID"
              value={penaltySession}
              onChange={(e) => setPenaltySession(e.target.value)}
              style={{ width: 90 }}
            />
            <input type="text" placeholder="Car #" value={penaltyCar} onChange={(e) => setPenaltyCar(e.target.value)} style={{ width: 70 }} />
            <input
              type="text"
              placeholder="Penalty (e.g. 5 second time penalty)"
              value={penaltyText}
              onChange={(e) => setPenaltyText(e.target.value)}
            />
          </div>
          <div className="settings-row">
            <input
              type="text"
              placeholder="Reason"
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
            />
            <input
              type="url"
              placeholder="Stewards document URL (optional)"
              value={penaltyDocUrl}
              onChange={(e) => setPenaltyDocUrl(e.target.value)}
            />
            <button type="button" className="chart-export-trigger" disabled={!canAddPenalty} onClick={submitPenalty}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
