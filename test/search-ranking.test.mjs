import test from "node:test";
import assert from "node:assert/strict";
import { searchTerms } from "../src/assets/search-ranking.js";

function term(id, label, { definition = "", synonyms = [], alt_ids = [] } = {}) {
  return {
    id, label, synonyms, alt_ids,
    tokens: [id, id.replace(":", "_"), label, definition, ...synonyms, ...alt_ids].join(" || ").toLowerCase()
  };
}

test("an exact label precedes matches in other terms' definitions", () => {
  const items = [
    term("SO:0000409", "binding_site", { definition: "A biological_region of sequence." }),
    term("SO:0001411", "biological_region"),
    term("SO:0001500", "heritable_phenotypic_marker", { definition: "A biological_region characterized as a trait." })
  ];
  const { matches, total } = searchTerms(items, "  BIOLOGICAL_REGION  ");
  assert.equal(total, 3);
  assert.deepEqual(matches.map(({ id }) => id), ["SO:0001411", "SO:0000409", "SO:0001500"]);
});

test("the result cap cannot hide a later exact label match", () => {
  const mentions = Array.from({ length: 75 }, (_, index) =>
    term("SO:" + String(index + 1).padStart(7, "0"), "feature_" + index, { definition: "A feature of a gene." }));
  const exact = term("SO:0000704", "gene");
  const items = [...mentions, exact];
  const originalOrder = [...items];
  const { matches, total } = searchTerms(items, "gene");
  assert.equal(total, 76);
  assert.equal(matches.length, 50);
  assert.equal(matches[0], exact);
  assert.deepEqual(items, originalOrder);
});

test("canonical, compact, and alternate IDs precede incidental ID mentions", () => {
  const exact = term("SO:0000704", "gene", { alt_ids: ["SO:9999999"] });
  const mention = term("SO:0000001", "region", { definition: "See SO:0000704, SO_0000704, SO:9999999, or SO_9999999." });
  for (const query of ["SO:0000704", "so_0000704", "SO:9999999", "so_9999999"]) {
    const { matches, total } = searchTerms([mention, exact], query);
    assert.equal(total, 2);
    assert.equal(matches[0], exact, query);
  }
});

test("synonym and partial-label matches precede definition-only matches", () => {
  const items = [
    term("SO:0000001", "region", { definition: "A feature in the sequence." }),
    term("SO:0000002", "element", { synonyms: ["genomic feature"] }),
    term("SO:0000003", "sequence_feature"),
    term("SO:0000004", "feature_collection"),
    term("SO:0000005", "sequence_element", { synonyms: ["feature"] }),
    term("SO:0000006", "unrelated")
  ];
  const { matches, total } = searchTerms(items, "feature");
  assert.equal(total, 5);
  assert.deepEqual(matches.map(({ id }) => id), ["SO:0000005", "SO:0000004", "SO:0000003", "SO:0000002", "SO:0000001"]);
});

test("empty queries and queries with no matches return no results", () => {
  const items = [term("SO:0000704", "gene")];
  for (const query of ["", "   ", "no_such_term"]) {
    assert.deepEqual(searchTerms(items, query), { matches: [], total: 0 });
  }
});
