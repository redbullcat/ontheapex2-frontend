import type { PanelInstance } from './types'

// Builds the URL a pop-out window opens — same route, with dashPanel/dashCar
// query params telling it to render just this one panel instead of the
// full dashboard (see replay/ReplayApp.tsx's / live/LiveNowApp.tsx's
// DashboardStandalonePanel).
export function buildPopoutUrl(panel: PanelInstance, extraParams: Record<string, string>): string {
  const params = new URLSearchParams({ ...extraParams, dashPanel: panel.kind })
  if (panel.carNumber) params.set('dashCar', panel.carNumber)
  return `${window.location.pathname}?${params.toString()}`
}

export function openPopout(url: string): void {
  window.open(url, '_blank', 'width=760,height=560')
}
