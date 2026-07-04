import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CarReferenceOption } from '../lib/carReference'
import { formatCarReference } from '../lib/carReference'

interface SlashState {
  start: number
  query: string
}

// A car number/driver/team is only a valid trigger start if it's right at
// the beginning of a "word" — guards against an ordinary slash inside note
// text (a date "10/07", a fraction) being mistaken for the start of a
// reference.
function findTriggerStart(value: string, cursor: number): number | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = value[i]
    if (ch === '/') {
      const before = value[i - 1]
      return before === undefined || /\s/.test(before) ? i : null
    }
    if (/\s/.test(ch)) return null
  }
  return null
}

export function SlashReferenceTextarea({
  value,
  onChange,
  options,
  className,
  placeholder,
  rows,
  autoFocus,
  onKeyDownCapture,
}: {
  value: string
  onChange: (value: string) => void
  options: CarReferenceOption[]
  className?: string
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  // Fires for every keydown the picker doesn't itself consume — lets the
  // caller keep its own shortcuts (Cmd/Ctrl+Enter to submit, Escape to
  // cancel an edit) working exactly as before.
  onKeyDownCapture?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [highlight, setHighlight] = useState(0)
  const pendingCaretRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingCaretRef.current == null) return
    const pos = pendingCaretRef.current
    pendingCaretRef.current = null
    const el = textareaRef.current
    if (el) el.setSelectionRange(pos, pos)
  }, [value])

  const filtered = slash
    ? options.filter((o) => o.searchText.includes(slash.query.toLowerCase())).slice(0, 8)
    : []

  function syncSlashState(el: HTMLTextAreaElement) {
    const cursor = el.selectionStart
    const start = findTriggerStart(el.value, cursor)
    if (start == null) {
      setSlash(null)
      return
    }
    setSlash({ start, query: el.value.slice(start + 1, cursor) })
    setHighlight(0)
  }

  function selectOption(option: CarReferenceOption) {
    if (!slash) return
    const el = textareaRef.current
    const cursor = el ? el.selectionStart : slash.start + 1 + slash.query.length
    const inserted = formatCarReference(option)
    const newValue = value.slice(0, slash.start) + inserted + ' ' + value.slice(cursor)
    pendingCaretRef.current = slash.start + inserted.length + 1
    onChange(newValue)
    setSlash(null)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slash && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectOption(filtered[highlight])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
    }
    onKeyDownCapture?.(e)
  }

  return (
    <div className="slash-reference-wrap">
      <textarea
        ref={textareaRef}
        className={className}
        value={value}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          syncSlashState(e.target)
        }}
        onKeyUp={(e) => {
          // Arrow-key cursor movement doesn't fire onChange, so the slash
          // trigger needs re-checking here too (e.g. moving out of a
          // "/query" span should close the picker without editing text).
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') syncSlashState(e.currentTarget)
        }}
        onClick={(e) => syncSlashState(e.currentTarget)}
        onKeyDown={handleKeyDown}
      />
      {slash && filtered.length > 0 && (
        <div className="slash-reference-menu">
          {filtered.map((option, i) => (
            <div
              key={option.carNumber}
              className={'slash-reference-option' + (i === highlight ? ' active' : '')}
              onMouseDown={(e) => {
                // mousedown (not click) fires before the textarea's blur,
                // so the selection is still valid when selectOption reads it.
                e.preventDefault()
                selectOption(option)
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="slash-reference-pos">P{option.position}</span>
              <span className="slash-reference-car">#{option.carNumber}</span>
              <span className="slash-reference-driver">{option.driverName ?? '—'}</span>
              <span className="slash-reference-team">{option.team ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
