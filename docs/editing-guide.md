# Editing the Sequence Ontology website

Run `npm run dev` from the repository root and open http://localhost:4173. Keep the terminal running while you edit. See the [README](../README.md) for initial setup and ontology input locations.

## Change page text

Open [About](../src/pages/about.md). The block between the first two `---` lines is YAML front matter: it selects the layout, page title, URL, and breadcrumb label. The text below it is Markdown.

For example, change a paragraph or add:

```markdown
## How to use this browser

Search by a Sequence Ontology ID, label, or synonym.
```

Save the file and check the browser. The page URL stays the same unless you change `permalink`.

On the [homepage](../src/pages/index.md), the front matter contains the browser-tab title, button labels and destinations, and labels for generated sections. The Markdown body below the closing `---` contains all of the welcome, introduction, uses, and participation text, including its visible headings and links. The [home layout](../src/_includes/layouts/home.njk) displays that body in the main card with the buttons, with the generated release snapshot and featured terms in a sidebar. These cards stack on narrow screens.

The [Publications page](../src/pages/publications.md) keeps each paper in its own `<article class="card publication-card">` block. Inside it, the title is a `###` Markdown heading, followed by the PubMed citation, full author list, numbered affiliations, identifier links, and abstract. The `<sup>` numbers beside authors refer to the numbered affiliation list for that paper. Abstract text uses Markdown blockquotes (`>`), with its source and reuse license or permission notice underneath. Keep those attributions when editing.

Each paper's opening `<article>` tag has a unique `id`, a four-digit `data-year`, a `data-type`, and a `data-content-type`, such as `id="publication-34389511" data-year="2021" data-type="journal-article" data-content-type="so-development-update"`. Choose `journal-article`, `conference-paper`, or `poster` for the publication type. Their labels live in [publicationTypes.json](../src/_data/publicationTypes.json). Choose `so-development-update`, `so-community-contribution`, or `so-cited-mentioned` for the content type; their labels live in [publicationContentTypes.json](../src/_data/publicationContentTypes.json).

The [publications layout](../src/_includes/layouts/publications.njk) generates both tags on each card and the year navigation from these attributes, including the publication counts. The [publications script](../src/assets/publications.js) filters the cards and updates the year links to match the visible papers. Select multiple checkboxes within either group to include those categories; a paper must match both its publication type and its content type to appear. Each group's All checkbox selects or clears just that group. Tags and year links also work without JavaScript; the interactive type controls appear when JavaScript is available.

A year link opens the first visible paper from that year; papers from the same year follow it. Keep the blank lines just inside the opening and closing `<article>` tags so the Markdown renders correctly. To add a paper, copy an entire article block, change its ID, year, publication type, and content type, and edit its contents. Keep papers in newest-first order by publication date, using the journal issue date for journal articles even when an online-first date differs. Check the names, dates, affiliations, identifier links, and abstract against its source records. The stylesheet's "Publications" section controls the sidebar and individual cards.

Use quotes around a YAML value containing a colon followed by a space:

```yaml
title: "Sequence Ontology: explore terms"
```

## Change navigation or featured terms

Edit [navigation.json](../src/_data/navigation.json) to change link labels, order, or destinations. Each entry has a `label` and a `url`. Keep URLs relative to the site root, beginning with `/`.

```json
{ "label": "About", "url": "/browser/current_release/about/" }
```

Edit [site.json](../src/_data/site.json) to change the site name, masthead description, or `featuredTermIds`. The featured IDs select terms from the prepared ontology data.

JSON requires double quotes and commas between entries, with no comma after the last entry.

## Add a written page

Create `src/pages/help.md`:

```markdown
---
layout: layouts/content.njk
permalink: /help/index.html
title: Browser help
breadcrumb: Help
---
## Browser help

Write your page here.
```

It will appear at `/help/`. Add an entry to `src/_data/navigation.json` if it should appear in the main navigation. Choose a URL that does not overlap an existing page or term route.

## Change shared markup or a term layout

Nunjucks files contain ordinary HTML plus placeholders and small loops or conditions. For example:

```html
<h2>{{ term.label }}</h2>
<p>{{ term.definition.text }}</p>
```

Use [header.njk](../src/_includes/header.njk) or [footer.njk](../src/_includes/footer.njk) for elements shared by every page. Use [base.njk](../src/_includes/layouts/base.njk) for the document shell.

Use [term.njk](../src/_includes/layouts/term.njk) to change the arrangement of every term page. The top card contains the term name, accession, definition, and any obsolete status. Comments and definition references appear in their own card directly below it, defined in [notes.njk](../src/_includes/term/notes.njk); that card is omitted when neither field has content. The relationships, graph, and change-history sections also have their own files in [src/_includes/term/](../src/_includes/term/). Labels, paragraphs, and section order can be changed directly in these templates.

The [Browse page](../src/pages/browse.njk) contains its introduction and top-level entry cards. Its nested sidebar is shared with term pages through [ontology-sidebar.njk](../src/_includes/ontology-sidebar.njk); edit that include to change the hierarchy heading or help text. Term labels and nesting come from the ontology data. [ontology-tree.js](../src/assets/ontology-tree.js) controls branch expansion, selection, and remembering open branches; the stylesheet's "Ontology browser" section controls the sidebar layout.

[browser-navigation.js](../src/assets/browser-navigation.js) loads selected records without resetting the page position. The floating update notice is in [term-notice.njk](../src/_includes/term-notice.njk). Preserve the `data-browser-content`, `data-browser-breadcrumbs`, `data-ontology-browser`, and `data-term-*` hooks when editing these layouts; they connect record loading, the notice, and URL history.

Preserve the graph's `data-graph-term`, `data-graph-src`, and `dag-figure` hooks, and the search page's `data-search-*` hooks when changing markup. The existing JavaScript uses them.

Ontology values are escaped automatically when printed into HTML. Keep that default; the existing `safe` filters are limited to rendered page content and the SVG builder's escaped output.

## Change the appearance

The shared header uses [so_logo.svg](../src/assets/so_logo.svg). Replace that file to update the logo, or change the `logo` URL in [site.json](../src/_data/site.json) to use another asset. The `.site-logo` rules in the stylesheet control its size and white backing; a smaller size is applied on narrow screens. The logo links to the homepage from every page.

Edit [styles.css](../src/assets/styles.css). Its `:root` variables define colors, border radius, shadow, and the `--font-display`, `--font-body`, and `--font-mono` families. Commented sections further down control the masthead, homepage, term records, search, graphs, and small-screen layouts.

Headings use Space Grotesk; prose and controls use Source Sans 3. These are self-hosted in [fonts/](../src/assets/fonts/README.md), with system fallbacks. To change font families, update the variables and the font files/declarations there; [base.njk](../src/_includes/layouts/base.njk) loads the font stylesheet and preloads the two main files.

The paper texture, offset shadows, and small geometric details are plain CSS. The header's shapes are a separate [decorative SVG](../src/assets/memphis-motif.svg); the `.masthead::after` rule controls its placement. Decorative pseudo-elements do not contain page content. Save and inspect both desktop and narrow browser widths; no external theme or design framework is required.

## Refresh scientific data

Term labels, definitions, synonyms, and relationships come from `so.owl` and `so.json`; release metrics come from `so-metadata.txt`. Update the ontology source, then run:

```bash
npm run data:refresh
```

This also refreshes best-effort Git history. A running development server reloads the prepared data and graph payloads after preparation finishes.

For a directory containing release files without a Git checkout, use:

```bash
SO_ONTOLOGY_DIR=/path/to/release-files npm run data:refresh -- --fast
```

Fast preparation omits displayed history and preserves the full history cache for the next full build. Do not edit generated JSON under `.cache/` or HTML under `dist/`: those changes will be replaced.

## Build and check

```bash
npm test
npm run build
```

Use `npm run build:fast` when history is not needed or no ontology Git checkout is available. A build replaces the configured output directory, removing obsolete pages from the previous build.

Check your changed page, its navigation links, and a representative term page. If you changed graph markup, verify the static graph and text lists as well as the interactive controls.

## Resolve common problems

- **Node or npm is not found:** install Node.js 24, or activate it with `nvm use` if you use nvm. Run commands from the repository root.
- **Release files cannot be read:** verify `SO_ONTOLOGY_REPO` or `SO_ONTOLOGY_DIR` and check that all three input files exist.
- **A full build cannot find Git history:** point `SO_ONTOLOGY_REPO` at the checkout, or use the fast command.
- **An edit is not reflected:** check the development terminal for a template or JSON error. Confirm you edited the source file and are viewing http://localhost:4173.
- **The ontology checkout changed:** run the refresh command. Ordinary page saves intentionally reuse the prepared snapshot.
- **The cache is missing or corrupt:** restart `npm run dev` to prepare fresh fast data, or run `npm run data:refresh` for full data. If needed, stop preview and remove the generated `.cache/` directory before restarting.
- **A term URL redirects unexpectedly:** some identifiers in the release are alternate IDs as well as OWL classes. Their existing redirect behavior is preserved.
