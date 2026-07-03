import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ReplayApp } from './replay/ReplayApp.tsx'

// The Live Timing Replay view intentionally lives outside the main app
// shell (its own tab, full browser width — see the wireframe discussion),
// so it's routed here rather than through App's own tab/state system. Just
// a plain pathname check: the app has exactly two entry points, not enough
// to justify a router dependency.
const isReplay = window.location.pathname === '/replay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isReplay ? <ReplayApp /> : <App />}</StrictMode>,
)
