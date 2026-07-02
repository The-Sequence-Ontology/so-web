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

        const matches = items
          .filter((item) => item.tokens.includes(trimmed))
          .slice(0, 50);

        summary.textContent = `${matches.length} matching term${matches.length === 1 ? "" : "s"} for "${query}".`;

        if (!matches.length) {
          results.innerHTML = "<li>No matching terms found.</li>";
          return;
        }

        for (const item of matches) {
          const li = document.createElement("li");
          const label = document.createElement("a");
          label.href = item.url;
          label.textContent = `${item.id} - ${item.label}`;
          li.appendChild(label);

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
