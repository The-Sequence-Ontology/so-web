import test from "node:test";
import assert from "node:assert/strict";
import { buildOntologyTree } from "../lib/ontology-tree.mjs";
import { findTermPath } from "../src/assets/ontology-tree.js";

const term = (id, label, parents = [], isObsolete = false) => ({
  id, label, parents, isObsolete,
  canonicalUrl: "/browser/current_release/term/" + id + "/"
});

test("the hierarchy retains multiple parents, sorts siblings, and separates obsolete terms", () => {
  const tree = buildOntologyTree([
    term("SO:1", "root"),
    term("SO:2", "zeta", ["SO:1"]),
    term("SO:3", "alpha", ["SO:1", "SO:1"]),
    term("SO:4", "shared child", ["SO:2", "SO:3"]),
    term("SO:5", "obsolete", ["SO:1"], true),
    term("SO:6", "disconnected", ["missing"]),
    term("SO:7", "active with obsolete parent", ["SO:5"])
  ]);
  assert.deepEqual(tree.nodes["SO:1"].children, ["SO:3", "SO:2"]);
  assert.deepEqual(tree.nodes["SO:4"].parents, ["SO:3", "SO:2"]);
  assert.deepEqual(tree.nodes["SO:2"].children, ["SO:4"]);
  assert.deepEqual(tree.nodes["SO:3"].children, ["SO:4"]);
  assert.deepEqual(tree.obsolete, ["SO:5"]);
  assert.deepEqual(tree.roots, ["SO:7", "SO:6", "SO:1"]);
  assert.deepEqual(findTermPath(tree, "SO:4"), ["SO:1", "SO:3", "SO:4"]);
  assert.deepEqual(findTermPath(tree, "SO:5"), ["__obsolete__", "SO:5"]);
  assert.deepEqual(findTermPath(tree, "unknown"), []);
  assert.equal(tree.nodes["SO:4"].url, "/browser/current_release/term/SO:4/");
});

test("disconnected cycles stay reachable without looping during path discovery", () => {
  const tree = buildOntologyTree([
    term("SO:1", "root"),
    term("SO:2", "cycle a", ["SO:3"]),
    term("SO:3", "cycle b", ["SO:2"])
  ]);
  assert.deepEqual(tree.roots, ["SO:1", "SO:2"]);
  assert.deepEqual(findTermPath(tree, "SO:3"), ["SO:2", "SO:3"]);
});
