import { canonicalTermPath, publicIdFromIri } from "./shared.mjs";

function buildTermPayload(term, termsByIri, metadata = {}) {
  const rolesByIri = new Map([[term.iri, new Set(["focal"])]]);

  function addRole(iri, role) {
    if (!rolesByIri.has(iri)) rolesByIri.set(iri, new Set());
    rolesByIri.get(iri).add(role);
  }

  for (const iri of term.graphNeighborhood.parents) addRole(iri, "parent");
  for (const iri of term.graphNeighborhood.children) addRole(iri, "child");
  for (const edge of term.graphNeighborhood.edges) {
    if (edge.predicate === "is_a") continue;
    if (edge.source === term.iri) addRole(edge.target, "related-outgoing");
    if (edge.target === term.iri) addRole(edge.source, "related-incoming");
  }

  const nodes = [...rolesByIri.entries()]
    .map(([iri, roles]) => {
      const node = termsByIri.get(iri);
      if (!node) return null;
      return {
        id: node.id,
        iri,
        label: node.label,
        url: `/${canonicalTermPath(node.id)}`,
        obsolete: node.isObsolete,
        roles: [...roles].sort()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = [
    ...new Map(
      term.graphNeighborhood.edges.map((edge) => [
        `${edge.source}|${edge.predicate}|${edge.target}`,
        {
          source: publicIdFromIri(edge.source),
          target: publicIdFromIri(edge.target),
          predicate: edge.predicate
        }
      ])
    ).values()
  ].sort((a, b) =>
    `${a.source}|${a.predicate}|${a.target}`.localeCompare(`${b.source}|${b.predicate}|${b.target}`)
  );

  return {
    schemaVersion: 1,
    release: {
      ontologyIri: metadata.ontologyIri || "",
      versionIri: metadata.versionIri || "",
      date: metadata.releaseDate || ""
    },
    focalTerm: term.id,
    nodes,
    edges
  };
}

export { buildTermPayload };
