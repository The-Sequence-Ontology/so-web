import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { settings, outputDirectory, projectRoot } from "../lib/build-paths.mjs";
import { hrefFrom } from "../lib/shared.mjs";
import { prepareData } from "../scripts/prepare-data.mjs";
import { termHistoryCacheVersion } from "../lib/history.mjs";

const run = promisify(execFile);
const fixture = path.join(projectRoot, "test/fixtures/ontology");

test("output cleanup is restricted to generated directories", () => {
  for (const target of ["src", ".", "..", ".cache", "test/fixtures", "../dist"]) {
    assert.throws(() => outputDirectory(target), /BUILD_DIR/);
  }
  assert.equal(outputDirectory("dist-fixture"), path.join(projectRoot, "dist-fixture"));
  assert.equal(hrefFrom("/assets/styles.css", "/browser/current_release/term/SO:0000704/"), "../../../../assets/styles.css");
  assert.equal(hrefFrom("/browser/current_release/search/?q=gene", "/"), "browser/current_release/search/?q=gene");
  assert.equal(hrefFrom("https://example.org/"), "https://example.org/");
});

test("Eleventy builds fixture pages, aliases, public data, and clean output", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "so-eleventy-test-"));
  const outputName = "dist-test-" + process.pid;
  const output = outputDirectory(outputName);
  const env = { ...process.env, SO_ONTOLOGY_DIR: fixture, SO_CACHE_DIR: path.join(temporary, "cache"), BUILD_DIR: outputName };
  const build = () => run(process.execPath, ["scripts/build-site.mjs", "--fast"], { cwd: projectRoot, env });
  try {
    await build();
    const read = (file) => fs.readFile(path.join(output, file), "utf8");
    const json = async (file) => JSON.parse(await read(file));
    const termPath = "browser/current_release/term/";
    const html = await read(termPath + "SO:0000704/index.html");
    assert.match(html, /<title>SO:0000704 - gene &lt;test&gt; &amp; &quot;quoted&quot;<\/title>/);
    assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>unsafe/);
    assert.match(html, /dag-figure/);
    assert.match(html, /data-graph-src="..\/..\/..\/..\/assets\/terms\/SO:0000704.json"/);
    assert.match(html, /<h4>derives_from \(incoming\)<\/h4>/);
    assert.match(html, /<h4>part_of \(outgoing\)<\/h4>/);
    assert.match(await read(termPath + "SO:0000002/index.html"), /Obsolete term[\s\S]*Replacement guidance:[\s\S]*SO:0000704/);
    for (const alias of ["SO_0000704", "SO:9999999", "SO_9999999", "SO:0000003", "SO_0000003"]) {
      assert.match(await read(termPath + alias + "/index.html"), /content="0; url=..\/SO:0000704\/"/);
    }
    for (const page of ["index.html", "browser/current_release/index.html", "browser/current_release/about/index.html", "browser/current_release/release/index.html", "browser/current_release/search/index.html"]) {
      assert.match(await read(page), /Sequence Ontology Browser/);
    }
    const payload = await json("assets/terms/SO:0000704.json");
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.release.date, "2026-11-03");
    assert.ok(payload.edges.some((edge) => edge.source === "SO:0000704" && edge.target === "SO:0000110" && edge.predicate === "is_a"));
    assert.equal((await json("assets/graph-manifest.json")).termCount, 5);
    const search = await json("assets/search-index.json");
    assert.ok(search.find((term) => term.id === "SO:0000704").tokens.includes("so:9999999"));
    assert.ok(search.find((term) => term.id === "SO:0000704").tokens.includes("genetic & feature"));
    for (const asset of ["styles.css", "search.js", "graph.js"]) {
      assert.equal(await read("assets/" + asset), await fs.readFile(path.join(projectRoot, "src/assets", asset), "utf8"));
    }
    for (const name of ["so.owl", "so.json", "so-metadata.txt"]) {
      assert.equal(await read("downloads/" + name), await fs.readFile(path.join(fixture, name), "utf8"));
    }
    await fs.writeFile(path.join(output, "stale.html"), "stale");
    await build();
    await assert.rejects(fs.access(path.join(output, "stale.html")), { code: "ENOENT" });
    assert.equal(await read(termPath + "SO:0000704/index.html"), html);
  } finally {
    await fs.rm(output, { recursive: true, force: true });
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("development reuses valid data and refreshes changed or incomplete data", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "so-eleventy-cache-"));
  try {
    const inputs = path.join(temporary, "inputs");
    await fs.cp(fixture, inputs, { recursive: true });
    const config = settings({ SO_ONTOLOGY_DIR: inputs, SO_CACHE_DIR: path.join(temporary, "cache") });
    await prepareData({ mode: "fast", config });
    const before = (await fs.stat(config.snapshotPath)).mtimeMs;
    await prepareData({ mode: "fast", reuse: true, config });
    assert.equal((await fs.stat(config.snapshotPath)).mtimeMs, before);
    const owl = path.join(inputs, "so.owl");
    await fs.writeFile(owl, (await fs.readFile(owl, "utf8")).replace("sequence_feature", "updated_feature"));
    const updated = await prepareData({ mode: "fast", reuse: true, config });
    assert.equal(updated.terms.find((term) => term.id === "SO:0000110").label, "updated_feature");
    const payload = path.join(config.publicDir, "assets/terms/SO:0000704.json");
    await fs.rm(payload);
    await prepareData({ mode: "fast", reuse: true, config });
    await fs.access(payload);
    await fs.writeFile(config.snapshotPath, "{broken");
    await prepareData({ mode: "fast", reuse: true, config });
    const bad = settings({ SO_ONTOLOGY_DIR: path.join(temporary, "missing"), SO_CACHE_DIR: config.cacheDir });
    await assert.rejects(prepareData({ mode: "fast", config: bad }), /Set SO_ONTOLOGY_REPO or SO_ONTOLOGY_DIR/);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("fast preparation preserves history and cannot satisfy a full request", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "so-eleventy-history-"));
  try {
    const repo = path.join(temporary, "ontology");
    await fs.mkdir(repo);
    await run("git", ["init", "-q", repo]);
    await fs.writeFile(path.join(repo, "README"), "Fixture repository\n");
    await run("git", ["-C", repo, "add", "README"]);
    await run("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Fixture"]);
    const repoHead = (await run("git", ["-C", repo, "rev-parse", "HEAD"])).stdout.trim();
    const config = settings({ SO_ONTOLOGY_DIR: fixture, SO_ONTOLOGY_REPO: repo, SO_CACHE_DIR: path.join(temporary, "cache") });
    await fs.mkdir(config.cacheDir);
    const event = { type: "label_changed", date: "2026-11-03", shortHash: repoHead.slice(0, 7), summary: "Changed <label>", details: ["Before & after"], issueRefs: ["#1"] };
    const history = { "SO:0000704": { firstSeen: event, mostRecent: event, entries: [], semanticEvents: [event] } };
    const cachedHistory = JSON.stringify({ repoHead, cacheVersion: termHistoryCacheVersion, history });
    const historyFile = path.join(config.cacheDir, "term-history.json");
    await fs.writeFile(historyFile, cachedHistory);
    const full = await prepareData({ config });
    assert.equal(full.terms.find((term) => term.id === "SO:0000704").history.semanticEvents.length, 1);
    const fast = await prepareData({ mode: "fast", config });
    assert.equal(fast.historyMode, "fast");
    assert.equal(fast.terms.find((term) => term.id === "SO:0000704").history.semanticEvents.length, 0);
    assert.equal(await fs.readFile(historyFile, "utf8"), cachedHistory);
    const restored = await prepareData({ mode: "full", reuse: true, config });
    assert.equal(restored.historyMode, "full");
    assert.equal(restored.historySource.repoHead, repoHead);
    assert.equal(restored.terms.find((term) => term.id === "SO:0000704").history.semanticEvents.length, 1);
    await assert.rejects(prepareData({ config: { ...config, ontologyRepoDir: temporary } }), /Full preparation needs/);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
