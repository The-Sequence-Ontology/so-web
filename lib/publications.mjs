import { parseDocument, DomUtils } from "htmlparser2";
import { escapeHtml } from "./shared.mjs";

// Derive labels and navigation from each card's authored year and categories.
export function publicationData(html, types, contentTypes) {
  const document = parseDocument(html);
  const years = new Map();
  const ids = new Set();
  const typeCounts = new Map(types.map((type) => [type.value, { ...type, count: 0 }]));
  const contentTypeCounts = new Map(contentTypes.map((type) => [type.value, { ...type, count: 0 }]));
  const cards = DomUtils.findAll((node) => node.name === "article" &&
    (node.attribs.class || "").split(/\s+/).includes("publication-card"), document.children);

  for (const card of cards) {
    const { id, "data-year": year, "data-type": type, "data-content-type": contentType } = card.attribs;
    if (!/^\d{4}$/.test(year || "") || !id || ids.has(id)) {
      throw new Error("Each publication card needs a four-digit data-year and a unique id.");
    }
    const category = typeCounts.get(type);
    if (!category) throw new Error(`Publication ${id} needs a valid data-type from publicationTypes.json.`);
    const contentCategory = contentTypeCounts.get(contentType);
    if (!contentCategory) throw new Error(`Publication ${id} needs a valid data-content-type from publicationContentTypes.json.`);
    const heading = card.children.find((node) => node.name === "h3");
    if (!heading) throw new Error(`Publication ${id} needs a level-three title heading.`);

    const header = parseDocument(`<header class="publication-card-header"><div class="publication-card-tags"><span class="publication-type-tag">${escapeHtml(category.label)}</span><span class="publication-content-tag">${escapeHtml(contentCategory.label)}</span></div></header>`).children[0];
    DomUtils.prepend(heading, header);
    DomUtils.prependChild(header, heading);
    category.count += 1;
    contentCategory.count += 1;
    ids.add(id);
    if (years.has(year)) years.get(year).count += 1;
    else years.set(year, { year, id, count: 1 });
  }

  return {
    html: DomUtils.getInnerHTML(document),
    years: [...years.values()].sort((a, b) => Number(b.year) - Number(a.year)),
    types: [...typeCounts.values()],
    contentTypes: [...contentTypeCounts.values()],
    total: cards.length
  };
}
