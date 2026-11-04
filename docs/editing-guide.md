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

On the [homepage](../src/pages/index.md), the front matter contains the introduction, button labels and destinations, and section headings. The Markdown body supplies the priorities list. The [home layout](../src/_includes/layouts/home.njk) positions these blocks alongside the generated release snapshot and featured terms.

Use quotes around a YAML value containing a colon followed by a space:

```yaml
heading: "Sequence Ontology: explore terms"
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

Use [term.njk](../src/_includes/layouts/term.njk) to change the arrangement of every term page. The relationships, graph, and change-history sections have their own files in [src/_includes/term/](../src/_includes/term/). Labels, paragraphs, and section order can be changed directly in these templates.

Preserve the graph's `data-graph-term`, `data-graph-src`, and `dag-figure` hooks, and the search page's `data-search-*` hooks when changing markup. The existing JavaScript uses them.

Ontology values are escaped automatically when printed into HTML. Keep that default; the existing `safe` filters are limited to rendered page content and the SVG builder's escaped output.

## Change the appearance

Edit [styles.css](../src/assets/styles.css). Its `:root` variables define the main colors, border radius, and shadow. Rules further down control the masthead, cards, grids, search results, and graphs.

Save and inspect both desktop and narrow browser widths. The site continues to use the original prototype's stylesheet; no external theme is required.

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
