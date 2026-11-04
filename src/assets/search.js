import { isExactMatch, searchTerms } from "./search-ranking.js";

const input = document.querySelector("[data-search-input]");
const results = document.querySelector("[data-search-results]");
const summary = document.querySelector("[data-search-summary]");

if (input && results && summary) {
  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get("q") || "";
  input.value = initialQuery;

  fetch(new URL("./search-index.json", import.meta.url))
    .then((response) => response.json())
    .then((items) => {
      const render = (query) => {
        const trimmed = query.trim().toLowerCase();
        results.innerHTML = "";

        if (!trimmed) {
          summary.textContent = "Enter a Sequence Ontology term ID, label, or synonym.";
          return;
        }

        const { matches, total } = searchTerms(items, trimmed);

        const count = `${total} matching term${total === 1 ? "" : "s"} for "${query}".`;
        summary.textContent = total > matches.length
          ? `Showing ${matches.length} of ${count}`
          : count;

        if (!matches.length) {
          results.innerHTML = "<li>No matching terms found.</li>";
          return;
        }

        for (const item of matches) {
          const li = document.createElement("li");
          const heading = document.createElement("div");
          heading.className = "search-result-heading";
          const label = document.createElement("a");
          label.href = item.url;
          label.textContent = `${item.id} - ${item.label}`;
          heading.appendChild(label);

          if (isExactMatch(item, trimmed)) {
            li.className = "search-result-exact";
            const badge = document.createElement("span");
            badge.className = "search-exact-badge";
            badge.textContent = "Exact match";
            heading.appendChild(badge);
          }

          li.appendChild(heading);

          if (item.definition_snippet) {
            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = item.definition_snippet;
            li.appendChild(p);
          }

          if (item.synonyms?.length) {
            const p = document.createElement("p");
            p.className = "muted";
            p.textContent = `Synonyms: ${item.synonyms.slice(0, 4).join(", ")}`;
            li.appendChild(p);
          }

          results.appendChild(li);
        }
      };

      render(initialQuery);

      input.addEventListener("input", () => {
        const query = input.value;
        const next = new URL(window.location.href);
        if (query) {
          next.searchParams.set("q", query);
        } else {
          next.searchParams.delete("q");
        }
        window.history.replaceState({}, "", next);
        render(query);
      });
    })
    .catch(() => {
      summary.textContent = "Search index could not be loaded.";
    });
}
