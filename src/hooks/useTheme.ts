import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function readInitialTheme(): Theme {
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Shared with the main dashboard's own theme state (App.tsx) via the same
// localStorage key, so switching theme on one screen carries over to the
// others — but each standalone page (Live, Replay, the live-staging page)
// needs its own copy of this rather than only the dashboard's Sidebar
// having a toggle, since those pages are routed to directly and never
// render the Sidebar at all.
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    window.localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return [theme, setTheme]
}
