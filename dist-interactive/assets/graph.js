const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_MIN_WIDTH = 156;
const NODE_MAX_WIDTH = 340;
const NODE_LINE_HEIGHT = 18;
const ROW_GAP = 74;
const COLUMN_GAP = 28;
const VIEWBOX_PADDING = 54;

function edgeKey(edge) {
  return `${edge.source}|${edge.predicate}|${edge.target}`;
}

function mergePayloads(base, addition) {
  if (base.schemaVersion !== addition.schemaVersion) {
    throw new Error("Graph payload schema versions do not match.");
  }
  if (
    base.release.versionIri &&
    addition.release.versionIri &&
    base.release.versionIri !== addition.release.versionIri
  ) {
    throw new Error("Graph payload releases do not match.");
  }

  const nodes = new Map(
    base.nodes.map((node) => [
      node.id,
      {
        ...node,
        roles: new Set(node.roles || [])
      }
    ])
  );

  for (const node of addition.nodes) {
    const additionRoles = (node.roles || []).filter(
      (role) => role !== "focal" || node.id === base.focalTerm
    );
    const existing = nodes.get(node.id);
    if (existing) {
      for (const role of additionRoles) existing.roles.add(role);
    } else {
      nodes.set(node.id, { ...node, roles: new Set(additionRoles) });
    }
  }

  const edges = new Map(base.edges.map((edge) => [edgeKey(edge), edge]));
  for (const edge of addition.edges) edges.set(edgeKey(edge), edge);

  return {
    ...base,
    nodes: [...nodes.values()]
      .map((node) => ({ ...node, roles: [...node.roles].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)))
  };
}

function wrapLabel(label, maxCharacters = 30) {
  if (label.length <= maxCharacters) return [label];

  const words = label.split(/(?=[_\-\s])|(?<=[_\-\s])/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current || `${current}${word}`.length <= maxCharacters) {
      current += word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.length > 2 ? [lines[0], `${lines.slice(1).join("").slice(0, maxCharacters - 1)}…`] : lines;
}

function assignLevels(payload, visibleEdges, visibleNodeIds) {
  const levels = new Map([[payload.focalTerm, 0]]);
  const hierarchyEdges = visibleEdges.filter((edge) => edge.predicate === "is_a");

  for (let pass = 0; pass < visibleNodeIds.size; pass += 1) {
    let changed = false;
    for (const edge of hierarchyEdges) {
      if (levels.has(edge.source) && !levels.has(edge.target)) {
        levels.set(edge.target, levels.get(edge.source) - 1);
        changed = true;
      } else if (levels.has(edge.target) && !levels.has(edge.source)) {
        levels.set(edge.source, levels.get(edge.target) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (let pass = 0; pass < visibleNodeIds.size; pass += 1) {
    let changed = false;
    for (const edge of visibleEdges) {
      if (levels.has(edge.source) && !levels.has(edge.target)) {
        levels.set(edge.target, levels.get(edge.source) + 1);
        changed = true;
      } else if (levels.has(edge.target) && !levels.has(edge.source)) {
        levels.set(edge.source, levels.get(edge.target) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const fallbackLevel = Math.max(0, ...levels.values()) + 1;
  for (const id of visibleNodeIds) {
    if (!levels.has(id)) levels.set(id, fallbackLevel);
  }
  return levels;
}

function buildLayout(payload, enabledPredicates = new Set(payload.edges.map((edge) => edge.predicate))) {
  const visibleEdges = payload.edges.filter((edge) => enabledPredicates.has(edge.predicate));
  const visibleNodeIds = new Set([payload.focalTerm]);
  for (const edge of visibleEdges) {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  const sourceNodes = new Map(payload.nodes.map((node) => [node.id, node]));
  const levels = assignLevels(payload, visibleEdges, visibleNodeIds);
  const rows = new Map();

  for (const id of visibleNodeIds) {
    const node = sourceNodes.get(id);
    if (!node) continue;
    const level = levels.get(id);
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level).push(node);
  }

  const sortedLevels = [...rows.keys()].sort((a, b) => a - b);
  const measuredRows = sortedLevels.map((level) => {
    const nodes = rows
      .get(level)
      .sort((a, b) => {
        if (a.id === payload.focalTerm) return -1;
        if (b.id === payload.focalTerm) return 1;
        return a.label.localeCompare(b.label);
      })
      .map((node) => {
        const labelLines = wrapLabel(node.label);
        const longestLine = Math.max(node.id.length, ...labelLines.map((line) => line.length));
        return {
          ...node,
          labelLines,
          width: Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, Math.ceil(longestLine * 9.25 + 46))),
          height: 44 + labelLines.length * NODE_LINE_HEIGHT
        };
      });
    return {
      level,
      nodes,
      width: nodes.reduce((sum, node) => sum + node.width, 0) + COLUMN_GAP * Math.max(0, nodes.length - 1),
      height: Math.max(...nodes.map((node) => node.height))
    };
  });

  const contentWidth = Math.max(NODE_MIN_WIDTH, ...measuredRows.map((row) => row.width));
  let cursorY = VIEWBOX_PADDING;
  const positionedNodes = [];

  for (const row of measuredRows) {
    let cursorX = VIEWBOX_PADDING + (contentWidth - row.width) / 2;
    for (const node of row.nodes) {
      positionedNodes.push({
        ...node,
        x: cursorX,
        y: cursorY + (row.height - node.height) / 2,
        level: row.level
      });
      cursorX += node.width + COLUMN_GAP;
    }
    cursorY += row.height + ROW_GAP;
  }

  const nodesById = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges = visibleEdges.filter(
    (edge) => nodesById.has(edge.source) && nodesById.has(edge.target)
  );
  const width = contentWidth + VIEWBOX_PADDING * 2;
  const height = Math.max(220, cursorY - ROW_GAP + VIEWBOX_PADDING);

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    nodesById,
    viewBox: { x: 0, y: 0, width, height }
  };
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function edgeEndpoints(source, target) {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

  if (source.level < target.level) {
    return {
      x1: sourceCenter.x,
      y1: source.y + source.height,
      x2: targetCenter.x,
      y2: target.y
    };
  }
  if (source.level > target.level) {
    return {
      x1: sourceCenter.x,
      y1: source.y,
      x2: targetCenter.x,
      y2: target.y + target.height
    };
  }
  if (sourceCenter.x < targetCenter.x) {
    return {
      x1: source.x + source.width,
      y1: sourceCenter.y,
      x2: target.x,
      y2: targetCenter.y
    };
  }
  return {
    x1: source.x,
    y1: sourceCenter.y,
    x2: target.x + target.width,
    y2: targetCenter.y
  };
}

function createGraphControls(section, state) {
  const controls = document.createElement("div");
  controls.className = "graph-controls";
  controls.setAttribute("aria-label", "Ontology graph controls");

  const viewControls = document.createElement("div");
  viewControls.className = "graph-control-group";
  viewControls.setAttribute("aria-label", "Graph view");

  for (const [label, action] of [
    ["Zoom in", "zoom-in"],
    ["Zoom out", "zoom-out"],
    ["Fit graph", "fit"]
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.graphAction = action;
    button.textContent = label;
    viewControls.appendChild(button);
  }

  const expansion = document.createElement("div");
  expansion.className = "graph-control-group graph-expansion";
  const selectLabel = document.createElement("label");
  selectLabel.textContent = "Selected term";
  const select = document.createElement("select");
  select.dataset.graphNodeSelect = "";
  selectLabel.appendChild(select);
  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.dataset.graphAction = "expand";
  expandButton.textContent = "Expand one level";
  expansion.append(selectLabel, expandButton);

  const filters = document.createElement("fieldset");
  filters.className = "graph-filters";
  filters.dataset.graphFilters = "";
  const legend = document.createElement("legend");
  legend.textContent = "Relationships";
  filters.appendChild(legend);

  const status = document.createElement("p");
  status.className = "graph-status muted";
  status.dataset.graphStatus = "";
  status.setAttribute("aria-live", "polite");

  controls.append(viewControls, expansion, filters, status);
  section.insertBefore(controls, section.querySelector(".dag-figure"));
  state.controls = { root: controls, select, expandButton, filters, status };
}

function updateControls(state) {
  const { select, expandButton, filters, status } = state.controls;
  const previousSelection = state.selectedId;
  select.replaceChildren();

  for (const node of state.payload.nodes) {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = `${node.id} — ${node.label}`;
    select.appendChild(option);
  }
  select.value = state.payload.nodes.some((node) => node.id === previousSelection)
    ? previousSelection
    : state.payload.focalTerm;
  state.selectedId = select.value;
  expandButton.disabled = state.expandedIds.has(state.selectedId);

  const predicates = [...new Set(state.payload.edges.map((edge) => edge.predicate))].sort();
  for (const predicate of predicates) {
    if (!state.enabledPredicates.has(predicate)) state.enabledPredicates.add(predicate);
  }
  filters.replaceChildren();
  const legend = document.createElement("legend");
  legend.textContent = "Relationships";
  filters.appendChild(legend);

  for (const predicate of predicates) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = predicate;
    input.checked = state.enabledPredicates.has(predicate);
    label.append(input, ` ${predicate.replaceAll("_", " ")}`);
    filters.appendChild(label);
  }

  status.textContent = `${state.payload.nodes.length} loaded terms; ${state.payload.edges.length} relationships.`;
}

function setViewBox(state, viewBox) {
  state.currentViewBox = { ...viewBox };
  state.svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`
  );
}

function renderGraph(state) {
  const layout = buildLayout(state.payload, state.enabledPredicates);
  const svg = svgElement("svg", {
    class: "dag-svg interactive-dag",
    role: "img",
    "aria-labelledby": `interactive-title-${state.payload.focalTerm.replace(":", "_")} interactive-desc-${state.payload.focalTerm.replace(":", "_")}`,
    tabindex: "0"
  });

  const title = svgElement("title", {
    id: `interactive-title-${state.payload.focalTerm.replace(":", "_")}`
  });
  title.textContent = `Interactive ontology neighborhood for ${state.payload.focalTerm}`;
  const desc = svgElement("desc", {
    id: `interactive-desc-${state.payload.focalTerm.replace(":", "_")}`
  });
  desc.textContent =
    "Use the graph controls to filter relationships, zoom, pan, and expand a selected term. Each graph node links to its canonical term page.";

  const defs = svgElement("defs");
  const marker = svgElement("marker", {
    id: `graph-arrow-${state.payload.focalTerm.replace(":", "_")}`,
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "7",
    markerHeight: "7",
    orient: "auto-start-reverse"
  });
  marker.appendChild(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "graph-arrow" }));
  defs.appendChild(marker);
  svg.append(title, desc, defs);

  const edgeLayer = svgElement("g", { class: "graph-edge-layer" });
  for (const edge of layout.edges) {
    const source = layout.nodesById.get(edge.source);
    const target = layout.nodesById.get(edge.target);
    const endpoints = edgeEndpoints(source, target);
    const line = svgElement("line", {
      ...endpoints,
      class: "dag-edge interactive-edge",
      "data-edge-source": edge.source,
      "data-edge-target": edge.target,
      "data-edge-predicate": edge.predicate,
      "marker-end": `url(#graph-arrow-${state.payload.focalTerm.replace(":", "_")})`
    });
    const edgeTitle = svgElement("title");
    edgeTitle.textContent = `${edge.source} ${edge.predicate.replaceAll("_", " ")} ${edge.target}`;
    line.appendChild(edgeTitle);
    edgeLayer.appendChild(line);
  }

  const nodeLayer = svgElement("g", { class: "graph-node-layer" });
  for (const node of layout.nodes) {
    const link = svgElement("a", {
      href: node.url,
      class: `dag-node interactive-node${node.id === state.payload.focalTerm ? " is-current" : ""}${node.id === state.selectedId ? " is-selected" : ""}`,
      "data-node-id": node.id,
      "aria-label": `${node.id} ${node.label}. Open term page.`
    });
    const nodeTitle = svgElement("title");
    nodeTitle.textContent = `${node.id} ${node.label}`;
    link.appendChild(nodeTitle);
    link.appendChild(
      svgElement("rect", {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      })
    );

    const idText = svgElement("text", { x: node.x + 14, y: node.y + 23 });
    idText.textContent = node.id;
    link.appendChild(idText);
    node.labelLines.forEach((line, index) => {
      const labelText = svgElement("text", {
        x: node.x + 14,
        y: node.y + 44 + index * NODE_LINE_HEIGHT
      });
      labelText.textContent = line;
      link.appendChild(labelText);
    });
    nodeLayer.appendChild(link);
  }

  svg.append(edgeLayer, nodeLayer);
  state.figure.querySelector("svg")?.replaceWith(svg);
  state.svg = svg;
  state.layout = layout;
  setViewBox(state, layout.viewBox);
  bindGraphInteractions(state);
}

function highlightNeighborhood(state, nodeId) {
  const connected = new Set([nodeId]);
  for (const edge of state.layout.edges) {
    if (edge.source === nodeId) connected.add(edge.target);
    if (edge.target === nodeId) connected.add(edge.source);
  }

  for (const node of state.svg.querySelectorAll("[data-node-id]")) {
    node.classList.toggle("is-dimmed", !connected.has(node.dataset.nodeId));
    node.classList.toggle("is-highlighted", node.dataset.nodeId === nodeId);
  }
  for (const edge of state.svg.querySelectorAll("[data-edge-source]")) {
    const active = edge.dataset.edgeSource === nodeId || edge.dataset.edgeTarget === nodeId;
    edge.classList.toggle("is-dimmed", !active);
    edge.classList.toggle("is-highlighted", active);
  }
}

function clearHighlight(state) {
  for (const element of state.svg.querySelectorAll(".is-dimmed, .is-highlighted")) {
    element.classList.remove("is-dimmed", "is-highlighted");
  }
}

function zoom(state, factor) {
  const current = state.currentViewBox;
  const nextWidth = current.width * factor;
  const nextHeight = current.height * factor;
  setViewBox(state, {
    x: current.x + (current.width - nextWidth) / 2,
    y: current.y + (current.height - nextHeight) / 2,
    width: nextWidth,
    height: nextHeight
  });
}

function bindGraphInteractions(state) {
  for (const node of state.svg.querySelectorAll("[data-node-id]")) {
    const selectNode = () => {
      state.selectedId = node.dataset.nodeId;
      state.controls.select.value = state.selectedId;
      state.controls.expandButton.disabled = state.expandedIds.has(state.selectedId);
      highlightNeighborhood(state, state.selectedId);
    };
    node.addEventListener("mouseenter", selectNode);
    node.addEventListener("focus", selectNode);
    node.addEventListener("mouseleave", () => clearHighlight(state));
    node.addEventListener("blur", () => clearHighlight(state));
  }

  let dragStart = null;
  state.svg.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-node-id]")) return;
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      viewBox: { ...state.currentViewBox }
    };
    state.svg.setPointerCapture(event.pointerId);
    state.svg.classList.add("is-panning");
  });
  state.svg.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    const scaleX = dragStart.viewBox.width / state.svg.clientWidth;
    const scaleY = dragStart.viewBox.height / state.svg.clientHeight;
    setViewBox(state, {
      ...dragStart.viewBox,
      x: dragStart.viewBox.x - (event.clientX - dragStart.x) * scaleX,
      y: dragStart.viewBox.y - (event.clientY - dragStart.y) * scaleY
    });
  });
  const stopPanning = () => {
    dragStart = null;
    state.svg.classList.remove("is-panning");
  };
  state.svg.addEventListener("pointerup", stopPanning);
  state.svg.addEventListener("pointercancel", stopPanning);
  state.svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(state, event.deltaY < 0 ? 0.88 : 1.14);
    },
    { passive: false }
  );
}

async function expandSelected(state) {
  const id = state.selectedId;
  if (!id || state.expandedIds.has(id)) return;
  state.controls.expandButton.disabled = true;
  state.controls.status.textContent = `Loading the neighborhood for ${id}…`;

  try {
    const response = await fetch(new URL(`${id}.json`, state.payloadDirectory));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const addition = await response.json();
    state.payload = mergePayloads(state.payload, addition);
    state.expandedIds.add(id);
    updateControls(state);
    renderGraph(state);
    state.controls.status.textContent = `Expanded ${id}. ${state.payload.nodes.length} terms are now loaded.`;
  } catch {
    state.controls.expandButton.disabled = false;
    state.controls.status.textContent = `The neighborhood for ${id} could not be loaded.`;
  }
}

function bindControlInteractions(state) {
  state.controls.root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-graph-action]");
    if (!button) return;
    if (button.dataset.graphAction === "zoom-in") zoom(state, 0.8);
    if (button.dataset.graphAction === "zoom-out") zoom(state, 1.25);
    if (button.dataset.graphAction === "fit") setViewBox(state, state.layout.viewBox);
    if (button.dataset.graphAction === "expand") expandSelected(state);
  });

  state.controls.select.addEventListener("change", () => {
    state.selectedId = state.controls.select.value;
    state.controls.expandButton.disabled = state.expandedIds.has(state.selectedId);
    renderGraph(state);
  });

  state.controls.filters.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.checked) state.enabledPredicates.add(event.target.value);
    else state.enabledPredicates.delete(event.target.value);
    renderGraph(state);
  });
}

async function enhanceGraph(section) {
  const sourceUrl = new URL(section.dataset.graphSrc, document.baseURI);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const figure = section.querySelector(".dag-figure");
  if (!figure) return;

  const state = {
    section,
    figure,
    payload,
    payloadDirectory: new URL("./", sourceUrl),
    selectedId: payload.focalTerm,
    expandedIds: new Set([payload.focalTerm]),
    enabledPredicates: new Set(payload.edges.map((edge) => edge.predicate)),
    controls: null,
    svg: null,
    layout: null,
    currentViewBox: null
  };

  createGraphControls(section, state);
  updateControls(state);
  renderGraph(state);
  bindControlInteractions(state);
  figure.querySelector("figcaption").textContent =
    "Interactive local ontology graph. Nodes open term pages; controls support filtering, zooming, panning, and one-level expansion.";
}

if (typeof document !== "undefined") {
  for (const section of document.querySelectorAll("[data-graph-src]")) {
    enhanceGraph(section).catch(() => {
      section.dataset.graphEnhancement = "failed";
    });
  }
}

export { buildLayout, mergePayloads };
