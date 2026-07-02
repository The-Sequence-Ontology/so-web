import { canonicalTermPath, publicIdFromIri, slugFromIri, stripTags } from "./shared.mjs";

function extractSingleText(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const match = block.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractAllText(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
  const values = [];
  let match;
  while ((match = pattern.exec(block))) {
    values.push(stripTags(match[1]));
  }
  return values;
}

function extractAllResources(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*rdf:resource="([^"]+)"[^>]*/?>`, "g");
  const values = [];
  let match;
  while ((match = pattern.exec(block))) {
    values.push(match[1]);
  }
  return values;
}

function parseOntologyMetadata(owl) {
  const blockMatch = owl.match(/<owl:Ontology[^>]*>([\s\S]*?)<\/owl:Ontology>/);
  const block = blockMatch ? blockMatch[1] : "";
  const ontologyIri = (owl.match(/<owl:Ontology rdf:about="([^"]+)"/) || [])[1] || "";
  const versionIri = (block.match(/<owl:versionIRI rdf:resource="([^"]+)"/) || [])[1] || "";
  const savedBy = extractSingleText(block, "oboInOwl:saved-by");
  const releaseDate = extractSingleText(block, "oboInOwl:date");
  const defaultNamespace = extractSingleText(block, "oboInOwl:default-namespace");
  return { ontologyIri, versionIri, savedBy, releaseDate, defaultNamespace };
}

function parseDefinitionXrefs(owl) {
  const map = new Map();
  const pattern = /<owl:Axiom>([\s\S]*?)<\/owl:Axiom>/g;
  let match;
  while ((match = pattern.exec(owl))) {
    const block = match[1];
    const source = (block.match(/<owl:annotatedSource rdf:resource="([^"]+)"/) || [])[1];
    const property = (block.match(/<owl:annotatedProperty rdf:resource="([^"]+)"/) || [])[1];
    if (!source || property !== "http://purl.obolibrary.org/obo/IAO_0000115") {
      continue;
    }
    const xrefs = extractAllText(block, "oboInOwl:hasDbXref");
    if (xrefs.length) {
      map.set(source, xrefs);
    }
  }
  return map;
}

function parseTermsFromOwl(owl) {
  const terms = new Map();
  const definitionXrefs = parseDefinitionXrefs(owl);
  const pattern = /<owl:Class rdf:about="([^"]*SO_[^"]+)">([\s\S]*?)<\/owl:Class>/g;
  let match;
  while ((match = pattern.exec(owl))) {
    const iri = match[1];
    const block = match[2];
    const id = extractSingleText(block, "oboInOwl:id") || publicIdFromIri(iri);
    const term = {
      iri,
      compactId: slugFromIri(iri),
      id,
      label: extractSingleText(block, "rdfs:label"),
      definition: {
        text: extractSingleText(block, "obo:IAO_0000115"),
        xrefs: definitionXrefs.get(iri) || []
      },
      comments: extractAllText(block, "rdfs:comment"),
      synonyms: [
        ...extractAllText(block, "oboInOwl:hasExactSynonym").map((value) => ({ scope: "exact", value })),
        ...extractAllText(block, "oboInOwl:hasRelatedSynonym").map((value) => ({ scope: "related", value })),
        ...extractAllText(block, "oboInOwl:hasBroadSynonym").map((value) => ({ scope: "broad", value })),
        ...extractAllText(block, "oboInOwl:hasNarrowSynonym").map((value) => ({ scope: "narrow", value }))
      ],
      xrefs: extractAllText(block, "oboInOwl:hasDbXref"),
      subsets: extractAllResources(block, "oboInOwl:inSubset").map((subset) => subset.split("#").pop()),
      altIds: extractAllText(block, "oboInOwl:hasAlternativeId"),
      namespace: extractSingleText(block, "oboInOwl:hasOBONamespace"),
      isObsolete: /<owl:deprecated[^>]*>\s*true\s*<\/owl:deprecated>/.test(block),
      replacedBy: extractAllResources(block, "obo:IAO_0100001").map(publicIdFromIri)
    };
    terms.set(iri, term);
  }
  return terms;
}

function parseMetrics(text) {
  const lines = text.trim().split(/\r?\n/);
  const metrics = {};
  for (const line of lines) {
    const [key, value] = line.split("\t");
    if (!key || value === undefined) {
      continue;
    }
    if (!(key in metrics)) {
      metrics[key] = value;
    }
  }
  return metrics;
}

function buildGraphData(jsonGraph, termMap) {
  const nodesByIri = new Map();
  for (const node of jsonGraph.nodes) {
    nodesByIri.set(node.id, node);
    if (!termMap.has(node.id) && node.id.includes("/SO_")) {
      termMap.set(node.id, {
        iri: node.id,
        compactId: slugFromIri(node.id),
        id: publicIdFromIri(node.id),
        label: node.lbl || publicIdFromIri(node.id),
        definition: { text: node.meta?.definition?.val || "", xrefs: node.meta?.definition?.xrefs || [] },
        comments: node.meta?.comments || [],
        synonyms: (node.meta?.synonyms || []).map((entry) => ({
          scope: String(entry.pred || "").replace(/^has/i, "").replace(/Synonym$/, "").toLowerCase() || "related",
          value: entry.val
        })),
        xrefs: (node.meta?.xrefs || []).map((entry) => entry.val),
        subsets: (node.meta?.subsets || []).map((subset) => subset.split("#").pop()),
        altIds: [],
        namespace: "",
        isObsolete: false,
        replacedBy: []
      });
    }
  }

  const parents = new Map();
  const children = new Map();
  const related = new Map();
  const relatedIncoming = new Map();

  for (const edge of jsonGraph.edges) {
    if (!termMap.has(edge.sub) || !termMap.has(edge.obj)) {
      continue;
    }

    if (edge.pred === "is_a") {
      if (!parents.has(edge.sub)) parents.set(edge.sub, []);
      if (!children.has(edge.obj)) children.set(edge.obj, []);
      parents.get(edge.sub).push(edge.obj);
      children.get(edge.obj).push(edge.sub);
      continue;
    }

    if (!related.has(edge.sub)) related.set(edge.sub, []);
    related.get(edge.sub).push({ predicate: edge.pred, target: edge.obj });
    if (!relatedIncoming.has(edge.obj)) relatedIncoming.set(edge.obj, []);
    relatedIncoming.get(edge.obj).push({ predicate: edge.pred, source: edge.sub });
  }

  return { nodesByIri, parents, children, related, relatedIncoming };
}

function computeClosure(startIri, adjacency) {
  const visited = new Set();
  const queue = [...(adjacency.get(startIri) || [])];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) || []) {
      queue.push(next);
    }
  }
  return [...visited];
}

function createSearchTokens(term) {
  return [
    term.id,
    term.compactId,
    term.label,
    term.definition.text,
    ...term.altIds,
    ...term.synonyms.map((synonym) => synonym.value)
  ]
    .filter(Boolean)
    .join(" || ")
    .toLowerCase();
}

function buildNormalizedTerms({ termsByIri, parents, children, related, relatedIncoming = new Map(), termHistory }) {
  return [...termsByIri.values()]
    .filter((term) => term.id.startsWith("SO:"))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((term) => {
      const parentIris = parents.get(term.iri) || [];
      const childIris = children.get(term.iri) || [];
      const relationEntries = related.get(term.iri) || [];
      const incomingRelationEntries = relatedIncoming.get(term.iri) || [];
      const relatedIris = [
        ...new Set([
          ...relationEntries.map((entry) => entry.target),
          ...incomingRelationEntries.map((entry) => entry.source)
        ])
      ];
      return {
        ...term,
        canonicalUrl: `/${canonicalTermPath(term.id)}`,
        history: termHistory[term.id] || { firstSeen: null, mostRecent: null, entries: [], semanticEvents: [] },
        parents: parentIris.map((iri) => publicIdFromIri(iri)),
        children: childIris.map((iri) => publicIdFromIri(iri)),
        ancestors: computeClosure(term.iri, parents).map((iri) => publicIdFromIri(iri)),
        descendants: computeClosure(term.iri, children).map((iri) => publicIdFromIri(iri)),
        relationships: relationEntries.map((entry) => ({
          predicate: entry.predicate,
          target: publicIdFromIri(entry.target)
        })),
        graphNeighborhood: {
          parents: parentIris,
          children: childIris,
          related: relatedIris,
          edges: [
            ...parentIris.map((parentIri) => ({
              source: term.iri,
              target: parentIri,
              predicate: "is_a"
            })),
            ...childIris.map((childIri) => ({
              source: childIri,
              target: term.iri,
              predicate: "is_a"
            })),
            ...relationEntries.map((entry) => ({
              source: term.iri,
              target: entry.target,
              predicate: entry.predicate
            })),
            ...incomingRelationEntries.map((entry) => ({
              source: entry.source,
              target: term.iri,
              predicate: entry.predicate
            }))
          ]
        }
      };
    });
}

export {
  buildGraphData,
  buildNormalizedTerms,
  createSearchTokens,
  parseMetrics,
  parseOntologyMetadata,
  parseTermsFromOwl
};
