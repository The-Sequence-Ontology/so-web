import { canonicalTermPath } from "./shared.mjs";

function termLink(term) {
  return { id: term.id, label: term.label, url: "/" + canonicalTermPath(term.id) };
}

function relationshipGroups(entries, lookup, incoming = false) {
  const groups = new Map();
  for (const entry of entries) {
    const target = lookup.get(incoming ? entry.source : entry.target);
    if (!target) continue;
    if (!groups.has(entry.predicate)) groups.set(entry.predicate, []);
    groups.get(entry.predicate).push(termLink(target));
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([predicate, targets]) => ({ predicate, targets }));
}

export function buildSiteData({ terms, termsByIri, related, relatedIncoming, metadata, metrics }) {
  const aliases = new Map();
  const addAlias = (alias, id) => {
    if (alias === id) return;
    // The release includes alternate IDs that are also OWL classes. The legacy
    // builder wrote redirects last, in term order; retain that URL behavior.
    aliases.set(alias, id);
  };

  const linkedTerms = terms.map((term) => {
    addAlias(term.compactId, term.id);
    for (const altId of term.altIds) {
      addAlias(altId.replace(":", "_"), term.id);
      addAlias(altId, term.id);
    }
    const links = (iris) => iris.map((iri) => termsByIri.get(iri)).filter(Boolean).map(termLink);
    return {
      ...term,
      parentTerms: links(term.graphNeighborhood.parents),
      childTerms: links(term.graphNeighborhood.children),
      outgoingGroups: relationshipGroups(related.get(term.iri) || [], termsByIri),
      incomingGroups: relationshipGroups(relatedIncoming.get(term.iri) || [], termsByIri, true),
      replacements: term.replacedBy.map((id) => ({ id, url: "/" + canonicalTermPath(id) }))
    };
  });

  return {
    metadata,
    metrics,
    terms: linkedTerms,
    pageTerms: linkedTerms.filter((term) => !aliases.has(term.id)),
    termLookup: Object.fromEntries([...termsByIri].map(([iri, term]) => [iri, termLink(term)])),
    topLevelTerms: linkedTerms.filter((term) => !term.parents.length && !term.isObsolete).slice(0, 20),
    aliases: [...aliases].map(([alias, id]) => ({ alias, id, url: "/" + canonicalTermPath(id) }))
  };
}
