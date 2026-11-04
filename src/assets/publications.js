function initializePublications(root) {
  const sidebar = root.querySelector(".publications-sidebar");
  const cards = [...root.querySelectorAll(".publication-card")];
  const years = root.querySelector("[data-publication-years]");
  const yearRows = [...years.querySelectorAll("[data-publication-year]")];
  const empty = root.querySelector("[data-publication-empty]");
  const status = root.querySelector("[data-publication-status]");
  const groups = [
    { selector: "[data-publication-filters]", name: "publication-type", key: "type", counter: "data-publication-type-count" },
    { selector: "[data-publication-content-filters]", name: "publication-content-type", key: "contentType", counter: "data-publication-content-type-count" }
  ].map((group) => {
    const element = root.querySelector(group.selector);
    const all = element.querySelector('input[value="all"]');
    const options = [...element.querySelectorAll(`input[name="${group.name}"]`)].filter((input) => input !== all);
    for (const counter of element.querySelectorAll(`[${group.counter}]`)) {
      const value = counter.getAttribute(group.counter);
      counter.textContent = value === "all" ? cards.length : cards.filter((card) => card.dataset[group.key] === value).length;
    }
    return { ...group, element, all, options };
  });

  function applyFilter() {
    for (const group of groups) {
      group.selected = new Set(group.options.filter((input) => input.checked).map((input) => input.value));
      group.all.checked = group.selected.size === group.options.length;
      group.all.indeterminate = group.selected.size > 0 && group.selected.size < group.options.length;
    }
    // Combine selected options within a group; require a match in both groups.
    for (const card of cards) card.hidden = !groups.every((group) => group.selected.has(card.dataset[group.key]));
    const visible = cards.filter((card) => !card.hidden);

    for (const row of yearRows) {
      const year = row.dataset.publicationYear;
      const matches = visible.filter((card) => card.dataset.year === year);
      row.hidden = matches.length === 0;
      if (!matches.length) continue;
      const link = row.querySelector("a");
      link.setAttribute("href", "#" + matches[0].id);
      link.setAttribute("aria-label", `${year}: ${matches.length} publication${matches.length === 1 ? "" : "s"}`);
      row.querySelector(".publication-year-count").textContent = matches.length;
    }

    years.hidden = visible.length === 0;
    empty.hidden = visible.length !== 0;
    empty.textContent = groups.every((group) => group.selected.size)
      ? "No publications match the selected filters."
      : "Select at least one option in each filter group to show publications.";
    status.textContent = `${visible.length} publication${visible.length === 1 ? "" : "s"} shown.`;

    // A bookmark should never point to a card hidden by the selected filter.
    if (cards.some((card) => card.hidden && location.hash === "#" + card.id)) {
      history.replaceState(history.state, "", location.pathname + location.search);
    }
  }

  for (const group of groups) {
    group.element.addEventListener("change", (event) => {
      if (!event.target.matches(`input[name="${group.name}"]`)) return;
      if (event.target === group.all) {
        for (const input of group.options) input.checked = group.all.checked;
      }
      applyFilter();
    });
  }
  applyFilter();
  for (const group of groups) group.element.hidden = false;

  // Let a long year list use the page's scrollbar instead of clipping its links.
  function updateSidebarFit() {
    const inset = 1.25 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    sidebar.toggleAttribute("data-sticky-disabled", sidebar.getBoundingClientRect().height + 2 * inset > innerHeight);
  }
  new ResizeObserver(updateSidebarFit).observe(sidebar);
  window.addEventListener("resize", updateSidebarFit);
  updateSidebarFit();
}

for (const root of document.querySelectorAll("[data-publications]")) initializePublications(root);
