---
layout: layouts/home.njk
permalink: /index.html
title: Sequence Ontology Browser Prototype
kicker: Prototype
heading: Modernized term browser around the current OWL release
introduction: This prototype keeps direct term URLs, uses OWL for displayed annotations, and uses the JSON graph export to generate local ontology DAG views with clickable term nodes.
actions:
  - label: Search the ontology
    url: /browser/current_release/search/?q=sequence_feature
  - label: Open a canonical term page
    url: /browser/current_release/term/SO:0000110/
snapshotHeading: Current release snapshot
prioritiesHeading: Prototype priorities
entriesHeading: Suggested entry points
---
- Canonical URLs at <code>/browser/current_release/term/&lt;SO_ID&gt;/</code>
- Accessible text-first term pages
- Clickable DAG nodes for parent and child navigation
- Release metadata and direct ontology downloads
