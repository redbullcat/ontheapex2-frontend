import { useState, type ReactNode } from 'react'
import { PanelSettingsContext } from './panelSettingsContext'

export function PanelFrame({
  title,
  onClose,
  onPopOut,
  hasSettings,
  children,
}: {
  title: string
  onClose: () => void
  onPopOut?: () => void
  // Panels whose chart has its own class/car/driver filters opt into a
  // gear icon here instead of showing those controls inline — dashboard
  // panels have much less width to spare than this chart's other home in
  // the full-width sidebar/main app, where the filters stay inline as always.
  hasSettings?: boolean
  children: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <span className="dash-panel-title">{title}</span>
        <div className="dash-panel-actions">
          {hasSettings && (
            <button
              type="button"
              className="dash-panel-btn"
              onClick={() => setSettingsOpen((o) => !o)}
              title="Panel settings"
            >
              ⚙
            </button>
          )}
          {onPopOut && (
            <button type="button" className="dash-panel-btn" onClick={onPopOut} title="Pop out to a new window">
              ⤢
            </button>
          )}
          <button type="button" className="dash-panel-btn" onClick={onClose} title="Close panel">
            ✕
          </button>
        </div>
      </div>
      <div className="dash-panel-body">
        <PanelSettingsContext.Provider value={{ open: settingsOpen, close: () => setSettingsOpen(false) }}>
          {children}
        </PanelSettingsContext.Provider>
      </div>
    </div>
  )
}
