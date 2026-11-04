import { parseDocument, DomUtils } from "htmlparser2";
import { canonicalTermPath, publicIdFromIri, slugFromIri, normalizeWhitespace } from "./shared.mjs";

function parseOwlDocument(owl) {
  const document = parseDocument(owl, { xmlMode: true, decodeEntities: true });
  return document.children.find((node) => node.name === "rdf:RDF") || document;
}

function childElements(node, tag) {
  return node.children.filter((child) => child.name === tag);
}

function extractSingleText(block, tag) {
  return extractAllText(block, tag)[0] || "";
}

function extractAllText(block, tag) {
  return childElements(block, tag).map((node) => normalizeWhitespace(DomUtils.textContent(node)));
}

function extractAllResources(block, tag) {
  return childElements(block, tag).map((node) => node.attribs["rdf:resource"]).filter(Boolean);
}

function parseOntologyMetadata(owl) {
  const root = parseOwlDocument(owl);
  const block = childElements(root, "owl:Ontology")[0] || { children: [], attribs: {} };
  const ontologyIri = block.attribs["rdf:about"] || "";
  const versionIri = extractAllResources(block, "owl:versionIRI")[0] || "";
  const savedBy = extractSingleText(block, "oboInOwl:saved-by");
  const releaseDate = extractSingleText(block, "oboInOwl:date");
  const defaultNamespace = extractSingleText(block, "oboInOwl:default-namespace");
  return { ontologyIri, versionIri, savedBy, releaseDate, defaultNamespace };
}

function parseDefinitionXrefs(root) {
  const map = new Map();
  for (const block of childElements(root, "owl:Axiom")) {
    const source = extractAllResources(block, "owl:annotatedSource")[0];
    const property = extractAllResources(block, "owl:annotatedProperty")[0];
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
  const root = parseOwlDocument(owl);
  const definitionXrefs = parseDefinitionXrefs(root);
  // Read annotations from the named class itself. Anonymous nested classes are
  // logical expressions, not the end of the term or sources of its annotations.
  for (const block of childElements(root, "owl:Class")) {
    const iri = block.attribs["rdf:about"];
    if (!iri?.includes("/SO_")) continue;
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
      isObsolete: extractSingleText(block, "owl:deprecated") === "true",
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
