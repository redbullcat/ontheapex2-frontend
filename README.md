# On The Apex — Frontend

D3.js/React frontend for [On The Apex](https://ontheapex.com), a race data
platform for endurance motorsport (FIA WEC, IMSA, ELMS, GTWC).

This is a Vite + React + TypeScript + D3 skeleton that proves the full
pipeline: pick a series → pick an event → pick a session → render a real
chart (lead history) against the live API, with no proxy or backend of its
own.

## Stack

- Vite + React + TypeScript
- D3 for chart rendering (not a charting library — direct DOM/SVG control)
- No SSR/routing framework — this is a password-gated internal dashboard,
  not a public site

## API

Talks directly to `https://ontheapex-api.fly.dev` from the browser
(`src/api/client.ts`). The API is read-only, unauthenticated, and has CORS
wide open, so no backend-for-frontend proxy is needed. See the API's own
`/docs` (Swagger UI) for the full surface.

## Development

```bash
npm install
npm run dev
```

```bash
npm run build    # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # serve the production build locally
```

## Structure

```
src/
  api/            fetch client + response types for the ontheapex-api endpoints used so far
  hooks/          useAsync — a tiny loading/error/data wrapper around fetch calls
  components/
    Select.tsx            generic labeled <select>
    LeadHistoryChart.tsx  D3 timeline of who led each lap range
  App.tsx         series → event → session picker, wired to the chart
```

## Deployment

Target is Vercel, on `data.ontheapex.com`, with Cloudflare Access in front
of the DNS record for tester allowlisting (app has no auth of its own).

## Status

Skeleton stage: one chart type (lead history) end-to-end. The Streamlit
reference app (`streamlit_api/` in `ontheapex2-backend`) has ~25 chart types
against this same API — pace, gap evolution, tyre degradation, stint
strategy, driver comparisons, etc. — to port next.
