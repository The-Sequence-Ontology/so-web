const obsoleteRoot = "__obsolete__";

// Find one shortest parent path. Other parent branches remain independently expandable.
export function findTermPath(tree, id) {
  if (!tree.nodes[id]) return [];
  if (tree.nodes[id].obsolete) return [obsoleteRoot, id];
  const roots = new Set(tree.roots);
  const visited = new Set([id]);
  const pending = [[id]];
  for (let index = 0; index < pending.length; index++) {
    const path = pending[index];
    const current = path.at(-1);
    if (roots.has(current)) return path.toReversed();
    for (const parent of tree.nodes[current].parents) {
      if (visited.has(parent)) continue;
      visited.add(parent);
      pending.push([...path, parent]);
    }
  }
  return [];
}

function readState(key) {
  try { return JSON.parse(sessionStorage.getItem(key)) || {}; }
  catch { return {}; }
}

async function initializeHierarchy(sidebar) {
  const panel = sidebar.querySelector("details");
  const list = sidebar.querySelector("[data-tree-roots]");
  let revealTerm = () => {};
  let currentId = sidebar.dataset.currentTerm;
  sidebar.addEventListener("so:term-selected", (event) => {
    currentId = event.detail.id;
    sidebar.dataset.currentTerm = currentId;
    revealTerm(currentId);
    for (const link of list.querySelectorAll("[data-tree-term]")) {
      if (link.dataset.treeTerm === currentId) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  });
  if (currentId && matchMedia("(max-width: 900px)").matches) panel.open = false;

  try {
    const source = new URL(sidebar.dataset.treeSrc, document.baseURI);
    const response = await fetch(source);
    if (!response.ok) throw new Error("Hierarchy could not be loaded");
    const tree = await response.json();
    const siteBase = new URL("../", source);
    const storageKey = "so-ontology-tree:" + source.pathname;
    const saved = readState(storageKey);
    const openPaths = new Set(Array.isArray(saved.openPaths) ? saved.openPaths : []);
    const currentPath = findTermPath(tree, currentId);
    for (let length = 1; length <= currentPath.length; length++) {
      openPaths.add(currentPath.slice(0, length).join("/"));
    }
    if (!currentId && !Array.isArray(saved.openPaths)) {
      const initialRoot = tree.roots.includes("SO:0000110") ? "SO:0000110" : tree.roots[0];
      if (initialRoot) openPaths.add(initialRoot);
    }

    const save = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ openPaths: [...openPaths] }));
      } catch { /* Navigation still works when browser storage is disabled. */ }
    };
    let nextListId = 0;

    function renderNode(id, ancestors = []) {
      if (ancestors.includes(id)) return null;
      const node = id === obsoleteRoot
        ? { id, label: "Obsolete terms (" + tree.obsolete.length + ")", children: tree.obsolete }
        : tree.nodes[id];
      if (!node) return null;
      const path = [...ancestors, id];
      const key = path.join("/");
      const children = node.children.filter((child) => !path.includes(child));
      const li = document.createElement("li");
      li.dataset.treeNode = id;
      if (id === obsoleteRoot) li.className = "ontology-tree-obsolete";
      const row = document.createElement("div");
      row.className = "ontology-tree-row";
      li.appendChild(row);

      let toggle;
      if (children.length) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ontology-tree-toggle";
        toggle.textContent = "›";
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "ontology-tree-spacer";
        spacer.setAttribute("aria-hidden", "true");
        row.appendChild(spacer);
      }

      const link = document.createElement(node.url ? "a" : "span");
      link.className = "ontology-tree-link";
      if (node.url) {
        link.href = new URL("." + node.url, siteBase).href;
        link.dataset.treeTerm = id;
        if (id === currentId) link.setAttribute("aria-current", "page");
      } else {
        link.classList.add("ontology-tree-group");
      }
      const label = document.createElement("span");
      label.textContent = node.label;
      link.appendChild(label);
      if (node.url) {
        const identifier = document.createElement("span");
        identifier.className = "ontology-tree-id";
        identifier.textContent = id;
        link.appendChild(identifier);
      }
      row.appendChild(link);

      if (toggle) {
        const nested = document.createElement("ul");
        nested.className = "ontology-tree-list";
        nested.setAttribute("role", "list");
        nested.id = "ontology-children-" + (++nextListId);
        toggle.setAttribute("aria-controls", nested.id);
        li.appendChild(nested);
        let populated = false;
        const setExpanded = (expanded) => {
          toggle.textContent = expanded ? "⌄" : "›";
          toggle.setAttribute("aria-expanded", String(expanded));
          toggle.setAttribute("aria-label", (expanded ? "Collapse " : "Expand ") + node.label);
          nested.hidden = !expanded;
          if (expanded && !populated) {
            populated = true;
            for (const childId of children) {
              const child = renderNode(childId, path);
              if (child) nested.appendChild(child);
            }
          }
        };
        setExpanded(openPaths.has(key));
        toggle.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") !== "true";
          if (expanded) openPaths.add(key);
          else openPaths.delete(key);
          setExpanded(expanded);
          save();
        });
      }
      return li;
    }

    const fragment = document.createDocumentFragment();
    const roots = [...tree.roots, ...(tree.obsolete.length ? [obsoleteRoot] : [])];
    for (const id of roots) fragment.appendChild(renderNode(id));
    list.replaceChildren(fragment);
    revealTerm = (id) => {
      let branch = list;
      for (const ancestor of findTermPath(tree, id).slice(0, -1)) {
        const entry = [...branch.children].find((li) => li.dataset.treeNode === ancestor);
        if (!entry) break;
        const toggle = entry.querySelector(":scope > .ontology-tree-row > button");
        if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
        branch = entry.querySelector(":scope > ul");
        if (!branch) break;
      }
    };
    window.addEventListener("pagehide", save);
  } catch {
    sidebar.querySelector("[data-tree-status]").textContent = "Branch controls are unavailable. Open a term to follow its parent and child links.";
  }
}

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-ontology-tree]").forEach(initializeHierarchy);
}
