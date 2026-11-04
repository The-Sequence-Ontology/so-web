// A compact adjacency list preserves multiple inheritance without repeating subtrees.
export function buildOntologyTree(terms) {
  const nodes = Object.fromEntries(terms.map((term) => [term.id, {
    id: term.id,
    label: term.label || term.id,
    url: term.canonicalUrl,
    obsolete: term.isObsolete,
    parents: [],
    children: []
  }]));
  const compare = (a, b) => nodes[a].label.localeCompare(nodes[b].label) || a.localeCompare(b);

  for (const term of terms) {
    if (term.isObsolete) continue;
    for (const parentId of new Set(term.parents)) {
      const parent = nodes[parentId];
      if (!parent || parent.obsolete) continue;
      nodes[term.id].parents.push(parentId);
      parent.children.push(term.id);
    }
  }
  for (const node of Object.values(nodes)) {
    node.parents.sort(compare);
    node.children.sort(compare);
  }

  const active = Object.keys(nodes).filter((id) => !nodes[id].obsolete).sort(compare);
  const roots = active.filter((id) => !nodes[id].parents.length);
  const reached = new Set();
  const visit = (id) => {
    const pending = [id];
    while (pending.length) {
      const current = pending.pop();
      if (reached.has(current)) continue;
      reached.add(current);
      pending.push(...nodes[current].children);
    }
  };
  roots.forEach(visit);
  // Keep disconnected/cyclic source components reachable, too.
  for (const id of active) {
    if (!reached.has(id)) {
      roots.push(id);
      visit(id);
    }
  }

  return {
    roots,
    obsolete: Object.keys(nodes).filter((id) => nodes[id].obsolete).sort(compare),
    nodes
  };
}
