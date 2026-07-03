import type { ReactNode } from 'react'

export function PanelFrame({
  title,
  onClose,
  onPopOut,
  children,
}: {
  title: string
  onClose: () => void
  onPopOut?: () => void
  children: ReactNode
}) {
  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <span className="dash-panel-title">{title}</span>
        <div className="dash-panel-actions">
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
      <div className="dash-panel-body">{children}</div>
    </div>
  )
}
