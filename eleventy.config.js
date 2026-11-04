import { settings, outputDirectory } from "./lib/build-paths.mjs";
import { hrefFrom } from "./lib/shared.mjs";
import { buildDagSvg } from "./lib/graph-svg.mjs";

export default function (eleventyConfig) {
  const { snapshotPath, publicDir } = settings();
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });
  eleventyConfig.addFilter("href", hrefFrom);
  eleventyConfig.addFilter("historyType", (type = "") => type.replaceAll("_", " "));
  eleventyConfig.addFilter("featuredTerms", (ids, terms) =>
    ids.map((id) => terms.find((term) => term.id === id)).filter(Boolean));
  eleventyConfig.addFilter("dagSvg", (term, lookup) =>
    buildDagSvg(term, term.graphNeighborhood, { get: (iri) => lookup[iri] }));
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets", [publicDir]: "." });
  eleventyConfig.setServerPassthroughCopyBehavior("passthrough");
  // The input is explicitly src/. Watch the ignored snapshot, not staging files.
  eleventyConfig.setUseGitIgnore(false);
  eleventyConfig.addWatchTarget(snapshotPath);
  eleventyConfig.watchIgnores.add("**/site-public/**");
  eleventyConfig.setServerOptions({ port: 4173, showAllHosts: false });
  return {
    dir: { input: "src", output: outputDirectory(), includes: "_includes", data: "_data" },
    templateFormats: ["md", "njk"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}
