import type { Theme } from '../hooks/useTheme'

export function ThemeToggleButton({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <button
      type="button"
      className="theme-toggle-standalone"
      onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
