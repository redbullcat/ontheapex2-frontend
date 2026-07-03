import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReplayApp } from './replay/ReplayApp.tsx'
import { LiveNowApp } from './live/LiveNowApp.tsx'

// The Live Timing Replay/Live views intentionally live outside the main app
// shell (their own tab, full browser width — see the wireframe discussion),
// so they're routed here rather than through App's own tab/state system.
// Just a plain pathname check: not enough entry points yet to justify a
// router dependency.
const path = window.location.pathname
const isReplay = path === '/replay'
const isLiveNow = path === '/live-now'

function render() {
  if (isReplay) return <ReplayApp />
  if (isLiveNow) return <LiveNowApp />
  return <App />
}

createRoot(document.getElementById('root')!).render(<StrictMode>{render()}</StrictMode>)
