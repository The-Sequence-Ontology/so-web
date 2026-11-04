const normalize = (value) => value.trim().toLowerCase();

// Lower ranks come first. Exact identifiers and labels beat incidental mentions.
function matchRank(item, query) {
  const identifiers = [item.id, ...(item.alt_ids || [])]
    .flatMap((id) => [normalize(id), normalize(id.replace(":", "_"))]);
  if (identifiers.includes(query)) return 0;

  const label = normalize(item.label);
  if (label === query) return 1;

  const synonyms = (item.synonyms || []).map(normalize);
  if (synonyms.includes(query)) return 2;
  if (label.startsWith(query)) return 3;
  if (label.includes(query)) return 4;
  if (synonyms.some((synonym) => synonym.includes(query))) return 5;
  if (item.tokens.includes(query)) return 6;
  return Infinity;
}

export function isExactMatch(item, query) {
  const normalized = normalize(query);
  return normalized !== "" && matchRank(item, normalized) <= 2;
}

export function searchTerms(items, query, limit = 50) {
  const normalized = normalize(query);
  if (!normalized) return { matches: [], total: 0 };

  const ranked = items
    .map((item) => ({ item, rank: matchRank(item, normalized) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((a, b) => a.rank - b.rank || a.item.id.localeCompare(b.item.id));

  // Rank every match before applying the display limit so exact matches stay visible.
  return {
    matches: ranked.slice(0, limit).map(({ item }) => item),
    total: ranked.length
  };
}
