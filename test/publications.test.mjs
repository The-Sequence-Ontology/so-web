import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, DomUtils } from "htmlparser2";
import { publicationData } from "../lib/publications.mjs";

const types = [
  { value: "journal-article", label: "Journal article" },
  { value: "conference-paper", label: "Conference paper" },
  { value: "poster", label: "Poster & demo" }
];
const contentTypes = [
  { value: "so-development-update", label: "SO development update" },
  { value: "so-community-contribution", label: "SO community contribution" },
  { value: "so-cited-mentioned", label: "SO cited/mentioned" }
];
const card = (id, year, type, contentType = "so-cited-mentioned") => `<article class="card publication-card" id="${id}" data-year="${year}" data-type="${type}" data-content-type="${contentType}"><h3>${id}</h3><p>Authors: A<sup>1</sup></p><ol><li>University</li></ol><blockquote><p>A &amp; B.</p></blockquote><p>Credit: <a href="https://example.org/${id}">source</a></p></article>`;
const cardsIn = (html) => DomUtils.findAll((node) => node.name === "article", parseDocument(html).children);

test("publication and content tags preserve all authored content and source credits", () => {
  const html = card("journal", 2021, "journal-article", "so-development-update") + card("conference", 2023, "conference-paper", "so-development-update") + card("poster", 2021, "poster", "so-community-contribution");
  const result = publicationData(html, types, contentTypes);
  assert.equal(result.total, 3);
  assert.deepEqual(result.years, [
    { year: "2023", id: "conference", count: 1 },
    { year: "2021", id: "journal", count: 2 }
  ]);
  assert.deepEqual(result.types, types.map((type) => ({ ...type, count: 1 })));
  assert.deepEqual(result.contentTypes, contentTypes.map((type, index) => ({ ...type, count: [2, 1, 0][index] })));
  const original = cardsIn(html);
  const rendered = cardsIn(result.html);
  for (const [index, article] of rendered.entries()) {
    const header = article.children.find((node) => node.name === "header");
    assert.equal(header.children[0].name, "h3");
    const tags = DomUtils.findAll((node) => node.name === "span", header.children);
    assert.equal(DomUtils.textContent(tags[0]), types[index].label);
    assert.equal(DomUtils.textContent(tags[1]), contentTypes[index === 2 ? 1 : 0].label);
    for (const tag of tags) DomUtils.removeElement(tag);
    assert.equal(DomUtils.textContent(article), DomUtils.textContent(original[index]));
    assert.equal(DomUtils.findAll((node) => node.name === "a", article.children)[0].attribs.href, `https://example.org/${article.attribs.id}`);
  }
});

test("invalid publication metadata produces clear authoring errors", () => {
  const render = (html) => publicationData(html, types, contentTypes);
  assert.throws(() => render(card("paper", 2021, "unknown")), /valid data-type/);
  assert.throws(() => render(card("paper", "next year", "poster")), /four-digit data-year/);
  assert.throws(() => render(card("paper", 2021, "poster") + card("paper", 2022, "poster")), /unique id/);
  assert.throws(() => render(card("paper", 2021, "poster").replace("<h3>paper</h3>", "")), /title heading/);
  assert.throws(() => render(card("paper", 2021, "poster", "unknown")), /valid data-content-type/);
  assert.throws(() => render(card("paper", 2021, "poster").replace(' data-content-type="so-cited-mentioned"', "")), /valid data-content-type/);
});
