import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphData, buildNormalizedTerms } from "../lib/ontology.mjs";
import { buildTermPayload } from "../lib/pages.mjs";

const iri = (id) => `http://purl.obolibrary.org/obo/${id.replace(":", "_")}`;

function term(id, label) {
  return {
    id,
    iri: iri(id),
    compactId: id.replace(":", "_"),
    label,
    definition: { text: "", xrefs: [] },
    comments: [],
    synonyms: [],
    xrefs: [],
    subsets: [],
    altIds: [],
    namespace: "sequence",
    isObsolete: false,
    replacedBy: []
  };
}

test("term subgraphs preserve semantic edge direction and relation predicates", () => {
  const focal = term("SO:0000001", "focal");
  const parent = term("SO:0000002", "parent");
  const child = term("SO:0000003", "child");
  const outgoing = term("SO:0000004", "outgoing");
  const incoming = term("SO:0000005", "incoming");
  const termsByIri = new Map([focal, parent, child, outgoing, incoming].map((entry) => [entry.iri, entry]));

  const graph = {
    nodes: [],
    edges: [
      { sub: focal.iri, obj: parent.iri, pred: "is_a" },
      { sub: child.iri, obj: focal.iri, pred: "is_a" },
      { sub: focal.iri, obj: outgoing.iri, pred: "part_of" },
      { sub: incoming.iri, obj: focal.iri, pred: "derives_from" }
    ]
  };

  const { parents, children, related, relatedIncoming } = buildGraphData(graph, termsByIri);
  const normalized = buildNormalizedTerms({
    termsByIri,
    parents,
    children,
    related,
    relatedIncoming,
    termHistory: {}
  });
  const normalizedFocal = normalized.find((entry) => entry.id === focal.id);

  assert.deepEqual(normalizedFocal.graphNeighborhood.edges, [
    { source: focal.iri, target: parent.iri, predicate: "is_a" },
    { source: child.iri, target: focal.iri, predicate: "is_a" },
    { source: focal.iri, target: outgoing.iri, predicate: "part_of" },
    { source: incoming.iri, target: focal.iri, predicate: "derives_from" }
  ]);

  const payload = buildTermPayload(normalizedFocal, termsByIri, {
    ontologyIri: "https://example.org/so.owl",
    versionIri: "https://example.org/so/2026-07-02/so.owl",
    releaseDate: "2026-07-02"
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.focalTerm, focal.id);
  assert.equal(payload.release.date, "2026-07-02");
  assert.deepEqual(
    payload.edges,
    [
      { source: "SO:0000005", target: "SO:0000001", predicate: "derives_from" },
      { source: "SO:0000003", target: "SO:0000001", predicate: "is_a" },
      { source: "SO:0000001", target: "SO:0000002", predicate: "is_a" },
      { source: "SO:0000001", target: "SO:0000004", predicate: "part_of" }
    ].sort((a, b) =>
      `${a.source}|${a.predicate}|${a.target}`.localeCompare(`${b.source}|${b.predicate}|${b.target}`)
    )
  );

  const roles = Object.fromEntries(payload.nodes.map((node) => [node.id, node.roles]));
  assert.deepEqual(roles[focal.id], ["focal"]);
  assert.deepEqual(roles[parent.id], ["parent"]);
  assert.deepEqual(roles[child.id], ["child"]);
  assert.deepEqual(roles[outgoing.id], ["related-outgoing"]);
  assert.deepEqual(roles[incoming.id], ["related-incoming"]);
});
