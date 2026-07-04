import { formatClock } from '../replay/format'
import { buildNotesGrid } from './raceNotesGrid'
import type { RaceNote } from './raceNotes'

function leaderText(leader: { carNumber: string; driverName: string | null } | null): string {
  if (!leader) return '—'
  return `#${leader.carNumber}${leader.driverName ? ` (${leader.driverName})` : ''}`
}

function noteLine(note: RaceNote): string {
  const elapsed = note.elapsedSeconds != null ? formatClock(note.elapsedSeconds) : '—'
  const raceTime = note.raceLocalTimestamp ? ` (${new Date(note.raceLocalTimestamp).toLocaleTimeString()})` : ''
  const car = note.linkedCar ? `#${note.linkedCar.carNumber}${note.linkedCar.driverName ? ` ${note.linkedCar.driverName}` : ''}` : null
  const lap = note.linkedCar ? ` L${note.linkedCar.lapNumber}` : ''
  const prefix = car ? `${elapsed}${raceTime} ${car}${lap}` : `${elapsed}${raceTime}`
  return `${prefix}: ${note.text}`
}

function cellText(notes: RaceNote[]): string {
  return notes.length === 0 ? '' : notes.map(noteLine).join('\n')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

export function raceNotesToMarkdown(notes: RaceNote[], classes: string[], title: string): string {
  const grid = buildNotesGrid(notes, classes)
  if (grid.length === 0) return `# ${title} — race notes\n\nNo notes logged yet.`

  const allClasses = [...new Set([...classes, ...grid.flatMap((r) => [...r.byClass.keys()])])]
  const header = ['Hour', 'Leader', ...allClasses, 'General']
  const sep = header.map(() => '---')
  const lines = [`# ${title} — race notes`, '', `| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`]

  for (const row of grid) {
    const cells = [
      String(row.hour),
      leaderText(row.leader),
      ...allClasses.map((cls) => escapeMdCell(cellText(row.byClass.get(cls) ?? []))),
      escapeMdCell(cellText(row.general)),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }

  return lines.join('\n')
}

export function raceNotesToHtml(notes: RaceNote[], classes: string[], title: string): string {
  const grid = buildNotesGrid(notes, classes)
  const allClasses = [...new Set([...classes, ...grid.flatMap((r) => [...r.byClass.keys()])])]

  const bodyRows =
    grid.length === 0
      ? `<tr><td colspan="${allClasses.length + 3}">No notes logged yet.</td></tr>`
      : grid
          .map((row) => {
            const cells = [
              `<td>${row.hour}</td>`,
              `<td>${escapeHtml(leaderText(row.leader))}</td>`,
              ...allClasses.map((cls) => `<td>${escapeHtml(cellText(row.byClass.get(cls) ?? [])).replace(/\n/g, '<br>')}</td>`),
              `<td>${escapeHtml(cellText(row.general)).replace(/\n/g, '<br>')}</td>`,
            ]
            return `<tr>${cells.join('')}</tr>`
          })
          .join('\n')

  const headerCells = ['Hour', 'Leader', ...allClasses, 'General'].map((h) => `<th>${escapeHtml(h)}</th>`).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — race notes</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; background: #fff; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; text-align: left; vertical-align: top; white-space: pre-wrap; }
  th { background: #f4f4f4; }
  h1 { font-size: 20px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)} — race notes</h1>
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
</body>
</html>
`
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadRaceNotesMarkdown(notes: RaceNote[], classes: string[], title: string) {
  download(`${title.replace(/[^a-z0-9]+/gi, '_')}_race_notes.md`, raceNotesToMarkdown(notes, classes, title), 'text/markdown')
}

export function downloadRaceNotesHtml(notes: RaceNote[], classes: string[], title: string) {
  download(`${title.replace(/[^a-z0-9]+/gi, '_')}_race_notes.html`, raceNotesToHtml(notes, classes, title), 'text/html')
}
