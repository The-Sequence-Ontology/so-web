import test from "node:test";
import assert from "node:assert/strict";
import { buildLayout } from "../src/assets/graph.js";

const release = {
  ontologyIri: "https://example.org/so.owl",
  versionIri: "https://example.org/so/2026-07-02/so.owl",
  date: "2026-07-02"
};

function node(id, label, roles) {
  return {
    id,
    iri: `https://example.org/${id}`,
    label,
    url: `/browser/current_release/term/${id}/`,
    obsolete: false,
    roles
  };
}

test("interactive layout preserves hierarchy levels and wraps long labels", () => {
  const payload = {
    schemaVersion: 1,
    release,
    focalTerm: "SO:2",
    nodes: [
      node("SO:1", "root", ["parent"]),
      node("SO:2", "child", ["focal"]),
      node("SO:3", "grandchild_with_a_label_long_enough_to_wrap", ["child"])
    ],
    edges: [
      { source: "SO:2", target: "SO:1", predicate: "is_a" },
      { source: "SO:3", target: "SO:2", predicate: "is_a" }
    ]
  };

  const layout = buildLayout(payload);
  assert.equal(layout.nodes.length, 3);
  assert.equal(layout.edges.length, 2);
  assert.equal(layout.nodesById.get("SO:1").level, -1);
  assert.equal(layout.nodesById.get("SO:2").level, 0);
  assert.equal(layout.nodesById.get("SO:3").level, 1);
  assert.equal(layout.nodesById.get("SO:3").labelLines.length, 2);
});

test("interactive layout includes every relationship type and isolated focal terms", () => {
  const payload = {
    schemaVersion: 1,
    release,
    focalTerm: "SO:1",
    nodes: [
      node("SO:1", "root", ["focal"]),
      node("SO:2", "child", ["child"]),
      node("SO:3", "related", ["related-outgoing"])
    ],
    edges: [
      { source: "SO:2", target: "SO:1", predicate: "is_a" },
      { source: "SO:1", target: "SO:3", predicate: "part_of" }
    ]
  };

  const layout = buildLayout(payload);
  assert.deepEqual(
    layout.nodes.map((entry) => entry.id).sort(),
    ["SO:1", "SO:2", "SO:3"]
  );
  assert.deepEqual(layout.edges.map((edge) => edge.predicate), ["is_a", "part_of"]);
  const isolated = buildLayout({ ...payload, edges: [] });
  assert.equal(isolated.nodes.length, 1);
  assert.equal(isolated.nodes[0].id, payload.focalTerm);
});
