// Track map SVGs are only available for the 2025 WEC season (bundled from
// the Streamlit reference app's tracks/2025 directory), keyed by filename
// prefixes that don't match the API's event slugs — matched by keyword
// against the event's display name instead of an exact slug lookup.
const TRACK_FILES: { keywords: string[]; file: string }[] = [
  { keywords: ['qatar', 'losail'], file: '1-qatar.svg' },
  { keywords: ['imola'], file: '2-imola.svg' },
  { keywords: ['spa'], file: '3-spa.svg' },
  { keywords: ['le mans', 'le-mans', 'lemans'], file: '4-le-mans.svg' },
  { keywords: ['interlagos', 'sao paulo', 'são paulo', 'sao-paulo', 'brazil'], file: '5-interlagos.svg' },
  { keywords: ['cota', 'circuit of the americas', 'americas', 'austin'], file: '6-cota.svg' },
  { keywords: ['fuji'], file: '7-fuji.svg' },
  { keywords: ['bahrain'], file: '8-bahrain.svg' },
]

export function findTrackMapUrl(eventName: string, year = 2025): string | null {
  const lower = eventName.toLowerCase()
  for (const { keywords, file } of TRACK_FILES) {
    if (keywords.some((k) => lower.includes(k))) {
      return `/tracks/${year}/${file}`
    }
  }
  return null
}
