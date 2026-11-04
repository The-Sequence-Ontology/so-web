import test from "node:test";
import assert from "node:assert/strict";
import { buildLayout, mergePayloads, termPayloadUrl } from "../src/assets/graph.js";

const release = {
  ontologyIri: "https://example.org/so.owl",
  versionIri: "https://example.org/so/2026-07-02/so.owl",
  date: "2026-07-02"
};

test("graph expansion fetches colon-containing term IDs as relative JSON files", () => {
  const url = termPayloadUrl("SO:0000704", new URL("https://example.org/assets/terms/"));
  assert.equal(url.href, "https://example.org/assets/terms/SO:0000704.json");
  assert.equal(url.protocol, "https:");
});

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

test("expanded payloads merge without duplicating nodes or changing the focal term", () => {
  const base = {
    schemaVersion: 1,
    release,
    focalTerm: "SO:1",
    nodes: [
      node("SO:1", "root", ["focal"]),
      node("SO:2", "child", ["child"])
    ],
    edges: [{ source: "SO:2", target: "SO:1", predicate: "is_a" }]
  };
  const addition = {
    schemaVersion: 1,
    release,
    focalTerm: "SO:2",
    nodes: [
      node("SO:2", "child", ["focal"]),
      node("SO:3", "grandchild_with_a_label_long_enough_to_wrap", ["child"])
    ],
    edges: [{ source: "SO:3", target: "SO:2", predicate: "is_a" }]
  };

  const merged = mergePayloads(base, addition);
  assert.equal(merged.focalTerm, "SO:1");
  assert.equal(merged.nodes.length, 3);
  assert.equal(merged.edges.length, 2);
  assert.deepEqual(merged.nodes.find((entry) => entry.id === "SO:2").roles, ["child"]);

  const layout = buildLayout(merged);
  assert.equal(layout.nodesById.get("SO:1").level, 0);
  assert.equal(layout.nodesById.get("SO:2").level, 1);
  assert.equal(layout.nodesById.get("SO:3").level, 2);
  assert.equal(layout.nodesById.get("SO:3").labelLines.length, 2);
});

test("relation filters remove disconnected nodes while retaining the focal term", () => {
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

  const layout = buildLayout(payload, new Set(["is_a"]));
  assert.deepEqual(
    layout.nodes.map((entry) => entry.id).sort(),
    ["SO:1", "SO:2"]
  );
});
