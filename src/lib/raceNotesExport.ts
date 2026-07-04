import { formatClock } from '../replay/format'
import { buildNotesTimeline } from './raceNotesGrid'
import { GENERAL_COLUMN_ID, type RaceNote } from './raceNotes'
import type { NotesColumn } from '../hooks/useNotesColumns'
import type { FlagEvent, RestartEvent } from './flagEvents'

function leaderText(leader: { carNumber: string; driverName: string | null } | null): string {
  if (!leader) return '—'
  return `#${leader.carNumber}${leader.driverName ? ` (${leader.driverName})` : ''}`
}

function noteLine(note: RaceNote): string {
  const elapsed = note.elapsedSeconds != null ? formatClock(note.elapsedSeconds) : '—'
  const raceTime = note.raceLocalTimestamp ? ` (${new Date(note.raceLocalTimestamp).toLocaleTimeString()})` : ''
  const car = note.linkedCar ? `#${note.linkedCar.carNumber}${note.linkedCar.driverName ? ` ${note.linkedCar.driverName}` : ''}` : null
  const lap = note.linkedCar ? ` L${note.linkedCar.lapNumber}` : ''
  const pos = note.linkedCar
    ? ` P${note.linkedCar.classPosition}/${note.linkedCar.totalInClass} (class), P${note.linkedCar.position}/${note.linkedCar.totalCars} (overall)`
    : ''
  const prefix = car ? `${elapsed}${raceTime} ${car}${lap}${pos}` : `${elapsed}${raceTime}`
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

function orderedColumns(columns: NotesColumn[]): NotesColumn[] {
  return [...columns, { id: GENERAL_COLUMN_ID, label: 'General' }]
}

export function raceNotesToMarkdown(
  notes: RaceNote[],
  columns: NotesColumn[],
  cautions: FlagEvent[],
  restarts: RestartEvent[],
  totalDurationSeconds: number | null,
  title: string,
): string {
  const timeline = buildNotesTimeline(notes, columns, cautions, restarts, totalDurationSeconds)
  if (timeline.length === 0) return `# ${title} — race notes\n\nNo notes logged yet.`

  const allColumns = orderedColumns(columns)
  const header = ['Hour', 'Leader', ...allColumns.map((c) => c.label)]
  const sep = header.map(() => '---')
  const lines = [`# ${title} — race notes`, '', `| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`]

  for (const row of timeline) {
    if (row.type === 'flag' || row.type === 'restart') {
      lines.push(`| **${escapeMdCell(row.label)}** | | ${allColumns.map(() => '').join(' | ')} |`)
      continue
    }
    const cells = [
      String(row.hour),
      leaderText(row.leader),
      ...allColumns.map((c) => escapeMdCell(cellText(row.byColumn.get(c.id) ?? []))),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }

  return lines.join('\n')
}

export function raceNotesToHtml(
  notes: RaceNote[],
  columns: NotesColumn[],
  cautions: FlagEvent[],
  restarts: RestartEvent[],
  totalDurationSeconds: number | null,
  title: string,
): string {
  const timeline = buildNotesTimeline(notes, columns, cautions, restarts, totalDurationSeconds)
  const allColumns = orderedColumns(columns)

  const bodyRows =
    timeline.length === 0
      ? `<tr><td colspan="${allColumns.length + 2}">No notes logged yet.</td></tr>`
      : timeline
          .map((row) => {
            if (row.type === 'flag' || row.type === 'restart') {
              const cls = row.type === 'restart' ? 'restart-row' : 'flag-row'
              return `<tr class="${cls}"><td colspan="${allColumns.length + 2}">${escapeHtml(row.label)}</td></tr>`
            }
            const cells = [
              `<td>${row.hour}</td>`,
              `<td>${escapeHtml(leaderText(row.leader))}</td>`,
              ...allColumns.map((c) => `<td>${escapeHtml(cellText(row.byColumn.get(c.id) ?? [])).replace(/\n/g, '<br>')}</td>`),
            ]
            return `<tr>${cells.join('')}</tr>`
          })
          .join('\n')

  const headerCells = ['Hour', 'Leader', ...allColumns.map((c) => c.label)].map((h) => `<th>${escapeHtml(h)}</th>`).join('')

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
  tr.flag-row td { background: #fff3cd; font-weight: 700; text-align: center; }
  tr.restart-row td { background: #d8f3dc; font-weight: 700; text-align: center; }
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

export function downloadRaceNotesMarkdown(
  notes: RaceNote[],
  columns: NotesColumn[],
  cautions: FlagEvent[],
  restarts: RestartEvent[],
  totalDurationSeconds: number | null,
  title: string,
) {
  download(
    `${title.replace(/[^a-z0-9]+/gi, '_')}_race_notes.md`,
    raceNotesToMarkdown(notes, columns, cautions, restarts, totalDurationSeconds, title),
    'text/markdown',
  )
}

export function downloadRaceNotesHtml(
  notes: RaceNote[],
  columns: NotesColumn[],
  cautions: FlagEvent[],
  restarts: RestartEvent[],
  totalDurationSeconds: number | null,
  title: string,
) {
  download(
    `${title.replace(/[^a-z0-9]+/gi, '_')}_race_notes.html`,
    raceNotesToHtml(notes, columns, cautions, restarts, totalDurationSeconds, title),
    'text/html',
  )
}
