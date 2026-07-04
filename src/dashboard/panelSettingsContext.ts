import { createContext, useContext } from 'react'

export interface PanelSettingsState {
  open: boolean
  close: () => void
}

// Provided by PanelFrame around each panel's body — lets a chart rendered
// inside a dashboard panel know whether its own gear-icon settings popup
// (opened from the panel's black title bar) is currently open, without
// threading an `open`/`onClose` prop pair through every panel registry call
// site by hand.
export const PanelSettingsContext = createContext<PanelSettingsState>({ open: false, close: () => {} })

export function usePanelSettings() {
  return useContext(PanelSettingsContext)
}
