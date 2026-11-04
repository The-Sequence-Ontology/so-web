# Sequence Ontology website

This website uses Eleventy to generate a static Sequence Ontology browser. Written pages live in Markdown, page layouts live in Nunjucks templates, and ontology processing lives in separate Node.js modules. The browser adds search and interactive term graphs using plain JavaScript.

The site's appearance comes from its own HTML and CSS. It preserves the custom prototype's design, canonical term URLs, search, graph viewer, and release downloads.

- [Preview locally](#preview-locally)
- [Current tech stack](#current-tech-stack)
- [Major components](#major-components)
- [Update static pages](#update-static-pages)
- [Build commands and ontology updates](#build-commands-and-ontology-updates)
- [Keep Eleventy up to date](#keep-eleventy-up-to-date)
- [Configuration and troubleshooting](#configuration-and-troubleshooting)

## Preview locally

Run commands from the repository root. You need **Node.js 24**, npm, and the three ontology release files described below. Git is needed for full history extraction and the test suite.

The tested Node version is **24.22.2**, recorded in [.nvmrc](.nvmrc). The `engines` field in [package.json](package.json) currently allows Node 24.x. If you use nvm:

```bash
nvm install
nvm use
```

Install the recorded dependencies and start the development server:

```bash
npm ci
npm run dev
```

Open **http://localhost:4173**. Keep the terminal running while you edit; saving Markdown, a template, site data, or CSS updates the preview. Stop it with **Ctrl+C**.

On startup, the development command reuses a valid prepared ontology snapshot, including its history if available. Otherwise it prepares fast data without extracting history. Ordinary page saves reuse that snapshot.

The build prefers a sibling ontology checkout at `../SO-Ontologies` when its `Ontology_Files/so.owl` exists, then falls back to the original `../context/SO-Ontologies` location. To select another checkout:

```bash
SO_ONTOLOGY_REPO=/path/to/SO-Ontologies npm run dev
```

To work from release files without an ontology Git checkout:

```bash
SO_ONTOLOGY_DIR=/path/to/release-files npm run dev
```

That directory must contain `so.owl`, `so.json`, and `so-metadata.txt`, including on the first preview startup.

To preview an already completed build without Node.js or the ontology inputs, use Python:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

This serves the existing files and does not rebuild them after edits. Run only one server on port 4173 at a time. To create a complete standalone build, stop the development server and run `npm run build` or `npm run build:fast` first. Development mode serves copied assets directly from their source locations, so its output directory is not a substitute for a completed build.

## Current tech stack

| Layer | Technology | Role in this repository |
| --- | --- | --- |
| Build runtime | Node.js 24, JavaScript ES modules | Runs the scripts and ontology processing; `.mjs` files and `"type": "module"` use `import`/`export` |
| Dependency management | npm and `package-lock.json` | Installs a reproducible dependency tree; normal setup uses `npm ci` |
| Static site generator | `@11ty/eleventy` **3.1.8** | Generates the HTML pages; installed as a development dependency and pinned to an exact version |
| Ontology XML reader | `htmlparser2` **7.2.0**, in XML mode | Reads nested RDF/XML class structures and their annotations during data preparation; pinned as a direct development dependency |
| Written content | Markdown with YAML front matter | Keeps prose and page settings in files that can be edited directly |
| Templates | Nunjucks, provided through Eleventy | Renders HTML layouts, includes, loops, conditions, and data placeholders |
| Site settings | JSON files under `src/_data/` | Stores navigation, masthead text, and featured term IDs |
| Styling | Custom plain CSS, self-hosted Space Grotesk and Source Sans 3 | Supplies the teal-and-cream design with light neo-Memphis accents; no external theme or CSS compilation step |
| Browser behavior | Plain JavaScript ES modules, Fetch API, and SVG | Provides client-side search and interactive graph controls |
| Scientific inputs | OWL/XML, ontology graph JSON, and release metrics | Supplies term annotations, topology, and release information |
| History | Local Git commands and a generated JSON cache | Reconstructs best-effort semantic changes from the editable ontology history |
| Tests | Node's built-in `node:test` and `node:assert` | Checks graph contracts, fixture builds, redirects, escaping, cache behavior, and output cleanup |
| Hosting output | Static HTML, CSS, JavaScript, JSON, and downloads | Can be served by a static HTTP server with directory-index support |

Eleventy and Node.js run during development and builds. The hosted website does not need an application server, database, or ontology API. Search and interactive graph controls require browser JavaScript; term content, relationship lists, and the static graph remain available without it.

## Major components

### Source and generated directories

```text
eleventy.config.js              Eleventy input/output, filters, assets, and watch settings
package.json                   Commands, Node requirement, and pinned Eleventy dependency
package-lock.json              Exact dependency tree
.nvmrc                         Tested Node version
src/
  pages/                       Markdown pages and data-driven Nunjucks page templates
  _includes/
    layouts/                   Document, content, homepage, and term layouts
    term/                      Relationships, history, and graph sections
    header.njk                 Shared masthead and navigation
    footer.njk                 Shared footer
  _data/                       Authored site settings and prepared ontology data loader
  assets/                      Stylesheet, logo, decorative SVG, and browser scripts
    fonts/                     Self-hosted WOFF2 fonts, font-face CSS, and licenses
lib/                           Ontology processing, graph rendering, and shared helpers
scripts/                       Data preparation, clean builds, and local preview
test/                          Automated tests and a small fixture ontology
docs/                          Editing guide and migration record
.cache/                        Generated ontology snapshot, public assets, and history cache
dist/                          Generated standalone website after a build
node_modules/                  Installed build dependencies
```

`src/`, `lib/`, `scripts/`, and the configuration files are the source of the website. `.cache/`, `dist/`, and `node_modules/` are generated and excluded from Git. Changes made directly to generated HTML or JSON are replaced by later builds.

### Pages, layouts, and shared content

| Component | Source | Responsibility |
| --- | --- | --- |
| Homepage | [src/pages/index.md](src/pages/index.md) and [home layout](src/_includes/layouts/home.njk) | Markdown overview, introduction, participation links, action buttons, generated release snapshot, and featured terms |
| About page | [src/pages/about.md](src/pages/about.md) | Written project information |
| Browse, search, and release pages | [browse.njk](src/pages/browse.njk), [search.njk](src/pages/search.njk), [release.njk](src/pages/release.njk) | HTML for the main browser entry points and release downloads |
| Ontology hierarchy sidebar | [ontology-sidebar.njk](src/_includes/ontology-sidebar.njk) and [ontology-tree.js](src/assets/ontology-tree.js) | Expandable term links shared by Browse and term pages |
| Document shell | [base.njk](src/_includes/layouts/base.njk) | HTML document, title, stylesheet, header, main area, and footer |
| Written-page layout | [content.njk](src/_includes/layouts/content.njk) | Breadcrumbs and the card around a Markdown page's content |
| Shared header and footer | [header.njk](src/_includes/header.njk), [footer.njk](src/_includes/footer.njk) | Elements shared by every main page |
| Authored settings | [site.json](src/_data/site.json), [navigation.json](src/_data/navigation.json) | Site name, description, featured IDs, and navigation labels and links |

The leading underscore directories are Eleventy conventions: `_includes` holds reusable templates and `_data` supplies values to templates. Files there are not standalone pages.

### Ontology preparation and build flow

Use all three input files from the same ontology release:

| Input | Use |
| --- | --- |
| `so.owl` | Term labels, definitions, synonyms, identifiers, comments, obsoletion annotations, and ontology metadata |
| `so.json` | Parent/child topology and other typed relationships; also supplies fallback information for graph terms absent from the OWL parse |
| `so-metadata.txt` | Release counts and metrics |
| Ontology Git checkout | Best-effort semantic history when full preparation is requested |

The build has two stages:

1. [scripts/prepare-data.mjs](scripts/prepare-data.mjs) reads the inputs and prepares `.cache/site-data.json` plus public JSON and downloads under `.cache/site-public/`.
2. Eleventy loads the snapshot through [src/_data/ontology.js](src/_data/ontology.js), renders the pages, and copies the public files and browser assets into `dist/`.

These modules keep the processing separate from page markup:

| Module | Responsibility |
| --- | --- |
| [lib/ontology.mjs](lib/ontology.mjs) | Parses annotations and metadata, indexes relationships, normalizes terms, and creates searchable text |
| [lib/history.mjs](lib/history.mjs) | Extracts and caches Git-era semantic events; earlier history is not reconstructed automatically |
| [lib/site-data.mjs](lib/site-data.mjs) | Resolves relationship labels and links and prepares browse entries, term records, and redirects |
| [lib/ontology-tree.mjs](lib/ontology-tree.mjs) | Prepares the hierarchy's roots and parent/child links without duplicating multiply inherited terms |
| [lib/graph-payload.mjs](lib/graph-payload.mjs) | Builds the public graph JSON contract independently of HTML templates |
| [lib/graph-svg.mjs](lib/graph-svg.mjs) | Renders the linked static SVG fallback |
| [lib/shared.mjs](lib/shared.mjs) | Supplies escaping, identifier conversion, canonical term paths, and relative-link helpers |
| [lib/build-paths.mjs](lib/build-paths.mjs) | Resolves input/cache locations and restricts which output directories may be cleaned |

The prepared snapshot records input fingerprints, a processing version fingerprint (including the dependency lockfile), and the history mode. Full history is cached against the ontology Git revision and history-cache format. Prepared data is published after its public files are ready, allowing the preview server to reload a consistent set.

### Generated term pages and redirects

[src/pages/terms.njk](src/pages/terms.njk) uses Eleventy's data pagination to generate one page for each term selected for a record page. [layouts/term.njk](src/_includes/layouts/term.njk) defines the shared arrangement; files under [src/_includes/term/](src/_includes/term/) define the relationships, change-history, and graph sections. [terms.11tydata.js](src/pages/terms.11tydata.js) computes plain-text page titles.

Term URLs retain the form `/browser/current_release/term/SO:NNNNNNN/`. The [redirect template](src/pages/redirects.njk) preserves compact IDs such as `SO_NNNNNNN` and alternate-ID destinations. Some release identifiers are both OWL classes and alternate IDs; their existing redirect precedence is preserved. Keep colons and trailing slashes when editing term routing.

### Hierarchy, search, graphs, and styling

The Browse page and every term record share [ontology-sidebar.njk](src/_includes/ontology-sidebar.njk). [ontology-tree.js](src/assets/ontology-tree.js) loads `assets/ontology-tree.json` and adds expandable nested term links. The nesting follows `is_a`, with alphabetical siblings; other relationship types remain in each term's relationships and DAG. A term with multiple parents appears under each parent. Obsolete terms have their own group.

The hierarchy opens a path to the current term and highlights its link. Expanded branches persist in browser session storage while navigating between records. The hierarchy grows down the document as terms expand, using the page's normal scrollbar. On narrow screens the sidebar moves above the record and starts collapsed on term pages; its heading opens it. Branches are rendered as needed, keeping large hierarchies manageable. Without JavaScript, top-level links and each record's parent/child lists remain available. The hierarchy JSON is rendered by [ontology-tree.njk](src/pages/ontology-tree.njk) from the prepared data during every Eleventy build; ordinary template edits do not require refreshing scientific data.

On a new Browse visit, `sequence_feature` starts expanded and other roots start collapsed. The sidebar stays in the normal page flow, and deep branches wrap their labels to fit its width.

[browser-navigation.js](src/assets/browser-navigation.js) loads term records into the existing Browse/term layout while preserving the hierarchy and the reader's page position. The URL and browser-tab title update to the selected term, and Back/Forward restore previous records and positions. A dismissible notice at the top announces the loaded term and offers "Go to top" to move to the new content. The loaded-term notice clears when you select "Go to top" or scroll back to the top of the page, and stays hidden if you are already at the top when the term loads. Normal links remain available for new tabs, bookmarks, and use without JavaScript. Static alternate-ID redirects are resolved to their destination records. The [notice include](src/_includes/term-notice.njk) contains its controls; the browser script supplies status messages. A failed request keeps the previous record and offers an ordinary page link.

[search.js](src/assets/search.js) loads `assets/search-index.json` and displays results ranked by [search-ranking.js](src/assets/search-ranking.js). Exact canonical, compact, or alternate IDs come first, followed by exact labels, exact synonyms, label prefixes, partial labels, partial synonyms, and other substring matches (including definitions). Matching ignores case and surrounding whitespace. All matches are ranked before displaying up to 50; the summary reports the full count and says when results are capped. The query stays in the page's `?q=` URL parameter.

Exact ID, label, and synonym matches have a pale amber background, a bold title, and an "Exact match" badge. Highlighting uses the same matching rules as ranking.

[graph.js](src/assets/graph.js) loads a term's `assets/terms/SO:NNNNNNN.json` payload and replaces its static SVG with an interactive view. It shows the term's neighborhood with highlighting, zoom, pan, fit, and linked nodes. All relationship types in that neighborhood are displayed. `assets/graph-manifest.json` describes the release and payload layout. Payloads retain predicates, node roles, canonical URLs, and semantic edge direction: `is_a` points from child to parent.

Use the **+ / − buttons in the graph's upper-right corner** to zoom. The opposing-corners icon below them fits the whole graph in view; its tooltip and accessible label say **Fit graph**. Mouse-wheel and trackpad scrolling over the graph scroll the page. Dragging the graph background pans the view.

[styles.css](src/assets/styles.css) controls the whole visual design. The `:root` variables define the main colors, borders, shadows, radius, and font families; commented sections style the masthead, homepage, term records, search, and graphs. Light paper texture, geometric accents, and offset shadows add a neo-Memphis touch while keeping scientific content readable. The homepage uses a main reading column and a resource sidebar on wide screens, then stacks the cards on narrow screens.

Headings and navigation use **Space Grotesk**; prose and controls use **Source Sans 3**. Term IDs use a system monospace font. Font files and their open licenses live in [src/assets/fonts/](src/assets/fonts/README.md); the browser loads them from this website, with system fallbacks if unavailable. There are no runtime requests to Google Fonts. The shared header's decorative neo-Memphis bent arrow, ring, bar, and double helix live in [memphis-motif.svg](src/assets/memphis-motif.svg). Their size and position are set by `.masthead::after` in the stylesheet, using the masthead's shared padding variables to balance the spacing with the logo.

The build also publishes `assets/metadata.json` and copies all three source release files to `downloads/`. There is no OWL parsing in the browser.

## Update static pages

### Change an existing written page

Start `npm run dev`, then edit [src/pages/about.md](src/pages/about.md). A written page consists of YAML settings between two `---` lines, followed by Markdown:

```markdown
---
layout: layouts/content.njk
permalink: /browser/current_release/about/index.html
title: About the Prototype
breadcrumb: About
---
## About this prototype

Write or update a paragraph here.

- Add an item.
- Add another item.
```

- `layout` chooses the shared template.
- `permalink` determines the public output URL. Keep it unchanged for a wording-only edit.
- `title` supplies the browser-tab title; the Markdown heading supplies the visible page heading.
- `breadcrumb` supplies the label after Home.

Save and check the preview. Use ordinary Markdown for headings, paragraphs, lists, emphasis, and links. YAML values containing a colon followed by a space should be quoted, for example `title: "Sequence Ontology: about the project"`.

### Update the homepage or HTML-based pages

The [homepage](src/pages/index.md) stores its browser-tab title, buttons, and generated-section labels in front matter. All page prose, including the welcome heading, introduction, uses list, and participation links, is ordinary Markdown below the closing `---`. Edit that body to change what the homepage says; change [home.njk](src/_includes/layouts/home.njk) to rearrange the blocks.

For Browse, Search, or Release, open the matching `.njk` file under `src/pages/`. Edit its headings and prose as HTML. Expressions such as `{{ ontology.metadata.releaseDate }}` insert prepared data; leave them in place when changing only the surrounding wording.

### Add a new written page

Create `src/pages/help.md`:

```markdown
---
layout: layouts/content.njk
permalink: /help/index.html
title: Browser help
breadcrumb: Help
---
## Browser help

Search for a Sequence Ontology ID, term label, or synonym.
```

The page will be available at `/help/`. Its source filename does not determine the public URL because `permalink` is explicit. Choose a URL that does not overlap an existing page or term route.

To include it in the header, add this object to the array in [navigation.json](src/_data/navigation.json), placing a comma between neighboring entries:

```json
{ "label": "Help", "url": "/help/" }
```

Keep JSON property names and strings in double quotes, with no trailing comma after the last array entry.

### Edit shared content, templates, or appearance

| Change | Where to edit |
| --- | --- |
| Site name or masthead description | `src/_data/site.json` |
| Shared header logo | `src/assets/so_logo.svg`; its URL is the `logo` setting in `src/_data/site.json` |
| Featured term IDs | The `featuredTermIds` array in `src/_data/site.json` |
| Navigation wording, order, or destinations | `src/_data/navigation.json` |
| Shared masthead/footer markup | `src/_includes/header.njk`, `footer.njk` |
| Arrangement of every term record | `src/_includes/layouts/term.njk` |
| Relationships, history, or graph section | The matching include under `src/_includes/term/` |
| Browse introduction or hierarchy heading/help | `src/pages/browse.njk`, `src/_includes/ontology-sidebar.njk` |
| Colors, spacing, fonts, or responsive rules | `src/assets/styles.css` |
| Font files, font-face declarations, and licenses | `src/assets/fonts/` |
| Decorative header shapes | `src/assets/memphis-motif.svg` |

Nunjucks templates are ordinary HTML with placeholders, loops, and conditions. Editing one shared layout updates every page that uses it:

```html
<h2>{{ term.label }}</h2>
<p>{{ term.definition.text }}</p>
```

For internal links in Nunjucks, the `href` filter computes a relative URL from the current page:

```html
<a href="{{ '/help/' | href(page.url) }}">Help</a>
```

Navigation data uses paths beginning with `/`; the header applies that filter for you. The current site assumes hosting at the domain root.

Preserve `data-search-*` attributes on search elements and the graph's `data-graph-term`, `data-graph-src`, and `dag-figure` hooks when changing their markup. Browser scripts use those selectors. Ontology values are escaped automatically; the existing `safe` filters are reserved for rendered page content and the SVG builder's escaped output.

Scientific term labels, definitions, synonyms, and relationships must be updated in the ontology source and refreshed. They are generated content, so changing the page template does not change the underlying scientific record.

The [editing guide](docs/editing-guide.md) provides additional examples and troubleshooting.

## Build commands and ontology updates

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the dependency versions in the lockfile |
| `npm run dev` | Reuse or prepare data, then preview at localhost:4173 with refresh on save |
| `npm run data:refresh` | Refresh ontology data and best-effort Git history |
| `npm run data:refresh -- --fast` | Refresh ontology data without Git history |
| `npm run build` | Prepare full data and create a clean standalone site in `dist/` |
| `npm run build:fast` | Create a clean standalone site without Git history |
| `npm test` | Run graph and fixture-based build/cache tests |

After updating the ontology checkout through your normal Git workflow, run `npm run data:refresh`. A running preview loads the new snapshot and public JSON after preparation completes. This command reads the checkout; it does not fetch or pull it.

Full preparation requires a readable ontology Git checkout and attempts to reconstruct semantic history from Git-era revisions. Fast preparation supports release files alone, omits displayed history, and leaves the full history cache intact. If you want history in the completed site, finish with `npm run build`.

Changes to release files are checked on preview startup. Restarting with changed inputs prepares fast data; use a full refresh when updated history is needed. Saving page text or CSS intentionally does not trigger ontology preparation.

Stop the development server before running a clean build: both use the configured output directory, and builds replace its contents. Publish the contents of `dist/` after a completed build, preserving directory indexes and term paths.

The tests use a small fixture ontology, so `npm test` does not require the external ontology checkout. They cover semantic graph directions, interactive graph layout, canonical and alias pages, escaping, downloads/assets, cache invalidation, full/fast history behavior, and stale-output cleanup.

## Keep Eleventy up to date

### Version policy

The repository currently pins `@11ty/eleventy` to **3.1.8** in [package.json](package.json). [package-lock.json](package-lock.json) records the exact resolved dependencies. Use the local project scripts so the installed version is the one being tested.

`npm ci` installs the recorded dependency tree and does not update either dependency file. It is the normal setup command, not the upgrade command. [npm ci documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

Keep routine Eleventy updates within the **3.x** line. Review a later major version or a package-name change as a separate migration, using the official [Eleventy release history and release notes](https://www.11ty.dev/docs/versions/).

### Routine updates within version 3

1. Record the working version and keep the update in its own reviewable change. Stop the development server.
2. Inspect what is installed and which 3.x versions are available:

   ```bash
   npm ls @11ty/eleventy
   npm view @11ty/eleventy@3 version
   ```

   The second command queries the npm registry and can list multiple matching releases. Review the release notes for the version you intend to adopt. [npm view documentation](https://docs.npmjs.com/cli/v11/commands/npm-view/)

3. Install the newest stable version matching major 3 and save its exact version:

   ```bash
   npm install --save-dev --save-exact @11ty/eleventy@3
   ```

   This updates `package.json` and `package-lock.json`. The explicit `@3` constrains the major version; `--save-exact` retains an exact pin. Because the dependency is pinned, a plain `npm update` is not the intended way to advance Eleventy to a new release. [npm install documentation](https://docs.npmjs.com/cli/v11/commands/npm-install/)

4. Validate the lockfile, tests, and a build:

   ```bash
   npm ci
   npm test
   npm run build:fast
   ```

   With the ontology Git checkout available, also run `npm run build` to verify full history. The real-release builds need the external inputs even though the tests do not.

5. Start `npm run dev` and check the homepage, About, Browse, Release, and Search, plus an ordinary term, an obsolete term, and an alternate-ID URL. Verify search and graph zoom, fit, panning, highlighting, and node navigation. Check desktop and narrow widths, and confirm term relationships and the static graph are available with JavaScript disabled.
6. Review the dependency changes, update the version recorded in this README, and commit `package.json` and `package-lock.json` together with any required source changes. Keep generated directories out of the change.

To roll back an unsuccessful update, restore the dependency-file changes for that update, including any related source changes, then run `npm ci` and rebuild.

### Major upgrades or package renames

Read the target release's upgrade guide before changing the major version. Use the official [Upgrade Helper](https://www.11ty.dev/docs/plugins/upgrade-help/) when it supports the intended transition, following its instructions for the matching helper version and removing the temporary helper after resolving its findings.

For this repository, review:

- Supported Node.js versions, the ESM configuration format, Nunjucks escaping, and Markdown/front-matter handling.
- Data pagination and explicit permalinks in the term and redirect templates, including colon-containing IDs.
- JavaScript data loading and computed titles in `src/_data/ontology.js` and `src/pages/terms.11tydata.js`.
- Passthrough copying, the development server, and snapshot watching in `eleventy.config.js`.
- The programmatic Eleventy import in `scripts/build-site.mjs` and the package-specific CLI path in `scripts/dev.mjs`; a package rename can require both to change.

Run the same automated and browser checks as for a routine update, then compare representative output with the previous version. The separate ontology modules and public graph JSON contracts should remain reusable.

### Node.js updates

For a tested Node 24 patch update, record the exact version in `.nvmrc`, reinstall with `npm ci`, and run the tests and builds. If adopting a different Node major, also review and update `package.json`'s `engines` requirement and the setup instructions. Changing the runtime does not itself update Eleventy.

## Configuration and troubleshooting

| Setting | Effect |
| --- | --- |
| `SO_ONTOLOGY_REPO` | Selects the ontology checkout used for release files and full Git history |
| `SO_ONTOLOGY_DIR` | Overrides the release-file directory; takes precedence over the checkout's `Ontology_Files/` for the three inputs |
| `SKIP_HISTORY=1` | Requests fast preparation for build/refresh commands, retained for compatibility |
| `BUILD_DIR` | Selects `dist` or a `dist-*` directory directly inside this repository; source directories and symbolic links are rejected before cleanup |
| `SO_CACHE_DIR` | Optionally separates the preparation cache; used by integration tests |

For a comparison build without replacing the main `dist/`:

```bash
BUILD_DIR=dist-preview npm run build:fast
```

If Node or npm is missing, install or activate Node.js 24 first. If release files cannot be read, verify the input directory and the three required filenames. If full history is unavailable, select the correct Git checkout or use a fast command.

If the preview does not update, check the terminal for a template or JSON error, confirm you edited a source file, and confirm the browser is showing http://localhost:4173. Restart preview to recover from a missing or invalid prepared snapshot, or run `npm run data:refresh` to regenerate full data. The [editing guide](docs/editing-guide.md) has further troubleshooting steps.

The [migration record](docs/eleventy-migration-plan.md) documents the architectural decisions and checks used when replacing the original renderer.
