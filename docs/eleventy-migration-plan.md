# Eleventy migration plan

Implemented November 3, 2026. This document retains the original migration plan as an architectural record. Current setup and editing instructions are in the [README](../README.md) and [editing guide](editing-guide.md).

The implementation preserves the original CSS and search script, interactive graph viewer, public routes, payload contracts, and rendered design. Browser testing also identified and corrected the graph expansion URL handling for colon-containing ontology IDs. Release data contains alternate IDs that also appear as OWL classes; the migration retains the legacy redirect precedence for those URLs instead of rejecting them as conflicts. The static SVG renderer is exposed through a template filter.

Validation at cutover:

- Eight automated tests pass after a clean install from the lockfile.
- Compared against a fresh legacy build of the same release and history: 5,509 HTML pages match after normalizing whitespace and equivalent relative links, and 2,659 JSON files have equivalent content. Checked 43,749 internal links.
- Desktop and narrow-screen homepage and term-page screenshots have zero differing pixels.
- Browser checks pass for search, graph controls and expansion, keyboard highlighting, static fallback, live Markdown/include/data/CSS edits, and prepared-data refresh. Ordinary edits leave the prepared ontology snapshot unchanged.
- The obsolete HTML renderer and historical build directories are removed. Generated builds and caches are no longer tracked; the single current output remains in ignored dist/.

The goal is to make this website easy to edit by hand while preserving its current appearance and behavior. Eleventy will assemble pages from readable templates, written content, and prepared ontology data.

## Design and scope

Use the existing website as the design reference. Preserve its colors, typography, masthead, cards, spacing, responsive styling, search, and graph presentation. Copy the existing HTML structure into templates and retain `src/assets/styles.css`. No starter theme is needed: Eleventy supports independent template formats and gives the project control over its output. [Eleventy architecture](https://www.11ty.dev/)

The migration should deliver:

- Markdown files for written content and HTML-like Nunjucks files for page structure.
- Shared header, footer, and term sections with recognizable filenames.
- An ontology preparation step that remains independent of Eleventy.
- A local preview command with browser refresh on save.
- A single generated output directory and an editing guide.

Keep visual redesign, search ranking changes, graph layout consolidation, and ontology parser changes for subsequent work. Keeping this migration focused will make comparisons with the existing site useful.

Use the verified stable Eleventy 3.x release at implementation time and pin its exact patch version with a committed lockfile. Record a supported Node.js LTS version in `.nvmrc` and `package.json`. Version 3 is currently stable and the Build Awesome version 4 transition is a separate future upgrade. [Release status](https://www.11ty.dev/docs/versions/)

## Original structure

- `scripts/build-site.mjs` reads ontology inputs, builds data, copies assets, renders HTML, and writes redirects.
- `lib/pages.mjs` combines page markup with term payload generation.
- `lib/render.mjs` combines shared markup, relationship and history markup, and static SVG geometry.
- `lib/ontology.mjs` and `lib/history.mjs` provide reusable ontology processing.
- `src/assets/` contains the current stylesheet and browser JavaScript.
- The existing tests cover graph semantics, payload merging, and interactive layout.
- Eight tracked `dist*` directories contain 54,571 generated files. The `.gitignore` entries currently target a different `site/` directory layout.

At drafting time, the sibling checkout `../SO-Ontologies/Ontology_Files/` contains all three release inputs. Node.js and npm are not on this terminal's PATH; resolve the toolchain before implementation and baseline builds.

## Proposed source layout

The implementation follows this structure, with build-path validation in lib/build-paths.mjs and computed term titles in src/pages/terms.11tydata.js.

```text
eleventy.config.js
package.json
package-lock.json
.nvmrc
README.md
docs/
  editing-guide.md
  eleventy-migration-plan.md
src/
  pages/
    index.md
    about.md
    browse.njk
    search.njk
    release.njk
    terms.njk
    redirects.njk
  _includes/
    layouts/
      base.njk
      home.njk
      content.njk
      term.njk
    header.njk
    footer.njk
    term/
      relationships.njk
      history.njk
      graph.njk
  _data/
    site.json
    navigation.json
    ontology.js
  assets/
    styles.css
    search.js
    graph.js
lib/
  ontology.mjs
  history.mjs
  shared.mjs
  site-data.mjs
  graph-payload.mjs
  graph-svg.mjs
scripts/
  prepare-data.mjs
  build-site.mjs
  dev.mjs
test/
  fixtures/
  graph-contract.test.mjs
  interactive-graph.test.mjs
  site-build.test.mjs
.cache/                         # generated; ignored
dist/                           # generated; ignored
```

Use `src` as Eleventy's input directory and `dist` as its final output. The existing ESM module convention remains in place. Keep configuration short and start without additional Eleventy plugins. [Configuration documentation](https://www.11ty.dev/docs/config/)

| Manual edit | Intended location |
| --- | --- |
| Homepage prose and small structured content blocks | `src/pages/index.md`, including its front matter |
| About-page text | `src/pages/about.md` |
| Site name, description, and featured term IDs | `src/_data/site.json` |
| Navigation labels, order, and destinations | `src/_data/navigation.json` |
| Masthead or footer markup | `src/_includes/header.njk`, `footer.njk` |
| Term-page layout | `src/_includes/layouts/term.njk` |
| Relationships, history, or graph section markup | The matching file in `src/_includes/term/` |
| Colors, spacing, and fonts | `src/assets/styles.css` |
| Search or interactive graph behavior | `src/assets/search.js`, `graph.js` |
| Scientific labels, definitions, and relationships | The ontology source checkout |

Keep written page content in Markdown and layout structure in Nunjucks. Nunjucks supplies HTML with placeholders, loops, and includes; Markdown supplies readable prose. Avoid extracting tiny includes that make a page harder to follow. [Markdown support](https://www.11ty.dev/docs/languages/markdown/), [Nunjucks support](https://www.11ty.dev/docs/languages/nunjucks/)

## Data and rendering responsibilities

The build will follow this sequence:

```text
OWL + graph JSON + release metrics + optional Git history
  -> ontology preparation
  -> .cache/site-data.json and .cache/site-public/
  -> Eleventy templates + Markdown + existing assets
  -> dist/
```

`scripts/prepare-data.mjs` will coordinate input reads, existing ontology processing, and generated data writes. `lib/site-data.mjs` will provide template-friendly objects and ordered arrays, including resolved relationship links and alias records. `lib/graph-payload.mjs` will own the existing `buildTermPayload` contract independently of page rendering.

The internal snapshot will contain metadata, metrics, terms, browse entries, aliases, and source provenance. Serialize plain objects and arrays; JavaScript Maps should stay inside the processing code. Resolve relationship labels and links before rendering so templates do not need to understand OWL or graph indexing.

`src/_data/ontology.js` will load the prepared snapshot using Eleventy's JavaScript data-file support. It will not extract Git history or parse the ontology on each template rebuild. [JavaScript data files](https://www.11ty.dev/docs/data-js/)

Data preparation will also produce the existing public JSON files and release downloads under `.cache/site-public/assets/` and `.cache/site-public/downloads/`. Eleventy will copy those into the final site alongside `src/assets/`. Each output filename must have one owner; data preparation must not write into Eleventy's output directory.

The snapshot will record its schema version, input fingerprints, and history mode. Full preparation will include the ontology Git revision and history-cache version when determining whether cached history is reusable. Fast preparation must not overwrite the existing full history cache or be mistaken for full preparation.

Move the current static SVG renderer into `lib/graph-svg.mjs` and expose it through a small template shortcode. Preserve its layout algorithm during migration. Relationship lists and history tables will become editable Nunjucks markup. Keep Nunjucks escaping enabled; only reviewed generated SVG and rendered authored Markdown should cross an explicit trusted-HTML boundary.

## Routes and output contracts

Source filenames should be chosen for editing convenience. Explicit permalinks will preserve the public URLs. Eleventy's data pagination can generate one term page or redirect per record. [Pages from data](https://www.11ty.dev/docs/pages-from-data/)

| Output | Required destination or behavior |
| --- | --- |
| Home | `/` |
| Browse | `/browser/current_release/` |
| About | `/browser/current_release/about/` |
| Search | `/browser/current_release/search/`, including `?q=` behavior |
| Release | `/browser/current_release/release/` |
| Terms | `/browser/current_release/term/SO:NNNNNNN/` |
| Compact IDs | Existing `SO_NNNNNNN` redirect paths |
| Alternate IDs | Existing colon and underscore alias paths and targets |
| Search data | `/assets/search-index.json`, with existing fields and result destinations |
| Graph data | `/assets/graph-manifest.json` and `/assets/terms/SO:NNNNNNN.json` |
| Release data | `/assets/metadata.json` and the three existing `/downloads/` files |

Preserve colons and trailing slashes in term routes; do not apply a generic slug filter to ontology IDs. Deduplicate aliases pointing to the same target and report conflicting output paths. Keep `canonicalTermPath` as the shared route definition and centralize template link construction instead of embedding directory-depth calculations throughout the markup.

Retain graph schema versions, release provenance, node roles, canonical URLs, predicates, and edge direction. In particular, `is_a` points from child to parent. Preserve the existing root-hosting assumption used by browser graph URLs; adding deployment under a subdirectory is outside this migration.

## Implementation stages

1. **Establish a reproducible baseline.** Set up the selected Node.js version, record the current website commit and ontology input fingerprints, and run the existing tests. Build the current source into an isolated comparison directory using `BUILD_DIR`. Capture route inventories and representative pages, including `SO:0000704`, `SO:0000110`, an obsolete term with replacement guidance, and terms with multiple parents, long labels, or missing annotations. Compare against a fresh build, not an arbitrary old `dist*` snapshot. Inspect generated directories for any unique authored material before planning their removal.

   Completion check: the current build and its required inputs can be reproduced, and a rollback point is recorded.

2. **Separate data preparation from HTML rendering.** Extract the prepared snapshot, public JSON generation, download copying, and graph payload builder. Keep the current renderer operational against the extracted functions while this change is verified. Update graph-contract test imports to the independent payload module without weakening their assertions.

   Completion check: the legacy build retains equivalent page content and public JSON; full and fast modes remain distinct and reproducible.

3. **Introduce Eleventy and migrate the shared layout and main pages.** Add the pinned dependency, lockfile, minimal ESM configuration, shared includes, and site/navigation data. Move the current page structure into templates and the authored prose into Markdown. Preserve the stylesheet and browser scripts. Generate to an isolated output while the legacy build remains available.

   Completion check: Home, Browse, About, Search, and Release have their original URLs, content, layout, and working assets. Saving page text, an include, or CSS updates the preview.

4. **Migrate term pages and redirects.** Add a single data-driven term template and a redirect template. Transfer relationship and history markup into readable includes. Connect the static SVG shortcode and existing interactive enhancement without changing the public graph payloads or browser hooks.

   Completion check: the complete term and alias inventory matches the baseline; search, term navigation, graph expansion, downloads, and static fallbacks work.

5. **Complete the everyday editing workflow.** Add the commands below, cache validation, bounded output cleanup, and useful missing-input errors. Preserve `SO_ONTOLOGY_REPO`, `SO_ONTOLOGY_DIR`, `SKIP_HISTORY`, and `BUILD_DIR` compatibility. Document the sibling ontology checkout explicitly. Configure the watcher to observe source files and the prepared snapshot without looping over generated output. Verify that refreshing prepared data while the server runs reloads both the data and copied public files.

   Completion check: repeated page edits do not parse the ontology or run Git history extraction. Source-data changes are handled by an explicit refresh or a new build.

6. **Switch the default build and clean the repository.** After comparison checks pass, make Eleventy the default renderer and remove the superseded JavaScript HTML templates. Retain ontology processing, shared URL helpers, and the extracted graph renderers. Correct root-level ignore rules for `.cache/`, `dist/`, and temporary `dist-*` outputs, then remove verified generated snapshots from Git tracking and the active source tree. Preserve any useful comparison artifact outside the source tree; do not rewrite Git history. Finish the README and editing guide.

   Completion check: a fresh checkout can install, build, test, and preview from the documented inputs, and routine content edits have no dependency on generated files or JavaScript template strings.

## Proposed commands

These commands describe the implemented workflow.

| Command | Intended behavior |
| --- | --- |
| `npm ci` | Install the recorded dependency versions |
| `npm run dev` | Reuse a valid prepared snapshot, or prepare fast data on startup; serve on local port 4173 and refresh on save |
| `npm run data:refresh` | Refresh release data and best-effort Git history from the configured checkout |
| `npm run build` | Prepare full data and produce a clean Eleventy build |
| `npm run build:fast` | Prepare data without Git history and produce a clean build; support release files without a Git checkout |
| `npm test` | Run the graph contracts and migration regression checks |

For the current local checkout, document setting `SO_ONTOLOGY_REPO=../SO-Ontologies`. The build should explain missing files or an invalid cache and how to correct them, without silently downloading a release. A full build must not silently accept a fast snapshot as complete history.

Output cleanup must be limited to the configured build directory after validating that it cannot target the repository root, source files, or ontology inputs. Keep cleanup out of the normal watch rebuild loop so saves do not erase prepared data. Eleventy provides the development server and watch functionality. [Watch and serve](https://www.11ty.dev/docs/watch-serve/)

## Verification and acceptance

Keep the existing graph tests and add a small fixture ontology for a complete build test that does not require the external checkout or its history. Include active and obsolete terms, an alternate ID, incoming and outgoing relations, and text requiring HTML escaping.

Before cutover, verify:

- The full route inventory and redirect targets match builds made from identical inputs and history modes.
- Public JSON has equivalent parsed content and release provenance; browser scripts, CSS, and downloaded release files remain unchanged.
- Page content, links, relationship directions, obsoletion guidance, and history match the baseline. Ignore harmless HTML whitespace differences.
- Internal page links, assets, downloads, graph fetches, and redirect destinations resolve in the built site.
- Desktop and narrow-screen screenshots of the homepage, search results, and representative term pages preserve the current design.
- With JavaScript disabled or graph fetches unavailable, term content, linked relationships, and the static SVG remain usable.
- Search by ID, label, synonym, and alternate ID still works. Graph filters, zoom, fit, expansion, node links, and keyboard access still work.
- Full and fast preparation cannot reuse incompatible caches. Changed inputs invalidate prepared data, and repeated content edits avoid preparation.
- A second clean build removes stale outputs and reproduces the same content from the same inputs.

The manual acceptance exercise is to edit an About paragraph, change a navigation label, adjust a shared header, and change a CSS value using the editing guide. Each edit should be easy to locate and visible in the local preview after saving.

Keep the legacy build usable until the comparison passes. If the migration fails its checks, retain the recorded baseline and fix the failing stage before cutover. After cutover, the recorded source commit and input provenance provide the rollback reference.

## Documentation to deliver

Put a short setup and editing map at the top of the README. Add `docs/editing-guide.md` with examples for changing text, adding a prose page, editing navigation, modifying a term layout, refreshing ontology data, and building without Git history. Explain which files are generated and how to recover from a missing or stale cache.

Record the selected tool versions and upgrade process. Keep ontology processing and public payload contracts independent of Eleventy so future build-tool updates remain localized.
