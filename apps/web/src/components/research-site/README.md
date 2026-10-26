# Knoww research site

The LTFM marketing site uses the supplied `knoww-site-v4.zip` design. Its routes are `/`, `/use-cases`, `/research`, and `/company`. Each route owns its metadata and page styles. Internal route links use Next.js navigation.

## Module responsibilities

- `site-shell.tsx` and the page content components render on the server.
- `home-figures.tsx`, `research-figures.tsx`, `roadmap.tsx`, and `training-visuals.tsx` render static diagrams on the server.
- `model-console.tsx` and `inference-chart.tsx` own interactive demos. Their calculations live in `console-model.ts` and `gaussian-process.ts`.
- `pilot-request.tsx` coordinates the request form and draft preview. `pilot-form.tsx` renders fields and validation errors. `pilot-request-model.ts` defines allowed choices, limits, validation, and email encoding.
- `themed-select.tsx` uses the existing Radix menu dependency. Its portal stays inside the research-site theme. `copy-button.tsx` handles clipboard success and failure feedback.

## Typography and styles

The site inherits the fonts already loaded by the root layout. Plus Jakarta Sans is the heading and UI font. Fraunces italic is reserved for the hero accent and closing statement. JetBrains Mono is used for numbers and metadata, including chart annotations. The site adds no font downloads or package dependencies beyond the existing app.

Tailwind v4 theme tokens live in `src/app/styles/research-theme.css`, which the global stylesheet imports. Colors, radii, control height, and container width use `@theme static` so separately processed component styles can reference them. Font utilities use `@theme inline` to resolve the fonts loaded by the root layout.

Layouts use Tailwind utilities where they are shared or responsive, including the centered desktop navigation, form grids, and action rows. Component styles reference the global stylesheet with `@reference` and live in `@layer components`, so utilities can override them. Styles stay inside `.kw-research-site`, with page styles separate from shared styles. The prototype's responsive overrides remain in order; the CSS specificity lint exception documents that choice. Reduced-motion overrides live in `@layer utilities` to take precedence over component animations. Wide charts and the roadmap have keyboard-scrollable containers.

## Input and data handling

The pilot form validates values with the existing Zod dependency. It enforces maximum lengths and allowed dropdown values, rejects control characters in single-line fields, and encodes the subject and body as separate email URL parameters. The preview renders user text through React's escaping. The form prepares a draft locally and sends no request to a server. Pilot details are not logged or stored by this feature.

The console uses synthetic records and an illustrative scoring function. Its outputs are not LTFM predictions. The chart uses a Gaussian process to illustrate uncertainty. Autoplay pauses offscreen, respects reduced motion, and has play/pause controls. Observation history is capped at 40 points. Timers, observers, and event listeners are cleaned up on unmount.

Research results, benchmarks, team information, and roadmap copy come from the supplied design. This implementation review does not independently validate those claims.

## Checks

Run the feature tests from `apps/web` with `vitest run src/components/research-site`. They cover industry switching, abstention, pilot validation and editing, dropdown selections, uncertainty calculations, and email URL encoding. Sitemap coverage is in `src/lib/sitemap-routes.test.ts`. Formatting follows the repository's Biome configuration.
