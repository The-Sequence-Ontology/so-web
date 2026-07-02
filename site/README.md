# Sequence Ontology website prototype

This static prototype uses the current Sequence Ontology release to generate term pages and precomputed graph neighborhoods.

## Inputs

- `so.owl` supplies term annotations and ontology metadata.
- `so.json` supplies graph topology during the current prototype phase.
- `so-metadata.txt` supplies release metrics.
- The ontology Git repository supplies best-effort semantic history.

By default, the build expects the ontology checkout at `../context/SO-Ontologies`. Override it with:

```bash
SO_ONTOLOGY_REPO=/path/to/SO-Ontologies npm run build
```

Alternatively, set `SO_ONTOLOGY_DIR` to a directory containing the three release files. Use `build:fast` when no Git checkout is available.

## Commands

```bash
npm test
npm run build
npm run build:fast
```

`build:fast` skips Git history extraction and is intended for graph, styling, and client-side development.

To preview a build on the headless server:

```bash
cd dist
python3 -m http.server 4173 --bind 127.0.0.1
```

## Graph data

The build generates:

- `assets/graph-manifest.json`
- `assets/terms/SO:NNNNNNN.json` for every SO term

Each term payload contains release provenance, the focal term, canonical node URLs, display roles, and typed semantic edges. Edge direction follows the ontology representation; for example, an `is_a` edge points from child to parent.

The static SVG and text relationship lists remain the accessible fallback. A future interactive viewer should progressively enhance them by consuming the same term payloads.

## Interactive graph

When JavaScript is available, `assets/graph.js` replaces the static neighborhood SVG with an interactive rendering of the same payload. It provides:

- keyboard-focus and pointer highlighting
- relationship filters
- zoom, pan, and fit controls
- a term selector with one-level expansion
- canonical term-page links on every node

Expansion fetches another precomputed term payload and merges its nodes and typed edges in the browser. It does not invoke an ontology service or parse OWL at runtime.
