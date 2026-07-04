import type { ReactNode } from 'react'
import { usePanelSettings } from './panelSettingsContext'

// A chart rendered inside a dashboard panel wraps its own class/car/driver
// filter controls in this, instead of showing them inline — the actual
// open/closed state lives on PanelFrame (toggled by the gear icon in the
// panel's black title bar), reached here via context so each chart doesn't
// need an `open`/`onClose` prop pair plumbed down from the panel registry.
export function PanelSettingsPopover({ children }: { children: ReactNode }) {
  const { open, close } = usePanelSettings()
  if (!open) return null
  return (
    <>
      <div className="panel-settings-backdrop" onClick={close} />
      <div className="panel-settings-modal">
        <div className="panel-settings-modal-header">
          <span>Filters</span>
          <button type="button" className="dash-panel-btn" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <div className="panel-settings-modal-body">{children}</div>
      </div>
    </>
  )
}
