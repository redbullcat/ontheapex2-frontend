// Fonts available in the "Edit as SVG" editor. Saira / Saira Condensed are
// already self-hosted by ./fonts (title-recording feature); Inter and
// Spline Sans Mono are new here, self-hosted the same way so the editor's
// live in-app preview renders correctly without an external request.
import './fonts'
import '@fontsource/inter/100.css'
import '@fontsource/inter/100-italic.css'
import '@fontsource/inter/200.css'
import '@fontsource/inter/200-italic.css'
import '@fontsource/inter/300.css'
import '@fontsource/inter/300-italic.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/500-italic.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/600-italic.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/700-italic.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/800-italic.css'
import '@fontsource/inter/900.css'
import '@fontsource/inter/900-italic.css'
// Spline Sans Mono only ships weights 300-700 on Google Fonts — no 100/200/
// 800/900 cuts exist to import.
import '@fontsource/spline-sans-mono/300.css'
import '@fontsource/spline-sans-mono/300-italic.css'
import '@fontsource/spline-sans-mono/400.css'
import '@fontsource/spline-sans-mono/400-italic.css'
import '@fontsource/spline-sans-mono/500.css'
import '@fontsource/spline-sans-mono/500-italic.css'
import '@fontsource/spline-sans-mono/600.css'
import '@fontsource/spline-sans-mono/600-italic.css'
import '@fontsource/spline-sans-mono/700.css'
import '@fontsource/spline-sans-mono/700-italic.css'

export type SvgEditorFontFamily = 'Inter' | 'Saira' | 'Saira Condensed' | 'Spline Sans Mono'

export const SVG_EDITOR_FONT_FAMILIES: SvgEditorFontFamily[] = ['Inter', 'Saira', 'Saira Condensed', 'Spline Sans Mono']

const WEIGHTS_BY_FAMILY: Record<SvgEditorFontFamily, number[]> = {
  Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  Saira: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Saira Condensed': [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Spline Sans Mono': [300, 400, 500, 600, 700],
}

// Saira Condensed has no italic cut on Google Fonts.
const FAMILIES_WITH_ITALIC = new Set<SvgEditorFontFamily>(['Inter', 'Saira', 'Spline Sans Mono'])

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

export interface FontStyleOption {
  weight: number
  italic: boolean
  label: string
}

export function stylesForSvgEditorFamily(family: SvgEditorFontFamily): FontStyleOption[] {
  const hasItalic = FAMILIES_WITH_ITALIC.has(family)
  const options: FontStyleOption[] = []
  for (const weight of WEIGHTS_BY_FAMILY[family]) {
    options.push({ weight, italic: false, label: WEIGHT_LABELS[weight] })
    if (hasItalic) options.push({ weight, italic: true, label: `${WEIGHT_LABELS[weight]} Italic` })
  }
  return options
}

export function svgEditorFontFamilyCss(family: SvgEditorFontFamily): string {
  return family.includes(' ') ? `'${family}'` : family
}

// A generic fallback matters here specifically: if the named family fails
// to load (slow network, a host that strips the @import), a bare family
// name with nothing after it falls back to the browser's serif default on
// many platforms — jarringly different from the sans look every one of
// these families has.
export function svgEditorFontStack(family: SvgEditorFontFamily): string {
  const generic = family === 'Spline Sans Mono' ? 'monospace' : 'sans-serif'
  return `${svgEditorFontFamilyCss(family)}, ${generic}`
}

// Fed into an exported/copied SVG's <style> block — the file lives outside
// the app (pasted into Ghost), so it can't reach our self-hosted assets and
// needs the same families from Google Fonts' CDN instead. ital/wght range
// syntax pulls every weight+style in one request per family.
export const SVG_EDITOR_GOOGLE_FONTS_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?" +
  'family=Inter:ital,wght@0,100..900;1,100..900' +
  '&family=Saira:ital,wght@0,100..900;1,100..900' +
  '&family=Saira+Condensed:wght@100..900' +
  '&family=Spline+Sans+Mono:ital,wght@0,300..700;1,300..700' +
  "&display=swap');"
