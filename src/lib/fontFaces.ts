// The @font-face CSS for the title-recording feature's font choices —
// split out from lib/fonts.ts so it's only ever fetched when actually
// needed (see ensureTitleFontLoaded), not bundled into the app's one
// global stylesheet that every visitor loads regardless of whether they
// ever open the "finalize recording" title screen. Each @fontsource
// package's own index.css only ships the 400 (Regular) weight, so every
// other weight/style needs its own import here. Saira Condensed has no
// italic cut on Google Fonts, so only the upright weights exist for it.
import '@fontsource/saira/100.css'
import '@fontsource/saira/100-italic.css'
import '@fontsource/saira/200.css'
import '@fontsource/saira/200-italic.css'
import '@fontsource/saira/300.css'
import '@fontsource/saira/300-italic.css'
import '@fontsource/saira/400.css'
import '@fontsource/saira/400-italic.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/500-italic.css'
import '@fontsource/saira/600.css'
import '@fontsource/saira/600-italic.css'
import '@fontsource/saira/700.css'
import '@fontsource/saira/700-italic.css'
import '@fontsource/saira/800.css'
import '@fontsource/saira/800-italic.css'
import '@fontsource/saira/900.css'
import '@fontsource/saira/900-italic.css'
import '@fontsource/saira-condensed/100.css'
import '@fontsource/saira-condensed/200.css'
import '@fontsource/saira-condensed/300.css'
import '@fontsource/saira-condensed/400.css'
import '@fontsource/saira-condensed/500.css'
import '@fontsource/saira-condensed/600.css'
import '@fontsource/saira-condensed/700.css'
import '@fontsource/saira-condensed/800.css'
import '@fontsource/saira-condensed/900.css'
