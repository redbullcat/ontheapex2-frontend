// "Save as default" for the SVG editor — persisted the same way team-color
// overrides are (see identityOverrides.ts), so choosing a font/size/element
// setup once can be re-applied to any other chart's editor session.
import type { SvgEditorFontFamily } from './svgEditorFonts'

export interface SvgEditorDefaults {
  titleFontFamily: SvgEditorFontFamily
  titleFontWeight: number
  titleItalic: boolean
  titleFontSize: number
  bodyFontFamily: SvgEditorFontFamily | null
  hiddenGroups: string[]
  backgroundVisible: boolean
}

const STORAGE_KEY = 'ota:svgEditorDefaults'

export const FALLBACK_DEFAULTS: SvgEditorDefaults = {
  titleFontFamily: 'Saira',
  titleFontWeight: 700,
  titleItalic: false,
  titleFontSize: 28,
  bodyFontFamily: 'Inter',
  hiddenGroups: [],
  backgroundVisible: false,
}

export function getSvgEditorDefaults(): SvgEditorDefaults | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...FALLBACK_DEFAULTS, ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

export function saveSvgEditorDefaults(defaults: SvgEditorDefaults) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
}

export function hasSvgEditorDefaults(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) != null
  } catch {
    return false
  }
}
