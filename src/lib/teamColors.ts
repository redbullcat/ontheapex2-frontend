// Ported from streamlit_api/config.py TEAM_COLORS + utils.py get_team_color.
// Real team livery colors, not the abstract categorical system palette — this
// is a domain-specific identity lookup (like a sports team color), matched
// fuzzily (case-insensitive substring) against the TEAM field. Keys are
// ordered most-specific-first so e.g. "AF Corse" doesn't swallow
// "Ferrari AF Corse" matches meant for the more specific key above it.
const TEAM_COLORS: [string, string][] = [
  // WEC Hypercar
  ['Cadillac Hertz Team JOTA', '#d4af37'],
  ['Peugeot TotalEnergies', '#BBD64D'],
  ['Ferrari AF Corse', '#d62728'],
  ['Toyota Gazoo Racing', '#100100'],
  ['BMW M Team WRT', '#2426a8'],
  ['Porsche Penske Motorsport', '#d3d3d3'],
  ['Alpine Endurance Team', '#2673e2'],
  ['Aston Martin Thor Team', '#01655c'],
  ['Toyota Racing', '#100100'],
  ['Genesis Magma Racing', '#EF732F'],
  ['Cadillac WTR', '#0E3463'],
  // WEC LMGT3
  ['AF Corse', '#FCE903'],
  ['Proton Competition', '#fcfcff'],
  ['WRT', '#2426a8'],
  ['United Autosports', '#FF8000'],
  ['Akkodis ASP', '#ff443b'],
  ['Iron Dames', '#e5017d'],
  ['Manthey', '#0192cf'],
  ['Heart of Racing', '#242c3f'],
  ['Racing Spirit of Leman', '#428ca8'],
  ['Iron Lynx', '#fefe00'],
  ['TF Sport', '#eaaa1d'],
  // GTWC Europe
  ['Team WRT', '#2426a8'],
  ['GetSpeed', '#e8000d'],
  ['Comtoyou Racing', '#00a651'],
  ['Boutsen VDS', '#003087'],
  ['Optimum Motorsport', '#f47920'],
  ['Herberth Motorsport', '#c8a951'],
  ['Rutronik Racing', '#005bac'],
  ['Lionspeed GP', '#e2000f'],
  ['Walkenhorst Motorsport', '#1a1a1a'],
  ['Team RJN', '#e30613'],
  ['Sainteloc Racing', '#d4001f'],
  ['Tresor Attempto Racing', '#1c3f94'],
  ['Rinaldi Racing', '#c00000'],
  ['Kessel Racing', '#ffcc00'],
  ['Rowe Racing', '#005ca9'],
  ['Pure Rxcing', '#3d1152'],
  ['Eastalent Racing', '#c8102e'],
  ['Steller Motorsport', '#003087'],
  ['Greystone GT', '#4a4a4a'],
  ['HRT Ford Racing', '#003478'],
  ['Oman Racing by Century Motorsport', '#c8102e'],
  ['Winward Racing', '#c8102e'],
  ['CSA Racing', '#ff6600'],
  ['Ziggo Sport Tempesta Racing', '#ff6600'],
  ['Grupo Prom Racing Team', '#006341'],
  ['Razoon', '#ffcc00'],
  ['2Seas Motorsport', '#00a0df'],
  ['Paradine Competition', '#1c1c1c'],
  ['Selected Car Racing', '#ff0000'],
  ['natural elements by Walkenhorst', '#1a1a1a'],
  // IMSA
  ['Cadillac Wayne Taylor Racing', '#0E3463'],
  ['JDC-Miller MotorSports', '#F8D94A'],
  ['Acura Meyer Shank Racing w/Curb Agajanian', '#E6662C'],
  ['Cadillac Whelen', '#D53C35'],
]

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function fallbackColor(team: string): string {
  // FNV-1a hash to a stable hue so an unlisted team still gets a unique,
  // deterministic color (same name -> same hue every render).
  let hash = 0x811c9dc5
  for (let i = 0; i < team.length; i++) {
    hash ^= team.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const unsigned = hash >>> 0
  const hue = (unsigned & 0xffff) / 0x10000
  const sat = 0.65 + ((unsigned >>> 16) & 0xff) / 255 / 5
  const light = 0.5 + ((unsigned >>> 8) & 0xff) / 255 * 0.15
  return hslToHex(hue, sat, light)
}

const resolvedCache = new Map<string, string>()

export function getTeamColor(team: string | null | undefined): string {
  if (!team) return fallbackColor('Unknown')
  const cached = resolvedCache.get(team)
  if (cached) return cached
  const lower = team.toLowerCase()
  for (const [key, color] of TEAM_COLORS) {
    if (lower.includes(key.toLowerCase())) {
      resolvedCache.set(team, color)
      return color
    }
  }
  const fallback = fallbackColor(team)
  resolvedCache.set(team, fallback)
  return fallback
}
