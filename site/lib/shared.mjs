const iriPrefix = "http://purl.obolibrary.org/obo/";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value = "") {
  return normalizeWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
  );
}

function slugFromIri(iri) {
  return iri.replace(iriPrefix, "");
}

function publicIdFromIri(iri) {
  const slug = slugFromIri(iri);
  if (slug.startsWith("SO_")) {
    return slug.replace("SO_", "SO:");
  }
  return slug;
}

function relativeHref(depth, targetPath) {
  return `${"../".repeat(depth)}${targetPath}`.replace(/\/+/g, "/");
}

function canonicalTermPath(id) {
  return `browser/current_release/term/${id}/`;
}

export {
  iriPrefix,
  escapeHtml,
  normalizeWhitespace,
  stripTags,
  slugFromIri,
  publicIdFromIri,
  relativeHref,
  canonicalTermPath
};
